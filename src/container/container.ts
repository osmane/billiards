import { Input } from "../events/input"
import { GameEvent } from "../events/gameevent"
import { StationaryEvent } from "../events/stationaryevent"
import { Controller } from "../controller/controller"
import { Table } from "../model/table"
import { View } from "../view/view"
import { Init } from "../controller/init"
import { AimInputs } from "../view/aiminputs"
import { Keyboard } from "../events/keyboard"
import { Sound } from "../view/sound"
import { controllerName } from "../controller/util"
import { Chat } from "../view/chat"
import { ChatEvent } from "../events/chatevent"
import { Throttle } from "../events/throttle"
import { Sliders } from "../view/sliders"
import { Recorder } from "../events/recorder"
import { Rules } from "../controller/rules/rules"
import { RuleFactory } from "../controller/rules/rulefactory"
import { Menu } from "../view/menu"
import { Hud } from "../view/hud"
import { LobbyIndicator } from "../view/lobbyindicator"
import { ScoreButtons } from "../view/scorebuttons"
import { endShot, recordShotFrame } from "../utils/shotstats"
import { TrajectoryPredictor } from "../model/trajectorypredictor"
import { TrajectoryRenderer } from "../view/trajectoryrenderer"
import { Vector3 } from "three"
import { R } from "../model/physics/constants"
import { CaromClothManager } from "../view/caromcloth"
import { ClothPanel } from "../view/clothpanel"
import { TableMesh } from "../view/tablemesh"
import { PrecisionPanel } from "../view/precisionpanel"

/**
 * Model, View, Controller container.
 */
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now())
export class Container {
  table: Table
  view: View
  controller: Controller
  inputQueue: Input[] = []
  eventQueue: GameEvent[] = []
  keyboard: Keyboard
  sound: Sound
  chat: Chat
  sliders: Sliders
  recorder: Recorder
  id: string = ""
  isSinglePlayer: boolean = true
  rules: Rules
  menu: Menu
  hud: Hud
  lobbyIndicator: LobbyIndicator
  scoreButtons: ScoreButtons
  trajectoryPredictor: TrajectoryPredictor
  trajectoryRenderer: TrajectoryRenderer
  caromClothManager?: CaromClothManager
  clothPanel?: ClothPanel
  precisionPanel: PrecisionPanel
  frame: (timestamp: number) => void
  private wasMoving = false
  private debugModeEnabled = false

  last = performance.now()
  readonly step = 0.001953125 * 1

  broadcast: (event: GameEvent) => void = () => {}
  log: (text: string) => void

  constructor(element, log, assets, ruletype?, keyboard?, id?) {
    this.log = log
    this.scoreButtons = new ScoreButtons(this)
    this.rules = RuleFactory.create(ruletype, this)
    this.table = this.rules.table()
    this.view = new View(element, this.table, assets)
    this.trajectoryPredictor = new TrajectoryPredictor()
    this.trajectoryRenderer = new TrajectoryRenderer(this.view.scene)
    // Initialize trajectories as hidden by default (they will be shown only when target button is active)
    this.trajectoryRenderer.setVisible(false)
    this.table.cue.container = this // Set container reference for trajectory updates
    this.table.cue.aimInputs = new AimInputs(this)
    this.keyboard = keyboard
    this.sound = assets.sound
    this.chat = new Chat(this.sendChat, this)
    this.sliders = new Sliders(undefined, this)
    this.debugModeEnabled = this.sliders.isVisible()
    this.view.setDebugMode(this.debugModeEnabled)
    this.table.showSpin(this.debugModeEnabled)
    this.table.showTraces(this.debugModeEnabled)
    this.table.showVirtualCue(this.debugModeEnabled)
    this.recorder = new Recorder(this)
    this.id = id
    this.menu = new Menu(this)
    this.table.addToScene(this.view.scene)
    if (this.rules.rulename === "threecushion") {
      const surfaces = TableMesh.caromSurfaces ?? null
      this.caromClothManager = new CaromClothManager(surfaces)
      this.clothPanel = new ClothPanel(this.caromClothManager)
      if (!surfaces) {
        setTimeout(() => {
          this.caromClothManager?.setSurfaces(TableMesh.caromSurfaces ?? null)
        }, 0)
      }
    }
    this.hud = new Hud()
    this.lobbyIndicator = new LobbyIndicator()
    this.precisionPanel = new PrecisionPanel(this)
    this.updateController(new Init(this))
    this.wasMoving = !this.table.allStationary()

    // Initial trajectory prediction for 3 cushion mode
    // Poll until balls are stationary, then update trajectory
    const ensureInitialTrajectory = () => {
      if (this.table.allStationary()) {
        this.updateTrajectoryPrediction()
      } else {
        requestAnimationFrame(ensureInitialTrajectory)
      }
    }
    requestAnimationFrame(ensureInitialTrajectory)
  }

