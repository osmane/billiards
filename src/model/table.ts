import { Cushion } from "./physics/cushion"
import { Collision } from "./physics/collision"
import { Knuckle } from "./physics/knuckle"
import { Pocket } from "./physics/pocket"
import { Cue } from "../view/cue"
import { Ball, State } from "./ball"
import { AimEvent } from "../events/aimevent"
import { TableGeometry } from "../view/tablegeometry"
import { Outcome } from "./outcome"
import { PocketGeometry } from "../view/pocketgeometry"
import { bounceHanBlend } from "./physics/physics"
import { zero } from "../utils/utils"
import { R } from "./physics/constants"
import { beginShot } from "../utils/shotstats"

interface Pair {
  a: Ball
  b: Ball
}

export class Table {
  balls: Ball[]
  cue: Cue
  pairs: Pair[]
  outcome: Outcome[] = []
  cueball: Ball
  cushionModel = bounceHanBlend
  mesh

  constructor(balls: Ball[], options?: { headless?: boolean }) {
    // Replace default cue with headless or full cue based on options
    if (options && options.headless) {
      this.cue = new Cue(undefined, undefined, true)
    } else {
      this.cue = new Cue()
    }
    this.cueball = balls[0]
    this.initialiseBalls(balls)
  }

  initialiseBalls(balls: Ball[]) {
    this.balls = balls
    this.pairs = []
    for (let a = 0; a < balls.length; a++) {
      for (let b = 0; b < balls.length; b++) {
        if (a < b) {
          this.pairs.push({ a: balls[a], b: balls[b] })
        }
      }
    }
  }

  updateBallMesh(t) {
    this.balls.forEach((a) => {
      a.updateMesh(t)
    })
  }

  advance(t: number) {
    let retries = 0
    while (!this.prepareAdvanceAll(t)) {
      retries++

      // Emergency separation after many retries (Codex 2025-10-21)
      if (retries === 80) {
        console.warn('Collision resolution struggling (80 retries), applying emergency separation')
        this.emergencySeparateAll()
      }

      if (retries > 100) {
        console.error(`Depth exceeded resolving collisions after ${retries} retries`)
        throw new Error("Depth exceeded resolving collisions")
      }
    }

    // Log if high retry count for debugging (Codex telemetry)
    if (retries > 10) {
      console.warn(`High collision retry count: ${retries}`)
    }

    this.balls.forEach((a) => {
      a.update(t)
      a.fround()
    })
  }

  // Emergency separation for stuck balls (Codex 2025-10-21)
  private emergencySeparateAll() {
    this.pairs.forEach(pair => {
      const dist = pair.a.pos.distanceTo(pair.b.pos)
      const radius = pair.a.physicsContext?.R ?? R
      const targetDist = 2 * radius

      if (dist < targetDist) {
        const offset = pair.b.pos.clone().sub(pair.a.pos)
        const offsetLen = offset.length()

        if (offsetLen > 1e-6) {
          offset.multiplyScalar(1 / offsetLen)
        } else {
          offset.set(1, 0, 0)  // Arbitrary direction if balls overlap exactly
        }

        const penetration = targetDist - dist
        const pushMagnitude = penetration * 0.6  // 60% of penetration

        // Positional correction
        pair.a.pos.addScaledVector(offset, -pushMagnitude)
        pair.b.pos.addScaledVector(offset, pushMagnitude)

        // Add separation velocity
        const minSepSpeed = pair.a.physicsContext?.minSeparationSpeed ?? 0.004
        pair.a.vel.addScaledVector(offset, -minSepSpeed)
        pair.b.vel.addScaledVector(offset, minSepSpeed)
      }
    })
  }


  /**
   * Returns true if all balls can advance by t without collision
   *
   */
  prepareAdvanceAll(t: number) {
    return (
      this.pairs.every((pair) => this.prepareAdvancePair(pair.a, pair.b, t)) &&
      this.balls.every((ball) => this.prepareAdvanceToCushions(ball, t))
    )
  }

  /**
   * Returns true if a pair of balls can advance by t without any collision.
   * If there is a collision, adjust velocity appropriately.
   */
  private prepareAdvancePair(a: Ball, b: Ball, t: number) {
    const radius = a.physicsContext?.R ?? R
    const currentDistance = a.pos.distanceTo(b.pos)
    const targetDistance = 2 * radius
    const penetration = targetDistance - currentDistance

    // Only process collision if there's actual penetration
    // This prevents infinite retry loops when balls are separated but have
    // velocities that would cause future collision
    const hasActualPenetration = penetration > radius * 1e-6

    if (Collision.willCollide(a, b, t, a.physicsContext)) {
      if (!hasActualPenetration) {
        // Balls will collide in the future but are currently separated
        // Let normal physics handle this in the next timestep
        return true
      }

      Collision.separateAtImpact(a, b, t, a.physicsContext)
      const incidentSpeed = Collision.collide(a, b)
      this.outcome.push(Outcome.collision(a, b, incidentSpeed))
      return false
    }
    return true
  }

