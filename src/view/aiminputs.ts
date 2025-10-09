import { Color, Vector3 } from "three"
import { Container } from "../container/container"
import { Input } from "../events/input"
import { Overlap } from "../utils/overlap"
import { unitAtAngle } from "../utils/utils"
import { PIQUE_PRESETS, getPresetById, PiquePreset } from "./piquepresets"

export class AimInputs {
  readonly cueBallElement
  readonly cueTipElement
  readonly cuePowerElement
  readonly cueHitElement
  readonly elevationValueElement
  readonly piquePresetElement: HTMLSelectElement | null
  readonly objectBallStyle: CSSStyleDeclaration | undefined
  readonly container: Container
  readonly overlap: Overlap
  currentPreset: PiquePreset | null = null

  ballWidth
  ballHeight
  tipRadius

  constructor(container) {
    this.container = container
    this.cueBallElement = document.getElementById("cueBall")
    this.cueTipElement = document.getElementById("cueTip")
    this.cuePowerElement = document.getElementById("cuePower")
    this.cueHitElement = document.getElementById("cueHit")
    this.elevationValueElement = document.getElementById("elevationValue")
    this.piquePresetElement = document.getElementById("piquePreset") as HTMLSelectElement
    this.objectBallStyle = document.getElementById("objectBall")?.style
    this.overlap = new Overlap(this.container.table.balls)
    this.addListeners()
  }

  addListeners() {
    this.cueBallElement?.addEventListener("pointermove", this.mousemove)
    this.cueBallElement?.addEventListener("click", (e) => {
      this.adjustSpin(e)
    })
    this.cueHitElement?.addEventListener("click", this.hit)
    this.cuePowerElement?.addEventListener("change", this.powerChanged)
    this.piquePresetElement?.addEventListener("change", this.presetChanged)
    if (!("ontouchstart" in window)) {
      document.getElementById("viewP1")?.addEventListener("dblclick", this.hit)
    }
    document.addEventListener("wheel", this.mousewheel)
  }

  setButtonText(text) {
    this.cueHitElement && (this.cueHitElement.innerText = text)
  }

  mousemove = (e) => {
    e.buttons === 1 && this.adjustSpin(e)
  }

  readDimensions() {
    this.ballWidth = this.cueBallElement?.offsetWidth
    this.ballHeight = this.cueBallElement?.offsetHeight
    this.tipRadius = this.cueTipElement?.offsetWidth / 2
  }

  adjustSpin(e) {
    this.readDimensions()
    this.container.table.cue.setSpin(
      new Vector3(
        -(e.offsetX - this.ballWidth / 2) / this.ballWidth,
        -(e.offsetY - this.ballHeight / 2) / this.ballHeight
      ),
      this.container.table
    )
    this.container.lastEventTime = performance.now()
    this.container.updateTrajectoryPrediction()
  }

  updateVisualState(x: number, y: number) {
    this.readDimensions()
    const elt = this.cueTipElement?.style
    if (elt) {
      elt.left = (-x + 0.5) * this.ballWidth - this.tipRadius + "px"
      elt.top = (-y + 0.5) * this.ballHeight - this.tipRadius + "px"
    }
    this.showOverlap()
    this.updateElevationDisplay()
  }

  updateElevationDisplay() {
    if (this.elevationValueElement) {
      const elevation = this.container.table.cue.aim.elevation
      this.elevationValueElement.textContent = `${Math.round(elevation)}°`
    }
  }

  showOverlap() {
    if (this.objectBallStyle) {
      const table = this.container.table
      const dir = unitAtAngle(table.cue.aim.angle)
      const closest = this.overlap.getOverlapOffset(table.cueball, dir)
      if (closest) {
        this.readDimensions()
        this.objectBallStyle.visibility = "visible"
        this.objectBallStyle.left =
          5 + (closest.overlap * this.ballWidth) / 2 + "px"
        this.objectBallStyle.backgroundColor = new Color(0, 0, 0)
          .lerp(closest.ball.ballmesh.color, 0.5)
          .getStyle()
      } else {
        this.objectBallStyle.visibility = "hidden"
      }
    }
  }

  powerChanged = (_) => {
    this.container.table.cue.setPower(this.cuePowerElement.value)
    this.container.updateTrajectoryPrediction()
  }

  updatePowerSlider(power) {
    power > 0 &&
      this.cuePowerElement?.value &&
      (this.cuePowerElement.value = power)
  }

  hit = (_) => {
    // If a preset is active, apply it one more time to ensure all parameters are set
    if (this.currentPreset) {
      this.applyPreset(this.currentPreset)
    }
    this.container.table.cue.setPower(this.cuePowerElement?.value)
    this.container.inputQueue.push(new Input(0, "SpaceUp"))
  }

  presetChanged = (e: Event) => {
    const selectElement = e.target as HTMLSelectElement
    const presetId = selectElement.value

    if (!presetId) {
      this.currentPreset = null
      return
    }

    const preset = getPresetById(presetId)
    if (preset) {
      this.applyPreset(preset)
    }
  }

  applyPreset(preset: PiquePreset) {
    this.currentPreset = preset
    const table = this.container.table
    const cue = table.cue

    // Set aim angle (convert degrees to radians)
    cue.aim.angle = (preset.aimAngle * Math.PI) / 180
    cue.mesh.rotation.z = cue.aim.angle
    cue.helperMesh.rotation.z = cue.aim.angle

    // Set elevation
    cue.setElevation(preset.verticalAngle)

    // Set horizontal offset
    // Preset offset is in physics units (-0.5 to +0.5)
    // UI offset is normalized by offCenterLimit (0.3)
    const uiX = preset.horizontalOffset / cue.offCenterLimit
    const uiY = 0  // Center vertically for piqué shots
    cue.setSpin(new Vector3(uiX, uiY, 0), table)

    // Set power
    cue.setPower(preset.power)

    // Update all visual indicators
    cue.updateAimInput()
    this.container.updateTrajectoryPrediction()
  }

  mousewheel = (e) => {
    if (this.cuePowerElement) {
      this.cuePowerElement.value -= Math.sign(e.deltaY) / 10
      this.container.table.cue.setPower(this.cuePowerElement.value)
      this.container.lastEventTime = performance.now()
      this.container.updateTrajectoryPrediction()
    }
  }
}
