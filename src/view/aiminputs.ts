import { Color, Vector3 } from "three"
import { Container } from "../container/container"
import { Input } from "../events/input"
import { Overlap } from "../utils/overlap"
import { unitAtAngle } from "../utils/utils"

export class AimInputs {
  readonly cueBallElement
  readonly cueTipElement
  readonly cuePowerElement
  readonly cueHitElement
  readonly masseHitAreaElement
  readonly objectBallStyle: CSSStyleDeclaration | undefined
  readonly container: Container
  readonly overlap: Overlap

  ballWidth
  ballHeight
  tipRadius

  constructor(container) {
    this.container = container
    this.cueBallElement = document.getElementById("cueBall")
    this.cueTipElement = document.getElementById("cueTip")
    this.cuePowerElement = document.getElementById("cuePower")
    this.cueHitElement = document.getElementById("cueHit")
    this.masseHitAreaElement = document.getElementById("masseHitArea")
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

    // Get current massé mode state
    const masseMode = this.container.table.cue.masseMode

    // Scale factor: In massé mode, expand hit area to allow full 0.8 range
    // Normal mode: 0.3 limit, Massé mode: 0.8 limit (2.67x larger)
    const scaleFactor = masseMode ? (0.8 / 0.3) : 1.0

    this.container.table.cue.setSpin(
      new Vector3(
        -(e.offsetX - this.ballWidth / 2) / this.ballWidth * scaleFactor,
        -(e.offsetY - this.ballHeight / 2) / this.ballHeight * scaleFactor
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
      // Get current massé mode state
      const masseMode = this.container.table.cue.masseMode

      // Toggle massé hit area visibility
      if (this.masseHitAreaElement) {
        if (masseMode) {
          this.masseHitAreaElement.classList.add("active")
        } else {
          this.masseHitAreaElement.classList.remove("active")
        }
      }

      // Normalize the offset for visual display
      // In massé mode, offset can be up to 0.8, but we display it within the same visual area
      // Scale factor: compress the visual representation to fit within the ball
      const normalizeScale = masseMode ? (0.3 / 0.8) : 1.0

      // Apply normalized positioning - offsets are scaled down for display
      const visualX = -x * normalizeScale
      const visualY = -y * normalizeScale

      elt.left = (visualX + 0.5) * this.ballWidth - this.tipRadius + "px"
      elt.top = (visualY + 0.5) * this.ballHeight - this.tipRadius + "px"
    }
    this.showOverlap()
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
    this.container.table.cue.setPower(this.cuePowerElement?.value)
    this.container.inputQueue.push(new Input(0, "SpaceUp"))
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