  sendChat = (msg) => {
    this.sendEvent(new ChatEvent(this.id, msg))
  }

  throttle = new Throttle(0, (event) => {
    this.broadcast(event)
  })

  sendEvent(event) {
    this.throttle.send(event)
  }

  advance(elapsed) {
    this.frame?.(elapsed)

    const steps = Math.floor(elapsed / this.step)
    const computedElapsed = steps * this.step
    const stateBefore = this.table.allStationary()
    for (let i = 0; i < steps; i++) {
      this.table.advance(this.step)
    }
    this.table.updateBallMesh(computedElapsed)
    this.view.update(computedElapsed, this.table.cue.aim)
    this.table.cue.update(computedElapsed)
    if (!stateBefore && this.table.allStationary()) {
      this.eventQueue.push(new StationaryEvent())
      this.updateTrajectoryPrediction()
    }
    this.sound.processOutcomes(this.table.outcome)
  }

  toggleDebugMode() {
    this.setDebugMode(!this.debugModeEnabled)
  }

  setDebugMode(enabled: boolean) {
    if (this.debugModeEnabled === enabled) {
      return
    }
    this.debugModeEnabled = enabled
    this.sliders.setVisible(enabled)
    this.table.showSpin(enabled)
    this.table.showTraces(enabled)
    this.table.showVirtualCue(enabled)
    this.view.setDebugMode(enabled)
  }

  isDebugModeEnabled() {
    return this.debugModeEnabled
  }

  processEvents() {
    if (this.keyboard) {
      const inputs = this.keyboard.getEvents()
      inputs.forEach((i) => this.inputQueue.push(i))
    }

    while (this.inputQueue.length > 0) {
      this.lastEventTime = this.last
      const input = this.inputQueue.shift()
      input && this.updateController(this.controller.handleInput(input))
    }

    // only process events when stationary
    if (this.table.allStationary()) {
      const event = this.eventQueue.shift()
      if (event) {
        this.lastEventTime = performance.now()
        this.updateController(event.applyToController(this.controller))
      }
    }
  }

  lastEventTime = performance.now()

  animate(timestamp): void {
    const frameStart = now()
    const dt = (timestamp - this.last) / 1000
    const wasMoving = this.wasMoving
    const clampedDt = Math.max(dt, 0)

    const advanceStart = now()
    this.advance(clampedDt)
    const advanceTime = now() - advanceStart
    this.last = timestamp

    const processStart = now()
    this.processEvents()
    const processTime = now() - processStart

    let renderTime = 0
    const needsRender =
      timestamp < this.lastEventTime + 12000 ||
      !this.table.allStationary() ||
      this.view.sizeChanged()
    if (needsRender) {
      const renderStart = now()
      this.view.render()
      renderTime = now() - renderStart
    }

    const frameTotal = now() - frameStart
    recordShotFrame({
      physics: advanceTime,
      process: processTime,
      render: renderTime,
      total: frameTotal,
      dtMs: clampedDt * 1000,
      rawElapsedMs: clampedDt * 1000,
      deltaMs: clampedDt * 1000,
      steps: 0,
      simulatedMs: clampedDt * 1000,
      accumulatorBefore: 0,
      accumulatorAfterAdd: 0,
      accumulatorAfter: 0,
      backlogBefore: 0,
      backlogAfter: 0,
      deltaClamped: false,
      accumulatorClamped: false,
      hitMaxSubSteps: false,
      accumulatorTrimmedPostStep: false,
    })

    const isMoving = !this.table.allStationary()
    if (wasMoving && !isMoving) {
      endShot()
    }
    // Close precision panel when shot is made (balls start moving)
    if (!wasMoving && isMoving) {
      this.precisionPanel?.hide()
    }
    this.wasMoving = isMoving

    // Update replay button state in aim mode
    // Disable when balls are moving, enable when stationary
    if (this.menu.replay && controllerName(this.controller) === "Aim") {
      this.menu.replay.disabled = isMoving
    }

    requestAnimationFrame((t) => {
      this.animate(t)
    })
  }

  updateController(controller) {
    if (controller !== this.controller) {
      this.log("Transition to " + controllerName(controller))
      this.controller = controller
      this.controller.onFirst()
    }
  }

