import { Vector3 } from "three"
import { Container } from "../container/container"
import { Input } from "../events/input"
import { Overlap } from "../utils/overlap"
import { unitAtAngle } from "../utils/utils"

export class AimInputs {
  readonly cueBallElement: HTMLElement
  readonly cueBallCanvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D
  readonly cueElevationElement: HTMLInputElement
  readonly cuePowerElement: HTMLInputElement
  readonly cueHitElement: HTMLElement
  readonly container: Container
  readonly overlap: Overlap

  // Sphere rendering properties
  radius: number = 0
  cx: number = 0
  cy: number = 0
  pitch: number = Math.PI / 2 // Cue elevation angle (rotated from horizontal)
  hitPoint: [number, number, number] = [0, 0, 1] // Current hit point in 3D space
  targetPoint: [number, number, number] = [0, 0, 1] // Target ball indicator (if visible)

  // Visual constants from sphereProjectionAreaformSide.html
  readonly hitPointRatio = 0.021 // Hit point visual size
  readonly targetPointRatio = 0.003 // Target point size
  readonly greyRatio = 0.75 // Grey area threshold
  readonly blendWidth = this.hitPointRatio * 2 * 1.2

  // Lighting
  readonly lightDir = [0.6, -0.7, 0.4]
  readonly lightNorm: [number, number, number]
  readonly ambientLight = 0.35
  readonly diffuseLight = 0.65

  private inputsEnabled = true // Control for NPC animation
  private npcAllowedOverlayVisible = false // Show NPC-allowed spin area while NPC is computing

  constructor(container) {
    this.container = container
    this.cueBallElement = document.getElementById("cueBall")!
    this.cueBallCanvas = document.getElementById("cueBallCanvas") as HTMLCanvasElement
    this.ctx = this.cueBallCanvas.getContext("2d", { alpha: false })!
    this.cueElevationElement = document.getElementById("cueElevation") as HTMLInputElement
    this.cuePowerElement = document.getElementById("cuePower") as HTMLInputElement
    this.cueHitElement = document.getElementById("cueHit")!
    this.overlap = new Overlap(this.container.table.balls)

    // Normalize light direction
    const lightLen = Math.sqrt(this.lightDir[0]**2 + this.lightDir[1]**2 + this.lightDir[2]**2)
    this.lightNorm = [
      this.lightDir[0]/lightLen,
      this.lightDir[1]/lightLen,
      this.lightDir[2]/lightLen
    ]

    this.initializeCanvas()
    this.addListeners()
    this.initializePower()
  }

  /** Disable user inputs (used during NPC camera animation) */
  disableInputs() {
    this.inputsEnabled = false
    // Force stop any active dragging state
    this.isDragging = false
  }

  /** Re-enable user inputs */
  enableInputs() {
    this.inputsEnabled = true
  }

  initializeCanvas() {
    // Set canvas size to match element size
    const rect = this.cueBallElement.getBoundingClientRect()
    const size = Math.min(rect.width, rect.height)
    this.cueBallCanvas.width = size
    this.cueBallCanvas.height = size
    this.cx = size / 2
    this.cy = size / 2
    // Use 0.49 instead of 0.5 to avoid edge artifacts with border-radius
    this.radius = Math.floor(size * 0.51)

    // Initialize with default elevation (convert from cue.elevation to degrees)
    const elevationDegrees = (this.container.table.cue.elevation * 180) / Math.PI
    this.cueElevationElement.value = elevationDegrees.toString()
    this.pitch = Math.PI / 2 - this.container.table.cue.elevation
    // Sync elevation to aim event for replay
    this.container.table.cue.aim.elevation = this.container.table.cue.elevation

    this.drawSphere()
  }

  addListeners() {
    this.cueBallCanvas?.addEventListener("mousedown", this.onMouseDown)
    this.cueBallCanvas?.addEventListener("mouseup", this.onMouseUp)
    this.cueBallCanvas?.addEventListener("mouseleave", this.onMouseLeave)
    this.cueBallCanvas?.addEventListener("mousemove", this.onMouseMove)
    this.cueBallCanvas?.addEventListener("click", this.onClick)

    this.cueElevationElement?.addEventListener("input", this.elevationChanged)
    this.cueHitElement?.addEventListener("click", this.hit)
    this.cuePowerElement?.addEventListener("input", this.powerChanged)

    if (!("ontouchstart" in window)) {
      document.getElementById("viewP1")?.addEventListener("dblclick", this.hit)
    }
    document.addEventListener("wheel", this.mousewheel)
  }

