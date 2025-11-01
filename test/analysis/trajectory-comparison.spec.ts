import fs from 'fs'
import path from 'path'
import { Table } from '../../src/model/table'
import { AimEvent } from '../../src/events/aimevent'
import { TrajectoryPredictor } from '../../src/model/trajectorypredictor'
import { Vector3 } from 'three'
import { applyShotFromPose } from '../../src/model/physics/shot'
import { TableGeometry } from '../../src/view/tablegeometry'
import { TestTraceLogger } from '../utils/test-trace-logger'

const testLogger = new TestTraceLogger()

function findLatestLog(): string | null {
  const dir = path.resolve(__dirname, '../../logs')
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir).filter(f => /^trajectory-.*\.log$/.test(f))
  if (files.length === 0) return null
  files.sort((a,b) => fs.statSync(path.join(dir,b)).mtimeMs - fs.statSync(path.join(dir,a)).mtimeMs)
  return path.join(dir, files[0])
}

describe('Trajectory Helper vs Actual Shot Comparison', () => {
  const latest = findLatestLog()
  if (!latest) {
    test.skip('no logs/trajectory-*.log present; skipping', () => {})
    return
  }

  const lines = fs.readFileSync(latest, 'utf8').split(/\r?\n/).filter(Boolean)
  const json = lines.map((l, idx) => { try { return JSON.parse(l) } catch (e) { throw new Error(`Bad JSON at line ${idx+1}`) } })
  const shots = json.filter((o: any) => o.label === 'shot')

  if (shots.length === 0) {
    test.skip('no shot lines found', () => {})
    return
  }

  const shotLine = shots[shots.length - 1]
  const shot = shotLine.data
  const shotId = shot.shotId

  test(`Compare helper prediction vs actual trajectory for shotId=${shotId}`, () => {
    console.log(`\n📊 Analyzing shot ${shotId}`)
    console.log(`   Power: ${shot.aim.power.toFixed(3)}, Elevation: ${(shot.elevation * 180 / Math.PI).toFixed(1)}°`)

    // Log shot data
    testLogger.log('shot', shot)

    // Apply logged table geometry
    const tg = shot.tableGeometry
    if (tg) {
      TableGeometry.tableX = tg.tableX
      TableGeometry.tableY = tg.tableY
      TableGeometry.X = tg.X
      TableGeometry.Y = tg.Y
      TableGeometry.hasPockets = !!tg.hasPockets
    }

    const ballRadius = shot.table.balls[0].physicsContext.R

    // 1. GET TRAJECTORY HELPER PREDICTION
    const tableForPrediction = Table.fromSerialised(shot.table)
    const aim = AimEvent.fromJson({
      angle: shot.aim?.angle ?? 0,
      offset: shot.aim?.offset ?? { x:0, y:0, z:0 },
      power: shot.aim?.power ?? 0,
      elevation: shot.elevation ?? 0,
      pos: { x: 0, y: 0, z: 0 }
    })

    const predictor = new TrajectoryPredictor()
    const predictions = predictor.predictTrajectory(tableForPrediction, aim, undefined, undefined, shot.elevation, undefined)
    const cueBallPrediction = predictions.find(p => p.ballId === shot.ballId)

    expect(cueBallPrediction).toBeTruthy()
    console.log(`   Helper predicted ${cueBallPrediction!.points.length} trajectory points`)

    // 2. RUN ACTUAL SIMULATION
    const tableForActual = Table.fromSerialised(shot.table)
    const cueBall = tableForActual.balls.find(b => b.id === shot.ballId) || tableForActual.cueball

    const cueDir = new Vector3(shot.cueDir.x, shot.cueDir.y, shot.cueDir.z)
    const hitPointWorld = new Vector3(shot.hitPointWorld.x, shot.hitPointWorld.y, shot.hitPointWorld.z)

    applyShotFromPose(cueBall, {
      cueDir,
      hitPointWorld,
      elevation: shot.elevation ?? 0,
      power: shot.aim?.power ?? 0
    })

    // Track actual trajectory
    const actualPoints: Array<{t: number, pos: Vector3}> = []
    const engineDt = Number(shot.engineDt) || 0.005
    let t = 0
    let firstCollisionPos: Vector3 | null = null
    let firstCushionPos: Vector3 | null = null
    let firstCollisionTime = Infinity
    let firstCushionTime = Infinity
    let processed = 0

    actualPoints.push({ t: 0, pos: cueBall.pos.clone() })

    const maxTime = 10
    const sampleInterval = 0.05 // Sample every 50ms

    while (t < maxTime) {
      tableForActual.advance(engineDt)
      t += engineDt

      // Sample trajectory
      if (actualPoints.length === 0 || t - actualPoints[actualPoints.length - 1].t >= sampleInterval) {
        actualPoints.push({ t, pos: cueBall.pos.clone() })
      }

      // Track events
      const newOutcomes = tableForActual.outcome.slice(processed)
      processed = tableForActual.outcome.length
      newOutcomes.forEach(o => {
        if (o.type === 'Collision') {
          if ((o.ballA?.id === cueBall.id || o.ballB?.id === cueBall.id) && !firstCollisionPos) {
            firstCollisionPos = cueBall.pos.clone()
            firstCollisionTime = t
            const otherId = o.ballA?.id === cueBall.id ? o.ballB?.id : o.ballA?.id
            testLogger.log('event', {
              shotId,
              type: 'collision',
              t,
              pos: { x: cueBall.pos.x, y: cueBall.pos.y, z: cueBall.pos.z },
              otherBallId: otherId
            })
          }
        } else if (o.type === 'Cushion') {
          if (o.ballA?.id === cueBall.id && !firstCushionPos) {
            firstCushionPos = cueBall.pos.clone()
            firstCushionTime = t
            testLogger.log('event', {
              shotId,
              type: 'cushion',
              t,
              pos: { x: cueBall.pos.x, y: cueBall.pos.y, z: cueBall.pos.z }
            })
          }
        }
      })

      if (tableForActual.allStationary()) break
    }

    // Log stop event
    testLogger.log('event', {
      shotId,
      type: 'stop',
      t,
      pos: { x: cueBall.pos.x, y: cueBall.pos.y, z: cueBall.pos.z }
    })

    console.log(`   Actual simulation produced ${actualPoints.length} trajectory points`)
    console.log(`   Test log written to: ${testLogger.getLogFilePath()}`)

    // 3. FIND FIRST SIGNIFICANT EVENT (collision or cushion)
    const firstEventIsCollision = firstCollisionTime < firstCushionTime
    const firstEventPos = firstEventIsCollision ? firstCollisionPos : firstCushionPos
    const firstEventTime = Math.min(firstCollisionTime, firstCushionTime)
    const firstEventType = firstEventIsCollision ? 'collision' : 'cushion'

    if (!firstEventPos) {
      console.log(`   ⚠️  No collision or cushion detected`)
      return
    }

    console.log(`\n   First event: ${firstEventType} at t=${firstEventTime.toFixed(3)}s`)
    console.log(`   Position: [${firstEventPos.x.toFixed(4)}, ${firstEventPos.y.toFixed(4)}]`)

    // 4. COMPARE HELPER PREDICTION WITH ACTUAL AT FIRST EVENT
    // Find helper prediction at the same time
    const helperPoints = cueBallPrediction!.points

    // Find closest helper point to first event time
    let closestHelperPoint = helperPoints[0]
    let minTimeDiff = Math.abs(helperPoints[0].time - firstEventTime)

    for (const pt of helperPoints) {
      const timeDiff = Math.abs(pt.time - firstEventTime)
      if (timeDiff < minTimeDiff) {
        minTimeDiff = timeDiff
        closestHelperPoint = pt
      }
    }

    const helperPos = new Vector3(closestHelperPoint.position.x, closestHelperPoint.position.y, closestHelperPoint.position.z)

    const dx = firstEventPos.x - helperPos.x
    const dy = firstEventPos.y - helperPos.y
    const distance = Math.sqrt(dx*dx + dy*dy)
    const ballDiameters = distance / (2 * ballRadius)

    console.log(`\n   📍 Helper prediction at t=${closestHelperPoint.time.toFixed(3)}s:`)
    console.log(`      Position: [${helperPos.x.toFixed(4)}, ${helperPos.y.toFixed(4)}]`)
    console.log(`\n   🎯 DIFFERENCE:`)
    console.log(`      Distance: ${(distance * 100).toFixed(2)} cm`)
    console.log(`      Ball diameters: ${ballDiameters.toFixed(2)} (radius = ${(ballRadius * 100).toFixed(2)} cm)`)

    if (ballDiameters < 0.5) {
      console.log(`      ✅ Excellent match!`)
    } else if (ballDiameters < 2) {
      console.log(`      ⚠️  Small deviation`)
    } else {
      console.log(`      ❌ Significant deviation`)
    }

    // Also check helper's first impact point if available
    if (cueBallPrediction!.firstImpactIndex !== undefined) {
      const helperFirstImpact = cueBallPrediction!.points[cueBallPrediction!.firstImpactIndex]
      const helperImpactPos = new Vector3(helperFirstImpact.position.x, helperFirstImpact.position.y, helperFirstImpact.position.z)

      const impactDx = firstEventPos.x - helperImpactPos.x
      const impactDy = firstEventPos.y - helperImpactPos.y
      const impactDistance = Math.sqrt(impactDx*impactDx + impactDy*impactDy)
      const impactBallDiameters = impactDistance / (2 * ballRadius)

      console.log(`\n   📍 Helper FIRST IMPACT prediction:`)
      console.log(`      Position: [${helperImpactPos.x.toFixed(4)}, ${helperImpactPos.y.toFixed(4)}]`)
      console.log(`      Distance from actual: ${(impactDistance * 100).toFixed(2)} cm`)
      console.log(`      Ball diameters: ${impactBallDiameters.toFixed(2)}`)
    }

    // Log actual vs predicted trajectory points for visualization
    console.log(`\n   📈 Trajectory comparison (first 5 points):`)
    for (let i = 0; i < Math.min(5, helperPoints.length, actualPoints.length); i++) {
      const helper = helperPoints[i]
      const actual = actualPoints.find(a => Math.abs(a.t - helper.time) < 0.1) || actualPoints[i]
      const diff = Math.sqrt(
        Math.pow(helper.position.x - actual.pos.x, 2) +
        Math.pow(helper.position.y - actual.pos.y, 2)
      )
      console.log(`      t=${helper.time.toFixed(2)}s: diff=${(diff*100).toFixed(2)}cm`)
    }
  })
})
