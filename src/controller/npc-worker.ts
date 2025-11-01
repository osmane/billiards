// Web Worker for NPC best-shot computation

// IMPORTANT: Workers don't have DOM access. Create minimal stubs to prevent crashes.
// This allows modules that check for window/document to load without errors.
if (typeof window === 'undefined') {
  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: (cb: any) => setTimeout(cb, 16),
    cancelAnimationFrame: (id: any) => clearTimeout(id),
  }
}
if (typeof document === 'undefined') {
  (globalThis as any).document = {
    createElement: () => ({}),
    createElementNS: () => ({}),
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  }
}
if (typeof navigator === 'undefined') {
  (globalThis as any).navigator = {
    userAgent: 'Worker',
  }
}

import { Table } from "../model/table"
import { Vector3 } from "three"
import { makeShotPoseFromAim, applyShotFromPose } from "../model/physics/shot"
import { ENGINE_DT } from "../model/physics/engine"
import { OutcomeType } from "../model/outcome"
import { TableGeometry } from "../view/tablegeometry"
import { CAROM_TABLE_LENGTH, CAROM_TABLE_WIDTH, CAROM_BALL_RADIUS } from "../model/physics/constants"

type NpcConfig = {
  minElevation: number
  maxElevation: number
  minPowerPct: number
  maxPowerPct: number
  minSpin: number
  maxSpin: number
  avoidKissStrict: boolean
  searchDensity: 'low' | 'medium' | 'high'
  enabled?: boolean
}

