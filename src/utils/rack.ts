import { Ball, State } from "../model/ball"
import { TableGeometry } from "../view/tablegeometry"
import { Vector3 } from "three"
import { roundVec, vec } from "./utils"
import { R, CAROM_PHYSICS, POOL_PHYSICS, SNOOKER_PHYSICS, PhysicsContext } from "../model/physics/constants"
import { Table } from "../model/table"

export class Rack {
  static readonly noise = R * 0.0233
  static readonly gap = 2 * R + 2 * Rack.noise
  static readonly up = new Vector3(0, 0, -1)
  static readonly spot = new Vector3(-TableGeometry.X / 2, 0.0, 0)
  static readonly across = new Vector3(0, Rack.gap, 0)
  static readonly down = new Vector3(Rack.gap, 0, 0)
  static readonly diagonal = Rack.across
    .clone()
    .applyAxisAngle(Rack.up, (Math.PI * 1) / 3)

  private static jitter(pos) {
    return roundVec(
      pos
        .clone()
        .add(
          new Vector3(
            Rack.noise * (Math.random() - 0.5),
            Rack.noise * (Math.random() - 0.5),
            0
          )
        )
    )
  }

  static cueBall(pos, physicsContext?: PhysicsContext) {
    return new Ball(Rack.jitter(pos), 0xfaebd7, physicsContext)
  }

  static diamond() {
    const pos = new Vector3(TableGeometry.tableX / 2, 0, 0)
    const diamond: Ball[] = []
    // Use POOL_PHYSICS for Nine-Ball/Pool games
    diamond.push(Rack.cueBall(Rack.spot, POOL_PHYSICS))
    diamond.push(new Ball(Rack.jitter(pos), 0xe0de36, POOL_PHYSICS))
    pos.add(Rack.diagonal)
    diamond.push(new Ball(Rack.jitter(pos), 0xff9d00, POOL_PHYSICS))
    pos.sub(Rack.across)
    diamond.push(new Ball(Rack.jitter(pos), 0x521911, POOL_PHYSICS))
    pos.add(Rack.diagonal)
    diamond.push(new Ball(Rack.jitter(pos), 0x595200, POOL_PHYSICS))
    pos.sub(Rack.across)
    diamond.push(new Ball(Rack.jitter(pos), 0xff0000, POOL_PHYSICS))
    pos.addScaledVector(Rack.across, 2)
    diamond.push(new Ball(Rack.jitter(pos), 0x050505, POOL_PHYSICS))
    pos.add(Rack.diagonal).sub(Rack.across)
    diamond.push(new Ball(Rack.jitter(pos), 0x0a74c2, POOL_PHYSICS))
    pos.sub(Rack.across)
    diamond.push(new Ball(Rack.jitter(pos), 0x087300, POOL_PHYSICS))
    pos.add(Rack.diagonal)
    diamond.push(new Ball(Rack.jitter(pos), 0x3e009c, POOL_PHYSICS))
    return diamond
  }

  static triangle() {
    const tp = Rack.trianglePositions()
    // Use POOL_PHYSICS for Fourteen-One pool game
    const cueball = Rack.cueBall(Rack.spot, POOL_PHYSICS)
    const triangle = tp.map((p) => new Ball(Rack.jitter(p), undefined, POOL_PHYSICS))
    triangle.unshift(cueball)
    return triangle.slice(0, 5)
  }

  static trianglePositions() {
    const triangle: Vector3[] = []
    const pos = new Vector3(TableGeometry.X / 2, 0, 0)
    triangle.push(vec(pos))
    // row 2
    pos.add(this.diagonal)
    triangle.push(vec(pos))
    pos.sub(this.across)
    triangle.push(vec(pos))
    // row 3
    pos.add(this.diagonal)
    triangle.push(vec(pos))
    pos.sub(this.across)
    triangle.push(vec(pos))
    pos.addScaledVector(this.across, 2)
    triangle.push(vec(pos))
    // row 4
    pos.add(this.diagonal)
    triangle.push(vec(pos))
    pos.sub(this.across)
    triangle.push(vec(pos))
    pos.sub(this.across)
    triangle.push(vec(pos))
    pos.sub(this.across)
    triangle.push(vec(pos))
    // row 5
    pos.add(this.diagonal).sub(this.across)
    triangle.push(vec(pos))
    pos.add(this.across)
    triangle.push(vec(pos))
    pos.add(this.across)
    triangle.push(vec(pos))
    pos.add(this.across)
    triangle.push(vec(pos))
    pos.add(this.across)
    triangle.push(vec(pos))

    return triangle
  }