  isDragging = false

  onMouseDown = (e: MouseEvent) => {
    if (!this.inputsEnabled) return
    this.isDragging = true
    this.updateHitPoint(e)
  }

  onMouseUp = () => {
    if (!this.inputsEnabled) return
    this.isDragging = false
  }

  onMouseLeave = () => {
    if (!this.inputsEnabled) return
    this.isDragging = false
  }

  onMouseMove = (e: MouseEvent) => {
    if (!this.inputsEnabled) return
    if (this.isDragging) {
      this.updateHitPoint(e)
    }
  }

  onClick = (e: MouseEvent) => {
    if (!this.inputsEnabled) return
    this.updateHitPoint(e)
  }

  updateHitPoint(e: MouseEvent) {
    const rect = this.cueBallCanvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const px = mouseX - this.cx
    const py = mouseY - this.cy
    const r2 = this.radius * this.radius

    if (px*px + py*py <= r2) {
      const z = Math.sqrt(Math.max(0, r2 - px*px - py*py))
      const nx = px / this.radius
      const ny = py / this.radius
      const nz = z / this.radius

      const clickedPoint: [number, number, number] = [nx, ny, nz]

      // Only accept if in white area
      if (this.isInWhiteArea(clickedPoint)) {
        this.hitPoint = clickedPoint

        // Direct normalized coordinates from sphere surface
        // nx, ny are already in range [-1, 1] representing the ball surface
        const offsetX = -nx
        const offsetY = -ny

        this.container.table.cue.setSpin(
          new Vector3(offsetX, offsetY, 0),
          this.container.table
        )

        // Sync to precision panel
        this.container.precisionPanel?.syncFromOriginal()

        this.drawSphere()
        this.container.lastEventTime = performance.now()
        this.container.updateTrajectoryPrediction()
      }
    }
  }

  elevationChanged = (e: Event) => {
    if (!this.inputsEnabled) return
    const target = e.target as HTMLInputElement
    const degrees = parseFloat(target.value)
    const angleRad = (degrees * Math.PI) / 180

    // Update cue elevation
    this.container.table.cue.elevation = angleRad
    // Sync elevation to aim event for replay
    this.container.table.cue.aim.elevation = angleRad

    // Update pitch for sphere rendering (pitch = π/2 - elevation)
    this.pitch = Math.PI / 2 - angleRad

    // Push hit point to white area if needed
    this.hitPoint = this.pushToWhiteArea(this.hitPoint)

    // Update cue spin offset based on adjusted hit point
    this.syncHitPointToCue()

    // Sync to precision panel
    this.container.precisionPanel?.syncFromOriginal()

    this.drawSphere()
    this.container.lastEventTime = performance.now()
    this.container.updateTrajectoryPrediction()
  }

  syncHitPointToCue() {
    // Direct normalized coordinates
    const offsetX = -this.hitPoint[0]
    const offsetY = -this.hitPoint[1]

    this.container.table.cue.setSpin(
      new Vector3(offsetX, offsetY, 0),
      this.container.table
    )
  }

  rotateX(v: [number, number, number], pitch: number): [number, number, number] {
    const sx = Math.sin(pitch), cx = Math.cos(pitch)
    const x = v[0]
    const y = cx*v[1] - sx*v[2]
    const z = sx*v[1] + cx*v[2]
    return [x, y, z]
  }

  smoothstep(edge0: number, edge1: number, x: number): number {
    let t = (x - edge0) / (edge1 - edge0)
    t = Math.max(0, Math.min(1, t))
    return t * t * (3 - 2 * t)
  }

  isInWhiteArea(point: [number, number, number]): boolean {
    const [rx, ry, rz] = this.rotateX(point, this.pitch)
    const tRaw = (ry + 1) * 0.5
    const threshold = 1 - this.greyRatio
    return tRaw < threshold
  }

  pushToWhiteArea(point: [number, number, number]): [number, number, number] {
    const [rx, ry, rz] = this.rotateX(point, this.pitch)
    const tRaw = (ry + 1) * 0.5
    const threshold = 1 - this.greyRatio

    if (tRaw >= threshold) {
      // In grey area, push to white area
      const targetTRaw = threshold - 0.02
      const targetRY = targetTRaw * 2 - 1

      // Apply inverse rotation
      const sx = Math.sin(this.pitch), cx = Math.cos(this.pitch)
      const newY = cx * targetRY + sx * rz
      const newZ = -sx * targetRY + cx * rz

      // Normalize (keep on sphere surface)
      const len = Math.sqrt(rx*rx + newY*newY + newZ*newZ)
      return [rx/len, newY/len, newZ/len]
    }

    return point
  }

