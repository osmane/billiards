import { Container } from "../container/container"
import { BreakEvent } from "../events/breakevent"
import { ChatEvent } from "../events/chatevent"
import { StationaryEvent } from "../events/stationaryevent"
import { share, shorten } from "../utils/shorten"

export class Menu {
  container: Container
  redo: HTMLButtonElement
  share: HTMLButtonElement
  replay: HTMLButtonElement
  camera: HTMLButtonElement
  masseButton: HTMLButtonElement
  massePresets: HTMLSelectElement

  disabled = true

  constructor(container) {
    this.container = container

    this.replay = this.getElement("replay")
    this.redo = this.getElement("redo")
    this.share = this.getElement("share")
    this.camera = this.getElement("camera")
    this.masseButton = this.getElement("masseButton")

    const massePresetsEl = document.getElementById("massePresets")
    if (!(massePresetsEl instanceof HTMLSelectElement)) {
      throw new Error("Masse presets dropdown element with id 'massePresets' not found or is not a select element.")
    }
    this.massePresets = massePresetsEl

    if (this.camera) {
      this.setMenu(true)
      this.camera.onclick = (_) => {
        this.adjustCamera()
      }
    }

    // Setup massé button
    if (this.masseButton) {
      this.masseButton.onclick = (_) => {
        this.toggleMasseMode()
      }
    }

    // Setup massé preset dropdown
    if (this.massePresets) {
      this.massePresets.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement
        const value = target.value
        if (value) {
          const [angleStr, direction] = value.split('-')
          const angle = parseInt(angleStr)
          this.setMassePreset(angle, direction as 'left' | 'right')
          // Reset dropdown to default option
          target.selectedIndex = 0
        }
      })
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

  toggleMasseMode() {
    const isActive = this.container.table.cue.toggleMasseMode()

    // Update button visual state
    if (isActive) {
      this.masseButton.classList.add('is-active')
      this.massePresets.style.display = 'block'
    } else {
      this.masseButton.classList.remove('is-active')
      this.massePresets.style.display = 'none'
    }

    this.container.lastEventTime = performance.now()
  }

  setMassePreset(angle: number, direction: 'left' | 'right') {
    this.container.table.cue.setMassePreset(angle, direction)
    this.container.lastEventTime = performance.now()
  }
}
