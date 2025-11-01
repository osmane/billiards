import { Controller } from "./controller"
import { exportGltf } from "../utils/gltf"
import { ChatEvent } from "../events/chatevent"
import { Outcome } from "../model/outcome"
import { Vector3 } from "three"

export abstract class ControllerBase extends Controller {
  readonly scale = 0.001

  override handleChat(chatevent: ChatEvent): Controller {
    const sender = chatevent.sender ? `${chatevent.sender}:` : ""
    const message = `${sender} ${chatevent.message}`
    this.container.chat.showMessage(message)
    return this
  }

  hit() {
    this.container.table.outcome = [
      Outcome.hit(
        this.container.table.cueball,
        this.container.table.cue.aim.power
      ),
    ]
    this.container.table.hit()
    this.container.view.camera.suggestMode(this.container.view.camera.aimView)
    this.container.table.cue.showHelper(false)
  }

  commonKeyHandler(input) {
    const cue = this.container.table.cue
    const delta = input.t * this.scale
    const cameraLocked = this.container.isCameraControlsLocked && this.container.isCameraControlsLocked()
    switch (input.key) {
      case "ArrowLeft":
        cue.rotateAim(-delta, this.container.table)
        return true
      case "ArrowRight":
        cue.rotateAim(delta, this.container.table)
        return true
      case "ArrowDown":
        cue.adjustSpin(new Vector3(0, -delta), this.container.table)
        return true
      case "ArrowUp":
        cue.adjustSpin(new Vector3(0, delta), this.container.table)
        return true
      case "ShiftArrowLeft":
        cue.adjustSpin(new Vector3(delta, 0), this.container.table)
        return true
      case "ShiftArrowRight":
        cue.adjustSpin(new Vector3(-delta, 0), this.container.table)
        return true
      case "KeyPUp":
        exportGltf(this.container.view.scene)
        return true
      case "KeyHUp":
        cue.toggleHelper()
        return true
      case "movementXUp":
        if (cameraLocked) return true
        // Precision panel aktifse hassasiyeti 2 kat artır (hareketi 2 kat yavaşlat)
        const precisionMultiplier = this.container.precisionPanel?.getIsVisible() ? 0.5 : 1.0
        cue.rotateAim(delta * 2 * precisionMultiplier, this.container.table)
        return true
      case "movementYUp":
      case "NumpadSubtract":
        if (cameraLocked) return true
        this.container.view.camera.adjustHeight(delta * 8)
        return true
      case "NumpadAdd":
        if (cameraLocked) return true
        this.container.view.camera.adjustHeight(-delta * 8)
        return true
      case "KeyOUp":
        if (cameraLocked) return true
        this.container.view.camera.toggleMode()
        return true
      case "KeyDUp":
        this.togglePanel()
        return true
      case "KeyVUp":
        this.container.table.cue.toggleVirtualCue()
        return true
      case "KeyFUp":
        this.toggleFullscreen()
        return true
      default:
        return false
    }
  }

  private togglePanel() {
    this.container.toggleDebugMode()
  }

  private toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else if (document.exitFullscreen) {
      document.exitFullscreen()
    }
  }
}
