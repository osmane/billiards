import { Table } from "./table"
import { Ball } from "./ball"
import { AimEvent } from "../events/aimevent"
import { unitAtAngle } from "../utils/utils"
import { cueToSpin } from "./physics/physics"
import { State } from "./ball"
import { OutcomeType } from "./outcome"
import { R } from "./physics/constants"
import { Vector3 } from "three"
import { Collision } from "./physics/collision"

export interface TrajectoryPoint {
  position: { x: number; y: number; z: number }
  ballId: number
  time: number
}

export interface TrajectoryPrediction {
  points: TrajectoryPoint[]
  ballId: number
  firstImpactIndex?: number
  firstImpactDistance?: number
  hadSimulationError?: boolean
}

export class TrajectoryPredictor {
  private maxSimulationTime = 10.0 // Maximum simulation time in seconds
  private timeStep = 0.001953125 // Same as container step size
  private sampleInterval = 0.05 // Sample positions every 50ms for smooth lines
  private maxRetries = 100 // Maximum collision resolution retries per step
  private readonly COLLISION_BUG_SHORTEN_DISTANCE = 50 // TEST: Distance to backtrack when collision bug detected

  constructor() {}

  predictTrajectory(table: Table, aim: AimEvent, rules?: any, masseMode?: boolean, elevation?: number, _limitToHelper?: boolean): TrajectoryPrediction[] {
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
    const cueBallStartPos = currentCueBall.pos.clone()

    // Calculate velocity with elevation angle (same as in cue.ts hit method)
    const horizontalVel = unitAtAngle(aim.angle).multiplyScalar(aim.power)

    if (masseMode && elevation !== undefined && elevation > 0.2) {
      // In masse mode with high elevation, apply vertical component
      const horizontalMagnitude = aim.power * Math.cos(elevation)
      const verticalMagnitude = aim.power * Math.sin(elevation)
      currentCueBall.vel.copy(unitAtAngle(aim.angle).multiplyScalar(horizontalMagnitude))
      currentCueBall.vel.z = verticalMagnitude
    } else {
      // Normal shot - pure horizontal
      currentCueBall.vel.copy(horizontalVel)
      currentCueBall.vel.z = 0
    }

    currentCueBall.rvel.copy(cueToSpin(aim.offset, currentCueBall.vel))
    const initialSpeed = currentCueBall.vel.length()

    // Enable Magnus effect in trajectory prediction when masse behaviour applies
    if (masseMode !== undefined) {
      currentCueBall.magnusEnabled = (masseMode ?? false) && elevation !== undefined && elevation > 0.2
      if (elevation !== undefined) {
        currentCueBall.magnusElevation = elevation
      }
    }

    // Initialize trajectory data for each ball using simulation IDs
    const trajectories: Map<number, TrajectoryPoint[]> = new Map()
    simulationTable.balls.forEach(ball => {
      trajectories.set(ball.id, [])
    })
    const firstImpactIndices: Map<number, number> = new Map()
    const firstImpactDistances: Map<number, number> = new Map()
    const cueBallSimId = currentCueBall.id
    let cueBallTravelDistance = 0
    let cueBallImpactRecorded = false
    let cueBallFirstImpactDistance: number | null = null
    const helperDistanceLimit = (R * 30) / 0.5
    const horizontalDirection = unitAtAngle(aim.angle).clone()
    horizontalDirection.z = 0
    if (horizontalDirection.lengthSq() > 0) {
      horizontalDirection.normalize()
    }

    const computeDirectImpactDistance = (): number | null => {
      if (horizontalDirection.lengthSq() === 0) {
        return null
      }

      let best: number | null = null
      simulationTable.balls.forEach(ball => {
        if (ball.id === cueBallSimId || !ball.onTable()) {
          return
        }

        const combinedRadius = currentCueBall.radius + ball.radius
        const start2D = new Vector3(cueBallStartPos.x, cueBallStartPos.y, 0)
        const toBall = new Vector3(ball.pos.x, ball.pos.y, 0).sub(start2D)
        const forward = toBall.dot(horizontalDirection)
        if (forward <= 0) {
          return
        }

        const along = horizontalDirection.clone().multiplyScalar(forward)
        const lateral = toBall.clone().sub(along)
        const radiusSq = combinedRadius * combinedRadius
        const lateralDistSq = lateral.lengthSq()
        if (lateralDistSq > radiusSq) {
          return
        }

        const offset = Math.sqrt(Math.max(0, radiusSq - lateralDistSq))
        const distanceToContact = forward - offset
        if (distanceToContact < 0) {
          if (best === null || 0 < best) {
            best = 0
          }
          return
        }

        if (best === null || distanceToContact < best) {
          best = distanceToContact
        }
      })

      return best
    }

    const isHighElevationMasse = (masseMode ?? false) && elevation !== undefined && elevation > 0.2
    const directImpactDistance = isHighElevationMasse ? null : computeDirectImpactDistance()

    const recordPoint = (ball: Ball, time: number): number | null => {
      const trajectory = trajectories.get(ball.id)
      if (!trajectory) {
        return null
      }

      const position = {
        x: ball.pos.x,
        y: ball.pos.y,
        z: ball.pos.z
      }

      if (trajectory.length > 0) {
        const lastPoint = trajectory[trajectory.length - 1]
        const dx = position.x - lastPoint.position.x
        const dy = position.y - lastPoint.position.y
        const dz = position.z - lastPoint.position.z
        const distanceSq = dx * dx + dy * dy + dz * dz
        if (distanceSq < 1e-12) {
          return trajectory.length - 1
        }
        if (ball.id === cueBallSimId) {
          cueBallTravelDistance += Math.sqrt(distanceSq)
        }
      }

      trajectory.push({
        position,
        ballId: ball.id,
        time
      })
      return trajectory.length - 1
    }

    let simulationTime = 0
    let lastSampleTime = 0
    let processedOutcomes = 0

    // Record initial positions
    simulationTable.balls.forEach(ball => {
      if (ball.inMotion() || ball === currentCueBall) {
        recordPoint(ball, 0)
      }
    })

    // Optimize simulation time when only helper is needed
    // Helper length is approximately (R * 30) / 0.5. When trajectory lines are hidden
    // we still simulate until the cue ball has travelled at least this much or hits something.
    const maxSimTime = this.maxSimulationTime

    // Run simulation with improved error handling
    let stepsWithoutMotion = 0
    const maxStepsWithoutMotion = 100 // Stop if balls haven't moved for 100 steps
    let simulationEndedByError = false

    while (simulationTime < maxSimTime) {
      // Advance simulation
      try {
        simulationTable.advance(this.timeStep)
        simulationTime += this.timeStep

        // Fine-grained cue ball sampling ensures curved helper accuracy
        if (currentCueBall.inMotion() && !cueBallImpactRecorded) {
          recordPoint(currentCueBall, simulationTime)
        }

        // Track new collision/cushion outcomes to capture first impact points
        const newOutcomes = simulationTable.outcome.slice(processedOutcomes)
        processedOutcomes = simulationTable.outcome.length

        newOutcomes.forEach(outcome => {
          if (
            outcome.type !== OutcomeType.Collision &&
            outcome.type !== OutcomeType.Cushion
          ) {
            return
          }


          const impactedBalls: Ball[] = []
          if (outcome.ballA) {
            impactedBalls.push(outcome.ballA)
          }
          if (
            outcome.type === OutcomeType.Collision &&
            outcome.ballB &&
            outcome.ballB !== outcome.ballA
          ) {
            impactedBalls.push(outcome.ballB)
          }

          impactedBalls.forEach(ball => {
            if (!ball || firstImpactIndices.has(ball.id)) {
              return
            }
            const newIndex = recordPoint(ball, simulationTime)
            if (newIndex !== null) {
              firstImpactIndices.set(ball.id, newIndex)
              if (ball.id === cueBallSimId) {
                cueBallImpactRecorded = true
                if (cueBallFirstImpactDistance === null) {
                  cueBallFirstImpactDistance = cueBallTravelDistance
                  firstImpactDistances.set(ball.id, cueBallFirstImpactDistance)
                }
              }
            }
          })
        })

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
              recordPoint(ball, simulationTime)
            }
          })
          lastSampleTime = simulationTime
        }

        // Stop if all balls are stationary (using table's method)
        if (simulationTable.allStationary()) {
          break
        }
      } catch (error) {
        // Collision depth error - simulation cannot continue
        simulationEndedByError = true
        break
      }
    }

    // Store error flag in predictions for later detection
    const hadSimulationError = simulationEndedByError

    if (cueBallFirstImpactDistance === null && directImpactDistance !== null) {
      const clampedDistance = Math.min(directImpactDistance, helperDistanceLimit)
      cueBallFirstImpactDistance = clampedDistance
      const cueBallTrajectory = trajectories.get(cueBallSimId)
      if (cueBallTrajectory && cueBallTrajectory.length > 0) {
        if (cueBallTrajectory.length < 2 && horizontalDirection.lengthSq() > 0) {
          const startPoint = cueBallTrajectory[0]
          const fallbackPosition = {
            x: startPoint.position.x + horizontalDirection.x * clampedDistance,
            y: startPoint.position.y + horizontalDirection.y * clampedDistance,
            z: startPoint.position.z
          }
          const fallbackTime =
            initialSpeed > 1e-6 ? clampedDistance / initialSpeed : 0
          cueBallTrajectory.push({
            position: fallbackPosition,
            ballId: cueBallSimId,
            time: fallbackTime
          })
          firstImpactDistances.set(cueBallSimId, clampedDistance)
        }
      }
    }

    if (cueBallFirstImpactDistance !== null && !firstImpactDistances.has(cueBallSimId)) {
      firstImpactDistances.set(cueBallSimId, cueBallFirstImpactDistance)
    }

    // Convert to return format using original ball IDs
    const predictions: TrajectoryPrediction[] = []
    trajectories.forEach((points, simulationBallId) => {
      const originalBallId = ballIdMapping.get(simulationBallId)
      if (points.length > 1 && originalBallId !== undefined) { // Only include balls that moved and have valid mapping
        const firstImpactIndex = firstImpactIndices.get(simulationBallId)
        const firstImpactDistance = firstImpactDistances.get(simulationBallId)
        predictions.push({
          ballId: originalBallId, // Use original ball ID for rendering
          points,
          firstImpactIndex,
          firstImpactDistance,
          hadSimulationError
        })
      }
    })

    return predictions
  }

  // Helper method to check if prediction should be enabled
  static shouldPredict(container: any): boolean {
    return !!container?.table && !!container?.table?.cueball
  }
}




