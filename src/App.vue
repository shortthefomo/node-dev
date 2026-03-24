<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import Hexasphere from './lib/hexasphere/hexasphere'

const globeContainer = ref(null)
const nodeCount = ref(0)
const lastUpdated = ref('—')
const status = ref('Loading XRPL nodes…')

let renderer
let scene
let camera
let controls
let globeGroup
let globeMesh
let animationFrameId
let nodePoints
let landPoints
let resizeHandler

const GLOBE_RADIUS = 14

function hashString(input) {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)

  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    -radius * Math.sin(phi) * Math.sin(theta)
  )
}

async function loadLandMaskSampler() {
  const loader = new THREE.ImageLoader()

  const image = await new Promise((resolve, reject) => {
    loader.load('/textures/equirectangle_projection.png', resolve, undefined, reject)
  })

  const projectionCanvas = document.createElement('canvas')
  const projectionContext = projectionCanvas.getContext('2d')

  projectionCanvas.width = image.width
  projectionCanvas.height = image.height
  projectionContext.drawImage(image, 0, 0, image.width, image.height)

  const pixelData = projectionContext.getImageData(0, 0, image.width, image.height)

  return (lat, lon) => {
    const x = Math.max(0, Math.min(image.width - 1, Math.floor((image.width * (lon + 180)) / 360)))
    const y = Math.max(0, Math.min(image.height - 1, Math.floor((image.height * (lat + 90)) / 180)))

    return pixelData.data[(y * pixelData.width + x) * 4] === 0
  }
}

function clearLandPoints() {
  if (!landPoints) {
    return
  }

  globeGroup.remove(landPoints)
  landPoints.geometry.dispose()
  landPoints.material.dispose()
  landPoints = null
}

async function createLandLayer() {
  clearLandPoints()

  let isLand
  try {
    isLand = await loadLandMaskSampler()
  } catch {
    return
  }

  const hexasphere = new Hexasphere(GLOBE_RADIUS + 0.06, 58, 0.82)
  const landGeometries = []

  for (const tile of hexasphere.tiles) {
    const { lat, lon } = tile.getLatLon(hexasphere.radius)
    if (!isLand(lat, lon)) {
      continue
    }

    const vertices = []
    const indices = []

    for (const boundaryPoint of tile.boundary) {
      vertices.push(parseFloat(boundaryPoint.x), parseFloat(boundaryPoint.y), parseFloat(boundaryPoint.z))
    }

    for (let vertexIndex = 1; vertexIndex < tile.boundary.length - 1; vertexIndex += 1) {
      indices.push(0, vertexIndex, vertexIndex + 1)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geometry.setIndex(indices)
    landGeometries.push(geometry)
  }

  if (!landGeometries.length) {
    return
  }

  const merged = BufferGeometryUtils.mergeGeometries(landGeometries)
  if (!merged) {
    return
  }

  landPoints = new THREE.Mesh(
    merged,
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    })
  )

  globeGroup.add(landPoints)
}

async function fetchNodes() {
  const endpoints = [
    'https://xrpscan.com/api/v1/nodes',
    'https://corsproxy.io/?https://xrpscan.com/api/v1/nodes'
  ]

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint)
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`)
      }

      const data = await response.json()
      if (!Array.isArray(data)) {
        throw new Error('Unexpected API response')
      }

      return data
    } catch {
      continue
    }
  }

  throw new Error('Unable to fetch XRPSCAN nodes')
}

function isPublicIp(ip) {
  if (!ip || typeof ip !== 'string') return false
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) return false
  // Filter private/loopback/link-local ranges
  if (parts[0] === 10) return false
  if (parts[0] === 127) return false
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false
  if (parts[0] === 192 && parts[1] === 168) return false
  if (parts[0] === 169 && parts[1] === 254) return false
  return true
}

async function geocodeIps(ips) {
  // ip-api.com/batch: free, up to 100 per request, HTTP only
  const coords = new Map()
  const BATCH = 100

  for (let i = 0; i < ips.length; i += BATCH) {
    const batch = ips.slice(i, i + BATCH).map((ip) => ({ query: ip, fields: 'query,lat,lon,status' }))
    try {
      const response = await fetch('http://ip-api.com/batch?fields=query,lat,lon,status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch)
      })
      if (!response.ok) continue
      const results = await response.json()
      for (const r of results) {
        if (r.status === 'success') coords.set(r.query, { lat: r.lat, lon: r.lon })
      }
    } catch {
      continue
    }
  }

  return coords
}

async function fetchCountryFallback(countryCodes) {
  if (countryCodes.length === 0) return new Map()
  try {
    const response = await fetch(
      `https://restcountries.com/v3.1/alpha?codes=${countryCodes.join(',')}&fields=cca2,latlng`
    )
    if (!response.ok) return new Map()
    const countries = await response.json()
    const coords = new Map()
    for (const country of countries) {
      if (!country?.cca2 || !Array.isArray(country?.latlng)) continue
      const [lat, lon] = country.latlng
      coords.set(country.cca2.toUpperCase(), { lat, lon })
    }
    return coords
  } catch {
    return new Map()
  }
}

