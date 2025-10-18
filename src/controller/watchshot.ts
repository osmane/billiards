import { Aim } from "./aim"
import { WatchAim } from "./watchaim"
import { ControllerBase } from "./controllerbase"
import { PlaceBall } from "./placeball"

export class WatchShot extends ControllerBase {
  constructor(container) {
    super(container)
    this.container.table.outcome = []
    this.container.table.hit()
  }

  override handleStartAim(_) {
    // Ensure cueball is set for 3-cushion multiplayer
    if (typeof this.container.rules.prepareForLocalTurn === "function") {
      this.container.rules.prepareForLocalTurn()
    }
    if (!this.container.rules.cueball && this.container.table.balls.length > 0) {
      // Set to first ball as default if not set
      this.container.rules.cueball = this.container.table.balls[0]
    }
    return new Aim(this.container)
  }

  override handlePlaceBall(_) {
    return new PlaceBall(this.container)
  }

  override handleWatch(event) {
    if ("rerack" in event.json) {
      console.log("Respot")
      this.container.table.updateFromSerialised(event.json)
      return this
    }
    // Sync rules cueball with table cueball (important for 3-cushion)
    if (this.container.table.cueball) {
      this.container.rules.cueball = this.container.table.cueball
    }
    // Update scores if present (for 3-cushion multiplayer sync)
    if ("whiteScore" in event.json && "yellowScore" in event.json) {
      if (typeof this.container.rules.setScores === "function") {
        this.container.rules.setScores(event.json.whiteScore, event.json.yellowScore)
      }
    }
    return new WatchAim(this.container)
  }
}
