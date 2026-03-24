export default class Point {
  constructor(x, y, z) {
    if (x !== undefined && y !== undefined && z !== undefined) {
      this.x = Number(x).toFixed(3)
      this.y = Number(y).toFixed(3)
      this.z = Number(z).toFixed(3)
    }

    this.faces = []
  }

  subdivide(point, count, checkPoint) {
    const segments = [this]

    for (let index = 1; index < count; index += 1) {
      let newPoint = new Point(
        this.x * (1 - index / count) + point.x * (index / count),
        this.y * (1 - index / count) + point.y * (index / count),
        this.z * (1 - index / count) + point.z * (index / count)
      )
      newPoint = checkPoint(newPoint)
      segments.push(newPoint)
    }

    segments.push(point)
    return segments
  }

  segment(point, percent) {
    const safePercent = Math.max(0.01, Math.min(1, percent))

    const x = point.x * (1 - safePercent) + this.x * safePercent
    const y = point.y * (1 - safePercent) + this.y * safePercent
    const z = point.z * (1 - safePercent) + this.z * safePercent

    return new Point(x, y, z)
  }

  midpoint(point) {
    return this.segment(point, 0.5)
  }

  project(radius, percent = 1) {
    const safePercent = Math.max(0, Math.min(1, percent))
    const magnitude = Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2)
    const ratio = radius / magnitude

    this.x = this.x * ratio * safePercent
    this.y = this.y * ratio * safePercent
    this.z = this.z * ratio * safePercent

    return this
  }

  registerFace(face) {
    this.faces.push(face)
  }

  getOrderedFaces() {
    const workingArray = this.faces.slice()
    const ordered = []

    let faceIndex = 0
    while (faceIndex < this.faces.length) {
      if (faceIndex === 0) {
        ordered.push(workingArray[faceIndex])
        workingArray.splice(faceIndex, 1)
      } else {
        let hit = false
        let workingIndex = 0

        while (workingIndex < workingArray.length && !hit) {
          if (workingArray[workingIndex].isAdjacentTo(ordered[faceIndex - 1])) {
            hit = true
            ordered.push(workingArray[workingIndex])
            workingArray.splice(workingIndex, 1)
          }
          workingIndex += 1
        }
      }

      faceIndex += 1
    }

    return ordered
  }

  findCommonFace(other, notThisFace) {
    for (let firstIndex = 0; firstIndex < this.faces.length; firstIndex += 1) {
      for (let secondIndex = 0; secondIndex < other.faces.length; secondIndex += 1) {
        if (
          this.faces[firstIndex].id === other.faces[secondIndex].id &&
          this.faces[firstIndex].id !== notThisFace.id
        ) {
          return this.faces[firstIndex]
        }
      }
    }

    return null
  }

  toJson() {
    return {
      x: this.x,
      y: this.y,
      z: this.z
    }
  }

  toString() {
    return `${this.x},${this.y},${this.z}`
  }
}