  applyLighting(color: [number, number, number], normal: [number, number, number]): [number, number, number] {
    const dotProduct = Math.max(0,
      normal[0] * this.lightNorm[0] +
      normal[1] * this.lightNorm[1] +
      normal[2] * this.lightNorm[2]
    )

    const intensity = this.ambientLight + this.diffuseLight * dotProduct

    return [
      Math.min(255, color[0] * intensity),
      Math.min(255, color[1] * intensity),
      Math.min(255, color[2] * intensity)
    ]
  }

  drawSphere() {
    if (!this.ctx) return

    const W = this.cueBallCanvas.width
    const H = this.cueBallCanvas.height

    // Background gradient
    const gradient = this.ctx.createLinearGradient(0, 0, 0, H)
    gradient.addColorStop(0, 'rgb(0, 64, 94)')
    gradient.addColorStop(1, '#000214')
    this.ctx.fillStyle = gradient
    this.ctx.fillRect(0, 0, W, H)

    const img = this.ctx.createImageData(W, H)
    const data = img.data
    const r2 = this.radius * this.radius
    // Precompute NPC overlay parameters if needed
    let showNpcOverlay = this.npcAllowedOverlayVisible === true
    let npcMinSpin = 0
    let npcMaxSpin = 0
    let centerOffX = 0
    let centerOffY = 0
    if (showNpcOverlay) {
      const cfg = (this.container as any)?.npcConfig
      if (!cfg || cfg.enabled !== true) {
        showNpcOverlay = false
      } else {
        npcMinSpin = Math.max(0, Math.min(1, Number(cfg.minSpin) || 0))
        npcMaxSpin = Math.max(0, Math.min(1, Number(cfg.maxSpin) || 0))
        const cx = Math.cos(this.pitch)
        centerOffX = 0
        centerOffY = cx
      }
    }

    // Fill background
    const bgColor: [number, number, number] = [0, 64, 94]
    for (let i = 0; i < data.length; i += 4) {
      data[i] = bgColor[0]
      data[i + 1] = bgColor[1]
      data[i + 2] = bgColor[2]
      data[i + 3] = 255
    }

    for (let py = -this.radius; py <= this.radius; py++) {
      const y = py
      const scanY = this.cy + y | 0
      if (scanY < 0 || scanY >= H) continue

      const maxX = Math.floor(Math.sqrt(Math.max(0, r2 - y*y)))
      for (let px = -maxX; px <= maxX; px++) {
        const x = px
        const scanX = this.cx + x | 0
        const z = Math.sqrt(Math.max(0, r2 - x*x - y*y))

        let nx = x / this.radius
        let ny = y / this.radius
        let nz = z / this.radius

        // Apply rotation for white-grey pattern
        const [rx, ry, rz] = this.rotateX([nx, ny, nz], this.pitch)

        // Calculate distances for hit point and target point
        const dotHit = nx * this.hitPoint[0] + ny * this.hitPoint[1] + nz * this.hitPoint[2]
        const hitThreshold = 1 - this.hitPointRatio * 2

        const dotTarget = nx * this.targetPoint[0] + ny * this.targetPoint[1] + nz * this.targetPoint[2]
        const targetThreshold = 1 - this.targetPointRatio * 2

        let r, g, b

        if (dotHit >= hitThreshold) {
          // Blue hit point with gradient
          const hitColor: [number, number, number] = [0, 64, 94]
          const edgeFade = (dotHit - hitThreshold) / (1 - hitThreshold)
          const t = this.smoothstep(0, 0.3, edgeFade)

          // Get base color
          let tRaw = (ry + 1) * 0.5
          const threshold = 1 - this.greyRatio
          const whiteColor: [number, number, number] = [217, 217, 217]
          const greyColor: [number, number, number] = [144, 144, 144]
          const tBlend = this.smoothstep(threshold - this.blendWidth, threshold, tRaw)
          const baseR = whiteColor[0]*(1-tBlend) + greyColor[0]*tBlend
          const baseG = whiteColor[1]*(1-tBlend) + greyColor[1]*tBlend
          const baseB = whiteColor[2]*(1-tBlend) + greyColor[2]*tBlend

          // Gradient blend
          r = baseR * (1-t) + hitColor[0] * t
          g = baseG * (1-t) + hitColor[1] * t
          b = baseB * (1-t) + hitColor[2] * t
        } else {
          // Normal painting: rotated height-based
          let tRaw = (ry + 1) * 0.5
          const threshold = 1 - this.greyRatio

          const whiteColor: [number, number, number] = [217, 217, 217]
          const greyColor: [number, number, number] = [144, 144, 144]

          const t = this.smoothstep(threshold - this.blendWidth, threshold, tRaw)
          r = whiteColor[0]*(1-t) + greyColor[0]*t
          g = whiteColor[1]*(1-t) + greyColor[1]*t
          b = whiteColor[2]*(1-t) + greyColor[2]*t
        }

        // Red target point with gradient and transparency
        if (dotTarget >= targetThreshold) {
          const targetColor: [number, number, number] = [255, 0, 0]
          const edgeFade = (dotTarget - targetThreshold) / (1 - targetThreshold)
          const t = this.smoothstep(0, 0.3, edgeFade) * 0.3

          r = r * (1-t) + targetColor[0] * t
          g = g * (1-t) + targetColor[1] * t
          b = b * (1-t) + targetColor[2] * t
        }

        // NPC allowed spin overlay (blend red) while computing
        if (showNpcOverlay) {
          const inWhite = this.isInWhiteArea([nx, ny, nz])
          if (inWhite) {
            const offX = -nx
            const offY = -ny
            const dx = offX - centerOffX
            const dy = offY - centerOffY
            const dist = Math.hypot(dx, dy)
            if (dist >= npcMinSpin && dist <= npcMaxSpin) {
              const alpha = 0.42
              const red = 255, green = 32, blue = 32
              r = r * (1 - alpha) + red * alpha
              g = g * (1 - alpha) + green * alpha
              b = b * (1 - alpha) + blue * alpha
            }
          }
        }

        // Apply lighting
        const litColor = this.applyLighting([r, g, b], [nx, ny, nz])
        r = litColor[0]
        g = litColor[1]
        b = litColor[2]

        const idx = (scanY * W + scanX) * 4
        data[idx] = r|0
        data[idx+1] = g|0
        data[idx+2] = b|0
        data[idx+3] = 255
      }
    }

    this.ctx.putImageData(img, 0, 0)

    // Overlay: NPC spin sample markers (green circles) during constrained search
    if (showNpcOverlay) {
      try {
        const density = String((this.container as any)?.npcConfig?.searchDensity || 'medium')
        const count = density === 'low' ? 24 : density === 'high' ? 96 : 48
        const samples = this.buildNpcSpinSamples(this.container.table.cue.elevation, npcMinSpin, npcMaxSpin, count)
        const markerRadius = Math.max(1, Math.floor(this.radius * (this.hitPointRatio * 0.5)))
        this.ctx.save()
        this.ctx.strokeStyle = 'rgba(0,255,0,0.9)'
        this.ctx.lineWidth = Math.max(1, Math.floor(markerRadius * 0.25))
        for (const s of samples) {
          const nx = -s.x
          const ny = -s.y
          const r2loc = nx*nx + ny*ny
          if (r2loc > 1) continue
          const nz = Math.sqrt(Math.max(0, 1 - r2loc))
          // Only draw on visible hemisphere
          if (nz < 1e-6) continue
          const cx = this.cx + nx * this.radius
          const cy = this.cy + ny * this.radius
          this.ctx.beginPath()
          this.ctx.arc(cx, cy, markerRadius, 0, Math.PI * 2)
          this.ctx.stroke()
        }
        this.ctx.restore()
      } catch {}
    }

    // Update target point for object ball overlap
    this.updateTargetPoint()
  }

