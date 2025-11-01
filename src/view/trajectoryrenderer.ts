import {
  LineBasicMaterial,
  BufferGeometry,
  BufferAttribute,
  Line,
  Scene
} from "three"
import { TrajectoryPrediction } from "../model/trajectorypredictor"
import { Table } from "../model/table"

export class TrajectoryRenderer {
  private trajectoryLines: Map<number, Line> = new Map()
  private scene: Scene

  constructor(scene: Scene) {
    this.scene = scene
  }

  updateTrajectories(predictions: TrajectoryPrediction[], table: Table) {
    // Clear existing trajectory lines
    this.clearTrajectories()

    // Create new trajectory lines
    predictions.forEach((prediction) => {
      const line = this.createTrajectoryLine(prediction, table)
      if (line) {
        this.trajectoryLines.set(prediction.ballId, line)
        this.scene.add(line)
      }
    })

    // Note: Visibility will be set explicitly by the container after calling this method
  }

  private createTrajectoryLine(prediction: TrajectoryPrediction, table: Table): Line | null {
    if (prediction.points.length < 2) {
      return null
    }

    // Find the ball to get its color
    const ball = table.balls.find(b => b.id === prediction.ballId)
    if (!ball) {
      return null
    }

    const ballColor = ball.ballmesh.color

    // Create geometry
    const geometry = new BufferGeometry()
    const positions = new Float32Array(prediction.points.length * 3)

    prediction.points.forEach((point, index) => {
      positions[index * 3] = point.position.x
      positions[index * 3 + 1] = point.position.y
      // Slightly elevate trajectory lines above table surface for visibility
      positions[index * 3 + 2] = point.position.z + 0.01
    })

    geometry.setAttribute('position', new BufferAttribute(positions, 3))

    for (let i = 2; i < positions.length; i += 3) positions[i] += 1e-4
    geometry.setAttribute("position", new BufferAttribute(positions, 3))

    // Create material with enhanced visibility for trajectory prediction
    // Use brighter, more contrasting colors for better visibility
    let trajectoryColor = ballColor.clone()

    // Make the trajectory color brighter and more saturated
    trajectoryColor.multiplyScalar(1.5) // Brighten
    trajectoryColor.setHSL(
      trajectoryColor.getHSL({ h: 0, s: 0, l: 0 }).h, // Keep hue
      Math.min(1.0, trajectoryColor.getHSL({ h: 0, s: 0, l: 0 }).s * 1.2), // Increase saturation
      Math.min(0.8, trajectoryColor.getHSL({ h: 0, s: 0, l: 0 }).l * 1.3)   // Brighten but not too much
    )

    const material = new LineBasicMaterial({
      color: trajectoryColor,
      opacity: 0.7,
      transparent: true,
      depthWrite: false
    })

    const line = new Line(geometry, material)
    line.userData.trajectoryLine = true // Mark as trajectory line for easy identification

    // Ensure the line renders on top of other objects
    line.renderOrder = 10

    return line
  }

  clearTrajectories() {
    this.trajectoryLines.forEach((line) => {
      this.scene.remove(line)
      line.geometry.dispose()
      if (line.material instanceof LineBasicMaterial) {
        line.material.dispose()
      }
    })
    this.trajectoryLines.clear()
  }

  setVisible(visible: boolean) {
    this.trajectoryLines.forEach(line => {
      line.visible = visible
    })
  }

  dispose() {
    this.clearTrajectories()
  }
}