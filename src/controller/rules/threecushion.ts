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

// fizik sabitleri - removed setR and setm imports to prevent global mutations
import {
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
  private whiteScore = 0
  private yellowScore = 0

  constructor(container: Container) {
    this.container = container
    this.resetScores()
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

  /** Mod girişinde karambol masa kurulumu (fizik artık ball-level'da) */
  tableGeometry() {
    // 1) Masa geometrisi: karambol ölçülerini ayarla
    TableGeometry.setCaromDimensions(CAROM_TABLE_LENGTH, CAROM_TABLE_WIDTH, CAROM_BALL_RADIUS)

    // 2) Görsel: üstten kamera yakınlığı
    CameraTop.zoomFactor = 0.92

    // NOTE: Physics context (ball size/mass) is now handled at ball level
    // This prevents cross-mode contamination of global physics constants
  }

  /** GLTF yüklemiyoruz; masa dinamik oluşturuluyor */
  asset(): string {
    return ""
  }

  table(): Table {
    this.tableGeometry()
    const table = new Table(this.rack())
    this.cueball = table.cueball
    this.resetScores()
    return table
  }

  rack() {
    return Rack.three()
  }

  update(outcomes: Outcome[]): Controller {
    if (Outcome.isThreeCushionPoint(this.cueball, outcomes)) {
      this.container.sound.playSuccess(outcomes.length / 3)
      this.currentBreak++
      this.registerPointForCurrentCueBall()
      // Send table state with scores for multiplayer sync
      const tableState = this.container.table.serialise()
      this.container.sendEvent(new WatchEvent({
        ...tableState,
        whiteScore: this.whiteScore,
        yellowScore: this.yellowScore
      }))
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

  private registerPointForCurrentCueBall() {
    const table = this.container?.table
    if (table) {
      const balls = table.balls
      if (this.cueball === balls[0]) {
        this.whiteScore++
      } else if (this.cueball === balls[1]) {
        this.yellowScore++
      }
    } else {
      this.whiteScore++
    }
    this.score = this.whiteScore + this.yellowScore
    this.updateScoreButtons()
  }

  private resetScores() {
    this.whiteScore = 0
    this.yellowScore = 0
    this.score = 0
    this.updateScoreButtons()
  }

  private updateScoreButtons() {
    this.container?.scoreButtons?.setScores(this.whiteScore, this.yellowScore)
  }

  setScores(whiteScore: number, yellowScore: number) {
    this.whiteScore = whiteScore
    this.yellowScore = yellowScore
    this.score = whiteScore + yellowScore
    this.updateScoreButtons()
  }

  allowsPlaceBall() {
    return false
  }
}