// White-area helpers (mirrors view logic)
const greyRatio = 0.75
const pitchFromElevation = (elevation: number) => Math.PI / 2 - elevation
function rotateX(v: [number, number, number], pitch: number): [number, number, number] {
  const sx = Math.sin(pitch), cx = Math.cos(pitch)
  const x = v[0]
  const y = cx * v[1] - sx * v[2]
  const z = sx * v[1] + cx * v[2]
  return [x, y, z]
}
function pushToWhiteArea(point: [number, number, number], pitch: number): [number, number, number] {
  const [rx, ry, rz] = rotateX(point, pitch)
  const tRaw = (ry + 1) * 0.5
  const threshold = 1 - greyRatio
  if (tRaw >= threshold) {
    const targetTRaw = threshold - 0.02
    const targetRY = targetTRaw * 2 - 1
    const sx = Math.sin(pitch), cx = Math.cos(pitch)
    const newY = cx * targetRY + sx * rz
    const newZ = -sx * targetRY + cx * rz
    const len = Math.sqrt(rx * rx + newY * newY + newZ * newZ) || 1
    return [rx / len, newY / len, newZ / len]
  }
  return point
}
function offsetToHitPoint(off: { x: number; y: number }): [number, number, number] {
  let nx = -off.x, ny = -off.y
  const r2 = nx * nx + ny * ny
  if (r2 >= 1) {
    const r = Math.sqrt(r2)
    nx = (nx / r) * 0.999
    ny = (ny / r) * 0.999
  }
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
  return [nx, ny, nz]
}
function hitPointToOffset(p: [number, number, number]): { x: number; y: number } {
  return { x: -p[0], y: -p[1] }
}
function isInWhiteArea(point: [number, number, number], pitch: number): boolean {
  const [, ry] = rotateX(point, pitch)
  const tRaw = (ry + 1) * 0.5
  const threshold = 1 - greyRatio
  return tRaw < threshold
}
function buildOffsetsAroundWhiteCenter(elevation: number, rMin: number, rMax: number, count: number = 48): { x: number; y: number }[] {
  // Deterministic equal-area polar sampling around white-center in offset space
  const pitch = pitchFromElevation(elevation)
  const lo = Math.max(0, Math.min(1, rMin))
  const hi = Math.max(lo, Math.min(1, rMax))
  const centerOffY = Math.cos(pitch)
  const golden = Math.PI * (3 - Math.sqrt(5))
  const target = Math.max(1, Math.floor(count))
  const out: { x: number; y: number }[] = []
  const maxIter = target * 40
  let i = 0
  while (out.length < target && i < maxIter) {
    const t = (i + 0.5) / target
    const r = Math.sqrt((1 - t) * lo * lo + t * hi * hi)
    const theta = golden * i
    const offX = r * Math.cos(theta)
    const offY = centerOffY + r * Math.sin(theta)
    let nx = -offX, ny = -offY
    const d2 = nx * nx + ny * ny
    if (d2 >= 1) {
      const d = Math.sqrt(d2) || 1
      nx = (nx / d) * 0.999
      ny = (ny / d) * 0.999
    }
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
    if (isInWhiteArea([nx, ny, nz], pitch)) {
      const cand = { x: -nx, y: -ny }
      if (!out.some(o => Math.abs(o.x - cand.x) < 1e-3 && Math.abs(o.y - cand.y) < 1e-3)) out.push(cand)
    }
    i++
  }
  // If still short, widen slightly
  let widen = 0.02
  while (out.length < target && widen < 0.15) {
    const newLo = Math.max(0, lo - widen)
    const newHi = Math.min(1, hi + widen)
    const need = target - out.length
    for (let k = 0; k < need; k++) {
      const idx = i + k
      const t = (idx + 0.5) / target
      const r = Math.sqrt((1 - t) * newLo * newLo + t * newHi * newHi)
      const theta = golden * idx
      const offX = r * Math.cos(theta)
      const offY = centerOffY + r * Math.sin(theta)
      let nx = -offX, ny = -offY
      const d2 = nx * nx + ny * ny
      if (d2 >= 1) {
        const d = Math.sqrt(d2) || 1
        nx = (nx / d) * 0.999
        ny = (ny / d) * 0.999
      }
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
      if (isInWhiteArea([nx, ny, nz], pitch)) {
        const cand = { x: -nx, y: -ny }
        if (!out.some(o => Math.abs(o.x - cand.x) < 1e-3 && Math.abs(o.y - cand.y) < 1e-3)) out.push(cand)
      }
    }
    i += need
    widen += 0.02
  }
  return out
}
function buildCandidates(table: Table, cfg: NpcConfig, sliceIndex?: number, sliceCount?: number) {
  const cue = table.cue
  const angleCount = (() => {
    switch (cfg.searchDensity) {
      case 'low': return 16
      case 'high': return 36
      default: return 24
    }
  })()
  // Base uniform angles
  const baseAngles: number[] = []
  for (let i = 0; i < angleCount; i++) baseAngles.push((i * 2 * Math.PI) / angleCount)
  // Remove first eight uniformly
  const trimmedAngles = baseAngles.slice(8)
  // Side-angles around object balls with two thickness levels
  const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  const cueBall = table.cueball
  const others = table.balls.filter((b) => b !== cueBall)
  const sideAngles: number[] = []
  try {
    const rCue = Math.max(1e-6, (cueBall as any)?.radius ?? 0.028)
    const thicknesses = [0.5, 0.2]
    for (let k = 0; k < Math.min(2, others.length); k++) {
      const ob = others[k]
      if (!ob) continue
      const dx = ob.pos.x - cueBall.pos.x
      const dy = ob.pos.y - cueBall.pos.y
      const dist = Math.hypot(dx, dy)
      const r = Math.max(rCue, (ob as any).radius || rCue)
      const base = Math.atan2(dy, dx)
      for (const thickness of thicknesses) {
        let delta = Math.asin(Math.min(0.95, (r * thickness) / Math.max(1e-6, dist)))
        if (!isFinite(delta) || delta <= 0) delta = thickness === 0.2 ? 0.12 : 0.28
        sideAngles.push(norm(base - delta), norm(base + delta))
      }
    }
  } catch {}
  // Compose and dedupe
  const allAngles: number[] = []
  const pushUnique = (a: number) => {
    if (!allAngles.some((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-3)) allAngles.push(a)
  }
  sideAngles.forEach(pushUnique)
  trimmedAngles.forEach(pushUnique)
  // Apply slicing over the final sequence, if requested
  let angles: number[] = []
  if (typeof sliceIndex === 'number' && typeof sliceCount === 'number' && sliceCount > 1) {
    for (let i = 0; i < allAngles.length; i++) if ((i % sliceCount) === sliceIndex) angles.push(allAngles[i])
  } else {
    angles = allAngles
  }
  // For both modes we will compute offsets per elevation later using Fibonacci sampling
  if (!cfg.enabled) {
    const elevations = [ Math.max(0, cue.defaultElevation ?? 0.17) ]
    const powers = [ cue.maxPower * 0.50, cue.maxPower * 0.70, cue.maxPower * 0.85 ]
    return { angles, offsets: [], elevations, powers }
  }
  const dirAngles = [0, Math.PI/4, Math.PI/2, 3*Math.PI/4, Math.PI, -3*Math.PI/4, -Math.PI/2, -Math.PI/4]
  const radii: number[] = []
  const addR = (r: number) => { const rr = Math.max(0, Math.min(1, r)); if (!radii.includes(rr)) radii.push(rr) }
  const rMin = cfg.minSpin, rMax = cfg.maxSpin
  addR(rMin); addR((rMin + rMax) * 0.5); addR(rMax); if (rMin === 0) addR(0)
  const offsets: { x: number; y: number }[] = []
  const eMin = cfg.minElevation, eMax = cfg.maxElevation, eMid = (eMin + eMax) * 0.5
  // Single elevation step at midpoint
  const elevations = [eMid]
  const pMin = Math.max(0, Math.min(1, cfg.minPowerPct)) * cue.maxPower
  const pMax = Math.max(0, Math.min(1, cfg.maxPowerPct)) * cue.maxPower
  const pMid = (pMin + pMax) * 0.5
  // Constraints enabled: single power level at midpoint
  const powers = [pMid]
  return { angles, offsets, elevations, powers }
}

function scoreShot(p: { angle: number; offset: { x: number; y: number }; elevation: number; power: number }, hadKiss: boolean, firstBall: boolean): number {
  const offsetLen = Math.hypot(p.offset.x, p.offset.y)
  const elevDeg = (p.elevation * 180) / Math.PI
  const penaltyNatural = 300 * offsetLen + 2.0 * elevDeg + 0.002 * p.power
  const penaltyKiss = hadKiss ? 500 : 0
  // Preference: first event weighting -> ~90% ball, ~10% cushion
  const baseFirst = 60
  const penaltyFirstEvent = baseFirst * (firstBall ? 0.1 : 0.9)
  const base = 1000
  return base - (penaltyNatural + penaltyKiss + penaltyFirstEvent)
}

function simulateThreeCushion(sim: Table, cueBallId: number, p: { angle: number; offset: { x: number; y: number }; elevation: number; power: number }): { success: boolean; hadKiss: boolean; firstBall: boolean } {
  try {
    const simCueBall = sim.balls.find(b => b.id === cueBallId)
    if (!simCueBall) return { success: false, hadKiss: false, firstBall: false }
    sim.cueball = simCueBall
    sim.cue.aim.i = sim.balls.indexOf(simCueBall)
    const aim = { angle: p.angle, offset: new Vector3(p.offset.x, p.offset.y, 0), power: p.power }
    const pose = makeShotPoseFromAim(simCueBall, aim, p.elevation)
    applyShotFromPose(simCueBall, pose)

    let t = 0
    let processed = 0
    let cushions = 0
    const objectSet = new Set<number>()
    const objectHits = new Map<number, number>()
    let totalObjectCollisions = 0
    let hadKiss = false
    let firstEvent: 'none' | 'cushion' | 'ball' = 'none'

    // Enhanced kiss detection bookkeeping
    const objBalls = sim.balls.filter((b) => b !== simCueBall)
    const objIds = new Set<number>(objBalls.map(b => b.id))
    const cueHitTimeByObj = new Map<number, number>()
    let secondBallMovedEarly = false

    while (t < 12.0) {
      sim.advance(ENGINE_DT)
      t += ENGINE_DT
      const newOutcomes = sim.outcome.slice(processed)
      processed = sim.outcome.length
      for (const o of newOutcomes) {
        if (o.type === OutcomeType.Cushion) {
          if (o.ballA === simCueBall) {
            if (firstEvent === 'none') firstEvent = 'cushion'
            cushions++
          }
        } else if (o.type === OutcomeType.Collision) {
          const a = o.ballA, b = o.ballB
          const aIsCue = a === simCueBall
          const bIsCue = b === simCueBall
          if (aIsCue || bIsCue) {
            if (firstEvent === 'none') firstEvent = 'ball'
            const other = aIsCue ? b : a
            if (other && other !== simCueBall) {
              const id = other.id
              objectSet.add(id)
              totalObjectCollisions++
              const prev = objectHits.get(id) ?? 0
              objectHits.set(id, prev + 1)
              if (prev + 1 > 1 || totalObjectCollisions > 2) hadKiss = true
              if (!cueHitTimeByObj.has(id)) cueHitTimeByObj.set(id, t)
              else if (objectSet.size < 2) hadKiss = true
              if (objectSet.size >= 2) {
                return { success: cushions >= 3, hadKiss: hadKiss || secondBallMovedEarly, firstBall: firstEvent === 'ball' }
              }
            }
          } else if (a && b && objIds.has(a.id) && objIds.has(b.id)) {
            // Object-object collision
            if (cueHitTimeByObj.size === 1) {
              secondBallMovedEarly = true
            }
          }
        }
      }
      if (sim.allStationary()) break
    }
    return { success: false, hadKiss, firstBall: firstEvent === 'ball' }
  } catch { return { success: false, hadKiss: false } }
  finally {
    try {
      if (sim && Array.isArray(sim.balls)) {
        sim.balls.forEach((b: any) => {
          try { b.ballmesh && b.ballmesh.dispose && b.ballmesh.dispose() } catch {}
        })
      }
    } catch {}
    // Dispose cue meshes/materials created for the simulation table
    try {
      const cue: any = (sim as any).cue
      const disposeMesh = (m: any) => {
        try { m && m.geometry && m.geometry.dispose && m.geometry.dispose() } catch {}
      }
      disposeMesh(cue?.mesh)
      disposeMesh(cue?.placerMesh)
      disposeMesh(cue?.hitPointMesh)
      disposeMesh(cue?.virtualCueMesh)
    } catch {}
    try { (sim as any).outcome = [] } catch {}
  }
}

function findBest(tableData: any, rulesName: string, cfg: NpcConfig, cueIndexParam?: number, cueBallId?: number, sliceIndex?: number, sliceCount?: number) {
  // Apply table geometry if needed (carom)
  if (rulesName === 'threecushion') {
    TableGeometry.setCaromDimensions(CAROM_TABLE_LENGTH, CAROM_TABLE_WIDTH, CAROM_BALL_RADIUS)
  }
  const table = Table.fromSerialised(tableData, { headless: true })

  // Apply cue metadata if provided (maxPower, defaultElevation)
  if (tableData.cue) {
    if (typeof tableData.cue.maxPower === 'number') {
      table.cue.maxPower = tableData.cue.maxPower
    }
    if (typeof tableData.cue.defaultElevation === 'number') {
      table.cue.defaultElevation = tableData.cue.defaultElevation
    }
  }

  // Use provided cueBallId if available, otherwise use cueIndex
  let activeCueBall: any
  if (typeof cueBallId === 'number') {
    activeCueBall = table.balls.find(b => b.id === cueBallId)
    if (!activeCueBall) return null
  } else {
    const cueIndex = typeof cueIndexParam === 'number' && cueIndexParam >= 0
      ? cueIndexParam
      : table.balls.indexOf(table.cueball)
    if (cueIndex < 0 || cueIndex >= table.balls.length) return null
    activeCueBall = table.balls[cueIndex]
  }

  table.cueball = activeCueBall

  const { angles, offsets: baseOffsets, elevations, powers } = buildCandidates(table, cfg, sliceIndex, sliceCount)
  let bestClean: any = null
  let bestKiss: any = null
  let fallback: any = null
  const kissAllowed = !cfg.avoidKissStrict
  const cueBallIdForSim = activeCueBall.id
  for (const angle of angles) for (const elevation of elevations) {
    const offsetCount = (() => { switch (cfg.searchDensity) { case 'low': return 24; case 'high': return 96; default: return 48 } })()
    const [rMin, rMax] = cfg.enabled ? [cfg.minSpin, cfg.maxSpin] : [0.0, 0.22]
    const offsets = buildOffsetsAroundWhiteCenter(elevation, rMin, rMax, offsetCount)
    for (const offset of offsets) for (const power of powers) {
      const sim = Table.fromSerialised(tableData, { headless: true })
      const res = simulateThreeCushion(sim, cueBallIdForSim, { angle, offset, elevation, power })
      if (!res.success) {
        const sc = scoreShot({ angle, offset, elevation, power }, res.hadKiss, res.firstBall)
        if (!fallback || sc > fallback.score) fallback = { angle, offset, elevation, power, score: sc }
        continue
      }
      const sc = scoreShot({ angle, offset, elevation, power }, res.hadKiss, res.firstBall)
      const cand = { angle, offset, elevation, power, score: sc, hadKiss: res.hadKiss }
      if (res.hadKiss) {
        if (!kissAllowed) continue
        if (!bestKiss || sc > bestKiss.score) bestKiss = cand
      } else {
        if (!bestClean || sc > bestClean.score) {
          bestClean = cand
          if (bestClean.score > 980) return bestClean
        }
      }
    }
  }
  try { return bestClean ?? bestKiss ?? fallback } finally {
    // Dispose the candidate-generation table as well
    try {
      if (table && Array.isArray(table.balls)) {
        table.balls.forEach((b: any) => {
          try { b.ballmesh && b.ballmesh.dispose && b.ballmesh.dispose() } catch {}
        })
      }
    } catch {}
    // Dispose cue meshes/materials created for the top-level table
    try {
      const cue: any = (table as any).cue
      const disposeMesh = (m: any) => {
        try { m && m.geometry && m.geometry.dispose && m.geometry.dispose() } catch {}
      }
      disposeMesh(cue?.mesh)
      disposeMesh(cue?.placerMesh)
      disposeMesh(cue?.hitPointMesh)
      disposeMesh(cue?.virtualCueMesh)
    } catch {}
    try { (table as any).outcome = [] } catch {}
  }
}

self.onmessage = (e: MessageEvent) => {
  const data = e.data || {}
  if (data.type === 'compute') {
    try {
      const cueIdx = typeof data.cueIndex === 'number' ? data.cueIndex : undefined
      const cueBallId = typeof data.cueBallId === 'number' ? data.cueBallId : undefined
      const sx = typeof data.sliceIndex === 'number' ? data.sliceIndex : undefined
      const sc = typeof data.sliceCount === 'number' ? data.sliceCount : undefined
      const best = findBest(data.table, data.rulesName, data.config, cueIdx, cueBallId, sx, sc)
      ;(self as any).postMessage({ type: 'result', best })
    } catch {
      ;(self as any).postMessage({ type: 'result', best: null })
    }
  }
}
