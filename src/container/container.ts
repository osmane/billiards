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
  frame: (timestamp: number) => void
  private wasMoving = false

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
    this.sliders = new Sliders()
    this.recorder = new Recorder(this)
    this.id = id
    this.menu = new Menu(this)
    this.table.addToScene(this.view.scene)
    this.hud = new Hud()
    this.lobbyIndicator = new LobbyIndicator()
    this.updateController(new Init(this))
    this.wasMoving = !this.table.allStationary()

    // Initial trajectory prediction for 3 cushion mode
    setTimeout(() => {
      this.updateTrajectoryPrediction()
    }, 1000)
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
    this.wasMoving = isMoving

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
    // Check if targetButton is in active state first
    const targetButton = document.getElementById("targetButton")
    const trajectoryVisible = targetButton?.classList.contains("is-active") ?? false

    // If button is unpressed, always hide and clear trajectories
    if (!trajectoryVisible) {
      this.trajectoryRenderer.clearTrajectories()
      return
    }

    // Only predict trajectories for 3 cushion mode when balls are stationary AND button is pressed
    if (!TrajectoryPredictor.shouldPredict(this) || !this.table.allStationary()) {
      this.trajectoryRenderer.clearTrajectories()
      return
    }

    // Button is pressed - calculate and show trajectories
    try {
      // Pass massé mode state to trajectory predictor
      const masseMode = this.table.cue.masseMode
      const predictions = this.trajectoryPredictor.predictTrajectory(this.table, this.table.cue.aim, this.rules, masseMode)
      this.trajectoryRenderer.updateTrajectories(predictions, this.table)
      // Force visibility to true since button is pressed
      this.trajectoryRenderer.setVisible(true)
    } catch (error) {
      this.trajectoryRenderer.clearTrajectories()
    }
  }
}