  // Build Fibonacci-distributed spin samples matching NPC constraints (around white-center ring)
  private buildNpcSpinSamples(elevation: number, rMin: number, rMax: number, count: number) {
    // Deterministic equal-area polar sampling around white-center in offset space
    const pitch = Math.PI / 2 - elevation
    const golden = Math.PI * (3 - Math.sqrt(5))
    const lo = Math.max(0, Math.min(1, rMin))
    const hi = Math.max(lo, Math.min(1, rMax))
    const target = Math.max(1, Math.floor(count))
    const out: Array<{ x: number; y: number }> = []
    const centerOffY = Math.cos(pitch)
    let i = 0
    const maxIter = target * 40
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
      const rotated = this.rotateX([nx, ny, nz], pitch)
      const tRaw = (rotated[1] + 1) * 0.5
      const threshold = 1 - this.greyRatio
      const inWhite = tRaw < threshold
      if (inWhite) {
        const cand = { x: -nx, y: -ny }
        if (!out.some(o => Math.abs(o.x - cand.x) < 1e-3 && Math.abs(o.y - cand.y) < 1e-3)) out.push(cand)
      }
      i++
    }
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
        const rotated = this.rotateX([nx, ny, nz], pitch)
        const tRaw = (rotated[1] + 1) * 0.5
        const threshold = 1 - this.greyRatio
        const inWhite = tRaw < threshold
        if (inWhite) {
          const cand = { x: -nx, y: -ny }
          if (!out.some(o => Math.abs(o.x - cand.x) < 1e-3 && Math.abs(o.y - cand.y) < 1e-3)) out.push(cand)
        }
      }
      i += need
      widen += 0.02
    }
    return out
  }

  // Toggle overlay that shows NPC's allowed spin region based on Min/Max Spin Dist and current elevation
  setNpcAllowedSpinOverlayVisible(visible: boolean) {
    this.npcAllowedOverlayVisible = !!visible
    try { this.drawSphere() } catch {}
  }

  updateTargetPoint() {
    const table = this.container.table
    const dir = unitAtAngle(table.cue.aim.angle)
    const closest = this.overlap.getOverlapOffset(table.cueball, dir)

    if (closest) {
      // Calculate target point position in 3D sphere space.
      // This should show where the object ball is relative to aim direction.
      // For now, keep it at north pole (can be enhanced later)
      this.targetPoint = [0, 0, 1]
    } else {
      // Move target indicator out of view when no overlap is detected.
      this.targetPoint = [0, 0, -1]
    }

    // Sync target point to precision panel
    this.container.precisionPanel?.updateTargetPoint(this.targetPoint)
  }

  updateVisualState(x: number, y: number) {
    // Direct mapping: offset values are already normalized [-1, 1]
    const nx = -x
    const ny = -y

    // Calculate nz to keep point on sphere surface
    const nxy2 = nx*nx + ny*ny
    if (nxy2 <= 1) {
      const nz = Math.sqrt(1 - nxy2)
      this.hitPoint = [nx, ny, nz]
    }

    this.drawSphere()
  }

  showOverlap() {
    this.drawSphere()
  }

  setButtonText(text) {
    this.cueHitElement && (this.cueHitElement.innerText = text)
  }

  powerChanged = (_) => {
    if (!this.inputsEnabled) return
    this.container.table.cue.setPower(this.cuePowerElement.value)
    // Sync to precision panel
    this.container.precisionPanel?.syncFromOriginal()
    this.container.lastEventTime = performance.now()
    this.container.updateTrajectoryPrediction()
  }

  updatePowerSlider(power) {
    power > 0 &&
      this.cuePowerElement?.value &&
      (this.cuePowerElement.value = power)
  }

  updateElevationSlider(elevation: number) {
    if (this.cueElevationElement) {
      const elevationDegrees = (elevation * 180) / Math.PI
      this.cueElevationElement.value = elevationDegrees.toString()
      this.pitch = Math.PI / 2 - elevation
      this.hitPoint = this.pushToWhiteArea(this.hitPoint)
      this.drawSphere()
    }
  }

  hit = (_) => {
    this.container.table.cue.setPower(this.cuePowerElement?.value)
    this.container.inputQueue.push(new Input(0, "SpaceUp"))
  }

  mousewheel = (e) => {
    if (!this.inputsEnabled) return
    if (this.cuePowerElement) {
      this.cuePowerElement.value -= Math.sign(e.deltaY) / 10
      this.container.table.cue.setPower(this.cuePowerElement.value)
      this.container.lastEventTime = performance.now()
      this.container.updateTrajectoryPrediction()
    }
  }

  private initializePower() {
    if (!this.cuePowerElement) {
      return
    }
    const initialValue = parseFloat(this.cuePowerElement.value)
    let normalizedPower = Number.isFinite(initialValue) ? initialValue : 0

    // Ensure a reasonable default power if it's zero or too small
    if (normalizedPower < 0.01) {
      normalizedPower = 0.5 // Default to 50% power
      this.cuePowerElement.value = normalizedPower.toString()
    }

    this.container.table.cue.setPower(normalizedPower)
  }
}
