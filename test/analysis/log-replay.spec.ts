import fs from 'fs'
import path from 'path'
import { Table } from '../../src/model/table'
import { AimEvent } from '../../src/events/aimevent'
import { TrajectoryPredictor } from '../../src/model/trajectorypredictor'
import { Vector3 } from 'three'
import { applyShotFromPose } from '../../src/model/physics/shot'
import { TableGeometry } from '../../src/view/tablegeometry'

// Enable trace logging for test environment
(global as any).__trajectoryTrace = 'file'

function findLatestLog(): string | null {
  const dir = path.resolve(__dirname, '../../logs')
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir).filter(f => /^trajectory-.*\.log$/.test(f))
  if (files.length === 0) return null
  files.sort((a,b) => fs.statSync(path.join(dir,b)).mtimeMs - fs.statSync(path.join(dir,a)).mtimeMs)
  return path.join(dir, files[0])
}

type ShotLine = {
  label: 'shot'
  data: any
}

type EventLine = {
  label: 'event'
  data: any
}

describe('Replay shot from logs and compare to simulation + helper', () => {
  const latest = findLatestLog()
  if (!latest) {
    test.skip('no logs/trajectory-*.log present; skipping replay test', () => {})
    return
  }

  const lines = fs.readFileSync(latest, 'utf8').split(/\r?\n/).filter(Boolean)
  const json = lines.map((l, idx) => { try { return JSON.parse(l) } catch (e) { throw new Error(`Bad JSON at line ${idx+1} in ${latest}`) } })
  const shots: ShotLine[] = json.filter((o: any) => o.label === 'shot')
  const events: EventLine[] = json.filter((o: any) => o.label === 'event')

  if (shots.length === 0) {
    test.skip('no shot lines found in the latest log', () => {})
    return
  }

  const shot = shots[shots.length - 1].data
  const shotId = shot.shotId
  const expectedEvents = events.filter(e => e.data.shotId === shotId).map(e => e.data)

  test(`replay shotId=${shotId} and compare events`, () => {
    // Apply logged table geometry
    const tg = shot.tableGeometry
    if (tg) {
      TableGeometry.tableX = tg.tableX
      TableGeometry.tableY = tg.tableY
      TableGeometry.X = tg.X
      TableGeometry.Y = tg.Y
      TableGeometry.hasPockets = !!tg.hasPockets
    }

    // Build table state
    const table = Table.fromSerialised(shot.table)
    const cueBall = table.balls.find(b => b.id === shot.ballId) || table.cueball

    // Apply the shot
    const cueDir = new Vector3(shot.cueDir.x, shot.cueDir.y, shot.cueDir.z)
    const hitPointWorld = new Vector3(shot.hitPointWorld.x, shot.hitPointWorld.y, shot.hitPointWorld.z)
    const elevation = Number(shot.elevation) || 0
    const power = Number(shot.aim?.power ?? 0)

    applyShotFromPose(cueBall, { cueDir, hitPointWorld, elevation, power })

    // Step simulation and capture events
    const engineDt = Number(shot.engineDt) || 0.005
    let t = 0
    let processed = 0
    const got: any[] = []
    let wasMoving = false
    let stopLogged = false

    const maxTime = 10 // seconds cap
    while (t < maxTime) {
      table.advance(engineDt)
      t += engineDt

      // read new outcomes
      const newOutcomes = table.outcome.slice(processed)
      processed = table.outcome.length
      newOutcomes.forEach(o => {
        if (o.type === 'Collision') {
          const aId = o.ballA?.id
          const bId = o.ballB?.id
          if (aId === cueBall.id || bId === cueBall.id) {
            const other = aId === cueBall.id ? (bId ?? null) : (aId ?? null)
            got.push({ type: 'collision', t, pos: { x: cueBall.pos.x, y: cueBall.pos.y, z: cueBall.pos.z }, otherBallId: other })
          }
        } else if (o.type === 'Cushion') {
          const id = o.ballA?.id
          if (id === cueBall.id) {
            got.push({ type: 'cushion', t, pos: { x: cueBall.pos.x, y: cueBall.pos.y, z: cueBall.pos.z } })
          }
        }
      })

      if (cueBall.inMotion()) {
        wasMoving = true
      } else if (wasMoving && !stopLogged) {
        got.push({ type: 'stop', t, pos: { x: cueBall.pos.x, y: cueBall.pos.y, z: cueBall.pos.z } })
        stopLogged = true
        break
      }

      if (table.allStationary()) break
    }

    // Compare sequences with tolerances
    const tolePos = 1e-3
    const toleTime = engineDt * 2 + 1e-6

    // Only compare up to the min length to avoid excess
    const n = Math.min(expectedEvents.length, got.length)
    for (let i=0; i<n; i++) {
      const exp = expectedEvents[i]
      const act = got[i]
      expect(act.type).toBe(exp.type)
      expect(Math.abs(act.t - exp.t)).toBeLessThanOrEqual(toleTime)
      const dx = act.pos.x - exp.pos.x
      const dy = act.pos.y - exp.pos.y
      const dz = act.pos.z - exp.pos.z
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz)
      expect(dist).toBeLessThanOrEqual(tolePos)
    }
  })

  test(`trajectory helper parity for shotId=${shotId}`, () => {
    // Setup geometry as above
    const tg = shot.tableGeometry
    if (tg) {
      TableGeometry.tableX = tg.tableX
      TableGeometry.tableY = tg.tableY
      TableGeometry.X = tg.X
      TableGeometry.Y = tg.Y
      TableGeometry.hasPockets = !!tg.hasPockets
    }

    const table = Table.fromSerialised(shot.table)

    const aim = AimEvent.fromJson({
      angle: shot.aim?.angle ?? 0,
      offset: shot.aim?.offset ?? { x:0, y:0, z:0 },
      power: shot.aim?.power ?? 0,
      elevation: shot.elevation ?? 0,
      pos: { x: 0, y: 0, z: 0 }
    })

    const predictor = new TrajectoryPredictor()
    const preds = predictor.predictTrajectory(table, aim, undefined, undefined, shot.elevation, undefined)

    const cueBallPred = preds.find(p => p.ballId === shot.ballId)
    expect(cueBallPred).toBeTruthy()
    expect(cueBallPred!.points.length).toBeGreaterThan(0)

        let firstEvent = expectedEvents.find(e => e.type === 'collision' || e.type === 'cushion' || e.type === 'stop')
    if (!firstEvent) {
      // simulate to get first event if log lacks event lines
      const table2 = Table.fromSerialised(shot.table)
      const cueBall2 = table2.balls.find(b => b.id === shot.ballId) || table2.cueball
      const cueDir2 = new Vector3(shot.cueDir.x, shot.cueDir.y, shot.cueDir.z)
      const hitPointWorld2 = new Vector3(shot.hitPointWorld.x, shot.hitPointWorld.y, shot.hitPointWorld.z)
      applyShotFromPose(cueBall2, { cueDir: cueDir2, hitPointWorld: hitPointWorld2, elevation: shot.elevation ?? 0, power: shot.aim?.power ?? 0 })
      const dt2 = Number(shot.engineDt) || 0.005
      let t2 = 0; let processed2 = 0; let wasMoving2 = false
      for (let s=0; s<100000; s++) {
        table2.advance(dt2); t2 += dt2
        const newOut = table2.outcome.slice(processed2); processed2 = table2.outcome.length
        let candidate: any = null
        for (const o of newOut) {
          if (o.type === 'Collision') {
            if (o.ballA?.id === cueBall2.id || o.ballB?.id === cueBall2.id) { candidate = { type: 'collision', t: t2, pos: { x: cueBall2.pos.x, y: cueBall2.pos.y, z: cueBall2.pos.z } }; break }
          } else if (o.type === 'Cushion') {
            if (o.ballA?.id === cueBall2.id) { candidate = { type: 'cushion', t: t2, pos: { x: cueBall2.pos.x, y: cueBall2.pos.y, z: cueBall2.pos.z } }; break }
          }
        }
        if (candidate) { firstEvent = candidate; break }
        if (cueBall2.inMotion()) { wasMoving2 = true } else if (wasMoving2) { firstEvent = { type: 'stop', t: t2, pos: { x: cueBall2.pos.x, y: cueBall2.pos.y, z: cueBall2.pos.z } }; break }
        if (table2.allStationary()) break
      }
    }
    expect(firstEvent).toBeTruthy()

    if (cueBallPred!.firstImpactIndex !== undefined) {
      const pt = cueBallPred!.points[cueBallPred!.firstImpactIndex]
      const tol = 1e-2 // helper tolerance a bit looser
      const dx = pt.position.x - firstEvent!.pos.x
      const dy = pt.position.y - firstEvent!.pos.y
      const dz = pt.position.z - firstEvent!.pos.z
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz)
      expect(dist).toBeLessThanOrEqual(tol)
    }
  })
})