  static rerack(key: Ball, table: Table) {
    const tp = Rack.trianglePositions()
    const first = tp.shift()!
    table.balls
      .filter((b) => b !== table.cueball)
      .filter((b) => b !== key)
      .forEach((b) => {
        b.pos.copy(Rack.jitter(tp.shift()))
        b.state = State.Stationary
      })
    if (table.overlapsAny(key.pos, key)) {
      key.pos.copy(first)
    }
    if (table.overlapsAny(table.cueball.pos)) {
      table.cueball.pos.copy(Rack.spot)
    }
  }

  static three() {
    const threeballs: Ball[] = []
    const dx = TableGeometry.X / 2
    const dy = TableGeometry.Y / 4
    // Use CAROM_PHYSICS for all Three-Cushion balls
    const white = Rack.cueBall(Rack.jitter(new Vector3(-dx, -dy, 0)), CAROM_PHYSICS)
    white.ballmesh.applySymmetricDots(0xff0000)

    const yellow = new Ball(Rack.jitter(new Vector3(-dx, 0, 0)), 0xe0de36, CAROM_PHYSICS)
    yellow.ballmesh.applySymmetricDots(0xff0000)

    const red = new Ball(Rack.jitter(new Vector3(dx, 0, 0)), 0xff0000, CAROM_PHYSICS)
    threeballs.push(white)
    threeballs.push(yellow)
    threeballs.push(red)
    return threeballs
  }

  static readonly sixth = (TableGeometry.Y * 2) / 6
  static readonly baulk = (-1.5 * TableGeometry.X * 2) / 5

  static snooker() {
    const balls: Ball[] = []
    const dy = TableGeometry.Y / 4
    // Use SNOOKER_PHYSICS for Snooker game
    balls.push(Rack.cueBall(Rack.jitter(new Vector3(Rack.baulk, -dy * 0.5, 0)), SNOOKER_PHYSICS))

    const colours = Rack.snookerColourPositions()
    balls.push(new Ball(Rack.jitter(colours[0]), 0xeede36, SNOOKER_PHYSICS))
    balls.push(new Ball(Rack.jitter(colours[1]), 0x0c9664, SNOOKER_PHYSICS))
    balls.push(new Ball(Rack.jitter(colours[2]), 0xbd723a, SNOOKER_PHYSICS))
    balls.push(new Ball(Rack.jitter(colours[3]), 0x0883ee, SNOOKER_PHYSICS))
    balls.push(new Ball(Rack.jitter(colours[4]), 0xffaacc, SNOOKER_PHYSICS))
    balls.push(new Ball(Rack.jitter(colours[5]), 0x010101, SNOOKER_PHYSICS))

    // change to 15 red balls
    const triangle = Rack.trianglePositions().slice(0, 15)
    triangle.forEach((p) => {
      balls.push(new Ball(Rack.jitter(p.add(Rack.down)), 0xee0000, SNOOKER_PHYSICS))
    })
    return balls
  }

  static snookerColourPositions() {
    const dx = TableGeometry.X / 2
    const black = TableGeometry.X - (TableGeometry.X * 2) / 11
    const positions: Vector3[] = []
    positions.push(new Vector3(Rack.baulk, -Rack.sixth, 0))
    positions.push(new Vector3(Rack.baulk, Rack.sixth, 0))
    positions.push(new Vector3(Rack.baulk, 0, 0))
    positions.push(new Vector3(0, 0, 0))
    positions.push(new Vector3(dx, 0, 0))
    positions.push(new Vector3(black, 0, 0))
    return positions
  }
}
