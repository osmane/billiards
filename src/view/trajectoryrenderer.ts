import {
  LineBasicMaterial,
  BufferGeometry,
  BufferAttribute,
  Line,
  Vector3,
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
    console.log("📊 TrajectoryRenderer.updateTrajectories called")
    console.log("  - Predictions count:", predictions.length)

    // Clear existing trajectory lines
    this.clearTrajectories()

    // Create new trajectory lines
    predictions.forEach((prediction, index) => {
      console.log(`  - Processing prediction ${index} for ball ${prediction.ballId}`)
      const line = this.createTrajectoryLine(prediction, table)
      if (line) {
        console.log(`    ✅ Line created and added to scene`)
        this.trajectoryLines.set(prediction.ballId, line)
        this.scene.add(line)
      } else {
        console.log(`    ❌ Failed to create line`)
      }
    })

    console.log(`  - Total trajectory lines in scene: ${this.trajectoryLines.size}`)
  }

  private createTrajectoryLine(prediction: TrajectoryPrediction, table: Table): Line | null {
    console.log(`    🎨 Creating trajectory line for ball ${prediction.ballId}`)
    console.log(`      Points: ${prediction.points.length}`)

    if (prediction.points.length < 2) {
      console.log("      ❌ Not enough points")
      return null
    }

    // Find the ball to get its color
    const ball = table.balls.find(b => b.id === prediction.ballId)
    if (!ball) {
      console.log("      ❌ Ball not found")
      return null
    }

    const ballColor = ball.ballmesh.color
    const hexColor = ballColor.getHexString()
    console.log(`      Ball color: #${hexColor}`)

    // Create geometry
    const geometry = new BufferGeometry()
    const positions = new Float32Array(prediction.points.length * 3)

    prediction.points.forEach((point, index) => {
      positions[index * 3] = point.position.x
      positions[index * 3 + 1] = point.position.y
      // Slightly elevate trajectory lines above table surface for visibility
      positions[index * 3 + 2] = point.position.z + 0.01

      if (index < 3) { // Log first few points for debugging
        console.log(`        Point ${index}: x=${point.position.x.toFixed(3)}, y=${point.position.y.toFixed(3)}, z=${point.position.z.toFixed(3)}`)
      }
    })

    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    console.log(`      Geometry created with ${prediction.points.length} vertices`)

    // Create material with enhanced visibility for trajectory prediction
    // Use brighter, more contrasting colors for better visibility
    let trajectoryColor = ballColor.clone()

    // Make the trajectory color brighter and more saturated
    trajectoryColor.multiplyScalar(1.5) // Brighten
    trajectoryColor.setHSL(
      trajectoryColor.getHSL({h: 0, s: 0, l: 0}).h, // Keep hue
      Math.min(1.0, trajectoryColor.getHSL({h: 0, s: 0, l: 0}).s * 1.2), // Increase saturation
      Math.min(0.8, trajectoryColor.getHSL({h: 0, s: 0, l: 0}).l * 1.3)   // Brighten but not too much
    )

    const material = new LineBasicMaterial({
      color: trajectoryColor,
      opacity: 0.8, // More visible than trace lines
      linewidth: 3, // Match trace line width
      transparent: true
    })

    const line = new Line(geometry, material)
    line.userData.trajectoryLine = true // Mark as trajectory line for easy identification

    // Ensure the line renders on top of other objects
    line.renderOrder = 10

    console.log(`      ✅ Line created with color #${hexColor}, opacity: 0.7`)
    return line
  }

  clearTrajectories() {
    console.log("🧹 Clearing trajectories", this.trajectoryLines.size, "lines")
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