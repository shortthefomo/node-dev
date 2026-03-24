import Point from './point'
import Face from './face'
import Tile from './tile'

export default class Hexasphere {
  constructor(radius, numDivisions, hexSize) {
    this.radius = radius

    const tao = 1.61803399
    const corners = [
      new Point(1000, tao * 1000, 0),
      new Point(-1000, tao * 1000, 0),
      new Point(1000, -tao * 1000, 0),
      new Point(-1000, -tao * 1000, 0),
      new Point(0, 1000, tao * 1000),
      new Point(0, -1000, tao * 1000),
      new Point(0, 1000, -tao * 1000),
      new Point(0, -1000, -tao * 1000),
      new Point(tao * 1000, 0, 1000),
      new Point(-tao * 1000, 0, 1000),
      new Point(tao * 1000, 0, -1000),
      new Point(-tao * 1000, 0, -1000)
    ]

    let points = {}
    for (let index = 0; index < corners.length; index += 1) {
      points[corners[index]] = corners[index]
    }

    let faces = [
      new Face(corners[0], corners[1], corners[4], false),
      new Face(corners[1], corners[9], corners[4], false),
      new Face(corners[4], corners[9], corners[5], false),
      new Face(corners[5], corners[9], corners[3], false),
      new Face(corners[2], corners[3], corners[7], false),
      new Face(corners[3], corners[2], corners[5], false),
      new Face(corners[7], corners[10], corners[2], false),
      new Face(corners[0], corners[8], corners[10], false),
      new Face(corners[0], corners[4], corners[8], false),
      new Face(corners[8], corners[2], corners[10], false),
      new Face(corners[8], corners[4], corners[5], false),
      new Face(corners[8], corners[5], corners[2], false),
      new Face(corners[1], corners[0], corners[6], false),
      new Face(corners[11], corners[1], corners[6], false),
      new Face(corners[3], corners[9], corners[11], false),
      new Face(corners[6], corners[10], corners[7], false),
      new Face(corners[3], corners[11], corners[7], false),
      new Face(corners[11], corners[6], corners[7], false),
      new Face(corners[6], corners[0], corners[10], false),
      new Face(corners[9], corners[1], corners[11], false)
    ]

    const getPointIfExists = (point) => {
      if (points[point]) {
        return points[point]
      }

      points[point] = point
      return point
    }

    const newFaces = []

    for (let faceIndex = 0; faceIndex < faces.length; faceIndex += 1) {
      let previous = null
      let bottom = [faces[faceIndex].points[0]]
      const left = faces[faceIndex].points[0].subdivide(
        faces[faceIndex].points[1],
        numDivisions,
        getPointIfExists
      )
      const right = faces[faceIndex].points[0].subdivide(
        faces[faceIndex].points[2],
        numDivisions,
        getPointIfExists
      )

      for (let index = 1; index <= numDivisions; index += 1) {
        previous = bottom
        bottom = left[index].subdivide(right[index], index, getPointIfExists)

        for (let segmentIndex = 0; segmentIndex < index; segmentIndex += 1) {
          let face = new Face(previous[segmentIndex], bottom[segmentIndex], bottom[segmentIndex + 1])
          newFaces.push(face)

          if (segmentIndex > 0) {
            face = new Face(previous[segmentIndex - 1], previous[segmentIndex], bottom[segmentIndex])
            newFaces.push(face)
          }
        }
      }
    }

    faces = newFaces

    const newPoints = {}
    for (const point in points) {
      const projectedPoint = points[point].project(radius)
      newPoints[projectedPoint] = projectedPoint
    }

    points = newPoints

    this.tiles = []
    this.tileLookup = {}

    for (const point in points) {
      const tile = new Tile(points[point], hexSize)
      this.tiles.push(tile)
      this.tileLookup[tile.toString()] = tile
    }

    for (let tileIndex = 0; tileIndex < this.tiles.length; tileIndex += 1) {
      this.tiles[tileIndex].neighbors = this.tiles[tileIndex].neighborIds.map(
        (item) => this.tileLookup[item]
      )
    }
  }

  toJson() {
    return JSON.stringify({
      radius: this.radius,
      tiles: this.tiles.map((tile) => tile.toJson())
    })
  }
}
