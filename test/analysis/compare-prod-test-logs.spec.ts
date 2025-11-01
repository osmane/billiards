import fs from 'fs'
import path from 'path'
import { Table } from '../../src/model/table'
import { Vector3 } from 'three'
import { applyShotFromPose } from '../../src/model/physics/shot'
import { TableGeometry } from '../../src/view/tablegeometry'
import { TrajectoryPredictor } from '../../src/model/trajectorypredictor'
import { AimEvent } from '../../src/events/aimevent'
import { trace } from '../../src/utils/trace'

// Access global test logger
const testLogger = (global as any).__trajectoryTestLogger

function findLatestProductionLog(): string | null {
  const dir = path.resolve(__dirname, '../../logs')
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir).filter(f => /^trajectory-.*\.log$/.test(f) && !f.startsWith('test-'))
  if (files.length === 0) return null
  files.sort((a,b) => fs.statSync(path.join(dir,b)).mtimeMs - fs.statSync(path.join(dir,a)).mtimeMs)
  return path.join(dir, files[0])
}

describe('Compare Production vs Test Logs', () => {
  const prodLog = findLatestProductionLog()

  if (!prodLog) {
    test.skip('no production logs found', () => {})
    return
  }

  const lines = fs.readFileSync(prodLog, 'utf8').split(/\r?\n/).filter(Boolean)
  const json = lines.map((l, idx) => {
    try { return JSON.parse(l) }
    catch (e) { throw new Error(`Bad JSON at line ${idx+1}`) }
  })

  const shots = json.filter((o: any) => o.label === 'shot')

  if (shots.length === 0) {
    test.skip('no shots in production log', () => {})
    return
  }

  // Get the latest shot
  const shotLine = shots[shots.length - 1]
  const shot = shotLine.data
  const shotId = shot.shotId

  // Get production events for this shot (both helper and actual)
  const prodHelperShot = json.find((o: any) => o.label === 'helper_shot' && o.data.shotId === shotId)
  const prodHelperEvents = json.filter((o: any) =>
    o.label === 'helper_event' && o.data.shotId === shotId
  ).map(e => e.data)
  const prodEvents = json.filter((o: any) =>
    o.label === 'event' && o.data.shotId === shotId
  ).map(e => e.data)

  test(`Replay production shot ${shotId} in test environment and compare`, () => {
    console.log(`\n🔄 Replaying production shot ${shotId}`)
    console.log(`   Production log: ${path.basename(prodLog)}`)

    // Apply production table geometry
    const tg = shot.tableGeometry
    if (tg) {
      TableGeometry.tableX = tg.tableX
      TableGeometry.tableY = tg.tableY
      TableGeometry.X = tg.X
      TableGeometry.Y = tg.Y
      TableGeometry.hasPockets = !!tg.hasPockets
    }

    // STEP 1: Run helper prediction (same as production does before shot)
    console.log(`\n📍 Step 1: Running helper prediction...`)
    const tableForHelper = Table.fromSerialised(shot.table)
    const aim = AimEvent.fromJson({
      angle: shot.aim?.angle ?? 0,
      offset: shot.aim?.offset ?? { x:0, y:0, z:0 },
      power: shot.aim?.power ?? 0,
      elevation: shot.elevation ?? 0,
      pos: { x: 0, y: 0, z: 0 }
    })

    const predictor = new TrajectoryPredictor()
    const predictions = predictor.predictTrajectory(tableForHelper, aim, undefined, undefined, shot.elevation, undefined)
    console.log(`   Helper prediction completed (${predictions.length} ball trajectories)`)

    // STEP 2: Replay actual shot
    console.log(`\n📍 Step 2: Replaying actual shot...`)

    // Log shot data to test log
    trace('shot', shot)

    // Build table state
    const table = Table.fromSerialised(shot.table)
    const cueBall = table.balls.find(b => b.id === shot.ballId) || table.cueball

    // Apply the shot
    const cueDir = new Vector3(shot.cueDir.x, shot.cueDir.y, shot.cueDir.z)
    const hitPointWorld = new Vector3(shot.hitPointWorld.x, shot.hitPointWorld.y, shot.hitPointWorld.z)

    applyShotFromPose(cueBall, {
      cueDir,
      hitPointWorld,
      elevation: shot.elevation ?? 0,
      power: shot.aim?.power ?? 0
    })

    // Step simulation and capture events
    const engineDt = Number(shot.engineDt) || 0.005
    let t = 0
    let processed = 0
    const testEvents: any[] = []
    let wasMoving = false
    let stopLogged = false

    const maxTime = 10
    while (t < maxTime) {
      table.advance(engineDt)
      t += engineDt

      const newOutcomes = table.outcome.slice(processed)
      processed = table.outcome.length

      newOutcomes.forEach(o => {
        if (o.type === 'Collision') {
          const aId = o.ballA?.id
          const bId = o.ballB?.id
          if (aId === cueBall.id || bId === cueBall.id) {
            const other = aId === cueBall.id ? (bId ?? null) : (aId ?? null)
            const event = {
              type: 'collision',
              t,
              pos: { x: cueBall.pos.x, y: cueBall.pos.y, z: cueBall.pos.z },
              otherBallId: other
            }
            testEvents.push(event)
            trace('event', { shotId, ...event })
          }
        } else if (o.type === 'Cushion') {
          const id = o.ballA?.id
          if (id === cueBall.id) {
            const event = {
              type: 'cushion',
              t,
              pos: { x: cueBall.pos.x, y: cueBall.pos.y, z: cueBall.pos.z }
            }
            testEvents.push(event)
            trace('event', { shotId, ...event })
          }
        }
      })

      if (cueBall.inMotion()) {
        wasMoving = true
      } else if (wasMoving && !stopLogged) {
        const event = {
          type: 'stop',
          t,
          pos: { x: cueBall.pos.x, y: cueBall.pos.y, z: cueBall.pos.z }
        }
        testEvents.push(event)
        trace('event', { shotId, ...event })
        stopLogged = true
        break
      }

      if (table.allStationary()) break
    }

    console.log(`\n📊 Comparison Results:`)
    console.log(`   Production helper events: ${prodHelperEvents.length}`)
    console.log(`   Production actual events: ${prodEvents.length}`)
    console.log(`   Test actual events: ${testEvents.length}`)
    console.log(`   Test log: ${testLogger.getLogFilePath()}`)

    // Compare events
    const minLength = Math.min(prodEvents.length, testEvents.length)
    const positionTolerance = 0.001 // 1mm
    const timeTolerance = engineDt * 2

    console.log(`\n📍 Event-by-Event Comparison:`)
    console.log(`   (Tolerance: position=${(positionTolerance*100).toFixed(1)}cm, time=${(timeTolerance*1000).toFixed(1)}ms)`)

    let allMatch = true
    for (let i = 0; i < minLength; i++) {
      const prod = prodEvents[i]
      const test = testEvents[i]

      const typeMatch = prod.type === test.type
      const timeDiff = Math.abs(prod.t - test.t)
      const dx = prod.pos.x - test.pos.x
      const dy = prod.pos.y - test.pos.y
      const dz = prod.pos.z - test.pos.z
      const posDiff = Math.sqrt(dx*dx + dy*dy + dz*dz)

      const timeMatch = timeDiff <= timeTolerance
      const posMatch = posDiff <= positionTolerance

      const status = (typeMatch && timeMatch && posMatch) ? '✅' : '❌'

      console.log(`\n   ${status} Event ${i+1}: ${prod.type}`)
      console.log(`      Type: ${prod.type} vs ${test.type} ${typeMatch ? '✅' : '❌'}`)
      console.log(`      Time: ${prod.t.toFixed(3)}s vs ${test.t.toFixed(3)}s (Δ=${(timeDiff*1000).toFixed(2)}ms) ${timeMatch ? '✅' : '❌'}`)
      console.log(`      Position: Δ=${(posDiff*100).toFixed(3)}cm ${posMatch ? '✅' : '❌'}`)
      console.log(`        Prod: [${prod.pos.x.toFixed(4)}, ${prod.pos.y.toFixed(4)}, ${prod.pos.z.toFixed(4)}]`)
      console.log(`        Test: [${test.pos.x.toFixed(4)}, ${test.pos.y.toFixed(4)}, ${test.pos.z.toFixed(4)}]`)

      // Jest assertions
      expect(test.type).toBe(prod.type)
      expect(timeDiff).toBeLessThanOrEqual(timeTolerance)
      expect(posDiff).toBeLessThanOrEqual(positionTolerance)

      if (!typeMatch || !timeMatch || !posMatch) {
        allMatch = false
      }
    }

    if (allMatch && prodEvents.length === testEvents.length) {
      console.log(`\n   🎉 PERFECT MATCH! Production and test environments produce identical results!`)
    } else if (allMatch) {
      console.log(`\n   ⚠️  Events match but counts differ (prod: ${prodEvents.length}, test: ${testEvents.length})`)
    } else {
      console.log(`\n   ❌ Some events don't match`)
    }
  })
})
