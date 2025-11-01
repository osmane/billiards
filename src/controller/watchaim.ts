import { AimEvent } from "../events/aimevent"
import { HitEvent } from "../events/hitevent"
import { WatchShot } from "./watchshot"
import { ControllerBase } from "./controllerbase"

export class WatchAim extends ControllerBase {
  constructor(container) {
    super(container)
    // Don't override cueball here - it should already be set from WatchEvent/HitEvent
    // For 3-cushion, the correct cueball is determined by the serialised data
    if (this.container.table.cueball) {
      this.container.table.cue.moveTo(this.container.table.cueball.pos)
    }
    this.container.view.camera.suggestMode(this.container.view.camera.topView)
  }

  override handleAim(event: AimEvent) {
    const table = this.container.table
    table.cue.aim = event

    const balls = table.balls
    if (
      Number.isInteger(event.i) &&
      event.i >= 0 &&
      event.i < balls.length
    ) {
      const incomingCueBall = balls[event.i]
      if (table.cueball !== incomingCueBall) {
        table.cueball = incomingCueBall
      }
    }

    table.cueball.pos.copy(event.pos)
    // Apply elevation from aim event to cue for proper trajectory prediction
    // Use the elevation from the event if available, otherwise keep current elevation
    if (event.elevation !== undefined && Number.isFinite(event.elevation)) {
      table.cue.elevation = event.elevation
    }
    return this
  }

  override handleHit(event: HitEvent) {
    this.container.table.updateFromSerialised(event.tablejson)
    // Sync rules cueball with table cueball (important for 3-cushion)
    if (this.container.table.cueball) {
      this.container.rules.cueball = this.container.table.cueball
    }
    return new WatchShot(this.container)
  }
}
