import { Vector3 } from "three"
import { Container } from "../container/container"
import { Input } from "../events/input"

/**
 * Precision aiming panel with 2x size controls for enhanced precision
 */
export class PrecisionPanel {
  readonly container: Container
  readonly panelElement: HTMLElement
  readonly buttonElement: HTMLElement
  readonly cueBallElement: HTMLElement
  readonly cueBallCanvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D
  readonly cueElevationElement: HTMLInputElement
  readonly cuePowerElement: HTMLInputElement

  // Sphere rendering properties (same as AimInputs but with doubled size)
  radius: number = 0
  cx: number = 0
  cy: number = 0
  pitch: number = Math.PI / 2
  hitPoint: [number, number, number] = [0, 0, 1]
  targetPoint: [number, number, number] = [0, 0, 1]

  // Visual constants
  readonly hitPointRatio = 0.021
  readonly targetPointRatio = 0.003
  readonly greyRatio = 0.75
  readonly blendWidth = this.hitPointRatio * 2 * 1.2

  // Lighting
  readonly lightDir = [0.6, -0.7, 0.4]
  readonly lightNorm: [number, number, number]
  readonly ambientLight = 0.35
  readonly diffuseLight = 0.65

  private isVisible = false

  constructor(container: Container) {
    this.container = container
    this.panelElement = document.getElementById("precisionPanel")!
    this.buttonElement = document.getElementById("precisionButton")!
    this.cueBallElement = document.getElementById("precisionCueBall")!
    this.cueBallCanvas = document.getElementById("precisionCueBallCanvas") as HTMLCanvasElement
    this.ctx = this.cueBallCanvas.getContext("2d", { alpha: false })!
    this.cueElevationElement = document.getElementById("precisionCueElevation") as HTMLInputElement
    this.cuePowerElement = document.getElementById("precisionCuePower") as HTMLInputElement

    // Normalize light direction
    const lightLen = Math.sqrt(this.lightDir[0]**2 + this.lightDir[1]**2 + this.lightDir[2]**2)
    this.lightNorm = [
      this.lightDir[0]/lightLen,
      this.lightDir[1]/lightLen,
      this.lightDir[2]/lightLen
    ]

    this.initializeCanvas()
    this.addListeners()
  }

  initializeCanvas() {
    // Set canvas size to be 2x the original size
    const rect = this.cueBallElement.getBoundingClientRect()
    const size = Math.min(rect.width, rect.height)

    // Ensure valid canvas size
    if (size <= 0) {
      // Panel is not visible yet, skip initialization
      return
    }

    this.cueBallCanvas.width = size
    this.cueBallCanvas.height = size
    this.cx = size / 2
    this.cy = size / 2
    this.radius = Math.floor(size * 0.51)

    // Sync with current cue state
    this.syncFromOriginal()
    this.drawSphere()
  }

  addListeners() {
    this.buttonElement?.addEventListener("click", this.togglePanel)
    this.cueBallCanvas?.addEventListener("mousedown", this.onMouseDown)
    this.cueBallCanvas?.addEventListener("mouseup", this.onMouseUp)
    this.cueBallCanvas?.addEventListener("mouseleave", this.onMouseLeave)
    this.cueBallCanvas?.addEventListener("mousemove", this.onMouseMove)
    this.cueBallCanvas?.addEventListener("click", this.onClick)
    this.cueElevationElement?.addEventListener("input", this.elevationChanged)
    this.cuePowerElement?.addEventListener("input", this.powerChanged)
  }

  togglePanel = () => {
    this.isVisible = !this.isVisible
    if (this.isVisible) {
      this.panelElement.classList.add("is-visible")
      this.buttonElement.classList.add("is-active")

      // Initialize canvas now that panel is visible
      setTimeout(() => {
        this.initializeCanvas()
      }, 50)
    } else {
      this.panelElement.classList.remove("is-visible")
      this.buttonElement.classList.remove("is-active")
    }
  }

  hide() {
    if (this.isVisible) {
      this.isVisible = false
      this.panelElement.classList.remove("is-visible")
      this.buttonElement.classList.remove("is-active")
    }
  }

  getIsVisible(): boolean {
    return this.isVisible
  }

  syncFromOriginal() {
    const cue = this.container.table.cue
    const aimInputs = cue.aimInputs

    // Sync elevation
    const elevationDegrees = (cue.elevation * 180) / Math.PI
    this.cueElevationElement.value = elevationDegrees.toString()
    this.pitch = Math.PI / 2 - cue.elevation

    // Sync power
    const normalizedPower = cue.aim.power / cue.maxPower
    this.cuePowerElement.value = normalizedPower.toString()

    // Sync hit point
    if (aimInputs) {
      this.hitPoint = [...aimInputs.hitPoint] as [number, number, number]
      this.targetPoint = [...aimInputs.targetPoint] as [number, number, number]
    }

    // Redraw if visible
    if (this.isVisible) {
      this.drawSphere()
    }
  }

  syncToOriginal() {
    const aimInputs = this.container.table.cue.aimInputs
    if (aimInputs) {
      // Update original controls
      aimInputs.hitPoint = [...this.hitPoint] as [number, number, number]
      aimInputs.pitch = this.pitch
      aimInputs.drawSphere()
    }
  }

  isDragging = false

  onMouseDown = (e: MouseEvent) => {
    this.isDragging = true
    this.updateHitPoint(e)
  }

  onMouseUp = () => {
    this.isDragging = false
  }

  onMouseLeave = () => {
    this.isDragging = false
  }

  onMouseMove = (e: MouseEvent) => {
    if (this.isDragging) {
      this.updateHitPoint(e)
    }
  }

