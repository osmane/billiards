import { AimEvent } from "../events/aimevent"
import { HitEvent } from "../events/hitevent"
import { WatchShot } from "./watchshot"
import { ControllerBase } from "./controllerbase"

export class WatchAim extends ControllerBase {
  constructor(container) {
    super(container)
    this.container.table.cueball = this.container.rules.otherPlayersCueBall()
    this.container.table.cue.moveTo(this.container.table.cueball.pos)
    this.container.view.camera.suggestMode(this.container.view.camera.topView)
  }

  override handleAim(event: AimEvent) {
    this.container.table.cue.aim = event
    this.container.table.cueball.pos.copy(event.pos)
    // Apply elevation from aim event to cue for proper trajectory prediction
    // Use the elevation from the event if available, otherwise keep current elevation
    if (event.elevation !== undefined && Number.isFinite(event.elevation)) {
      this.container.table.cue.elevation = event.elevation
    }
    return this
  }

  override handleHit(event: HitEvent) {
    this.container.table.updateFromSerialised(event.tablejson)
    return new WatchShot(this.container)
  }
}
