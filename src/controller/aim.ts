import { BreakEvent } from "../events/breakevent"
import { Controller, HitEvent, Input } from "./controller"
import { ControllerBase } from "./controllerbase"
import { PlayShot } from "./playshot"
import { Replay } from "./replay"

/**
 * Aim using input events.
 *
 */
export class Aim extends ControllerBase {
  constructor(container) {
    super(container)
    const table = this.container.table
    table.cue.aimMode()
    table.cue.showHelper(true)
    table.cueball = this.container.rules.cueball
    table.cue.aim.i = table.balls.indexOf(table.cueball)
    table.cue.moveTo(table.cueball.pos)
    this.container.view.camera.suggestMode(this.container.view.camera.aimView)
    table.cue.aimInputs.showOverlap()

    // Enable share button in aim mode
    this.container.menu.aimMode()

    // Update score buttons visibility for the current game mode
    // This is crucial when transitioning from replay back to normal gameplay
    this.container.scoreButtons.updateGameModeVisibility()

    // Reinitialize event handlers with a slight delay to ensure DOM is ready
    // This fixes issues where score buttons don't respond after retry from replay mode
    setTimeout(() => {
      this.container.scoreButtons.updateGameModeVisibility()
      this.container.scoreButtons.reinitializeEventHandlers()
    }, 100)

    // Ensure trajectory prediction happens after aim mode is fully set up and balls are stationary
    // Poll until balls are stationary, then update trajectory
    // Also add a small delay to ensure all initialization is complete
    const ensureTrajectoryUpdate = () => {
      if (this.container.table.allStationary()) {
        this.container.updateTrajectoryPrediction()
        // Update again after a short delay to ensure everything is settled
        setTimeout(() => {
          if (this.container.table.allStationary()) {
            this.container.updateTrajectoryPrediction()
          }
        }, 50)
      } else {
        // If balls are still moving, check again on the next frame
        requestAnimationFrame(ensureTrajectoryUpdate)
      }
    }
    requestAnimationFrame(ensureTrajectoryUpdate)
  }

  override handleInput(input: Input): Controller {
    switch (input.key) {
      case "Space":
        this.container.table.cue.adjustPower(input.t * this.scale * 0.7)
        break
      case "SpaceUp":
        return this.playShot()
      default:
        if (!this.commonKeyHandler(input)) {
          return this
        }
    }

    this.container.sendEvent(this.container.table.cue.aim)
    return this
  }

  override handleBreak(breakEvent: BreakEvent): Controller {
    return new Replay(
      this.container,
      breakEvent.init,
      breakEvent.shots,
      breakEvent.retry
    )
  }

  playShot() {
    const hitEvent = new HitEvent(this.container.table.serialise())
    this.container.sendEvent(hitEvent)
    this.container.recorder.record(hitEvent)
    return new PlayShot(this.container)
  }
}