  updateTrajectoryPrediction() {
    // Check if targetButton is in active state
    const targetButton = document.getElementById("targetButton")
    const trajectoryVisible = targetButton?.classList.contains("is-active") ?? false

    // Only predict trajectories when balls are stationary
    if (!TrajectoryPredictor.shouldPredict(this) || !this.table.allStationary()) {
      this.trajectoryRenderer.clearTrajectories()
      this.table.cue.updateHelperCurve(null)
      return
    }

    // Ensure power is set to a reasonable default if it's zero or too small
    if (this.table.cue.aim.power < 0.01) {
      this.table.cue.aim.power = this.table.cue.maxPower * 0.5 // Set to 50% power as default
    }

    // Always calculate trajectories (for helper curve), but control visibility separately
    try {
      // Pass massé mode state and elevation to trajectory predictor
      const masseMode = this.table.cue.masseMode
      const elevation = this.table.cue.elevation

      // Optimize: If trajectory lines are hidden, only predict short distance for helper
      const limitToHelper = !trajectoryVisible
      const predictions = this.trajectoryPredictor.predictTrajectory(
        this.table,
        this.table.cue.aim,
        this.rules,
        masseMode,
        elevation,
        limitToHelper
      )

      const helperMaxDistance = (R * 30) / 0.5
      const trimPointsByDistance = (points: Vector3[], maxDistance: number): Vector3[] => {
        if (points.length === 0) {
          return []
        }
        if (maxDistance <= 0) {
          return [points[0].clone()]
        }

        const trimmed: Vector3[] = [points[0].clone()]
        let accumulated = 0

        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1]
          const current = points[i]
          const segment = current.clone().sub(prev)
          const segmentLength = segment.length()
          if (segmentLength === 0) {
            continue
          }

          if (accumulated + segmentLength <= maxDistance) {
            trimmed.push(current.clone())
            accumulated += segmentLength
            continue
          }

          const remaining = maxDistance - accumulated
          if (remaining >= 0) {
            const interpolated = prev.clone().add(
              segment.multiplyScalar(remaining / segmentLength)
            )
            trimmed.push(interpolated)
          }
          break
        }

        if (trimmed.length < 2 && points.length >= 2) {
          trimmed.push(points[1].clone())
        }

        return trimmed
      }

      // Update helper curve to match trajectory prediction (always)
      if (predictions && predictions.length > 0) {
        // Find cue ball trajectory by matching ball ID
        const cueBallId = this.table.cueball.id
        const cueBallTrajectory = predictions.find(p => p.ballId === cueBallId)

        if (cueBallTrajectory && cueBallTrajectory.points.length >= 2) {
          const trajectoryVectors = cueBallTrajectory.points.map(p =>
            new Vector3(p.position.x, p.position.y, p.position.z)
          )
          let helperPoints = trajectoryVectors
          if (
            cueBallTrajectory.firstImpactIndex !== undefined &&
            cueBallTrajectory.firstImpactIndex >= 0
          ) {
            const clampIndex = Math.min(
              cueBallTrajectory.firstImpactIndex + 1,
              trajectoryVectors.length
            )
            helperPoints = trajectoryVectors.slice(0, clampIndex)
          } else if (cueBallTrajectory.firstImpactDistance !== undefined) {
            const maxDistance = Math.min(
              cueBallTrajectory.firstImpactDistance,
              helperMaxDistance
            )
            helperPoints = trimPointsByDistance(trajectoryVectors, maxDistance)
          } else if (limitToHelper) {
            helperPoints = trimPointsByDistance(trajectoryVectors, helperMaxDistance)
          }

          const firstImpactDistance = cueBallTrajectory.firstImpactDistance
          const impactThreshold = helperMaxDistance - 1e-6
          const hasImpact =
            cueBallTrajectory.firstImpactIndex !== undefined ||
            (firstImpactDistance !== undefined && firstImpactDistance < impactThreshold)
          const hasBallImpact = predictions.some((p) =>
            p.ballId !== cueBallId && p.firstImpactIndex !== undefined
          )


          this.table.cue.updateHelperCurve(helperPoints, hasImpact, hasBallImpact)
        } else {
          this.table.cue.updateHelperCurve(null)
        }
      } else {
        this.table.cue.updateHelperCurve(null)
      }

      // Control trajectory lines visibility based on button state
      if (trajectoryVisible) {
        this.trajectoryRenderer.updateTrajectories(predictions, this.table)
        this.trajectoryRenderer.setVisible(true)
      } else {
        // Hide trajectory lines but keep helper curve working
        this.trajectoryRenderer.setVisible(false)
      }
    } catch (error) {
      this.trajectoryRenderer.clearTrajectories()
      this.table.cue.updateHelperCurve(null)
    }
  }
}

