import JSONCrush from "jsoncrush"
import { Vector3 } from "three"
import { Ball, State } from "../../src/model/ball"
import { CAROM_PHYSICS } from "../../src/model/physics/constants"

type ReplayShot = {
  type: string
  offset: { x: number; y: number; z: number }
  angle: number
  power: number
  pos: { x: number; y: number; z: number }
  i: number
  elevation?: number
}

export type ReplayState = {
  init: number[]
  shots: ReplayShot[]
}

type ContainerModules = typeof import("../../src/container/container")
type AssetsModules = typeof import("../../src/view/assets")

let modulesLoaded = false
let ContainerModule: ContainerModules
let AssetsModule: AssetsModules
let AimEventCtor: any

const ensureCanvasStub = () => {
  const canvasProto = HTMLCanvasElement.prototype as any
  if (!canvasProto.__threeCushionPatched__) {
    canvasProto.getContext = (type: string) => {
      if (type !== "2d") {
        return null
      }

      const gradientStub = {
        addColorStop: () => {},
      }

      return {
        fillRect: () => {},
        createLinearGradient: () => gradientStub,
        fillStyle: "",
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4),
          width: w,
          height: h,
        }),
        createImageData: (w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4),
          width: w,
          height: h,
        }),
        putImageData: () => {},
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        clearRect: () => {},
      }
    }
    canvasProto.__threeCushionPatched__ = true
  }
}

export const prepareThreeCushionEnvironment = () => {
  if (modulesLoaded) {
    return
  }
  ensureCanvasStub()
  AssetsModule = require("../../src/view/assets")
  ContainerModule = require("../../src/container/container")
  AimEventCtor = require("../../src/events/aimevent").AimEvent
  modulesLoaded = true
}

export const decodeReplay = (urlStr: string): ReplayState => {
  const url = new URL(urlStr)
  const packed = url.searchParams.get("state")
  if (!packed) {
    throw new Error("state parameter missing in replay url")
  }
  const crushed = decodeURIComponent(packed)
  const json = JSONCrush.uncrush(crushed)
  return JSON.parse(json)
}

export const createThreeCushionContainer = (canvasElement: HTMLElement) => {
  prepareThreeCushionEnvironment()
  const assets = AssetsModule.Assets.localAssets("threecushion")
  const keyboard = { getEvents: () => [] }
  const container = new ContainerModule.Container(
    canvasElement,
    () => {},
    assets,
    "threecushion",
    keyboard,
    "threecushion-replay-helper"
  )
  container.isSinglePlayer = true
  return container
}

export const applyReplayState = (container: any, state: ReplayState) => {
  const cue = container.table.cue
  const { balls } = container.table

  Ball.id = 0
  container.table.updateFromShortSerialised(state.init)
  balls.forEach((ball: InstanceType<typeof Ball>) => {
    ball.vel.set(0, 0, 0)
    ball.rvel.set(0, 0, 0)
    ball.state = State.Stationary
    ball.updatePhysicsContext(CAROM_PHYSICS)
  })

  const shot = state.shots[0]
  const aim = AimEventCtor.fromJson(shot)
  const cueBall = balls[shot.i]
  container.table.cueball = cueBall

  // Cue is already set correctly by Container.ts for threecushion mode
  // No need to override here - using production code path
  cue.aim = aim
  cue.elevation = shot.elevation ?? cue.defaultElevation
  cue.aim.elevation = cue.elevation
  cue.aim.offset.copy(aim.offset)
  cue.aim.pos.copy(aim.pos)
  cueBall.pos.set(shot.pos.x, shot.pos.y, shot.pos.z ?? 0)
  cueBall.state = State.Stationary

  return { shot, cueBall }
}

export type SimulationResult = {
  distance: number
  duration: number
  finalPos: Vector3
  finalVel: number
  finalSpin: number
  finalState: string
}

export const simulateThreeCushionScenario = (
  canvasElement: HTMLElement,
  state: ReplayState,
  maxTimeSeconds = 30,
  stepSeconds = 1 / 60
): SimulationResult => {
  const container = createThreeCushionContainer(canvasElement)
  const { cueBall } = applyReplayState(container, state)

  container.table.cue.hit(cueBall)

  const prevPos = cueBall.pos.clone()
  let distance = 0
  let elapsed = 0

  while (elapsed < maxTimeSeconds) {
    container.advance(stepSeconds)
    distance += cueBall.pos.distanceTo(prevPos)
    prevPos.copy(cueBall.pos)
    elapsed += stepSeconds
    if (container.table.allStationary()) {
      break
    }
  }

  return {
    distance,
    duration: elapsed,
    finalPos: cueBall.pos.clone(),
    finalVel: cueBall.vel.length(),
    finalSpin: cueBall.rvel.length(),
    finalState: cueBall.state,
  }
}

