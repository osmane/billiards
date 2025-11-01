import { Input } from "./input"
import interact from "interactjs"

/**
 * Maintains a map of pressed keys.
 *
 * Produces events while key is pressed with elapsed time
 */
export class Keyboard {
  pressed = {}
  released = {}
  private interactable: any = null // Store interact instance for enable/disable
  private element: HTMLCanvasElement | null = null
  private dragEnabled = true // Flag to completely block drag input processing

  getEvents() {
    const keys = Object.keys(this.pressed)
      .filter((key) => !/Shift/.test(key))
      .filter((key) => !/Control/.test(key))
    const shift = Object.keys(this.pressed).some((key) => /Shift/.test(key))
    const control = Object.keys(this.pressed).some((key) => /Control/.test(key))
    const result: Input[] = []

    keys.forEach((k) => {
      const t = performance.now() - this.pressed[k]
      result.push(new Input(control ? t / 3 : t, shift ? "Shift" + k : k))
      if (k != "Space") {
        this.pressed[k] = performance.now()
      }
    })

    Object.keys(this.released).forEach((key) =>
      result.push(new Input(this.released[key], key + "Up"))
    )

    this.released = {}
    return result
  }

  constructor(element: HTMLCanvasElement) {
    this.addHandlers(element)
    if (!/Android|iPhone/i.test(navigator.userAgent)) {
      element.contentEditable = "true"
    }
  }

  keydown = (e) => {
    if (this.pressed[e.code] == null) {
      this.pressed[e.code] = performance.now()
    }
    e.stopImmediatePropagation()
    if (e.key !== "F12") {
      e.preventDefault()
    }
  }

  keyup = (e) => {
    this.released[e.code] = performance.now() - this.pressed[e.code]
    delete this.pressed[e.code]
    e.stopImmediatePropagation()
    if (e.key !== "F12") {
      e.preventDefault()
    }
  }

  mousetouch = (e) => {
    // Block all drag input processing when disabled (e.g., during NPC animation)
    if (!this.dragEnabled) {
      return
    }

    const k = this.released
    const topHalf = e.client.y < e.rect.height / 2
    const factor = topHalf || e.ctrlKey ? 0.5 : 1
    const dx = e.dx * factor
    const dy = e.dy * 0.8
    k["movementY"] = (k["movementY"] ?? 0.0) + dy
    k["movementX"] = (k["movementX"] ?? 0.0) + dx
    if (Math.abs(k["movementX"]) > Math.abs(k["movementY"])) {
      k["movementY"] = 0
    }
  }

  private addHandlers(element: HTMLCanvasElement) {
    this.element = element
    element.addEventListener("keydown", this.keydown)
    element.addEventListener("keyup", this.keyup)
    element.focus()

    this.interactable = interact(element)
    this.interactable.draggable({
      listeners: {
        move: (e) => {
          this.mousetouch(e)
        },
      },
    })
    this.interactable.gesturable({
      onmove: (e) => {
        e.dx /= 3
        this.mousetouch(e)
      },
    })
  }

  /** Disable drag/gesture controls (used during NPC camera animation) */
  disableDragControls() {
    // FIRST: Block input processing at the source
    this.dragEnabled = false

    // THEN: Disable interact.js listeners
    if (this.interactable) {
      this.interactable.draggable(false)
      this.interactable.gesturable(false)
    }

    // FINALLY: Clear all active input states to prevent carry-over
    this.pressed = {}
    this.released = {}
  }

  /** Re-enable drag/gesture controls */
  enableDragControls() {
    // Re-enable input processing
    this.dragEnabled = true

    if (this.interactable && this.element) {
      this.interactable.draggable({
        listeners: {
          move: (e) => {
            this.mousetouch(e)
          },
        },
      })
      this.interactable.gesturable({
        onmove: (e) => {
          e.dx /= 3
          this.mousetouch(e)
        },
      })
    }
  }
}
