import { Table } from "./table"
import { Ball } from "./ball"
import { AimEvent } from "../events/aimevent"
import { OutcomeType } from "./outcome"
import { R } from "./physics/constants"
import { Vector3 } from "three"
import { CAROM_PHYSICS } from "./physics/constants"
import { CAROM_TABLE_LENGTH, CAROM_TABLE_WIDTH } from "./physics/constants"
import { applyShotFromPose } from "./physics/shot"
import { ENGINE_DT, TRAJECTORY_SAMPLE_DT } from "./physics/engine"

const MIN_PREVIEW_SPEED = 0.25

const tableDiag = Math.hypot(CAROM_TABLE_LENGTH, CAROM_TABLE_WIDTH)
const helperDistanceLimit = tableDiag * 2

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

function sanitizeAim(aim: { angle?: number; offset?: any; power?: number }) {
  const angle = Number.isFinite(aim?.angle as number) ? (aim!.angle as number) : 0
  const off = aim?.offset ?? { x: 0, y: 0, z: 0 }
  const offset = new Vector3(
    Number.isFinite(off.x) ? off.x : 0,
    Number.isFinite(off.y) ? off.y : 0,
    Number.isFinite(off.z) ? off.z : 0,
  )
  let power = Number.isFinite(aim?.power as number) ? (aim!.power as number) : 0
  if (power <= 0) power = MIN_PREVIEW_SPEED
  return { angle, offset, power }
}

export class TrajectoryPredictor {
  private maxSimulationTime = 10.0 // Maximum simulation time in seconds
  private timeStep = ENGINE_DT
  private sampleInterval = TRAJECTORY_SAMPLE_DT
  private maxRetries = 100 // Maximum collision resolution retries per step
  private readonly COLLISION_BUG_SHORTEN_DISTANCE = 50 // TEST: Distance to backtrack when collision bug detected

  constructor() { }

  predictTrajectory(table: Table, aim: AimEvent, rules?: any, masseMode?: boolean, elevation?: number, _limitToHelper?: boolean): TrajectoryPrediction[] {
    // Create a copy of the table for simulation
    const serializedTable = table.serialise()
    const simulationTable = Table.fromSerialised(serializedTable)
    const { angle, offset, power } = sanitizeAim(aim)

    let cueDir: Vector3
    const cue = table as any as { cue?: any } // proje tiplerine göre uyumlu
    if (cue?.cue?.mesh?.quaternion) {
      cueDir = new Vector3(0, -1, 0).applyQuaternion(cue.cue.mesh.quaternion).normalize()
    } else {
      cueDir = new Vector3(Math.cos(angle), Math.sin(angle), 0).normalize()
    }

    // 2) darbe noktası: varsa cue.hitPointMesh’ten, yoksa offset’ten türet
    let hitPointWorld: Vector3
    if (cue?.cue?.hitPointMesh?.position) {
      hitPointWorld = cue.cue.hitPointMesh.position.clone()
    } else {
      // offset küresel (%R) ise R ile ölçekleyip cue ball merkezine ekliyoruz
      const cb = simulationTable.cueball
      hitPointWorld = cb.pos.clone().add(new Vector3(offset.x * R, offset.y * R, offset.z * R))
    }

    // 3) elevation
    const elevationVal = Number.isFinite((aim as any)?.elevation) ? (aim as any).elevation : 0

    simulationTable.balls.forEach((b, i) => {
      b.physicsContext = (table.balls[i] as any)?.physicsContext ?? CAROM_PHYSICS
    })

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

    applyShotFromPose(currentCueBall, {
      cueDir: cueDir,
      hitPointWorld: hitPointWorld,
      elevation: elevationVal,
      power
    })
    const cueBallStartPos = currentCueBall.pos.clone()

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
    //const helperDistanceLimit = (currentCueBall.radius * 30) / 0.5
    const horizontalDirection = new Vector3(Math.cos(aim.angle), Math.sin(aim.angle), 0)
    // (cos/sin zaten normalleştirili vektör verdiği için length ≈ 1; yine de güvenlik için)
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

    if (cueBallFirstImpactDistance === null) {
      // Simülasyonda bir yere çarpmadan durduysa:
      const reachable = cueBallTravelDistance
      // Çarpışma mesafesi hesaplandıysa ve ulaşılabiliyorsa onu da dikkate al:
      const target = directImpactDistance !== null
        ? Math.min(reachable, directImpactDistance)
        : reachable

      // Artık helperDistanceLimit ile kesME; gerçek mesafeyi kullan
      cueBallFirstImpactDistance = target

      // Çizgiyi tamamlamak için fallback noktası gerekiyorsa:
      const cueBallTrajectory = trajectories.get(cueBallSimId)
      if (cueBallTrajectory && cueBallTrajectory.length > 0 && cueBallTrajectory.length < 2) {
        const startPoint = cueBallTrajectory[0]
        const fallbackPosition = {
          x: startPoint.position.x + horizontalDirection.x * target,
          y: startPoint.position.y + horizontalDirection.y * target,
          z: startPoint.position.z
        }
        const initialSpeed = currentCueBall.vel.length()
        const fallbackTime = initialSpeed > 1e-6 ? target / initialSpeed : 0
        cueBallTrajectory.push({ position: fallbackPosition, ballId: cueBallSimId, time: fallbackTime })
        firstImpactDistances.set(cueBallSimId, target)
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
        try {
          const prediction: TrajectoryPrediction = {
            ballId: originalBallId, // Use original ball ID for rendering
            points,
            hadSimulationError
          }

          const firstImpactIndex = firstImpactIndices.get(simulationBallId)
          if (firstImpactIndex !== undefined) {
            prediction.firstImpactIndex = firstImpactIndex
          }

          const firstImpactDistance = firstImpactDistances.get(simulationBallId)
          if (firstImpactDistance !== undefined) {
            prediction.firstImpactDistance = firstImpactDistance
          }

          predictions.push(prediction)
        } catch {

        }
      }
    })

    return predictions
  }

  // Helper method to check if prediction should be enabled
  static shouldPredict(container: any): boolean {
    return !!container?.table && !!container?.table?.cueball
  }
}




