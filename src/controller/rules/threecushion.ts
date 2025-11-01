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

type CueSettings = {
  power: number
  angle: number
  offset: Vector3
  elevation: number
}

export class ThreeCushion implements Rules {
  readonly container: Container

  cueball!: Ball
  private assignedCueBall?: Ball
  private aimSettingsByBallId: Map<number, CueSettings> = new Map()
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
    this.assignedCueBall = this.cueball
    // Keep table state in sync in case NPC or predictor runs immediately after
    this.container.table.cueball = this.cueball
    this.container.table.cue.aim.i = this.container.table.balls.indexOf(this.cueball)
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
    this.assignedCueBall = this.cueball
    this.resetScores()
    return table
  }

  rack() {
    return Rack.three()
  }

  update(outcomes: Outcome[]): Controller {
    this.captureCueSettings(this.cueball)

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

    // Switch to other player's cue ball and keep table.cueball in sync
    this.cueball = this.otherPlayersCueBall()
    this.container.table.cueball = this.cueball
    this.container.table.cue.aim.i = this.container.table.balls.indexOf(this.cueball)

    if (this.container.isSinglePlayer) {
      return new Aim(this.container)
    }

    this.container.sendEvent(new StartAimEvent())
    return new WatchAim(this.container)
  }

  otherPlayersCueBall(): Ball {
    const balls = this.container.table.balls
    return this.cueball === balls[0] ? balls[1] : balls[0]
  }

  prepareForLocalTurn() {
    if (!this.assignedCueBall) {
      this.assignedCueBall = this.cueball
    }

    if (this.assignedCueBall) {
      this.cueball = this.assignedCueBall
      this.container.table.cueball = this.cueball
      this.restoreCueSettingsFor(this.cueball)
    }
  }

  isPartOfBreak(outcome: Outcome[]) {
    return Outcome.isThreeCushionPoint(this.cueball, outcome)
  }

  isEndOfGame(_: Outcome[]) {
    return false
  }

  private captureCueSettings(ball?: Ball) {
    if (!ball) {
      return
    }

    const table = this.container?.table
    const cue = table?.cue
    if (!table || !cue) {
      return
    }

    this.aimSettingsByBallId.set(ball.id, {
      power: cue.aim.power,
      angle: cue.aim.angle,
      offset: cue.aim.offset.clone(),
      elevation: cue.elevation,
    })
  }

  private restoreCueSettingsFor(ball?: Ball) {
    if (!ball) {
      return
    }

    const table = this.container?.table
    const cue = table?.cue
    if (!table || !cue) {
      return
    }

    const storedSettings = this.aimSettingsByBallId.get(ball.id)
    if (storedSettings) {
      cue.aim.power = storedSettings.power
      cue.aim.angle = storedSettings.angle
      cue.aim.offset.copy(storedSettings.offset)
      cue.elevation = storedSettings.elevation
      cue.aim.elevation = storedSettings.elevation
    } else {
      cue.aim.offset.set(0, 0, 0)
      cue.aim.power = cue.maxPower * 0.5
      cue.elevation = cue.defaultElevation
      cue.aim.elevation = cue.defaultElevation
      this.aimSettingsByBallId.set(ball.id, {
        power: cue.aim.power,
        angle: cue.aim.angle,
        offset: cue.aim.offset.clone(),
        elevation: cue.elevation,
      })
    }

    cue.aim.pos.copy(ball.pos)
    cue.aim.i = table.balls.indexOf(ball)
    cue.moveTo(ball.pos)
    cue.updateAimInput()
    this.captureCueSettings(ball)
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
