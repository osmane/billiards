export interface FrameSample {
  physics: number
  process: number
  render: number
  total: number
  dtMs: number
  rawElapsedMs: number
  deltaMs: number
  steps: number
  simulatedMs: number
  accumulatorBefore: number
  accumulatorAfterAdd: number
  accumulatorAfter: number
  backlogBefore: number
  backlogAfter: number
  deltaClamped: boolean
  accumulatorClamped: boolean
  hitMaxSubSteps: boolean
  accumulatorTrimmedPostStep: boolean
}

interface RecordedFrame extends FrameSample {
  frame: number
}

interface CatapultFrame extends RecordedFrame {
  reasons: string[]
}

interface ShotState {
  active: boolean
  frames: RecordedFrame[]
  catapultFrames: CatapultFrame[]
  startedAt: number
}

interface MetricSummary {
  avg: number
  max: number
  p95: number
}

interface CatapultHighlight {
  frame: number
  dtMs: number
  rawElapsedMs: number
  deltaMs: number
  steps: number
  simulatedMs: number
  physics: number
  process: number
  render: number
  total: number
  reasons: string[]
  accumulatorBefore: number
  accumulatorAfterAdd: number
  accumulatorAfter: number
  backlogBefore: number
  backlogAfter: number
}

interface ShotSummary {
  frames: number
  durationMs: number
  metrics: {
    physics: MetricSummary
    process: MetricSummary
    render: MetricSummary
    total: MetricSummary
    dt: MetricSummary
    delta: MetricSummary
    steps: MetricSummary
    simulated: MetricSummary
    backlogBefore: MetricSummary
    backlogAfter: MetricSummary
  }
  catapult: {
    frames: number
    reasons: Record<string, number>
    worst?: CatapultHighlight | undefined
  }
}

interface ShotExport {
  summary: ShotSummary
  frames: RecordedFrame[]
  catapultFrames: CatapultFrame[]
}

const hasWindow = typeof window !== "undefined"
const hasPerformance = typeof performance !== "undefined"
const now = () => (hasPerformance ? performance.now() : Date.now())
const FRAME_SKIP_THRESHOLD_MS = 1000 / 30 + 5

const state: ShotState = {
  active: false,
  frames: [],
  catapultFrames: [],
  startedAt: 0,
}

let lastShot: ShotExport | undefined

const round3 = (value: number) => Math.round(value * 1000) / 1000

const summarise = (
  frames: RecordedFrame[],
  key: keyof RecordedFrame
): MetricSummary => {
  const values = frames.map((f) => f[key] as number)
  if (values.length === 0) {
    return { avg: 0, max: 0, p95: 0 }
  }
  values.sort((a, b) => a - b)
  const sum = values.reduce((acc, v) => acc + v, 0)
  const index = Math.min(values.length - 1, Math.floor(values.length * 0.95))
  return {
    avg: round3(sum / values.length),
    max: round3(values[values.length - 1]),
    p95: round3(values[index]),
  }
}

const detectCatapult = (frame: RecordedFrame): string[] => {
  const reasons: string[] = []
  if (frame.dtMs > FRAME_SKIP_THRESHOLD_MS) {
    reasons.push(`dt>${round3(FRAME_SKIP_THRESHOLD_MS)}`)
  }
  if (frame.deltaClamped) {
    reasons.push("deltaClamped")
  }
  if (frame.hitMaxSubSteps) {
    reasons.push("hitMaxSubSteps")
  }
  if (frame.accumulatorClamped || frame.accumulatorTrimmedPostStep) {
    reasons.push("backlogClamped")
  }
  return reasons
}

const highlightCatapult = (frame: CatapultFrame): CatapultHighlight => ({
  frame: frame.frame,
  dtMs: round3(frame.dtMs),
  rawElapsedMs: round3(frame.rawElapsedMs),
  deltaMs: round3(frame.deltaMs),
  steps: frame.steps,
  simulatedMs: round3(frame.simulatedMs),
  physics: round3(frame.physics),
  process: round3(frame.process),
  render: round3(frame.render),
  total: round3(frame.total),
  reasons: frame.reasons.slice(),
  accumulatorBefore: round3(frame.accumulatorBefore),
  accumulatorAfterAdd: round3(frame.accumulatorAfterAdd),
  accumulatorAfter: round3(frame.accumulatorAfter),
  backlogBefore: round3(frame.backlogBefore),
  backlogAfter: round3(frame.backlogAfter),
})
const buildSummary = (
  frames: RecordedFrame[],
  duration: number,
  catapultFrames: CatapultFrame[]
): ShotSummary => {
  const reasonCounts: Record<string, number> = {}
  catapultFrames.forEach((frame) => {
    frame.reasons.forEach((reason) => {
      reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1
    })
  })

  const worst = catapultFrames.reduce<CatapultFrame | undefined>((acc, frame) => {
    if (!acc) {
      return frame
    }
    return frame.dtMs > acc.dtMs ? frame : acc
  }, undefined)

  return {
    frames: frames.length,
    durationMs: round3(duration),
    metrics: {
      physics: summarise(frames, "physics"),
      process: summarise(frames, "process"),
      render: summarise(frames, "render"),
      total: summarise(frames, "total"),
      dt: summarise(frames, "dtMs"),
      delta: summarise(frames, "deltaMs"),
      steps: summarise(frames, "steps"),
      simulated: summarise(frames, "simulatedMs"),
      backlogBefore: summarise(frames, "backlogBefore"),
      backlogAfter: summarise(frames, "backlogAfter"),
    },
    catapult: {
      frames: catapultFrames.length,
      reasons: reasonCounts,
      worst: worst ? highlightCatapult(worst) : undefined,
    },
  }
}

export function beginShot(): void {
  if (!hasWindow) {
    return
  }
  if (state.active) {
    endShot()
  }
  state.active = true
  state.frames = []
  state.catapultFrames = []
  state.startedAt = now()
}

export function recordShotFrame(sample: FrameSample): void {
  if (!state.active) {
    return
  }
  const frameNumber = state.frames.length
  const record: RecordedFrame = { ...sample, frame: frameNumber }
  state.frames.push(record)
  const reasons = detectCatapult(record)
  if (reasons.length > 0) {
    state.catapultFrames.push({ ...record, reasons })
  }
}

export function endShot(): ShotExport | undefined {
  if (!state.active) {
    return lastShot
  }
  state.active = false
  const frames = state.frames.slice()
  const catapultFrames = state.catapultFrames.slice()
  const duration = now() - state.startedAt
  const summary = buildSummary(frames, duration, catapultFrames)
  const exportValue: ShotExport = { summary, frames, catapultFrames }
  lastShot = exportValue
  if (hasWindow) {
    ;(window as ShotStatsWindow).lastShotStats = exportValue
  }
  state.frames = []
  state.catapultFrames = []
  return exportValue
}

export function isShotActive(): boolean {
  return state.active
}

export function getLastShotStats(): ShotExport | undefined {
  return lastShot
}

declare global {
  interface ShotStatsWindow extends Window {
    lastShotStats?: ShotExport
  }
}












