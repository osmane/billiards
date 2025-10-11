import { Table } from "./table"
import { Ball } from "./ball"
import { AimEvent } from "../events/aimevent"
import { unitAtAngle } from "../utils/utils"
import { cueToSpin } from "./physics/physics"
import { State } from "./ball"

export interface TrajectoryPoint {
  position: { x: number; y: number; z: number }
  ballId: number
  time: number
}

export interface TrajectoryPrediction {
  points: TrajectoryPoint[]
  ballId: number
}

export class TrajectoryPredictor {
  private maxSimulationTime = 10.0 // Maximum simulation time in seconds
  private timeStep = 0.001953125 // Same as container step size
  private sampleInterval = 0.05 // Sample positions every 50ms for smooth lines
  private maxRetries = 100 // Maximum collision resolution retries per step

  constructor() {}

  predictTrajectory(table: Table, aim: AimEvent, rules?: any, masseMode?: boolean): TrajectoryPrediction[] {
    // Create a copy of the table for simulation
    const serializedTable = table.serialise()
    const simulationTable = Table.fromSerialised(serializedTable)

    // Ensure physics constants and table geometry are properly set for three cushion mode
    if (rules && rules.tableGeometry) {
      rules.tableGeometry()
    }

    // Create mapping between original and simulation ball IDs to preserve ball identity
    const ballIdMapping: Map<number, number> = new Map()
    table.balls.forEach((originalBall, index) => {
      const simulationBall = simulationTable.balls[index]
      if (simulationBall) {
        ballIdMapping.set(simulationBall.id, originalBall.id)
      }
    })

    // Find the current player's cue ball in the simulation
    // For three cushion, we need to use the actual current cue ball, not always table.cueball
    let currentCueBall = simulationTable.cueball // Default fallback

    // In three cushion mode, check which ball is actually being aimed from
    if (table.cue && table.cue.aim && table.cue.aim.i !== undefined) {
      const aimIndex = table.cue.aim.i
      if (aimIndex >= 0 && aimIndex < simulationTable.balls.length) {
        currentCueBall = simulationTable.balls[aimIndex]
      }
    } else {
      // Fallback: try to get from rules if available
      if (rules && rules.cueball) {
        const ruleCueballIndex = table.balls.findIndex(b => b === rules.cueball)
        if (ruleCueballIndex >= 0 && ruleCueballIndex < simulationTable.balls.length) {
          currentCueBall = simulationTable.balls[ruleCueballIndex]
        }
      }
    }

    // Apply the shot to the current player's cue ball
    currentCueBall.state = State.Sliding
    currentCueBall.vel.copy(unitAtAngle(aim.angle).multiplyScalar(aim.power))
    currentCueBall.rvel.copy(cueToSpin(aim.offset, currentCueBall.vel))

    // Enable Magnus effect in trajectory prediction if in massé mode
    if (masseMode !== undefined) {
      currentCueBall.magnusEnabled = masseMode
    }

    // Initialize trajectory data for each ball using simulation IDs
    const trajectories: Map<number, TrajectoryPoint[]> = new Map()
    simulationTable.balls.forEach(ball => {
      trajectories.set(ball.id, [])
    })

    let simulationTime = 0
    let lastSampleTime = 0

    // Record initial positions
    simulationTable.balls.forEach(ball => {
      if (ball.inMotion() || ball === currentCueBall) {
        trajectories.get(ball.id)!.push({
          position: { x: ball.pos.x, y: ball.pos.y, z: ball.pos.z },
          ballId: ball.id,
          time: 0
        })
      }
    })

    // Run simulation with improved error handling
    let stepsWithoutMotion = 0
    const maxStepsWithoutMotion = 100 // Stop if balls haven't moved for 100 steps

    while (simulationTime < this.maxSimulationTime) {
      // Advance simulation
      try {
        simulationTable.advance(this.timeStep)
        simulationTime += this.timeStep

        // Check for motion to avoid infinite loops with very slow balls
        const anyInMotion = simulationTable.balls.some(ball => ball.inMotion())
        if (!anyInMotion) {
          stepsWithoutMotion++
          if (stepsWithoutMotion > maxStepsWithoutMotion) {
            break
          }
        } else {
          stepsWithoutMotion = 0
        }

        // Sample positions at intervals
        if (simulationTime - lastSampleTime >= this.sampleInterval) {
          simulationTable.balls.forEach(ball => {
            if (ball.inMotion()) {
              trajectories.get(ball.id)!.push({
                position: { x: ball.pos.x, y: ball.pos.y, z: ball.pos.z },
                ballId: ball.id,
                time: simulationTime
              })
            }
          })
          lastSampleTime = simulationTime
        }

        // Stop if all balls are stationary (using table's method)
        if (simulationTable.allStationary()) {
          break
        }
      } catch (error) {
        // Break on simulation errors (collision depth exceeded, etc.)
        break
      }
    }

    // Convert to return format using original ball IDs
    const predictions: TrajectoryPrediction[] = []
    trajectories.forEach((points, simulationBallId) => {
      const originalBallId = ballIdMapping.get(simulationBallId)
      if (points.length > 1 && originalBallId !== undefined) { // Only include balls that moved and have valid mapping
        predictions.push({
          ballId: originalBallId, // Use original ball ID for rendering
          points
        })
      }
    })

    return predictions
  }

  // Helper method to check if prediction should be enabled
  static shouldPredict(container: any): boolean {
    return container?.rules?.rulename === "threecushion"
  }
}