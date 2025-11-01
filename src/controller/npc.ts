import type { Container } from "../container/container"
import { Table } from "../model/table"
import { Outcome, OutcomeType } from "../model/outcome"
import { Vector3 } from "three"
import { makeShotPoseFromAim, applyShotFromPose } from "../model/physics/shot"
import { ENGINE_DT } from "../model/physics/engine"

export type NpcConfig = {
  minElevation: number // radians
  maxElevation: number // radians
  minPowerPct: number  // 0..1 of cue.maxPower
  maxPowerPct: number  // 0..1 of cue.maxPower
  minSpin: number      // normalized 0..1 distance from center
  maxSpin: number      // normalized 0..1 distance from center
  avoidKissStrict: boolean // if true, disallow kiss entirely
  searchDensity: 'low' | 'medium' | 'high'
  enabled?: boolean // if false, use fast pre-panel defaults
}

/**
 * Deterministic NPC bot for selecting and executing a professional carom (three-cushion) shot.
 *
 * Strategy (deterministic, simple baseline):
 * - Grid search over a compact set of aim angles, spin offsets, elevations, and powers.
 * - For each candidate, simulate on a cloned table until success decided or stationary.
 * - Success = Outcome.isThreeCushionPoint for active cue ball.
 * - Among successful candidates, prefer more "natural" shots: lower elevation, moderate power, smaller tip offset.
 * - If a valid shot is found, apply settings to real cue and shoot.
 */
export class NpcBot {
  // ---- Worker Pool & Adaptive Management ----
  private static workerPool: Worker[] = []
  private static workerPoolSize = 0
  private static readonly WORKER_TIMEOUT_MS = 30000 // 30 seconds
  private static workerStats = {
    lastWorkerCount: 0,
    lastDuration: 0,
    optimalWorkerCount: 0,
    memoryPressure: false,
    adaptiveEnabled: true, // Can be disabled for debugging
    callCount: 0,
  }

