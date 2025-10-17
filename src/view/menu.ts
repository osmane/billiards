import { Container } from "../container/container"
import { BreakEvent } from "../events/breakevent"
import { ChatEvent } from "../events/chatevent"
import { StationaryEvent } from "../events/stationaryevent"
import { share, shorten } from "../utils/shorten"
import JSONCrush from "jsoncrush"

export class Menu {
  container: Container
  redo: HTMLButtonElement
  share: HTMLButtonElement
  replay: HTMLButtonElement
  camera: HTMLButtonElement

  disabled = true

  constructor(container) {
    this.container = container

    this.replay = this.getElement("replay")
    this.redo = this.getElement("redo")
    this.share = this.getElement("share")
    this.camera = this.getElement("camera")

    if (this.camera) {
      this.setMenu(true)
      this.camera.onclick = (_) => {
        this.adjustCamera()
      }
    }
  }

  setMenu(disabled) {
    this.replay.disabled = disabled
    this.redo.disabled = disabled
    this.share.disabled = disabled
  }

  adjustCamera() {
    this.container.view.camera.toggleMode()
    this.container.lastEventTime = performance.now()
  }

  replayMode(url, breakEvent: BreakEvent) {
    if (!this.replay) {
      return
    }

    this.setMenu(false)
    const queue = this.container.eventQueue
    this.share.onclick = (_) => {
      shorten(url, (url) => {
        const response = share(url)
        queue.push(new ChatEvent(null, response))
      })
    }
    this.redo.onclick = (_) => {
      const redoEvent = new BreakEvent(breakEvent.init, breakEvent.shots)
      redoEvent.retry = true
      this.interuptEventQueue(redoEvent)
    }
    this.replay.onclick = (_) => {
      this.interuptEventQueue(breakEvent)
    }
  }

  aimMode() {
    if (!this.replay) {
      return
    }

    // Enable replay button in aim mode to share current state
    this.replay.disabled = false
    this.share.disabled = true
    this.redo.disabled = true

    const queue = this.container.eventQueue
    this.replay.onclick = (_) => {
      // Only allow sharing when balls are stationary
      if (!this.container.table.allStationary()) {
        return
      }

      // Build URL from current state
      const currentState = this.buildCurrentStateUrl()
      if (!currentState) {
        return
      }

      // In single player aim mode, directly copy to clipboard without network call
      const response = share(currentState)
      queue.push(new ChatEvent(null, response))
    }
  }

  private buildCurrentStateUrl(): string | null {
    // Get current table state
    const init = this.container.table.shortSerialise()

    // Get current aim event (cue position, angle, power, elevation, spin)
    const aim = this.container.table.cue.aim.copy()

    // Create a replay state with single shot
    const state = {
      init: init,
      shots: [aim],
      start: Date.now(),
      now: Date.now(),
      score: 0,
      wholeGame: false,
      v: 1,
    }

    const serialised = JSON.stringify(state)
    const compressed = JSONCrush.crush(serialised)

    // Encode for URL
    const encoded = encodeURIComponent(compressed)
      .replace(/\(/g, "%28")
      .replace(/\)/g, "%29")
      .replace(/\!/g, "%21")
      .replace(/\*/g, "%2A")

    // Get replay URL from recorder
    const replayUrl = this.container.recorder.replayUrl
    if (!replayUrl) {
      return null
    }

    return `${replayUrl}${encoded}`
  }

  interuptEventQueue(breakEvent: BreakEvent) {
    this.container.table.halt()
    const queue = this.container.eventQueue
    queue.length = 0
    queue.push(new StationaryEvent())
    queue.push(breakEvent)
  }

  getElement(id): HTMLButtonElement {
    return document.getElementById(id)! as HTMLButtonElement
  }
}
