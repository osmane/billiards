import { Input } from "../events/input"
import { GameEvent } from "../events/gameevent"
import { StationaryEvent } from "../events/stationaryevent"
import { Controller } from "../controller/controller"
import { Table, AdvanceStepStats } from "../model/table"
import { View } from "../view/view"
import type { MeshUpdateOptions } from "../view/ballmesh"
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

/**
 * Model, View, Controller container.
 */
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
  frame: (timestamp: number) => void

  last = performance.now()
  readonly step = 0.001953125 * 1
  accumulator = 0
  readonly maxSubSteps = 24
  readonly maxAccumulator = this.step * 96
  readonly physicsBudgetMs = 6
  readonly physicsLogCooldownMs = 1500
  readonly maxFrameDelta = 1 / 30
  lastPhysicsWarningTs = 0
  droppedDeltaSinceLog = 0
  prevAdvanceMs = 0
  prevProcessMs = 0
  prevRenderMs = 0

  broadcast: (event: GameEvent) => void = () => {}
  log: (text: string) => void

  constructor(element, log, assets, ruletype?, keyboard?, id?) {
    this.log = log
    this.rules = RuleFactory.create(ruletype, this)
    this.table = this.rules.table()
    this.view = new View(element, this.table, assets)
    this.table.cue.aimInputs = new AimInputs(this)
    this.keyboard = keyboard
    this.sound = assets.sound
    this.chat = new Chat(this.sendChat)
    this.sliders = new Sliders()
    this.recorder = new Recorder(this)
    this.id = id
    this.menu = new Menu(this)
    this.table.addToScene(this.view.scene)
    this.hud = new Hud()
    this.lobbyIndicator = new LobbyIndicator()
    this.updateController(new Init(this))
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

    const stateBefore = this.table.allStationary()
    const rawDelta = Math.max(elapsed, 0)
    const delta = Math.min(rawDelta, this.maxFrameDelta)
    const droppedDelta = rawDelta - delta
    if (droppedDelta > 0) {
      this.droppedDeltaSinceLog += droppedDelta
    }
    this.accumulator = Math.min(this.accumulator + delta, this.maxAccumulator)
    const backlogBeforeStep = this.accumulator

    const now = typeof performance !== "undefined" && performance.now ? () => performance.now() : () => Date.now()
    const started = now()
    let steps = 0
    let budgetClamped = false
    let backlogOnClamp = 0
    let maxStepRetries = 0
    let totalStepRetries = 0
    let outcomesThisFrame = 0
    while (this.accumulator >= this.step && steps < this.maxSubSteps) {
      const stepStats: AdvanceStepStats = { retries: 0, outcomeDelta: 0 }
      this.table.advance(this.step, stepStats)
      maxStepRetries = Math.max(maxStepRetries, stepStats.retries)
      totalStepRetries += stepStats.retries
      outcomesThisFrame += stepStats.outcomeDelta
      this.accumulator -= this.step
      steps++
      if (now() - started >= this.physicsBudgetMs) {
        backlogOnClamp = this.accumulator
        this.accumulator = 0
        budgetClamped = true
        break
      }
    }
    const physicsMs = now() - started
    const hitStepCap = steps === this.maxSubSteps && this.accumulator >= this.step
    const backlogBeforeClamp = budgetClamped ? backlogOnClamp : this.accumulator
    if (hitStepCap) {
      this.accumulator = Math.min(this.accumulator, this.step)
    }
    const backlogAfterClamp = budgetClamped ? backlogOnClamp : this.accumulator
    const simulated = steps * this.step
    const { mode: meshMode, options: meshOptions } = this.selectMeshUpdate(
      droppedDelta,
      backlogBeforeStep,
      budgetClamped,
      hitStepCap,
      steps
    )
    const meshStart = now()
    this.table.updateBallMesh(simulated, meshOptions)
    const meshEnd = now()
    this.view.update(simulated, this.table.cue.aim)
    const viewEnd = now()
    this.table.cue.update(simulated)
    const cueEnd = now()
    const meshMs = meshEnd - meshStart
    const viewMs = viewEnd - meshEnd
    const cueMs = cueEnd - viewEnd
    const totalAdvanceMs = cueEnd - started
    this.prevAdvanceMs = totalAdvanceMs
    const controllerLabel = controllerName(this.controller)
    const shouldLog = controllerLabel === "PlayShot" && (budgetClamped || hitStepCap || droppedDelta > 0 || rawDelta >= this.step * this.maxSubSteps)
    if (shouldLog) {
      const ts = now()
      if (typeof console !== "undefined" && console.warn) {
        if (ts - this.lastPhysicsWarningTs >= this.physicsLogCooldownMs) {
          const reason = budgetClamped ? "budget" : hitStepCap ? "step" : "slow"
          const movingBalls = this.table.balls.filter((b) => b.inMotion()).length
          console.warn(`[physics] frame clamped (${reason})`, {
            elapsed,
            delta,
            droppedDelta: this.droppedDeltaSinceLog,
            steps,
            backlogBefore: backlogBeforeClamp,
            backlogAfter: backlogAfterClamp,
            controller: controllerLabel,
            movingBalls,
            stateBefore,
            maxSubSteps: this.maxSubSteps,
            maxStepRetries,
            totalStepRetries,
            outcomesThisFrame,
            physicsMs,
            meshMode,
            meshMs,
            viewMs,
            cueMs,
            advanceMs: this.prevAdvanceMs,
            processMs: this.prevProcessMs,
            renderMs: this.prevRenderMs,
          })
          this.droppedDeltaSinceLog = 0
          this.lastPhysicsWarningTs = ts
        }
      }
    }

    if (!stateBefore && this.table.allStationary()) {
      this.eventQueue.push(new StationaryEvent())
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
    const dt = (timestamp - this.last) / 1000
    this.advance(dt)
    this.last = timestamp

    const perfNow =
      typeof performance !== "undefined" && performance.now
        ? () => performance.now()
        : () => Date.now()

    const processStart = perfNow()
    this.processEvents()
    this.prevProcessMs = perfNow() - processStart

    const needsRender =
      timestamp < this.lastEventTime + 12000 ||
      !this.table.allStationary() ||
      this.view.sizeChanged()
    let renderMs = 0
    if (needsRender) {
      const renderStart = perfNow()
      this.view.render()
      renderMs = perfNow() - renderStart
    }
    this.prevRenderMs = renderMs

    requestAnimationFrame((t) => {
      this.animate(t)
    })
  }

  private selectMeshUpdate(
    droppedDelta: number,
    backlogBeforeStep: number,
    budgetClamped: boolean,
    hitStepCap: boolean,
    stepsExecuted: number
  ): { mode: "full" | "reduced" | "positions-only"; options?: MeshUpdateOptions } {
    const backlogSteps = backlogBeforeStep / this.step
    const clampActive = budgetClamped || hitStepCap
    const heavyDrop = droppedDelta > 0.12
    const moderateDrop = droppedDelta > 0.03
    const heavyBacklog = backlogSteps >= this.maxSubSteps
    if (heavyDrop || heavyBacklog || (clampActive && moderateDrop)) {
      return {
        mode: "positions-only",
        options: { positionsOnly: true, skipTrace: true, skipSpinAxis: true },
      }
    }
    if (moderateDrop || clampActive || backlogSteps > 8 || stepsExecuted > this.maxSubSteps / 2) {
      return {
        mode: "reduced",
        options: { skipTrace: true, skipSpinAxis: true },
      }
    }
    return { mode: "full" }
  }

  updateController(controller) {
    if (controller !== this.controller) {
      this.log("Transition to " + controllerName(controller))
      this.controller = controller
      this.controller.onFirst()
    }
  }
}