  onClick = (e: MouseEvent) => {
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

      if (this.isInWhiteArea(clickedPoint)) {
        this.hitPoint = clickedPoint

        const offsetX = -nx
        const offsetY = -ny

        // Update original cue
        this.container.table.cue.setSpin(
          new Vector3(offsetX, offsetY, 0),
          this.container.table
        )

        // Sync to original canvas
        this.syncToOriginal()

        this.drawSphere()
        this.container.lastEventTime = performance.now()
        this.container.updateTrajectoryPrediction()
      }
    }
  }

  elevationChanged = (e: Event) => {
    const target = e.target as HTMLInputElement
    const degrees = parseFloat(target.value)
    const angleRad = (degrees * Math.PI) / 180

    // Update cue elevation
    this.container.table.cue.elevation = angleRad
    this.container.table.cue.aim.elevation = angleRad

    // Update pitch
    this.pitch = Math.PI / 2 - angleRad

    // Push hit point to white area if needed
    this.hitPoint = this.pushToWhiteArea(this.hitPoint)

    // Update cue spin
    this.syncHitPointToCue()

    // Sync to original
    const aimInputs = this.container.table.cue.aimInputs
    if (aimInputs) {
      aimInputs.pitch = this.pitch
      aimInputs.hitPoint = [...this.hitPoint] as [number, number, number]
      if (aimInputs.cueElevationElement) {
        aimInputs.cueElevationElement.value = degrees.toString()
      }
      aimInputs.drawSphere()
    }

    this.drawSphere()
    this.container.lastEventTime = performance.now()
    this.container.updateTrajectoryPrediction()
  }

  powerChanged = (_: Event) => {
    const normalizedPower = parseFloat(this.cuePowerElement.value)
    this.container.table.cue.setPower(normalizedPower)

    // Sync to original
    const aimInputs = this.container.table.cue.aimInputs
    if (aimInputs && aimInputs.cuePowerElement) {
      aimInputs.cuePowerElement.value = normalizedPower.toString()
    }

    this.container.lastEventTime = performance.now()
    this.container.updateTrajectoryPrediction()
  }

  syncHitPointToCue() {
    const offsetX = -this.hitPoint[0]
    const offsetY = -this.hitPoint[1]

    this.container.table.cue.setSpin(
      new Vector3(offsetX, offsetY, 0),
      this.container.table
    )

    this.syncToOriginal()
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
      const targetTRaw = threshold - 0.02
      const targetRY = targetTRaw * 2 - 1

      const sx = Math.sin(this.pitch), cx = Math.cos(this.pitch)
      const newY = cx * targetRY + sx * rz
      const newZ = -sx * targetRY + cx * rz

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

    // Safety check for valid canvas dimensions
    if (W <= 0 || H <= 0 || !isFinite(W) || !isFinite(H)) {
      return
    }

    // Background gradient
    const gradient = this.ctx.createLinearGradient(0, 0, 0, H)
    gradient.addColorStop(0, 'rgb(0, 64, 94)')
    gradient.addColorStop(1, '#000214')
    this.ctx.fillStyle = gradient
    this.ctx.fillRect(0, 0, W, H)

    const img = this.ctx.createImageData(W, H)
    const data = img.data
    const r2 = this.radius * this.radius

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

        const [rx, ry, rz] = this.rotateX([nx, ny, nz], this.pitch)

        const dotHit = nx * this.hitPoint[0] + ny * this.hitPoint[1] + nz * this.hitPoint[2]
        const hitThreshold = 1 - this.hitPointRatio * 2

        const dotTarget = nx * this.targetPoint[0] + ny * this.targetPoint[1] + nz * this.targetPoint[2]
        const targetThreshold = 1 - this.targetPointRatio * 2

        let r, g, b

        if (dotHit >= hitThreshold) {
          const hitColor: [number, number, number] = [0, 64, 94]
          const edgeFade = (dotHit - hitThreshold) / (1 - hitThreshold)
          const t = this.smoothstep(0, 0.3, edgeFade)

          let tRaw = (ry + 1) * 0.5
          const threshold = 1 - this.greyRatio
          const whiteColor: [number, number, number] = [217, 217, 217]
          const greyColor: [number, number, number] = [144, 144, 144]
          const tBlend = this.smoothstep(threshold - this.blendWidth, threshold, tRaw)
          const baseR = whiteColor[0]*(1-tBlend) + greyColor[0]*tBlend
          const baseG = whiteColor[1]*(1-tBlend) + greyColor[1]*tBlend
          const baseB = whiteColor[2]*(1-tBlend) + greyColor[2]*tBlend

          r = baseR * (1-t) + hitColor[0] * t
          g = baseG * (1-t) + hitColor[1] * t
          b = baseB * (1-t) + hitColor[2] * t
        } else {
          let tRaw = (ry + 1) * 0.5
          const threshold = 1 - this.greyRatio

          const whiteColor: [number, number, number] = [217, 217, 217]
          const greyColor: [number, number, number] = [144, 144, 144]

          const t = this.smoothstep(threshold - this.blendWidth, threshold, tRaw)
          r = whiteColor[0]*(1-t) + greyColor[0]*t
          g = whiteColor[1]*(1-t) + greyColor[1]*t
          b = whiteColor[2]*(1-t) + greyColor[2]*t
        }

        if (dotTarget >= targetThreshold) {
          const targetColor: [number, number, number] = [255, 0, 0]
          const edgeFade = (dotTarget - targetThreshold) / (1 - targetThreshold)
          const t = this.smoothstep(0, 0.3, edgeFade) * 0.3

          r = r * (1-t) + targetColor[0] * t
          g = g * (1-t) + targetColor[1] * t
          b = b * (1-t) + targetColor[2] * t
        }

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
  }

  updateTargetPoint(targetPoint: [number, number, number]) {
    this.targetPoint = targetPoint
    this.drawSphere()
  }
}
