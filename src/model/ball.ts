import { Vector3 } from "three"
import { zero, vec, passesThroughZero } from "../utils/utils"
import {
  forceRoll,
  rollingFull,
  sliding,
  surfaceVelocityFull,
  magnus,
} from "../model/physics/physics"
import { BallMesh } from "../view/ballmesh"
import { Pocket } from "./physics/pocket"
import { PhysicsContext, POOL_PHYSICS, g, tableRestitution } from "./physics/constants"

export enum State {
  Stationary = "Stationary",
  Rolling = "Rolling",
  Sliding = "Sliding",
  Falling = "Falling",
  InPocket = "InPocket",
}

export class Ball {
  readonly pos: Vector3
  readonly vel: Vector3 = zero.clone()
  readonly rvel: Vector3 = zero.clone()
  readonly futurePos: Vector3 = zero.clone()
  readonly ballmesh: BallMesh
  state: State = State.Stationary
  pocket: Pocket
  physicsContext: PhysicsContext = POOL_PHYSICS
  magnusEnabled: boolean = false
  magnusElevation: number = 0

  public static id = 0
  readonly id = Ball.id++

  static readonly transition = 0.05

  constructor(pos, color?, physicsContext?: PhysicsContext) {
    this.pos = pos.clone()
    // Set physics context first
    if (physicsContext) {
      this.physicsContext = physicsContext
    }
    // Create BallMesh with correct radius from physics context
    this.ballmesh = new BallMesh(color || 0xeeeeee * Math.random(), this.physicsContext.R)
  }

  get radius(): number {
    return this.physicsContext.R
  }

  // Method to update physics context and ensure mesh matches
  updatePhysicsContext(newContext: PhysicsContext) {
    this.physicsContext = newContext
    // Update ball mesh to match new physics context
    this.ballmesh.updateRadius(newContext.R)
  }

  update(t) {
    this.updatePosition(t)
    if (this.state == State.Falling) {
      this.pocket.updateFall(this, t)
    } else {
      this.updateVelocity(t)
    }
  }

  updateMesh(t) {
    this.ballmesh.updateAll(this, t)
  }

  private updatePosition(t: number) {
    this.pos.addScaledVector(this.vel, t)
  }

  private updateVelocity(t: number) {
    if (this.inMotion()) {
      if (this.isRolling()) {
        this.state = State.Rolling
        forceRoll(this.vel, this.rvel, this.physicsContext)
        this.addDelta(t, rollingFull(this.rvel, this.physicsContext))
      } else {
        this.state = State.Sliding
        this.addDelta(t, sliding(this.vel, this.rvel, this.physicsContext))
      }

      if (this.magnusEnabled) {
        const magnusAccel = magnus(
          this.vel,
          this.rvel,
          this.magnusElevation,
          this.pos.z,
          this.physicsContext
        )
        this.vel.addScaledVector(magnusAccel, t)
      }

      const tableThreshold = this.physicsContext.R * 0.01
      if (this.pos.z > tableThreshold) {
        // Ball is airborne - apply gravity
        this.vel.z -= g * t
      } else {
        // Ball hit or is on table
        if (this.pos.z < 0) {
          this.pos.z = 0
        }

        if (this.vel.z < 0) {
          // Ball is falling and hits table - apply bounce with restitution
          const restitution = tableRestitution // Table bounce coefficient (adjustable via sliders)
          const minBounceVelocity = 0.1 // Minimum velocity to bounce (m/s)

          if (Math.abs(this.vel.z) > minBounceVelocity) {
            // Significant impact - bounce
            this.vel.z = -this.vel.z * restitution
            this.pos.z = tableThreshold * 0.5 // Small lift to prevent immediate re-collision

            // Table contact also dampens horizontal velocity and spin (friction)
            const tableFriction = 0.95 // Horizontal velocity retention on bounce
            this.vel.x *= tableFriction
            this.vel.y *= tableFriction
          } else {
            // Low impact - just stop vertical motion
            this.vel.z = 0
            this.pos.z = 0
          }
        }
      }
    }
  }

  private addDelta(t, delta) {
    delta.v.multiplyScalar(t)
    delta.w.multiplyScalar(t)
    if (!this.passesZero(delta)) {
      this.vel.add(delta.v)
      this.rvel.add(delta.w)
    }
  }

  private passesZero(delta) {
    const vz = passesThroughZero(this.vel, delta.v)
    const wz = passesThroughZero(this.rvel, delta.w)
    const halts = this.state === State.Rolling ? vz || wz : vz && wz
    if (halts && Math.abs(this.rvel.z) < 0.01) {
      this.setStationary()
      return true
    }
    return false
  }

  setStationary() {
    this.vel.copy(zero)
    this.rvel.copy(zero)
    this.state = State.Stationary
  }

  isRolling() {
    return (
      this.vel.lengthSq() !== 0 &&
      this.rvel.lengthSq() !== 0 &&
      surfaceVelocityFull(this.vel, this.rvel).length() < Ball.transition
    )
  }

  onTable() {
    return this.state !== State.Falling && this.state !== State.InPocket
  }

  inMotion() {
    return (
      this.state === State.Rolling ||
      this.state === State.Sliding ||
      this.isFalling()
    )
  }

  isFalling() {
    return this.state === State.Falling
  }

  futurePosition(t) {
    this.futurePos.copy(this.pos).addScaledVector(this.vel, t)
    return this.futurePos
  }

  fround() {
    this.pos.x = Math.fround(this.pos.x)
    this.pos.y = Math.fround(this.pos.y)
    this.vel.x = Math.fround(this.vel.x)
    this.vel.y = Math.fround(this.vel.y)
    this.rvel.x = Math.fround(this.rvel.x)
    this.rvel.y = Math.fround(this.rvel.y)
    this.rvel.z = Math.fround(this.rvel.z)
  }

  serialise() {
    return {
      pos: this.pos.clone(),
      id: this.id,
      physicsContext: this.physicsContext,
    }
  }

  static fromSerialised(data) {
    return Ball.updateFromSerialised(new Ball(vec(data.pos), undefined, data.physicsContext), data)
  }

  static updateFromSerialised(b, data) {
    b.pos.copy(data.pos)
    b.vel.copy(data?.vel ?? zero)
    b.rvel.copy(data?.rvel ?? zero)
    b.state = State.Stationary
    return b
  }
}
