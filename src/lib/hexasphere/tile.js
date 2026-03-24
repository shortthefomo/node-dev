function vector(point1, point2) {
  return {
    x: point2.x - point1.x,
    y: point2.y - point1.y,
    z: point2.z - point1.z
  }
}

function calculateSurfaceNormal(point1, point2, point3) {
  const vectorU = vector(point1, point2)
  const vectorV = vector(point1, point3)

  return {
    x: vectorU.y * vectorV.z - vectorU.z * vectorV.y,
    y: vectorU.z * vectorV.x - vectorU.x * vectorV.z,
    z: vectorU.x * vectorV.y - vectorU.y * vectorV.x
  }
}

function pointingAwayFromOrigin(point, vector3) {
  return point.x * vector3.x >= 0 && point.y * vector3.y >= 0 && point.z * vector3.z >= 0
}

export default class Tile {
  constructor(centerPoint, hexSize = 1) {
    const safeHexSize = Math.max(0.01, Math.min(1, hexSize))

    this.centerPoint = centerPoint
    this.faces = centerPoint.getOrderedFaces()
    this.boundary = []
    this.neighborIds = []
    this.neighbors = []

    const neighborHash = {}
    for (let faceIndex = 0; faceIndex < this.faces.length; faceIndex += 1) {
      this.boundary.push(this.faces[faceIndex].getCentroid().segment(this.centerPoint, safeHexSize))

      const otherPoints = this.faces[faceIndex].getOtherPoints(this.centerPoint)
      for (let pointIndex = 0; pointIndex < 2; pointIndex += 1) {
        neighborHash[otherPoints[pointIndex]] = 1
      }
    }

    this.neighborIds = Object.keys(neighborHash)

    const normal = calculateSurfaceNormal(this.boundary[1], this.boundary[2], this.boundary[3])

    if (!pointingAwayFromOrigin(this.centerPoint, normal)) {
      this.boundary.reverse()
    }
  }

  getLatLon(radius, boundaryNum) {
    let point = this.centerPoint
    if (typeof boundaryNum === 'number' && boundaryNum < this.boundary.length) {
      point = this.boundary[boundaryNum]
    }

    const phi = Math.acos(point.y / radius)
    const theta = (Math.atan2(point.x, point.z) + Math.PI + Math.PI / 2) % (Math.PI * 2) - Math.PI

    return {
      lat: (180 * phi) / Math.PI - 90,
      lon: (180 * theta) / Math.PI
    }
  }

  scaledBoundary(scale) {
    const safeScale = Math.max(0, Math.min(1, scale))
    const scaled = []

    for (let index = 0; index < this.boundary.length; index += 1) {
      scaled.push(this.centerPoint.segment(this.boundary[index], 1 - safeScale))
    }

    return scaled
  }

  toJson() {
    return {
      centerPoint: this.centerPoint.toJson(),
      boundary: this.boundary.map((point) => point.toJson())
    }
  }

  toString() {
    return this.centerPoint.toString()
  }
}