  // ---- White-area helpers (aligned with view/precision panel logic) ----
  private static readonly greyRatio = 0.75
  private static pitchFromElevation(elevation: number) { return Math.PI / 2 - elevation }
  private static rotateX(v: [number, number, number], pitch: number): [number, number, number] {
    const sx = Math.sin(pitch), cx = Math.cos(pitch)
    const x = v[0]
    const y = cx * v[1] - sx * v[2]
    const z = sx * v[1] + cx * v[2]
    return [x, y, z]
  }
  private static isInWhiteArea(point: [number, number, number], pitch: number): boolean {
    const [, ry] = this.rotateX(point, pitch)
    const tRaw = (ry + 1) * 0.5
    const threshold = 1 - this.greyRatio
    return tRaw < threshold
  }
  private static pushToWhiteArea(point: [number, number, number], pitch: number): [number, number, number] {
    const [rx, ry, rz] = this.rotateX(point, pitch)
    const tRaw = (ry + 1) * 0.5
    const threshold = 1 - this.greyRatio
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
  private static offsetToHitPoint(off: { x: number; y: number }): [number, number, number] {
    // offset.x/y are negatives of hitPoint x/y
    let nx = -off.x
    let ny = -off.y
    const r2 = nx * nx + ny * ny
    if (r2 >= 1) {
      const r = Math.sqrt(r2)
      nx = (nx / r) * 0.999
      ny = (ny / r) * 0.999
    }
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
    return [nx, ny, nz]
  }
  private static hitPointToOffset(p: [number, number, number]): { x: number; y: number } {
    return { x: -p[0], y: -p[1] }
  }
  private static buildOffsetsAroundWhiteCenter(elevation: number, rMin: number, rMax: number, count: number = 48): { x: number; y: number }[] {
    // Deterministic equal-area polar sampling around white-center in offset space
    const pitch = this.pitchFromElevation(elevation)
    const lo = Math.max(0, Math.min(1, rMin))
    const hi = Math.max(lo, Math.min(1, rMax))
    const centerOffY = Math.cos(pitch)
    const golden = Math.PI * (3 - Math.sqrt(5)) // ~2.399963
    const target = Math.max(1, Math.floor(count))
    const out: { x: number; y: number }[] = []
    const maxIter = target * 40
    let i = 0
    while (out.length < target && i < maxIter) {
      const t = (i + 0.5) / target
      // Equal-area radius within annulus
      const r = Math.sqrt((1 - t) * lo * lo + t * hi * hi)
      const theta = golden * i
      const offX = r * Math.cos(theta)
      const offY = centerOffY + r * Math.sin(theta)
      // Validate inside unit disk and white area on sphere
      let nx = -offX, ny = -offY
      const d2 = nx * nx + ny * ny
      if (d2 >= 1) {
        const d = Math.sqrt(d2) || 1
        nx = (nx / d) * 0.999
        ny = (ny / d) * 0.999
      }
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
      if (this.isInWhiteArea([nx, ny, nz] as any, pitch)) {
        const cand = { x: -nx, y: -ny }
        if (!out.some(o => Math.abs(o.x - cand.x) < 1e-3 && Math.abs(o.y - cand.y) < 1e-3)) out.push(cand)
      }
      i++
    }
    // If still short, widen slightly and continue
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
        if (this.isInWhiteArea([nx, ny, nz] as any, pitch)) {
          const cand = { x: -nx, y: -ny }
          if (!out.some(o => Math.abs(o.x - cand.x) < 1e-3 && Math.abs(o.y - cand.y) < 1e-3)) out.push(cand)
        }
      }
      i += need
      widen += 0.02
    }
    return out
  }
  static getDefaultConfig(container: Container): NpcConfig {
    const cue = container.table.cue
    return {
      minElevation: 0.0,
      maxElevation: Math.max(0.17, cue.defaultElevation ?? 0.17) + 0.10, // ~10-16°
      minPowerPct: 0.40,
      maxPowerPct: 0.85,
      minSpin: 0.00,
      maxSpin: 0.22,
      avoidKissStrict: false,
      searchDensity: 'medium',
      enabled: false,
    }
  }

  private static readConfig(container: Container): NpcConfig {
    const cfg = (container as any).npcConfig as NpcConfig | undefined
    if (!cfg) return this.getDefaultConfig(container)
    // Basic sanitization and clamping
    const safe = this.getDefaultConfig(container)
    const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
    const out: NpcConfig = {
      minElevation: clamp(cfg.minElevation, 0, Math.PI / 2),
      maxElevation: clamp(cfg.maxElevation, 0, Math.PI / 2),
      minPowerPct: clamp(cfg.minPowerPct, 0, 1),
      maxPowerPct: clamp(cfg.maxPowerPct, 0, 1),
      minSpin: clamp(cfg.minSpin, 0, 1),
      maxSpin: clamp(cfg.maxSpin, 0, 1),
      avoidKissStrict: !!cfg.avoidKissStrict,
      searchDensity: cfg.searchDensity ?? safe.searchDensity,
      enabled: cfg.enabled === true,
    }
    if (out.minElevation > out.maxElevation) [out.minElevation, out.maxElevation] = [out.maxElevation, out.minElevation]
    if (out.minPowerPct > out.maxPowerPct) [out.minPowerPct, out.maxPowerPct] = [out.maxPowerPct, out.minPowerPct]
    if (out.minSpin > out.maxSpin) [out.minSpin, out.maxSpin] = [out.maxSpin, out.minSpin]
    return out
  }
  /** Simple sleep helper */
  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  // Yield to browser to allow UI to paint (e.g., spinner)
  private static waitNextFrame(): Promise<void> {
    return new Promise((resolve) =>
      (typeof requestAnimationFrame !== 'undefined')
        ? requestAnimationFrame(() => resolve())
        : setTimeout(resolve, 0)
    )
  }

  /** Interpolate between two angles, taking shortest path */
  private static interpolateAngle(from: number, to: number, t: number): number {
    // Normalize angles to [0, 2π]
    from = ((from % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    to = ((to % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)

    // Calculate shortest angular difference
    let diff = to - from
    if (diff > Math.PI) diff -= 2 * Math.PI
    if (diff < -Math.PI) diff += 2 * Math.PI

    return from + diff * t
  }

  /** Ease-in-out cubic for smooth animation */
  private static easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  }

  // Toggle spinner overlays on NPC button and current cue ball's score button
  private static setThinkingUI(container: Container, thinking: boolean) {
    try {
      if (typeof document === 'undefined') return
      const npcBtn = document.getElementById('npc') as HTMLElement | null
      if (npcBtn) npcBtn.classList.toggle('is-busy', thinking)

      const rules: any = (container as any).rules
      const table: any = (container as any).table
      const cue = rules?.cueball ?? table?.cueball
      const left = document.getElementById('customBtnLeft')
      const right = document.getElementById('customBtnRight')
      if (cue && table) {
        const isWhite = cue === table.balls?.[0]
        const isYellow = cue === table.balls?.[1]
        if (left && (isWhite || (!isWhite && !isYellow))) left.classList.toggle('is-busy', thinking)
        if (right && isYellow) right.classList.toggle('is-busy', thinking)
      }
      // Disable bottom control panel while thinking (camera & score buttons remain outside)
      const panel = document.querySelector('.panel') as HTMLElement | null
      if (panel) panel.classList.toggle('is-disabled', thinking)
      // Show NPC allowed spin overlay only while computing
      try { container.table?.cue?.aimInputs?.setNpcAllowedSpinOverlayVisible?.(thinking) } catch {}
    } catch {}
  }

  // Explicitly disable/enable bottom control panel inputs (pointer-events)
  private static setPanelDisabled(container: Container, disabled: boolean) {
    try {
      if (typeof document === 'undefined') return
      const panel = document.querySelector('.panel') as HTMLElement | null
      if (panel) panel.classList.toggle('is-disabled', !!disabled)
    } catch {}
  }

  /** Try to take a shot now. Only runs in single-player aim state when balls are stationary. */
  static async takeShot(container: Container) {
    try {
      // Preconditions - NPC only works in single player practice mode
      if (!container.isSinglePlayer) {
        container?.chat?.showMessage?.("NPC: Sadece tek oyunculu pratik modunda çalışır.")
        return
      }
      if (!container?.table || !container.table.allStationary()) {
        container?.chat?.showMessage?.("NPC: Bekliyorum, toplar hareket ediyor.")
        return
      }
      const rulename = container?.rules?.rulename ?? ""
      if (rulename !== "threecushion") {
        container?.chat?.showMessage?.("NPC: Şimdilik yalnızca 3-bant modunda destekleniyor.")
        return
      }

      container.chat?.showMessage?.("NPC: En güvenli 3-bant atışı arıyorum...")

      // Align table.cueball with rules.cueball before heavy compute
      // Prefer rules.cueball (turn owner). In multiplayer, let rules prepare local state.
      try {
        if (!container.isSinglePlayer) {
          ;(container.rules as any)?.prepareForLocalTurn?.()
        }
        const rb = container.rules?.cueball ?? container.table.cueball
        if (rb) {
          container.table.cueball = rb
          const idx = container.table.balls.indexOf(rb)
          container.table.cue.aim.i = idx
          // Keep cue aim position and visuals aligned with the active cue ball
          try {
            container.table.cue.aim.pos.copy(rb.pos)
            container.table.cue.moveTo(rb.pos)
            container.table.cue.updateAimInput()
            container.updateTrajectoryPrediction()
          } catch {}
        }
      } catch {}

      NpcBot.setThinkingUI(container, true)
      // Yield a frame, then a tiny timeout to ensure paint before heavy compute
      await (new Promise((resolve) => (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(() => resolve(null)) : setTimeout(resolve, 0))))
      await NpcBot.sleep(50)

      // Prefer multi-worker computation if available; fallback to cooperative
      let best = await NpcBot.computeBestShotInWorkers(container)
      if (!best) {
        // Fallback to single-thread cooperative search to preserve legacy behavior
        best = await NpcBot.computeBestShotCooperative(container)
      }
      if (!best) {
        NpcBot.setThinkingUI(container, false)
        container.chat?.showMessage?.("NPC: Uygun deterministik sayı atışı bulamadım.")
        return
      }

      NpcBot.setThinkingUI(container, false)
      // Lock panel and camera while NPC applies staged settings
      NpcBot.setPanelDisabled(container, true)
      try { ;(container as any).lockCameraControls?.(true) } catch {}

      // Apply chosen parameters to the real cue, showing them on UI with delays
      const cue = container.table.cue
      const table = container.table

      // Ensure cueball index is aligned with rules (important in 3-cushion)
      const activeCueBall = container.rules?.cueball ?? table.cueball
      cue.aim.i = table.balls.indexOf(activeCueBall)
      // Also set table.cueball explicitly to ensure outcomes track the correct player ball
      try { container.table.cueball = activeCueBall } catch {}

      // Prepare camera for animation
      let shouldAnimate = false
      try {
        ;(container as any).lockCameraControls?.(true)
        const cam = container.view.camera

        // Only animate if user is in aim view, preserve top view if that's active
        if (cam.mode === cam.aimView) {
          shouldAnimate = true
          ;(container as any).setNpcAnimating?.(true) // Force rendering during animation
          // Force aim view to guarantee smooth transition
          cam.forceMode(cam.aimView)
          // Reset all dynamic adjustments for clean animation
          cam.resetDynamicAdjustments(activeCueBall.pos)
        }
      } catch {}

      // Save current angle for smooth transition
      const startAngle = cue.aim.angle
      const targetAngle = best.angle

      // Apply all parameters immediately (visual display)
      cue.elevation = best.elevation
      cue.aim.elevation = best.elevation
      // Ensure non-trivial power and clamp to max
      cue.aim.power = Math.max(0, Math.min(cue.maxPower, best.power))
      cue.aim.offset.copy(new Vector3(best.offset.x, best.offset.y, 0))

      // Reset angle to start position for animation
      cue.aim.angle = startAngle
      cue.moveTo(activeCueBall.pos)
      cue.updateAimInput()
      container.updateTrajectoryPrediction()

      // Animate camera by smoothly rotating from startAngle to targetAngle
      // Only animate if user is in aim view mode
      if (shouldAnimate) {
        const animationDuration = 3000 // 3 seconds
        const startTime = (typeof performance !== 'undefined') ? performance.now() : Date.now()
        let frameCount = 0

        while (true) {
          const now = (typeof performance !== 'undefined') ? performance.now() : Date.now()
          const elapsed = now - startTime

          if (elapsed >= animationDuration) {
            // Animation complete
            break
          }

          // Calculate interpolation factor with easing
          const t = Math.min(elapsed / animationDuration, 1.0)
          const eased = this.easeInOutCubic(t)

          // Interpolate angle with shortest path
          const currentAngle = this.interpolateAngle(startAngle, targetAngle, eased)

          // Update cue with interpolated angle
          cue.aim.angle = currentAngle
          cue.moveTo(activeCueBall.pos)
          cue.updateAimInput()
          container.updateTrajectoryPrediction()

          frameCount++

          // Wait for next frame to allow rendering
          await this.waitNextFrame()
        }

        // Brief pause to let camera settle
        await this.sleep(200)
      }

      // Ensure final angle is exactly set
      cue.aim.angle = targetAngle
      cue.moveTo(activeCueBall.pos)
      cue.updateAimInput()
      container.updateTrajectoryPrediction()

      // Animation complete - disable forced rendering
      try {
        ;(container as any).setNpcAnimating?.(false)
      } catch {}

      // Fire the shot via the normal controller path (HitEvent -> PlayShot)
      // CRITICAL: Ensure rules.cueball is synced before the shot for outcome validation
      const finalCueBall = container.table.cueball
      if (container.rules) {
        ;(container.rules as any).cueball = finalCueBall
      }

      const { HitEvent } = require("../events/hitevent")
      const { PlayShot } = require("./playshot")
      const hitEvent = new HitEvent(container.table.serialise())
      container.sendEvent(hitEvent)
      container.recorder.record(hitEvent)
      container.updateController(new PlayShot(container))
      try { ;(container as any).lockCameraControls?.(false) } catch {}
      try { NpcBot.setPanelDisabled(container, false) } catch {}

      container.chat?.showMessage?.("NPC: Atis yapildi. Bol sans!")
    } catch (e) {
      try { NpcBot.setThinkingUI(container, false) } catch {}
      try { ;(container as any).setNpcAnimating?.(false) } catch {}
      try { ;(container as any).lockCameraControls?.(false) } catch {}
      try { NpcBot.setPanelDisabled(container, false) } catch {}
      try { container?.chat?.showMessage?.("NPC: Hata olustu, atis iptal.") } catch {}
      // eslint-disable-next-line no-console
      console.error("NPC bot error:", e)
    }

  }

  // ---- Adaptive Worker Pool Management ----

  /** Check if memory pressure is high (Chrome only, graceful degradation) */
  private static checkMemoryPressure(): boolean {
    try {
      const mem = (performance as any).memory
      if (mem && mem.usedJSHeapSize && mem.jsHeapSizeLimit) {
        const usage = mem.usedJSHeapSize / mem.jsHeapSizeLimit
        return usage > 0.85 // Over 85% heap usage
      }
    } catch {}
    return false
  }

  /** Calculate optimal worker count based on hardware and performance history */
  private static calculateOptimalWorkers(hw: number, config: NpcConfig): number {
    if (!this.workerStats.adaptiveEnabled) {
      // Fallback to simple 75% strategy when adaptive is disabled
      return Math.max(2, Math.min(16, Math.floor(hw * 0.75)))
    }

    const { lastWorkerCount, lastDuration, memoryPressure, callCount } = this.workerStats

    // First call: use 75% of available cores (conservative start)
    if (callCount === 0 || lastWorkerCount === 0) {
      return Math.max(2, Math.min(16, Math.floor(hw * 0.75)))
    }

    // Memory pressure: reduce workers significantly
    if (memoryPressure) {
      return Math.max(2, Math.floor(lastWorkerCount * 0.6))
    }

    // Fast completion (< 2s): likely CPU-underutilized, increase workers
    if (lastDuration < 2000) {
      const increased = Math.min(hw, Math.floor(lastWorkerCount * 1.3))
      return Math.min(32, increased) // Cap at 32 for safety
    }

    // Slow completion (> 8s): likely CPU-saturated or contention, decrease workers
    if (lastDuration > 8000) {
      return Math.max(2, Math.floor(lastWorkerCount * 0.8))
    }

    // Sweet spot: keep current worker count
    return lastWorkerCount
  }

  /** Initialize or resize worker pool */
  private static async initWorkerPool(targetSize: number): Promise<number> {
    // Terminate excess workers
    while (this.workerPool.length > targetSize) {
      const w = this.workerPool.pop()
      try { w?.terminate() } catch {}
    }

    // Create new workers to reach target size
    while (this.workerPool.length < targetSize) {
      try {
        const w = new Worker('npcworker.js')
        this.workerPool.push(w)
      } catch (err) {
        console.warn('[NPC] Failed to create worker:', err)
        break
      }
    }

    this.workerPoolSize = this.workerPool.length
    return this.workerPoolSize
  }

  /** Cleanup all workers (call on page unload or when NPC is disabled) */
  static cleanupWorkerPool() {
    this.workerPool.forEach(w => {
      try { w.terminate() } catch {}
    })
    this.workerPool = []
    this.workerPoolSize = 0
  }

  /**
   * Serialize table data for worker (deep copy, removing functions and circular refs)
   * CRITICAL: physicsContext and other objects may contain function references,
   * which cannot be cloned by structuredClone or JSON.stringify.
   * Solution: Extract only primitive fields manually.
   */
  private static serializeTableForWorker(table: any): any {
    try {
      // Extract only primitive data from physicsContext
      const cleanPhysicsContext = (ctx: any) => {
        if (!ctx || typeof ctx !== 'object') return ctx
        const cleaned: any = {}
        for (const key in ctx) {
          const val = ctx[key]
          // Only copy primitive values and plain objects/arrays (skip functions)
          if (typeof val === 'function') continue
          if (val === null || val === undefined) {
            cleaned[key] = val
          } else if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') {
            cleaned[key] = val
          } else if (Array.isArray(val)) {
            cleaned[key] = val.map(v => typeof v === 'object' ? cleanPhysicsContext(v) : v)
          } else if (typeof val === 'object') {
            // Recursively clean nested objects
            cleaned[key] = cleanPhysicsContext(val)
          }
        }
        return cleaned
      }

      // Manually serialize balls with clean physics context
      const ballsData = table.balls.map((b: any) => ({
        pos: { x: b.pos.x, y: b.pos.y, z: b.pos.z },
        vel: b.vel ? { x: b.vel.x, y: b.vel.y, z: b.vel.z } : { x: 0, y: 0, z: 0 },
        rvel: b.rvel ? { x: b.rvel.x, y: b.rvel.y, z: b.rvel.z } : { x: 0, y: 0, z: 0 },
        id: b.id,
        radius: b.radius,
        physicsContext: cleanPhysicsContext(b.physicsContext),
      }))

      // Manually serialize cue aim (avoid copying methods)
      const aimData = table.cue?.aim ? {
        angle: table.cue.aim.angle,
        power: table.cue.aim.power,
        offset: table.cue.aim.offset ? {
          x: table.cue.aim.offset.x,
          y: table.cue.aim.offset.y,
          z: table.cue.aim.offset.z
        } : { x: 0, y: 0, z: 0 },
        elevation: table.cue.aim.elevation,
        i: table.cue.aim.i,
      } : null

      return {
        balls: ballsData,
        aim: aimData,
        // Do NOT include cushionModel (functions are not structured-cloneable)
        cueballId: table.cueball?.id,
        // Include cue metadata
        cue: {
          maxPower: table.cue?.maxPower,
          defaultElevation: table.cue?.defaultElevation,
        }
      }
    } catch (err) {
      console.error('[NPC] Failed to serialize table for worker:', err)
      return null
    }
  }

  /** Public API: Enable/disable adaptive worker management */
  static setAdaptiveMode(enabled: boolean) {
    this.workerStats.adaptiveEnabled = enabled
    if (enabled) {
      console.log('[NPC] Adaptive worker management ENABLED')
    } else {
      console.log('[NPC] Adaptive worker management DISABLED (fallback to 75% strategy)')
    }
  }

  /** Public API: Get current worker pool statistics */
  static getWorkerStats() {
    return {
      poolSize: this.workerPoolSize,
      lastWorkerCount: this.workerStats.lastWorkerCount,
      lastDuration: this.workerStats.lastDuration,
      memoryPressure: this.workerStats.memoryPressure,
      adaptiveEnabled: this.workerStats.adaptiveEnabled,
      callCount: this.workerStats.callCount,
      hardwareConcurrency: typeof navigator !== 'undefined' ? (navigator as any).hardwareConcurrency : 'unknown'
    }
  }

  private static buildCandidateSet(container: Container) {
    const table = container.table
    const cue = table.cue
    const cfg = this.readConfig(container)

    // Angles: deterministic coverage, density selectable (same for both modes)
    const angleCount = ((): number => {
      switch (cfg.searchDensity) {
        case 'low': return 16 // 22.5°
        case 'high': return 36 // 10°
        default: return 24 // 15°
      }
    })()
    // Base uniform angles over 360°
    const baseAngles: number[] = []
    for (let i = 0; i < angleCount; i++) baseAngles.push((i * 2 * Math.PI) / angleCount)

    // Prefer rules.cueball if available to avoid any desync
    const activeCueBall = container.rules?.cueball ?? table.cueball
    // Remove the first 8 base angles uniformly
    const trimmedAngles = baseAngles.slice(8)

    // Add dynamic side-angles for the two object balls (left/right of each), medium thickness
    const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    const others = table.balls.filter((b) => b !== activeCueBall)
    const sideAngles: number[] = []
    try {
      const rCue = Math.max(1e-6, activeCueBall?.radius ?? 0.028)
      const thicknesses = [0.5, 0.2] // medium and thinner hits
      for (let k = 0; k < Math.min(2, others.length); k++) {
        const ob = others[k]
        if (!ob) continue
        const dx = ob.pos.x - activeCueBall.pos.x
        const dy = ob.pos.y - activeCueBall.pos.y
        const dist = Math.hypot(dx, dy)
        const r = Math.max(rCue, ob.radius || rCue)
        const base = Math.atan2(dy, dx)
        for (const thickness of thicknesses) {
          let delta = Math.asin(Math.min(0.95, (r * thickness) / Math.max(1e-6, dist)))
          if (!isFinite(delta) || delta <= 0) delta = thickness === 0.2 ? 0.12 : 0.28 // ~7° or ~16° fallback
          sideAngles.push(norm(base - delta), norm(base + delta))
        }
      }
    } catch {}

    // Final angle list: side-angles first, then remaining uniform angles; dedupe
    const angles: number[] = []
    const pushUnique = (a: number) => {
      if (!angles.some((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-3)) angles.push(a)
    }
    sideAngles.forEach(pushUnique)
    trimmedAngles.forEach(pushUnique)

    // If constraints are disabled, use the previous fast candidate set
    if (!cfg.enabled) {
      const offsets = [
        { x: 0.00, y: 0.00 },
        { x: 0.15, y: 0.00 },
        { x: -0.15, y: 0.00 },
        { x: 0.00, y: 0.15 },
        { x: 0.00, y: -0.15 },
        { x: 0.12, y: 0.12 },
        { x: -0.12, y: 0.12 },
      ]
      // Search at a single elevation step when constraints are disabled: use cue default
      const elevations = [
        Math.max(0, cue.defaultElevation ?? 0.17),
      ]
      const powers = [
        cue.maxPower * 0.50,
        cue.maxPower * 0.70,
        cue.maxPower * 0.85,
      ]
      return { angles, offsets, elevations, powers }
    }

    // Constraints enabled: build from configured ranges
    const dirAngles = [0, Math.PI/4, Math.PI/2, 3*Math.PI/4, Math.PI, -3*Math.PI/4, -Math.PI/2, -Math.PI/4]
    const radii: number[] = []
    const addRadius = (r: number) => { const rr = Math.max(0, Math.min(1, r)); if (!radii.includes(rr)) radii.push(rr) }
    const rMin = cfg.minSpin, rMax = cfg.maxSpin
    const rMid = (rMin + rMax) * 0.5
    const rQ1 = rMin * 0.75 + rMax * 0.25
    const rQ3 = rMin * 0.25 + rMax * 0.75
    addRadius(rMin)
    addRadius(rQ1)
    addRadius(rMid)
    addRadius(rQ3)
    addRadius(rMax)
    if (rMin === 0) addRadius(0)
    const offsets: { x: number; y: number }[] = []
    for (const r of radii) {
      for (const da of dirAngles) {
        offsets.push({ x: r * Math.cos(da), y: r * Math.sin(da) })
      }
    }

    const eMin = cfg.minElevation
    const eMax = cfg.maxElevation
    const eMid = (eMin + eMax) * 0.5
    // Search at a single elevation step (midpoint of min/max)
    const elevations = [eMid]

    const pMin = Math.max(0, Math.min(1, cfg.minPowerPct)) * cue.maxPower
    const pMax = Math.max(0, Math.min(1, cfg.maxPowerPct)) * cue.maxPower
    const pMid = (pMin + pMax) * 0.5
    // Constraints enabled: search with a single power = midpoint
    const powers = [pMid]

    return { angles, offsets, elevations, powers }
  }

  // Compute using a Web Worker to keep UI responsive
  private static async computeBestShotInWorker(container: Container): Promise<{ angle: number; elevation: number; offset: { x: number; y: number }; power: number } | null> {
    if (typeof Worker === 'undefined') return this.findBestThreeCushionShot(container) as any
    // Serialize table in a worker-safe way (no functions)
    const tableData = this.serializeTableForWorker(container.table)
    if (!tableData) return null
    try { if (tableData && typeof tableData === 'object' && 'cushionModel' in tableData) { delete (tableData as any).cushionModel } } catch {}
    const rulesName = container.rules?.rulename ?? 'unknown'
    const config = this.readConfig(container)

    // Get active cue ball index and ID - prefer rules.cueball if available
    const activeCueBall = container.rules?.cueball ?? container.table.cueball
    const cueBallId = activeCueBall.id
    let cueIndex = container.table.balls.indexOf(activeCueBall)
    if (cueIndex < 0) {
      cueIndex = Math.max(0, Math.min(container.table.balls.length - 1, (container.table.cue?.aim?.i ?? -1)))
    }
    if (cueIndex < 0) return null

    return new Promise((resolve, reject) => {
      try {
        const worker = new Worker('npcworker.js')
        const onMessage = (e: MessageEvent) => {
          try { worker.terminate() } catch {}
          const data = e.data || {}
          if (data && data.type === 'result') {
            resolve(data.best || null)
          } else {
            resolve(null)
          }
        }
        const onError = (err: any) => {
          try { worker.terminate() } catch {}
          reject(err)
        }
        worker.addEventListener('message', onMessage)
        worker.addEventListener('error', onError)
        worker.postMessage({ type: 'compute', table: tableData, rulesName, config, cueIndex, cueBallId })
      } catch (err) {
        reject(err)
      }
    })
  }

  // Multi-worker aggregation with adaptive pool management
  private static async computeBestShotInWorkers(container: Container): Promise<{ angle: number; elevation: number; offset: { x: number; y: number }; power: number } | null> {
    if (typeof Worker === 'undefined') return this.computeBestShotCooperative(container)

    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now()

    // Serialize table data for worker (removes functions and circular refs)
    const tableData = this.serializeTableForWorker(container.table)
    if (!tableData) {
      console.error('[NPC] Failed to serialize table data for workers')
      return this.computeBestShotCooperative(container)
    }
    const rulesName = container.rules?.rulename ?? 'unknown'
    const config = this.readConfig(container)

    // Get active cue ball index and ID to send to workers - prefer rules.cueball
    const activeCueBall = container.rules?.cueball ?? container.table.cueball
    const cueBallId = activeCueBall.id
    let cueIndex = container.table.balls.indexOf(activeCueBall)
    if (cueIndex < 0) {
      cueIndex = Math.max(0, Math.min(container.table.balls.length - 1, (container.table.cue?.aim?.i ?? -1)))
    }
    if (cueIndex < 0) return null

    // Get hardware info and check memory pressure
    const hw = (typeof navigator !== 'undefined' && (navigator as any).hardwareConcurrency) ? (navigator as any).hardwareConcurrency : 4
    this.workerStats.memoryPressure = this.checkMemoryPressure()

    // Calculate optimal worker count adaptively
    const optimalWorkers = this.calculateOptimalWorkers(hw, config)
    const angleCount = (() => { switch (config.searchDensity) { case 'low': return 16; case 'high': return 36; default: return 24 } })()
    const sliceCount = Math.min(optimalWorkers, angleCount)

    // Initialize worker pool (resizes if needed)
    const actualWorkerCount = await this.initWorkerPool(optimalWorkers)

    if (actualWorkerCount === 0) {
      console.warn('[NPC] No workers available, falling back to cooperative mode')
      return this.computeBestShotCooperative(container)
    }

    // Show diagnostic info
    try {
      const memStatus = this.workerStats.memoryPressure ? 'YÜKSEK' : 'Normal'
      const adaptiveInfo = this.workerStats.adaptiveEnabled ? ` (adaptive: ${this.workerStats.callCount > 0 ? 'aktif' : 'ilk çağrı'})` : ''
      container.chat?.showMessage?.(
        `NPC: ${actualWorkerCount}/${hw} çekirdek${adaptiveInfo}, RAM: ${memStatus}, yoğunluk: ${config.searchDensity}`
      )
    } catch {}

    try {
      // Create tasks for worker pool (reusing existing workers)
      const tasks = this.workerPool.slice(0, sliceCount).map((w, idx) => new Promise<any>((resolve) => {
        // Timeout handler
        const timeoutId = setTimeout(() => {
          console.warn(`[NPC] Worker ${idx} timeout after ${this.WORKER_TIMEOUT_MS}ms`)
          resolve(null)
        }, this.WORKER_TIMEOUT_MS)

        const onMessage = (e: MessageEvent) => {
          clearTimeout(timeoutId)
          const data = e.data || {}
          resolve(data && data.best ? data.best : null)
        }

        const onError = (err: any) => {
          clearTimeout(timeoutId)
          console.warn(`[NPC] Worker ${idx} error:`, err)
          resolve(null)
        }

        // Use { once: true } to auto-cleanup listeners
        w.addEventListener('message', onMessage, { once: true })
        w.addEventListener('error', onError, { once: true })

        // Send work to this worker
        w.postMessage({
          type: 'compute',
          table: tableData,
          rulesName,
          config,
          cueIndex,
          cueBallId,
          sliceIndex: idx,
          sliceCount
        })
      }))

      const results = await Promise.all(tasks)

      // Find best result across all workers
      let best: any = null
      for (const r of results) {
        if (!r) continue
        if (!best || (typeof r.score === 'number' && r.score > (best.score ?? -Infinity))) {
          best = r
        }
      }

      // Update performance stats
      const duration = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime
      this.workerStats.lastWorkerCount = actualWorkerCount
      this.workerStats.lastDuration = duration
      this.workerStats.callCount++

      // Log performance metrics
      console.log(
        `[NPC Performance] Workers: ${actualWorkerCount}/${hw}, Duration: ${duration.toFixed(0)}ms, ` +
        `Memory: ${this.workerStats.memoryPressure ? 'HIGH' : 'OK'}, ` +
        `Result: ${best ? 'Found' : 'None'}`
      )

      if (!best) return null
      return { angle: best.angle, elevation: best.elevation, offset: best.offset, power: best.power }
    } catch (err) {
      console.error('[NPC] Worker pool error:', err)
      return null
    }
    // Note: Workers are NOT terminated here - they stay in the pool for reuse
  }

  // Cooperative main-thread computation: yields to event loop between batches to avoid freezing UI
  private static async computeBestShotCooperative(container: Container): Promise<{ angle: number; elevation: number; offset: { x: number; y: number }; power: number } | null> {
    const cfg = this.readConfig(container)
    const { angles, offsets: baseOffsets, elevations, powers } = this.buildCandidateSet(container)
    const table = container.table
    // Prefer rules.cueball if available
    const activeCueBall = container.rules?.cueball ?? table.cueball
    const cueIndex = table.balls.indexOf(activeCueBall)
    if (cueIndex < 0) return null

    type Candidate = { angle: number; offset: { x: number; y: number }; elevation: number; power: number; score: number; hadKiss: boolean }
    let bestClean: Candidate | null = null
    let bestKiss: Candidate | null = null
    let fallback: Candidate | null = null
    const kissAllowed = !this.readConfig(container).avoidKissStrict

    let lastYield = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    const SLICE_MS = 8 // time budget per chunk
    let totalAttempts = 0
    let successfulAttempts = 0

    // Log search start info
    console.log(
      `[NPC Arama Başlangıç]`,
      `Top ID: ${activeCueBall.id}`,
      `Renk: #${activeCueBall.ballmesh.color.getHexString()}`,
      `Pozisyon: (${activeCueBall.pos.x.toFixed(2)}, ${activeCueBall.pos.y.toFixed(2)}, ${activeCueBall.pos.z.toFixed(2)})`,
      `Diğer toplar:`,
      table.balls.filter(b => b !== activeCueBall).map(b =>
        `ID:${b.id} (${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)})`
      ).join(', ')
    )

    for (const angle of angles) {
      for (const elevation of elevations) {
        // Use Fibonacci sampling across allowed area (white/red) for both modes
        const offsetCount = (() => { switch (cfg.searchDensity) { case 'low': return 24; case 'high': return 96; default: return 48 } })()
        const [rMin, rMax] = cfg.enabled
          ? [cfg.minSpin, cfg.maxSpin]
          : [0.0, this.getDefaultConfig(container).maxSpin]
        const offsets = this.buildOffsetsAroundWhiteCenter(elevation, rMin, rMax, offsetCount)
        for (const offset of offsets) {
          for (const power of powers) {
            totalAttempts++
            const result = this.simulateThreeCushion(container, { angle, offset, elevation, power, cueIndex, cueBallId: activeCueBall.id })
            if (!result.success) {
              const sc = this.scoreShot({ angle, offset, elevation, power }, result.hadKiss, result.firstBall)
              if (!fallback || sc > fallback.score) fallback = { angle, offset, elevation, power, score: sc, hadKiss: result.hadKiss }
            } else {
              successfulAttempts++
              const sc = this.scoreShot({ angle, offset, elevation, power }, result.hadKiss, result.firstBall)
              const cand: Candidate = { angle, offset, elevation, power, score: sc, hadKiss: result.hadKiss }

              // Log successful shot parameters
              console.log(
                `[NPC Başarılı Atış #${successfulAttempts}]`,
                `Açı: ${(angle * 180 / Math.PI).toFixed(1)}°`,
                `Güç: ${power.toFixed(2)}`,
                `Spin X: ${offset.x.toFixed(2)}`,
                `Spin Y: ${offset.y.toFixed(2)}`,
                `Elevation: ${(elevation * 180 / Math.PI).toFixed(1)}°`,
                `Score: ${sc.toFixed(1)}`,
                `Kiss: ${result.hadKiss ? 'Evet' : 'Hayır'}`
              )

              if (result.hadKiss) {
                if (kissAllowed) {
                  if (!bestKiss || sc > bestKiss.score) bestKiss = cand
                }
              } else {
                if (!bestClean || sc > bestClean.score) {
                  bestClean = cand
                  if (bestClean.score > 980) return bestClean
                }
              }
            }
            const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
            if (now - lastYield >= SLICE_MS) {
              await new Promise((r) => (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(() => r(null)) : setTimeout(r, 0)))
              lastYield = (typeof performance !== 'undefined' ? performance.now() : Date.now())
            }
          }
        }
      }
    }

    // Log search summary
    console.log(
      `[NPC Arama Özeti]`,
      `Toplam deneme: ${totalAttempts}`,
      `Başarılı: ${successfulAttempts}`,
      `Başarı oranı: ${totalAttempts > 0 ? ((successfulAttempts / totalAttempts) * 100).toFixed(1) : 0}%`,
      `Sonuç: ${bestClean ? 'Clean' : bestKiss ? 'Kiss' : fallback ? 'Fallback' : 'Yok'}`
    )

    return bestClean ?? bestKiss ?? fallback
  }

  /** Find the best scoring 3-cushion shot deterministically. */
  private static findBestThreeCushionShot(container: Container) {
    const table = container.table
    // Prefer rules.cueball if available
    const activeCueBall = container.rules?.cueball ?? table.cueball
    const cueIndex = table.balls.indexOf(activeCueBall)
    if (cueIndex < 0) return null

    const cfg = this.readConfig(container)
    const { angles, offsets: baseOffsets, elevations, powers } = this.buildCandidateSet(container)

    type Candidate = {
      angle: number
      offset: { x: number; y: number }
      elevation: number
      power: number
      score: number
      hadKiss: boolean
    }

    let bestClean: Candidate | null = null // no kiss before success
    let bestKiss: Candidate | null = null  // with kiss, fallback only
    let fallback: Candidate | null = null  // best natural attempt if no success
    let totalAttempts = 0
    let successfulAttempts = 0

    // Log search start info
    console.log(
      `[NPC Arama Başlangıç]`,
      `Top ID: ${activeCueBall.id}`,
      `Renk: #${activeCueBall.ballmesh.color.getHexString()}`,
      `Pozisyon: (${activeCueBall.pos.x.toFixed(2)}, ${activeCueBall.pos.y.toFixed(2)}, ${activeCueBall.pos.z.toFixed(2)})`,
      `Diğer toplar:`,
      table.balls.filter(b => b !== activeCueBall).map(b =>
        `ID:${b.id} (${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)})`
      ).join(', ')
    )

    // Deterministic nested loops. Keep bounds moderate for performance.
    // Early-exit if an excellent score is found.
    for (const angle of angles) {
      for (const elevation of elevations) {
        const offsetCount = (() => { switch (cfg.searchDensity) { case 'low': return 24; case 'high': return 96; default: return 48 } })()
        const [rMin, rMax] = cfg.enabled
          ? [cfg.minSpin, cfg.maxSpin]
          : [0.0, this.getDefaultConfig(container).maxSpin]
        const offsets = this.buildOffsetsAroundWhiteCenter(elevation, rMin, rMax, offsetCount)
        for (const offset of offsets) {
          for (const power of powers) {
            totalAttempts++
            const result = this.simulateThreeCushion(container, {
              angle,
              offset,
              elevation,
              power,
              cueIndex,
              cueBallId: activeCueBall.id,
            })

            if (!result.success) {
              // Track best "attempt" within constraints even if no success found
              const fallbackScore = this.scoreShot({ angle, offset, elevation, power }, result.hadKiss, result.firstBall)
              if (!fallback || fallbackScore > fallback.score) {
                fallback = { angle, offset, elevation, power, score: fallbackScore, hadKiss: result.hadKiss }
              }
              continue
            }

            successfulAttempts++
            const score = this.scoreShot({ angle, offset, elevation, power }, result.hadKiss, result.firstBall)
            const candidate: Candidate = { angle, offset, elevation, power, score, hadKiss: result.hadKiss }

            // Log successful shot parameters
            console.log(
              `[NPC Başarılı Atış #${successfulAttempts}]`,
              `Açı: ${(angle * 180 / Math.PI).toFixed(1)}°`,
              `Güç: ${power.toFixed(2)}`,
              `Spin X: ${offset.x.toFixed(2)}`,
              `Spin Y: ${offset.y.toFixed(2)}`,
              `Elevation: ${(elevation * 180 / Math.PI).toFixed(1)}°`,
              `Score: ${score.toFixed(1)}`,
              `Kiss: ${result.hadKiss ? 'Evet' : 'Hayır'}`
            )

            // Respect strict no-kiss if enabled
            const cfg = this.readConfig(container)
            const kissAllowed = !cfg.avoidKissStrict

            if (result.hadKiss) {
              if (!kissAllowed) {
                // Skip kiss candidates entirely if forbidden
                continue
              }
              if (!bestKiss || score > bestKiss.score) {
                bestKiss = candidate
              }
            } else {
              if (!bestClean || score > bestClean.score) {
                bestClean = candidate
                if (bestClean.score > 980) {
                  return bestClean
                }
              }
            }
          }
        }
      }
    }

    // Log search summary
    console.log(
      `[NPC Arama Özeti]`,
      `Toplam deneme: ${totalAttempts}`,
      `Başarılı: ${successfulAttempts}`,
      `Başarı oranı: ${totalAttempts > 0 ? ((successfulAttempts / totalAttempts) * 100).toFixed(1) : 0}%`,
      `Sonuç: ${bestClean ? 'Clean' : bestKiss ? 'Kiss' : fallback ? 'Fallback' : 'Yok'}`
    )

    // If still nothing successful, return best within bounds even if not guaranteed success
    return bestClean ?? bestKiss ?? fallback
  }

  /** Heuristic scoring for "professional" naturalness */
  private static scoreShot(p: { angle: number; offset: { x: number; y: number }; elevation: number; power: number }, hadKiss: boolean, firstBall: boolean = false): number {
    const offsetLen = Math.hypot(p.offset.x, p.offset.y)
    const elevDeg = (p.elevation * 180) / Math.PI
    // Penalize large tip offsets, high elevation, and excessive power, prefer smoother shots
    const penaltyNatural = 300 * offsetLen + 2.0 * elevDeg + 0.002 * p.power
    // Strong penalty for kiss paths (allowed only as last resort)
    const penaltyKiss = hadKiss ? 500 : 0
    // Preference: first event weighting -> ~90% ball, ~10% cushion
    const baseFirst = 60
    const penaltyFirstEvent = baseFirst * (firstBall ? 0.1 : 0.9)
    // Base score for a valid shot
    const base = 1000
    return base - (penaltyNatural + penaltyKiss + penaltyFirstEvent)
  }

  /**
   * Simulate a candidate three-cushion shot on a cloned table and decide success.
   * Returns success true if cue ball touches both object balls and there are at least
   * three cushion events before the second object-ball collision.
   */
  private static simulateThreeCushion(
    container: Container,
    p: { angle: number; offset: { x: number; y: number }; elevation: number; power: number; cueIndex: number; cueBallId: number }
  ): { success: boolean; hadKiss: boolean; firstBall: boolean } {
    let sim: Table | null = null
    try {
      // Serialize and clone table (preserving carom geometry). Do not mutate real table.
      const serialised = container.table.serialise()
      sim = Table.fromSerialised(serialised, { headless: true })

      // Copy per-ball physics context (carom constants) if present
      container.table.balls.forEach((b, i) => {
        const match = sim.balls.find(sb => sb.id === b.id) || sim.balls[i]
        if (match) {
          ;(match as any).physicsContext = (b as any).physicsContext
        }
      })

      // Choose cue ball by ID (not by index which can be stale)
      const simCueBall = sim.balls.find((b) => b.id === p.cueBallId)
      if (!simCueBall) {
        console.error(`[NPC Error] simCueBall bulunamadı! cueBallId: ${p.cueBallId}, sim.balls IDs: ${sim.balls.map(b => b.id).join(', ')}`)
        return { success: false, hadKiss: false, firstBall: false }
      }
      sim.cueball = simCueBall
      sim.cue.aim.i = sim.balls.indexOf(simCueBall)

      // Apply shot pose
      const aim = { angle: p.angle, offset: new Vector3(p.offset.x, p.offset.y, 0), power: p.power }
      const pose = makeShotPoseFromAim(simCueBall, aim, p.elevation)
      applyShotFromPose(simCueBall, pose)

      // Simulate until decided
      const maxSimTime = 12.0 // seconds, enough for decision
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
      let firstObjObjCollisionTime: number | null = null
      let secondBallMovedEarly = false

      while (t < maxSimTime) {
        sim.advance(ENGINE_DT)
        t += ENGINE_DT

        const newOutcomes = sim.outcome.slice(processed)
        processed = sim.outcome.length

        // Track cue ball events (handle collisions where cue ball may be ballA or ballB)
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
                // Repeated hit of same object or too many total object contacts by cue ball
                if (prev + 1 > 1 || totalObjectCollisions > 2) {
                  hadKiss = true
                }
                // Record first cue->object contact time
                if (!cueHitTimeByObj.has(id)) {
                  cueHitTimeByObj.set(id, t)
                } else {
                  // Second hit on same object before touching the other object
                  if (objectSet.size < 2) hadKiss = true
                }
                if (objectSet.size >= 2) {
                  // Decision point reached
                  return { success: cushions >= 3, hadKiss: hadKiss || secondBallMovedEarly, firstBall: firstEvent === 'ball' }
                }
              }
            } else if (a && b && objIds.has(a.id) && objIds.has(b.id)) {
              // Object-object collision (between the two non-cue balls)
              if (firstObjObjCollisionTime === null) firstObjObjCollisionTime = t
              // If cue has hit exactly one object so far, the other moved early => kiss
              const hitCount = cueHitTimeByObj.size
              if (hitCount === 1) {
                secondBallMovedEarly = true
              }
            }
          }
        }

        if (sim.allStationary()) {
          break
        }
      }

      // Fallback: evaluate using outcomes analysis
      const analyzed = this.analyzeCaromOutcome(simCueBall, sim.outcome)
      // If analyze didn't see any event, use firstEvent we tracked (could be none)
      return { success: analyzed.success, hadKiss: analyzed.hadKiss || secondBallMovedEarly, firstBall: analyzed.firstBall ?? (firstEvent === 'ball') }
    } catch {
      return { success: false, hadKiss: false, firstBall: false }
    } finally {
      // Ensure we free GPU/JS resources created for this simulation
      try {
        if (sim && Array.isArray(sim.balls)) {
          sim.balls.forEach((b: any) => {
            try { b.ballmesh && b.ballmesh.dispose && b.ballmesh.dispose() } catch {}
          })
        }
      } catch {}
      // Dispose cue geometries created for the simulation table (do not dispose shared materials)
      try {
        if (sim && (sim as any).cue) {
          const cue: any = (sim as any).cue
          const disposeMesh = (m: any) => {
            try { m && m.geometry && m.geometry.dispose && m.geometry.dispose() } catch {}
          }
          disposeMesh(cue.mesh)
          disposeMesh(cue.placerMesh)
          disposeMesh(cue.hitPointMesh)
          disposeMesh(cue.virtualCueMesh)
        }
      } catch {}
      try { if (sim) (sim as any).outcome = [] } catch {}
    }
  }

  // Analyze full outcomes for success and whether extra object-ball contacts (kiss) occurred
  private static analyzeCaromOutcome(cueBall, outcomes: Outcome[]): { success: boolean; hadKiss: boolean; firstBall?: boolean } {
    // Normalize outcomes so that collisions involving cueBall always have ballA === cueBall
    const normalized = Outcome.cueBallFirst(cueBall, outcomes)
    let cushions = 0
    const objectSet = new Set<number>()
    const objectHits = new Map<number, number>()
    let totalObjectCollisions = 0
    let hadKiss = false
    let firstEvent: 'none' | 'cushion' | 'ball' = 'none'

    // For enhanced kiss detection
    const allBalls = new Set(outcomes.flatMap((o: any) => [o.ballA, o.ballB]).filter(Boolean))
    const objIds = new Set<number>(Array.from(allBalls).map((b: any) => b.id).filter((id: number) => id !== cueBall.id))
    const cueHitTimeByObj = new Map<number, number>()
    let secondBallMovedEarly = false
    let tCursor = 0 // We don't have timestamps in Outcome; approximate with event order

    for (const o of outcomes) {
      tCursor += 1
      if (o.type === OutcomeType.Cushion && o.ballA === cueBall) {
        if (firstEvent === 'none') firstEvent = 'cushion'
        cushions++
        continue
      }
      if (o.type !== OutcomeType.Collision) continue

      const a = o.ballA, b = o.ballB
      if (!a || !b) continue
      if (a === cueBall || b === cueBall) {
        if (firstEvent === 'none') firstEvent = 'ball'
        const other = a === cueBall ? b : a
        if (other && other !== cueBall) {
          const id = other.id
          objectSet.add(id)
          totalObjectCollisions++
          const prev = objectHits.get(id) ?? 0
          objectHits.set(id, prev + 1)
          if (prev + 1 > 1 || totalObjectCollisions > 2) hadKiss = true
          if (!cueHitTimeByObj.has(id)) cueHitTimeByObj.set(id, tCursor)
          else if (objectSet.size < 2) hadKiss = true
          if (objectSet.size >= 2) {
            return { success: cushions >= 3, hadKiss: hadKiss || secondBallMovedEarly, firstBall: firstEvent === 'ball' }
          }
        }
      } else if (objIds.has(a.id) && objIds.has(b.id)) {
        // Object-object collision
        if (cueHitTimeByObj.size === 1) {
          secondBallMovedEarly = true
        }
      }
    }
    return { success: false, hadKiss: hadKiss || secondBallMovedEarly, firstBall: firstEvent === 'ball' }
  }
}

// Global cleanup: Terminate worker pool when page unloads
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    try {
      NpcBot.cleanupWorkerPool()
    } catch {}
  })
  // Also cleanup on visibility change (mobile browsers)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      try {
        NpcBot.cleanupWorkerPool()
      } catch {}
    }
  })
}
