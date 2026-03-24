import Point from './point'

let faceCount = 0

export default class Face {
  constructor(point1, point2, point3, register = true) {
    this.id = faceCount
    faceCount += 1

    this.points = [point1, point2, point3]

    if (register) {
      point1.registerFace(this)
      point2.registerFace(this)
      point3.registerFace(this)
    }
  }

  getOtherPoints(point) {
    return this.points.filter((facePoint) => facePoint.toString() !== point.toString())
  }

  findThirdPoint(point1, point2) {
    return this.points.find(
      (facePoint) =>
        facePoint.toString() !== point1.toString() && facePoint.toString() !== point2.toString()
    )
  }

  isAdjacentTo(face) {
    let count = 0

    for (let firstIndex = 0; firstIndex < this.points.length; firstIndex += 1) {
      for (let secondIndex = 0; secondIndex < face.points.length; secondIndex += 1) {
        if (this.points[firstIndex].toString() === face.points[secondIndex].toString()) {
          count += 1
        }
      }
    }

    return count === 2
  }

  getCentroid(clear = false) {
    if (this.centroid && !clear) {
      return this.centroid
    }

    const x = (this.points[0].x + this.points[1].x + this.points[2].x) / 3
    const y = (this.points[0].y + this.points[1].y + this.points[2].y) / 3
    const z = (this.points[0].z + this.points[1].z + this.points[2].z) / 3

    this.centroid = new Point(x, y, z)
    return this.centroid
  }
}
