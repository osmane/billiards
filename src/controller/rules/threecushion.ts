import { Vector3 } from "three"
import { Container } from "../../container/container"
import { Aim } from "../../controller/aim"
import { Controller } from "../../controller/controller"
import { WatchAim } from "../../controller/watchaim"
import { WatchEvent } from "../../events/watchevent"
import { Ball } from "../../model/ball"
import { Outcome } from "../../model/outcome"
import { R } from "../../model/physics/constants"
import { Table } from "../../model/table"
import { Rack } from "../../utils/rack"
import { CameraTop } from "../../view/cameratop"
import { TableGeometry } from "../../view/tablegeometry"
import { Rules } from "./rules"
import { zero } from "../../utils/utils"
import { Respot } from "../../utils/respot"
import { StartAimEvent } from "../../events/startaimevent"

export class ThreeCushion implements Rules {
  readonly container: Container

  cueball: Ball
  currentBreak = 0
  previousBreak = 0
  score = 0
  rulename = "threecushion"

  constructor(container) {
    this.container = container
  }

  startTurn() {
    // not used
  }

  nextCandidateBall() {
    return Respot.closest(
      this.container.table.cueball,
      this.container.table.balls
    )
  }

  placeBall(_?): Vector3 {
    return zero
  }

  asset(): string {
    return "models/threecushion.min.gltf"
  }

  secondToPlay() {
    this.cueball = this.container.table.balls[1]
  }

  tableGeometry() {
    // 2.84 m × 1.42 m playing surface (half‑dimensions: 1.42 m × 0.71 m)
    TableGeometry.tableX = 1.42;        // half-length in metres
    TableGeometry.tableY = 0.71;        // half-width in metres
    // outer limits include one ball radius on each side
    TableGeometry.X = TableGeometry.tableX + R;
    TableGeometry.Y = TableGeometry.tableY + R;
    // 3‑cushion tables have no pockets
    TableGeometry.hasPockets = false;
  }

  table(): Table {
    this.tableGeometry()
    CameraTop.zoomFactor = 0.92
    const table = new Table(this.rack())
    this.cueball = table.cueball
    return table
  }

  rack() {
    return Rack.three()
  }

  update(outcomes: Outcome[]): Controller {
    if (Outcome.isThreeCushionPoint(this.cueball, outcomes)) {
      this.container.sound.playSuccess(outcomes.length / 3)
      this.container.sendEvent(new WatchEvent(this.container.table.serialise()))
      this.currentBreak++
      this.score++
      return new Aim(this.container)
    }

    this.previousBreak = this.currentBreak
    this.currentBreak = 0

    if (this.container.isSinglePlayer) {
      this.cueball = this.otherPlayersCueBall()
      this.container.table.cue.aim.i = this.container.table.balls.indexOf(
        this.cueball
      )
      return new Aim(this.container)
    }

    this.container.sendEvent(new StartAimEvent())
    return new WatchAim(this.container)
  }

  otherPlayersCueBall(): Ball {
    const balls = this.container.table.balls
    return this.cueball === balls[0] ? balls[1] : balls[0]
  }

  isPartOfBreak(outcome: Outcome[]) {
    return Outcome.isThreeCushionPoint(this.cueball, outcome)
  }

  isEndOfGame(_: Outcome[]) {
    return false
  }

  allowsPlaceBall() {
    return false
  }
}
