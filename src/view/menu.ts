import { Container } from "../container/container"
import JSONCrush from "jsoncrush"
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
  menuToggle: HTMLButtonElement | null
  menuPanel: HTMLElement | null

  private menuPanelVisible = false
  private handleOutsideClick = (_: MouseEvent) => {
    if (!this.menuPanelVisible) {
      return
    }
    this.setMenuPanelVisibility(false)
  }
  private handleEscapeKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      this.setMenuPanelVisibility(false)
    }
  }
  private handlePanelSelection = () => {
    this.setMenuPanelVisibility(false)
  }
  disabled = true

  constructor(container) {
    this.container = container

    this.replay = this.getElement("replay")
    this.redo = this.getElement("redo")
    this.share = this.getElement("share")
    this.camera = this.getElement("camera")
    this.menuToggle = document.getElementById("mainMenuToggle") as HTMLButtonElement | null
    this.menuPanel = document.getElementById("mainMenuPanel")

    this.setupMenuPanel()

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
    if (this.share) {
      this.share.disabled = disabled
    }
    if (disabled) {
      this.setMenuPanelVisibility(false)
    }
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
    this.bindShare(() => {
      shorten(url, (shortUrl) => {
        const response = share(shortUrl)
        queue.push(new ChatEvent(null, response))
      })
    })
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

    // In aim mode, allow replaying the most recent recorded shot
    const canReplay = this.canReplayLastShot()
    this.replay.disabled = !canReplay
    this.share.disabled = true
    this.redo.disabled = true

    this.replay.onclick = (_) => {
      // Only allow replay when balls are stationary to prevent conflicts
      if (!this.container.table.allStationary()) {
        return
      }

      this.replayLastRecordedShot()
    }
  }

  private setupMenuPanel() {
    if (!this.menuToggle || !this.menuPanel) {
      return
    }

    this.menuToggle.addEventListener("click", (event) => {
      event.stopPropagation()
      this.toggleMenuPanel()
    })

    this.menuPanel.addEventListener("click", (event) => {
      event.stopPropagation()
    })

    document.addEventListener("click", this.handleOutsideClick)
    document.addEventListener("keydown", this.handleEscapeKey)

    const selectableItems = this.menuPanel.querySelectorAll("a, button")
    selectableItems.forEach((item) => {
      item.addEventListener("click", this.handlePanelSelection)
      item.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          this.handlePanelSelection()
        }
      })
    })
  }

  private toggleMenuPanel(force?: boolean) {
    const targetState =
      typeof force === "boolean" ? force : !this.menuPanelVisible
    this.setMenuPanelVisibility(targetState)
  }

  private setMenuPanelVisibility(visible: boolean) {
    this.menuPanelVisible = visible
    if (!this.menuPanel || !this.menuToggle) {
      return
    }

    this.menuPanel.classList.toggle("is-visible", visible)
    this.menuPanel.setAttribute("aria-hidden", visible ? "false" : "true")
    this.menuToggle.setAttribute("aria-expanded", visible ? "true" : "false")
  }

  private bindShare(handler: () => void) {
    if (!this.share) {
      return
    }
    this.share.onclick = (_) => {
      handler()
      this.setMenuPanelVisibility(false)
    }
  }

  private replayLastRecordedShot() {
    if (!this.canReplayLastShot()) {
      return
    }

    const recorder = this.container.recorder
    if (!recorder) {
      return
    }

    const lastShotState = recorder.lastShot()
    if (!this.isValidShotState(lastShotState)) {
      return
    }

    const replayUrl = this.buildReplayUrlFromState(lastShotState)
    if (!replayUrl) {
      return
    }

    window.open(replayUrl, "_blank", "noopener")
    this.setMenuPanelVisibility(false)
  }

  private isValidShotState(
    state: any
  ): state is {
    init: unknown
    shots: unknown[]
  } {
    return (
      !!state &&
      !!state.init &&
      Array.isArray(state.shots) &&
      state.shots.length > 0
    )
  }

  private canReplayLastShot(): boolean {
    const recorder = this.container.recorder
    if (!recorder || !recorder.replayUrl) {
      return false
    }
    return recorder.shots.length > 0
  }

  private buildReplayUrlFromState(state): string | null {
    const recorder = this.container.recorder
    const prefix = recorder?.replayUrl
    if (!prefix) {
      return null
    }

    const serialised = JSON.stringify(state)
    const compressed = JSONCrush.crush(serialised)
    const encoded = encodeURIComponent(compressed)
      .replace(/\(/g, "%28")
      .replace(/\)/g, "%29")
      .replace(/\!/g, "%21")
      .replace(/\*/g, "%2A")

    return `${prefix}${encoded}`
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
