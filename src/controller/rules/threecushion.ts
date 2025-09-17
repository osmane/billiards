// src/controller/rules/threecushion.ts
import { Vector3 } from "three"
import { Container } from "../../container/container"
import { Aim } from "../../controller/aim"
import { Controller } from "../../controller/controller"
import { WatchAim } from "../../controller/watchaim"
import { WatchEvent } from "../../events/watchevent"
import { StartAimEvent } from "../../events/startaimevent"
import { Ball } from "../../model/ball"
import { Outcome } from "../../model/outcome"
import { Table } from "../../model/table"
import { Rack } from "../../utils/rack"
import { zero } from "../../utils/utils"
import { Respot } from "../../utils/respot"
import { CameraTop } from "../../view/cameratop"
import { TableGeometry } from "../../view/tablegeometry"
import { Rules } from "./rules"

// fizik sabitleri
import {
  setR,
  setm,
  CAROM_BALL_RADIUS,
  CAROM_BALL_MASS,
  CAROM_TABLE_LENGTH,
  CAROM_TABLE_WIDTH,
} from "../../model/physics/constants"

export class ThreeCushion implements Rules {
  readonly container: Container

  cueball!: Ball
  currentBreak = 0
  previousBreak = 0
  score = 0
  rulename = "threecushion" as const

  constructor(container: Container) {
    this.container = container
  }

  startTurn() {
    // not used
  }

  nextCandidateBall() {
    return Respot.closest(this.container.table.cueball, this.container.table.balls)
  }

  placeBall(_?: unknown): Vector3 {
    return zero
  }

  secondToPlay() {
    this.cueball = this.container.table.balls[1]
  }

  /** Mod girişinde karambol fizik ve masa kurulumu */
  tableGeometry() {
    // 1) Fizik: karambol top ölçüsü + kütlesi
    setR(CAROM_BALL_RADIUS)
    setm(CAROM_BALL_MASS)

    // 2) Masa geometrisi: karambol ölçülerini R'e göre kur
    TableGeometry.setCaromDimensions(CAROM_TABLE_LENGTH, CAROM_TABLE_WIDTH, CAROM_BALL_RADIUS)

    // 3) Görsel: üstten kamera yakınlığı (isteğe bağlı ayar)
    CameraTop.zoomFactor = 0.92
  }

  /** GLTF yüklemiyoruz; masa dinamik oluşturuluyor */
  asset(): string {
    return ""
  }

  table(): Table {
    this.tableGeometry()
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
      this.container.table.cue.aim.i = this.container.table.balls.indexOf(this.cueball)
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
