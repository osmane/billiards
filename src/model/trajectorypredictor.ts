import { Table } from "./table"
import { Ball } from "./ball"
import { AimEvent } from "../events/aimevent"
import { OutcomeType } from "./outcome"
// import { R } from "./physics/constants"
import { Vector3 } from "three"
// import { unitAtAngle, upCross } from "../utils/utils"
import { CAROM_PHYSICS } from "./physics/constants"
import { CAROM_TABLE_LENGTH, CAROM_TABLE_WIDTH } from "./physics/constants"
import { applyShotFromPose, makeShotPoseFromAim } from "./physics/shot"
import { ENGINE_DT, TRAJECTORY_SAMPLE_DT } from "./physics/engine"
import { TableGeometry } from "../view/tablegeometry"
import { trace } from "../utils/trace"
// Physics parameters are now sourced only from src/model/physics/constants.ts

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
  private maxSimulationTime = 60.0 // Maximum simulation time in seconds (full-shot parity)
  private timeStep = ENGINE_DT
  private sampleInterval = TRAJECTORY_SAMPLE_DT
  private maxRetries = 100 // Maximum collision resolution retries per step
  private readonly COLLISION_BUG_SHORTEN_DISTANCE = 50 // TEST: Distance to backtrack when collision bug detected

  constructor() { }

  predictTrajectory(table: Table, aim: AimEvent, rules?: any, masseMode?: boolean, elevation?: number, _limitToHelper?: boolean): TrajectoryPrediction[] {
    const { angle, offset, power } = sanitizeAim(aim)

    const shotId = (typeof performance !== 'undefined' ? Math.round(performance.now()) : Date.now())

    // Pose will be created later using simulation ball (ensures exact parity)

    // IMPORTANT: Determine which ball is being hit FIRST (for three cushion mode)
    // In carom mode, aim.i can be 0, 1, or 2 depending on which ball is being played
    let actualCueBall = table.cueball // Default to balls[0]
    if (table.cue && table.cue.aim && table.cue.aim.i !== undefined) {
      const aimIndex = table.cue.aim.i
      if (aimIndex >= 0 && aimIndex < table.balls.length) {
        actualCueBall = table.balls[aimIndex]
      }
    } else if (rules && rules.cueball) {
      actualCueBall = rules.cueball
    }

    // hit point will be determined below; prefer visual mesh if available

    // IMPORTANT: Extract cue direction and hit point BEFORE serialization
    // because table.serialise() does NOT serialize cue.mesh or cue.hitPointMesh
    // Compute cue direction from aim + elevation directly to avoid stale mesh state
    // (direction will be derived later using simulation ball)

    // 2) darbe noktasÄ±: ALWAYS derive from aim offsets (deterministic, no mesh timing issues)
    // Using arcsin mapping (matches Cue.updateHitPoint)
    // NOTE: Mesh-based approach removed to prevent trajectory/shot parity issues due to mesh update timing
    // (hitpoint will be derived later)
    // (pose computed later)


    // 3) elevation - FIX: Use elevation parameter passed to function
    const elevationVal = Number.isFinite(elevation) ? elevation! : 0

    // IMPORTANT: Save current TableGeometry state before rules.tableGeometry() modifies it
    // This prevents trajectory prediction from polluting global state
    const savedTableGeometry = {
      tableX: TableGeometry.tableX,
      tableY: TableGeometry.tableY,
      X: TableGeometry.X,
      Y: TableGeometry.Y,
      hasPockets: TableGeometry.hasPockets
    }

    // Ensure physics constants and table geometry are properly set for three cushion mode
    if (rules && rules.tableGeometry) {
      rules.tableGeometry()
    }

    // Create a copy of the table for simulation (AFTER setting up geometry)
    const serializedTable = table.serialise()
    const simulationTable = Table.fromSerialised(serializedTable, { headless: true })

    simulationTable.balls.forEach((b, i) => {
      b.physicsContext = (table.balls[i] as any)?.physicsContext ?? CAROM_PHYSICS
    })

    // Create mapping between original and simulation ball IDs to preserve ball identity
    const ballIdMapping: Map<number, number> = new Map()
    table.balls.forEach((originalBall, index) => {
      const simulationBall = simulationTable.balls[index]
      if (simulationBall) {
        ballIdMapping.set(simulationBall.id, originalBall.id)
      }
    })

    // Find the current player's cue ball in the simulation
    // We already determined actualCueBall from original table, now find it in simulationTable
    const actualCueBallIndex = table.balls.indexOf(actualCueBall)
    let currentCueBall = simulationTable.balls[actualCueBallIndex]

    // Sanity check: if not found, fall back to simulationTable.cueball
    if (!currentCueBall) {
      currentCueBall = simulationTable.cueball
    }

    const pose = makeShotPoseFromAim(currentCueBall, { angle, offset, power }, elevationVal)
    applyShotFromPose(currentCueBall, pose)
    const cueBallStartPos = currentCueBall.pos.clone()

    // Log helper prediction shot data
    trace('helper_shot', {
      shotId,
      ballId: currentCueBall.id,
      pos: { x: currentCueBall.pos.x, y: currentCueBall.pos.y, z: currentCueBall.pos.z },
      aim: { angle, offset: { x: offset.x, y: offset.y, z: offset.z }, power },
      elevation: elevationVal,
      cueDir: { x: pose.cueDir.x, y: pose.cueDir.y, z: pose.cueDir.z },
      hitPointWorld: { x: pose.hitPointWorld.x, y: pose.hitPointWorld.y, z: pose.hitPointWorld.z },
      engineDt: this.timeStep,
      table: serializedTable,
      tableGeometry: {
        tableX: TableGeometry.tableX,
        tableY: TableGeometry.tableY,
        X: TableGeometry.X,
        Y: TableGeometry.Y,
        hasPockets: TableGeometry.hasPockets
      }
    })

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
    // (cos/sin zaten normalleÅŸtirili vektÃ¶r verdiÄŸi iÃ§in length â‰ˆ 1; yine de gÃ¼venlik iÃ§in)
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
    const cushionCounts: Map<number, number> = new Map()
    const firstCushionTimeByBall: Map<number, number> = new Map()
    let firstCollisionTime: number | null = null
    let firstCollisionPair: [number | null, number | null] | null = null

    // Record initial positions
    simulationTable.balls.forEach(ball => {
      if (ball.inMotion() || ball === currentCueBall) {
        recordPoint(ball, 0)
      }
    })

    // Optimize simulation time when only helper is needed
    // Helper length is approximately (R * 30) / 0.5. When trajectory lines are hidden
    // we still simulate until the cue ball has travelled at least this much or hits something.
    // If only helper preview is requested, limit simulation to a shorter window.
    // Otherwise allow full-shot duration parity with real simulation.
    const maxSimTime = _limitToHelper ? Math.min(this.maxSimulationTime, 5.0) : this.maxSimulationTime

    // Run simulation with improved error handling
    let stepsWithoutMotion = 0
    const maxStepsWithoutMotion = 100 // Stop if balls haven't moved for 100 steps
    let simulationEndedByError = false
    let cueWasMoving = false
    let stopLogged = false

    while (simulationTime < maxSimTime) {
      try {
        simulationTable.advance(this.timeStep)
        simulationTime += this.timeStep

        // Sample cue ball path until first impact
        if (currentCueBall.inMotion() && !cueBallImpactRecorded) {
          recordPoint(currentCueBall, simulationTime)
        }

        // Handle new outcomes
        const newOutcomes = simulationTable.outcome.slice(processedOutcomes)
        processedOutcomes = simulationTable.outcome.length

        newOutcomes.forEach(outcome => {
          if (
            outcome.type !== OutcomeType.Collision &&
            outcome.type !== OutcomeType.Cushion
          ) {
            return
          }

          // Minimal logging: cue ball collisions and cushions only
          if (outcome.type === OutcomeType.Collision) {
            const aId = outcome.ballA?.id
            const bId = outcome.ballB?.id
            if (aId === cueBallSimId || bId === cueBallSimId) {
              const other = aId === cueBallSimId ? (bId ?? null) : (aId ?? null)
              trace('helper_event', {
                shotId,
                type: 'collision',
                t: simulationTime,
                pos: { x: currentCueBall.pos.x, y: currentCueBall.pos.y, z: currentCueBall.pos.z },
                otherBallId: other
              })
            }
          } else if (outcome.type === OutcomeType.Cushion) {
            const id = outcome.ballA?.id
            if (id === cueBallSimId) {
              trace('helper_event', {
                shotId,
                type: 'cushion',
                t: simulationTime,
                pos: { x: currentCueBall.pos.x, y: currentCueBall.pos.y, z: currentCueBall.pos.z }
              })
            }
          }

          // Maintain first impact bookkeeping
          if (outcome.type === OutcomeType.Cushion) {
            const id = outcome.ballA?.id
            if (id !== undefined) {
              const prev = (cushionCounts.get(id) ?? 0)
              cushionCounts.set(id, prev + 1)
              if (!firstCushionTimeByBall.has(id)) {
                firstCushionTimeByBall.set(id, simulationTime)
              }
            }
          } else if (outcome.type === OutcomeType.Collision) {
            if (firstCollisionTime === null) {
              firstCollisionTime = simulationTime
              firstCollisionPair = [outcome.ballA?.id ?? null, outcome.ballB?.id ?? null]
            }
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

        // Detect cue ball stop
        if (currentCueBall.inMotion()) {
          cueWasMoving = true
        } else if (cueWasMoving && !stopLogged) {
          trace('helper_event', {
            shotId,
            type: 'stop',
            t: simulationTime,
            pos: { x: currentCueBall.pos.x, y: currentCueBall.pos.y, z: currentCueBall.pos.z },
            distance: cueBallTravelDistance
          })
          stopLogged = true
        }

        // Motion/end conditions
        const anyInMotion = simulationTable.balls.some(ball => ball.inMotion())
        if (!anyInMotion) {
          stepsWithoutMotion++
          if (stepsWithoutMotion > maxStepsWithoutMotion) {
            break
          }
        } else {
          stepsWithoutMotion = 0
        }

        // Sampling
        if (simulationTime - lastSampleTime >= this.sampleInterval) {
          simulationTable.balls.forEach(ball => {
            if (ball.inMotion()) {
              recordPoint(ball, simulationTime)
            }
          })
          lastSampleTime = simulationTime
        }

        if (simulationTable.allStationary()) {
          break
        }
      } catch (error) {
        simulationEndedByError = true
        break
      }
    }

    if (!stopLogged) {
      trace('helper_event', {
        shotId,
        type: 'stop',
        t: simulationTime,
        pos: { x: currentCueBall.pos.x, y: currentCueBall.pos.y, z: currentCueBall.pos.z }
      })
    }

    // Store error flag
    const hadSimulationError = simulationEndedByError

    if (cueBallFirstImpactDistance === null) {
      const reachable = cueBallTravelDistance
      const target = directImpactDistance !== null
        ? Math.min(reachable, directImpactDistance)
        : reachable

      cueBallFirstImpactDistance = target

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

    const predictions: TrajectoryPrediction[] = []
    trajectories.forEach((points, simulationBallId) => {
      const originalBallId = ballIdMapping.get(simulationBallId)
      if (points.length > 1 && originalBallId !== undefined) {
        try {
          const prediction: TrajectoryPrediction = {
            ballId: originalBallId,
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
        } catch { }
      }
    })

    // Restore TableGeometry
    TableGeometry.tableX = savedTableGeometry.tableX
    TableGeometry.tableY = savedTableGeometry.tableY
    TableGeometry.X = savedTableGeometry.X
    TableGeometry.Y = savedTableGeometry.Y
    TableGeometry.hasPockets = savedTableGeometry.hasPockets
    try {
      // Dispose simulation resources to prevent leaks
      simulationTable.balls.forEach((b: any) => {
        try { b.ballmesh && b.ballmesh.dispose && b.ballmesh.dispose() } catch {}
      })
      // Dispose cue geometries created for the simulation table (do not dispose shared materials)
      try {
        const cue: any = (simulationTable as any).cue
        const disposeMesh = (m: any) => {
          try { m && m.geometry && m.geometry.dispose && m.geometry.dispose() } catch {}
        }
        disposeMesh(cue?.mesh)
        disposeMesh(cue?.placerMesh)
        disposeMesh(cue?.hitPointMesh)
        disposeMesh(cue?.virtualCueMesh)
      } catch {}
      ;(simulationTable as any).outcome = []
    } catch {}
    return predictions
  }

  // Helper method to check if prediction should be enabled
  static shouldPredict(container: any): boolean {
    return !!container?.table && !!container?.table?.cueball
  }
}
