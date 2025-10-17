import { HitEvent } from "../events/hitevent"
import { ControllerBase } from "./controllerbase"
import { AimEvent } from "../events/aimevent"
import { AbortEvent, Controller, Input } from "./controller"
import { BreakEvent } from "../events/breakevent"
import { Aim } from "./aim"
import { GameEvent } from "../events/gameevent"
import { EventType } from "../events/eventtype"
import { RerackEvent } from "../events/rerackevent"
import { End } from "./end"
import { ChatEvent } from "../events/chatevent"

export class Replay extends ControllerBase {
  delay: number
  shots: GameEvent[]
  firstShot: GameEvent
  timer
  init
  waitingForClick: boolean = false
  clickHandler: (event: MouseEvent) => void

  constructor(container, init, shots, retry = false, delay = 1500) {
    super(container)
    this.init = init
    this.shots = [...shots]
    this.firstShot = this.shots[0]
    this.delay = delay
    this.container.table.showTraces(true)
    // Ensure virtual cue is hidden in replay mode (controlled by debug mode)
    if (!this.container.isDebugModeEnabled()) {
      this.container.table.showVirtualCue(false)
    }
    this.container.table.updateFromShortSerialised(this.init)
    if (retry) {
      const retryEvent = new BreakEvent(init, shots)
      retryEvent.retry = true
      this.container.eventQueue.push(retryEvent)
    } else {
      this.container.view.camera.forceMode(this.container.view.camera.topView)
      // Instead of playing immediately, wait for click
      this.waitForClick()
    }
  }

  waitForClick() {
    this.waitingForClick = true
    // Show message in chat
    this.container.eventQueue.push(
      new ChatEvent(null, "Click on the screen to start replay")
    )

    // Setup click handler
    this.clickHandler = (event: MouseEvent) => {
      if (this.waitingForClick) {
        this.waitingForClick = false
        // Remove the click handler
        const viewElement = document.getElementById("viewP1")
        if (viewElement) {
          viewElement.removeEventListener("click", this.clickHandler)
        }
        // Start playing
        this.playNextShot(this.delay * 1.5)
      }
    }

    // Add click listener to view
    const viewElement = document.getElementById("viewP1")
    if (viewElement) {
      viewElement.addEventListener("click", this.clickHandler)
    }
  }

  playNextShot(delay) {
    const shot = this.shots.shift()

    if (shot?.type === EventType.RERACK) {
      const rerack = RerackEvent.fromJson((shot as RerackEvent).ballinfo)
      rerack.applyToController(this)
      if (this.shots.length > 0) {
        this.playNextShot(delay)
      }
      return
    }
    const aim = AimEvent.fromJson(shot)
    this.container.table.cueball = this.container.table.balls[aim.i]
    this.container.table.cueball.pos.copy(aim.pos)
    this.container.table.cue.aim = aim
    // Restore elevation from aim event for accurate replay
    this.container.table.cue.elevation = aim.elevation
    this.container.table.cue.updateAimInput()
    this.container.table.cue.t = 1
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.container.eventQueue.push(new HitEvent(this.container.table.cue.aim))
      this.timer = undefined
    }, delay)
  }

  override handleHit(_: HitEvent) {
    this.hit()
    return this
  }

  override handleStationary(_) {
    if (this.shots.length > 0 && this.timer === undefined) {
      this.playNextShot(this.delay)
    }
    return this
  }

  override handleInput(input: Input): Controller {
    this.commonKeyHandler(input)
    return this
  }

  override handleBreak(event: BreakEvent): Controller {
    // Clean up click handler if waiting
    if (this.waitingForClick) {
      this.waitingForClick = false
      const viewElement = document.getElementById("viewP1")
      if (viewElement && this.clickHandler) {
        viewElement.removeEventListener("click", this.clickHandler)
      }
    }

    this.container.table.updateFromShortSerialised(event.init)
    this.shots = [...event.shots]
    this.container.table.showSpin(true)
    if (event.retry) {
      return this.retry()
    }
    this.playNextShot(this.delay)
    return this
  }

  override handleAbort(_: AbortEvent): Controller {
    console.log("Replay aborted")
    // Clean up click handler if waiting
    if (this.waitingForClick) {
      this.waitingForClick = false
      const viewElement = document.getElementById("viewP1")
      if (viewElement && this.clickHandler) {
        viewElement.removeEventListener("click", this.clickHandler)
      }
    }
    return new End(this.container)
  }

  retry() {
    // Clean up click handler if waiting
    if (this.waitingForClick) {
      this.waitingForClick = false
      const viewElement = document.getElementById("viewP1")
      if (viewElement && this.clickHandler) {
        viewElement.removeEventListener("click", this.clickHandler)
      }
    }

    clearTimeout(this.timer)
    this.timer = undefined
    this.container.table.updateFromShortSerialised(this.init)
    const aim = AimEvent.fromJson(this.firstShot)
    this.container.table.cueball = this.container.table.balls[aim.i]
    this.container.rules.cueball = this.container.table.cueball
    this.container.table.cueball.pos.copy(aim.pos)
    this.container.table.cue.aim = aim
    // Restore elevation from aim event for accurate replay
    this.container.table.cue.elevation = aim.elevation
    this.container.view.camera.forceMode(this.container.view.camera.aimView)
    return new Aim(this.container)
  }
}