function clearNodePoints() {
  if (!nodePoints) {
    return
  }

  globeGroup.remove(nodePoints)
  nodePoints.geometry.dispose()
  nodePoints.material.dispose()
  nodePoints = null
}

function plotNodes(nodes, ipCoords, countryCoords) {
  clearNodePoints()

  // Each node gets its IP coord, or falls back to country centroid with jitter
  const plotList = []
  for (const node of nodes) {
    const ip = node.ip
    if (ipCoords.has(ip)) {
      plotList.push({ node, lat: ipCoords.get(ip).lat, lon: ipCoords.get(ip).lon })
    } else {
      const country = node.country?.toUpperCase()
      if (country && countryCoords.has(country)) {
        const coord = countryCoords.get(country)
        const seed = hashString(node.public_key ?? `${country}`)
        const jitterLat = ((seed % 1000) / 1000 - 0.5) * 5
        const jitterLon = (((Math.floor(seed / 1000) % 1000) / 1000) - 0.5) * 8
        plotList.push({
          node,
          lat: Math.max(-85, Math.min(85, coord.lat + jitterLat)),
          lon: coord.lon + jitterLon
        })
      }
    }
  }

  const positions = new Float32Array(plotList.length * 3)
  const colors = new Float32Array(plotList.length * 3)
  const color = new THREE.Color()

  plotList.forEach(({ node, lat, lon }, index) => {
    const position = latLonToVector3(lat, lon, GLOBE_RADIUS + 0.95)

    positions[index * 3] = position.x
    positions[index * 3 + 1] = position.y
    positions[index * 3 + 2] = position.z

    const uptime = Number(node.uptime ?? 0)
    const t = Math.min(1, uptime / 1_000_000)
    color.setRGB(0.12 + t * 0.22, 0.85 + t * 0.15, 1)

    colors[index * 3] = color.r
    colors[index * 3 + 1] = color.g
    colors[index * 3 + 2] = color.b
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const material = new THREE.PointsMaterial({
    size: 0.34,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })

  nodePoints = new THREE.Points(geometry, material)
  globeGroup.add(nodePoints)
  nodeCount.value = plotList.length
}

async function loadAndRenderNodes() {
  status.value = 'Fetching XRPL nodes…'

  try {
    const nodes = await fetchNodes()

    const uniqueNodes = new Map()
    for (const node of nodes) {
      if (!node?.public_key) {
        continue
      }
      uniqueNodes.set(node.public_key, node)
    }

    const dedupedNodes = [...uniqueNodes.values()]

    // Geocode by IP first
    status.value = 'Geolocating nodes…'
    const publicIps = [...new Set(dedupedNodes.map((n) => n.ip).filter(isPublicIp))]
    const ipCoords = await geocodeIps(publicIps)

    // Country fallback for nodes whose IP didn't resolve
    const needsFallback = dedupedNodes.filter((n) => !ipCoords.has(n.ip))
    const fallbackCountries = [...new Set(needsFallback.map((n) => n.country?.toUpperCase()).filter(Boolean))]
    const countryCoords = await fetchCountryFallback(fallbackCountries)

    plotNodes(dedupedNodes, ipCoords, countryCoords)
    status.value = 'Live XRPL network nodes'
    lastUpdated.value = new Date().toLocaleString()
  } catch {
    status.value = 'Unable to load XRPL nodes'
  }
}

function buildScene() {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x020611)

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
  camera.position.set(0, 0, 43)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace

  globeContainer.value.appendChild(renderer.domElement)

  globeGroup = new THREE.Group()
  scene.add(globeGroup)

  const globeGeometry = new THREE.SphereGeometry(GLOBE_RADIUS, 72, 72)
  const globeMaterial = new THREE.MeshPhongMaterial({
    color: 0x04080f,
    emissive: 0x08162b,
    shininess: 8,
    specular: 0x1f385a
  })
  globeMesh = new THREE.Mesh(globeGeometry, globeMaterial)
  globeGroup.add(globeMesh)

  const wireframe = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS + 0.03, 48, 48),
    new THREE.MeshBasicMaterial({
      color: 0x2b69cf,
      wireframe: true,
      transparent: true,
      opacity: 0.08
    })
  )
  globeGroup.add(wireframe)

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS + 0.65, 56, 56),
    new THREE.MeshBasicMaterial({
      color: 0x3a9cff,
      transparent: true,
      opacity: 0.07,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending
    })
  )
  globeGroup.add(atmosphere)

  const starsGeometry = new THREE.BufferGeometry()
  const starCount = 2200
  const starPositions = new Float32Array(starCount * 3)

  for (let index = 0; index < starCount; index += 1) {
    const radius = THREE.MathUtils.randFloat(75, 190)
    const theta = THREE.MathUtils.randFloat(0, Math.PI * 2)
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(2))

    starPositions[index * 3] = radius * Math.sin(phi) * Math.cos(theta)
    starPositions[index * 3 + 1] = radius * Math.cos(phi)
    starPositions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta)
  }

  starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
  const starsMaterial = new THREE.PointsMaterial({
    color: 0x9bbcff,
    size: 0.22,
    transparent: true,
    opacity: 0.75,
    depthWrite: false
  })

  scene.add(new THREE.Points(starsGeometry, starsMaterial))

  scene.add(new THREE.AmbientLight(0x7aa6ff, 0.55))

  const directional = new THREE.DirectionalLight(0x82b2ff, 1.3)
  directional.position.set(18, 10, 20)
  scene.add(directional)

  const rimLight = new THREE.PointLight(0x4fa3ff, 1.6, 200)
  rimLight.position.set(-24, 8, -20)
  scene.add(rimLight)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enablePan = false
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.minDistance = 25
  controls.maxDistance = 70
  controls.autoRotate = true
  controls.autoRotateSpeed = 0.32

  resizeHandler = () => {
    if (!globeContainer.value) {
      return
    }

    const { clientWidth, clientHeight } = globeContainer.value
    camera.aspect = clientWidth / clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(clientWidth, clientHeight)
  }

  resizeHandler()
  window.addEventListener('resize', resizeHandler)
}