  /**
   * Returns true if ball can advance by t without hitting cushion, knuckle or pocket.
   * If there is a collision, adjust velocity appropriately.
   *
   */
  private prepareAdvanceToCushions(a: Ball, t: number): boolean {
    if (!a.onTable()) {
      return true
    }
    const futurePosition = a.futurePosition(t)
    if (
      Math.abs(futurePosition.y) < TableGeometry.tableY &&
      Math.abs(futurePosition.x) < TableGeometry.tableX
    ) {
      return true
    }

    const incidentSpeed = Cushion.bounceAny(
      a,
      t,
      TableGeometry.hasPockets,
      this.cushionModel
    )
    if (incidentSpeed) {
      this.outcome.push(Outcome.cushion(a, incidentSpeed))
      return false
    }

    const k = Knuckle.findBouncing(a, t)
    if (k) {
      const knuckleIncidentSpeed = k.bounce(a)
      this.outcome.push(Outcome.cushion(a, knuckleIncidentSpeed))
      return false
    }
    const p = Pocket.findPocket(PocketGeometry.pocketCenters, a, t)
    if (p) {
      const pocketIncidentSpeed = p.fall(a, t)
      this.outcome.push(Outcome.pot(a, pocketIncidentSpeed))
      return false
    }

    return true
  }

  allStationary() {
    return this.balls.every((b) => !b.inMotion())
  }

  inPockets(): number {
    return this.balls.reduce((acc, b) => (b.onTable() ? acc : acc + 1), 0)
  }

  hit() {
    beginShot()
    this.cue.hit(this.cueball)
    this.balls.forEach((b) => {
      b.ballmesh.trace.reset()
    })
  }

  serialise() {
    return {
      balls: this.balls.map((b) => b.serialise()),
      aim: this.cue.aim.copy(),
      cushionModel: this.cushionModel,
      cueballId: this.cueball.id,
    }
  }

  static fromSerialised(data, options?: { headless?: boolean }) {
    const table = new Table(
      data.balls.map((b) => Ball.fromSerialised(b, options)),
      options
    )
    table.updateFromSerialised(data)
    return table
  }

  updateFromSerialised(data) {
    if (data.balls) {
      // FIX: Find ball by ID, not by array index (b.id might not equal array index)
      data.balls.forEach((b, index) => {
        const ball = this.balls.find(ball => ball.id === b.id) || this.balls[index]
        if (ball) {
          Ball.updateFromSerialised(ball, b)
        }
      })
    }
    if (data.aim) {
      this.cue.aim = AimEvent.fromJson(data.aim)
      // Apply elevation from aim event to cue for proper visualization
      if (data.aim.elevation !== undefined) {
        this.cue.elevation = data.aim.elevation
      }
    }
    if (data.cushionModel) {
      this.cushionModel = data.cushionModel
    }
    // Set cueball from serialised data (important for 3-cushion multiplayer)
    if (data.cueballId !== undefined) {
      const byId = this.balls.find((b) => b.id === data.cueballId)
      if (byId) {
        this.cueball = byId
      }
    }
  }

  shortSerialise() {
    return this.balls
      .map((b) => [b.pos.x, b.pos.y])
      .reduce((acc, val) => acc.concat(val), [])
  }

  updateFromShortSerialised(data) {
    this.balls.forEach((b, i) => {
      b.pos.x = data[i * 2]
      b.pos.y = data[i * 2 + 1]
      b.pos.z = 0
      b.vel.copy(zero)
      b.rvel.copy(zero)
      b.state = State.Stationary
    })
  }

  addToScene(scene) {
    this.balls.forEach((b) => {
      b.ballmesh.addToScene(scene)
    })
    scene.add(this.cue.mesh)
    scene.add(this.cue.helperGhostGroup)
    scene.add(this.cue.placerMesh)
    scene.add(this.cue.hitPointMesh)
    scene.add(this.cue.virtualCueMesh)
  }

  showTraces(bool) {
    this.balls.forEach((b) => {
      b.ballmesh.trace.line.visible = bool
      b.ballmesh.trace.reset()
    })
  }

  showSpin(bool) {
    this.balls.forEach((b) => {
      b.ballmesh.spinAxisArrow.visible = bool
    })
  }

  showVirtualCue(bool) {
    this.cue.virtualCueMesh.visible = bool
  }

  halt() {
    this.balls.forEach((b) => {
      b.vel.copy(zero)
      b.rvel.copy(zero)
      b.state = State.Stationary
    })
  }

  roundCueBallPosition() {
    const pos = this.cueball.pos.clone()
    if (this.overlapsAny(pos)) {
      return
    }
    this.cueball.pos.copy(pos)
  }

  overlapsAny(pos, excluding = this.cueball) {
    return this.balls
      .filter((b) => b !== excluding)
      .some((b) => b.pos.distanceTo(pos) < 2 * b.radius)
  }
}