function animate() {
  animationFrameId = window.requestAnimationFrame(animate)

  globeGroup.rotation.y += 0.0008

  if (nodePoints) {
    const pulse = 0.34 + Math.sin(Date.now() * 0.003) * 0.05
    nodePoints.material.size = pulse
  }

  controls.update()
  renderer.render(scene, camera)
}

function destroyScene() {
  window.cancelAnimationFrame(animationFrameId)

  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
  }

  controls?.dispose()
  clearNodePoints()
  clearLandPoints()

  scene?.traverse((object) => {
    if (!object.geometry && !object.material) {
      return
    }

    if (object.geometry) {
      object.geometry.dispose()
    }

    if (Array.isArray(object.material)) {
      object.material.forEach((material) => material.dispose())
    } else if (object.material) {
      object.material.dispose()
    }
  })

  renderer?.dispose()

  if (renderer?.domElement && globeContainer.value?.contains(renderer.domElement)) {
    globeContainer.value.removeChild(renderer.domElement)
  }
}

onMounted(async () => {
  buildScene()
  animate()
  await createLandLayer()
  await loadAndRenderNodes()
})

onBeforeUnmount(() => {
  destroyScene()
})
</script>

<template>
  <main class="app">
    <section class="hud">
      <p class="eyebrow">XRPL Network</p>
      <h1>Node Globe</h1>
      <p class="status">{{ status }}</p>

      <div class="meta">
        <div class="meta-card">
          <span>Plotted Nodes</span>
          <strong>{{ nodeCount }}</strong>
        </div>
        <div class="meta-card">
          <span>Last Updated</span>
          <strong>{{ lastUpdated }}</strong>
        </div>
      </div>
    </section>

    <section ref="globeContainer" class="globe-container" aria-label="3D globe of XRPL nodes" />
  </main>
</template>
