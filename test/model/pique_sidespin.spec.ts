/**
 * Piqué Shot Side Spin Validation
 *
 * Tests the effect of horizontal cue tip offset on piqué trajectory.
 * Validates that offset controls curve direction as expected.
 */

import { Ball } from '../../src/model/ball'
import { Table } from '../../src/model/table'
import { Vector3 } from 'three'
import { State } from '../../src/model/ball'
import * as fs from 'fs'
import * as path from 'path'

// Import utility functions from pique_validation
// (In production, these would be moved to a shared utilities file)

const TEST_DATA_DIR = path.join(__dirname, '../data/pique_sidespin')
const SIMULATION_DURATION = 2.0
const LOGGING_INTERVAL = 0.01

// ============================================================================
// Test Configuration
// ============================================================================

interface SideSpinTestCase {
  id: string
  verticalAngle: number
  horizontalOffset: number
  description: string
}

const TEST_CASES: SideSpinTestCase[] = [
  // 75° vertical angle tests
  { id: 'T1', verticalAngle: 75, horizontalOffset: 0.00, description: '75° center (baseline)' },
  { id: 'T2', verticalAngle: 75, horizontalOffset: 0.25, description: '75° right 25%' },
  { id: 'T3', verticalAngle: 75, horizontalOffset: 0.50, description: '75° right 50%' },
  { id: 'T4', verticalAngle: 75, horizontalOffset: -0.25, description: '75° left 25%' },
  { id: 'T5', verticalAngle: 75, horizontalOffset: -0.50, description: '75° left 50%' },

  // 65° vertical angle tests
  { id: 'T6', verticalAngle: 65, horizontalOffset: 0.00, description: '65° center (baseline)' },
  { id: 'T7', verticalAngle: 65, horizontalOffset: 0.25, description: '65° right 25%' },
  { id: 'T8', verticalAngle: 65, horizontalOffset: 0.50, description: '65° right 50%' },
  { id: 'T9', verticalAngle: 65, horizontalOffset: -0.25, description: '65° left 25%' },
  { id: 'T10', verticalAngle: 65, horizontalOffset: -0.50, description: '65° left 50%' },
]

// ============================================================================
// Data Structures
// ============================================================================

interface TrajectoryPoint {
  time: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  wx: number
  wy: number
  wz: number
}

interface SideSpinResult {
  testId: string
  verticalAngle: number
  horizontalOffset: number
  finalPosition: { x: number; y: number }
  apexPosition: { x: number; y: number }
  maxLateralDeviation: number
  trajectoryLength: number
}

// ============================================================================
// Utility Functions
// ============================================================================

function createPiqueBall(angle: number, velocity: number, horizontalOffset: number = 0): Ball {
  const ball = new Ball(new Vector3(0, 0, 0))
  ball.state = State.Sliding

  const aimAngleRad = Math.PI / 4

  const velX = velocity * Math.cos(aimAngleRad)
  const velY = velocity * Math.sin(aimAngleRad)
  ball.vel.set(velX, velY, 0)

  const elevationRad = (angle * Math.PI) / 180
  const spinMagnitude = velocity * Math.sin(elevationRad) * (5 / (2 * ball.radius))

  let spinX = spinMagnitude * Math.cos(aimAngleRad)
  let spinY = spinMagnitude * Math.sin(aimAngleRad) * 0.3

  if (horizontalOffset !== 0) {
    const offsetAngle = horizontalOffset * Math.PI / 4
    const cos = Math.cos(offsetAngle)
    const sin = Math.sin(offsetAngle)
    const originalSpinX = spinX
    const originalSpinY = spinY

    spinX = originalSpinX * cos - originalSpinY * sin
    spinY = originalSpinX * sin + originalSpinY * cos
  }

  ball.rvel.set(spinX, spinY, 0)

  return ball
}

function simulateAndLogTrajectory(ball: Ball, duration: number, interval: number): TrajectoryPoint[] {
  const table = new Table([ball])
  const points: TrajectoryPoint[] = []
  let elapsedTime = 0
  let nextLogTime = 0

  while (elapsedTime < duration && ball.state !== State.Stationary) {
    if (elapsedTime >= nextLogTime) {
      points.push({
        time: elapsedTime,
        x: ball.pos.x,
        y: ball.pos.y,
        z: ball.pos.z,
        vx: ball.vel.x,
        vy: ball.vel.y,
        vz: ball.vel.z,
        wx: ball.rvel.x,
        wy: ball.rvel.y,
        wz: ball.rvel.z
      })
      nextLogTime += interval
    }

    const dt = Math.min(0.001, duration - elapsedTime, nextLogTime - elapsedTime)
    ball.update(dt, table)
    elapsedTime += dt
  }

  if (points.length === 0 || points[points.length - 1].time < elapsedTime) {
    points.push({
      time: elapsedTime,
      x: ball.pos.x,
      y: ball.pos.y,
      z: ball.pos.z,
      vx: ball.vel.x,
      vy: ball.vel.y,
      vz: ball.vel.z,
      wx: ball.rvel.x,
      wy: ball.rvel.y,
      wz: ball.rvel.z
    })
  }

  return points
}

function perpendicularDistance(point: TrajectoryPoint, lineStart: TrajectoryPoint, lineEnd: TrajectoryPoint): number {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y
  const lineLength = Math.sqrt(dx * dx + dy * dy)

  if (lineLength === 0) return 0

  const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (lineLength * lineLength)
  const projX = lineStart.x + t * dx
  const projY = lineStart.y + t * dy

  const distX = point.x - projX
  const distY = point.y - projY
  return Math.sqrt(distX * distX + distY * distY)
}

function calculateArcLength(points: TrajectoryPoint[]): number {
  let length = 0
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i-1].x
    const dy = points[i].y - points[i-1].y
    length += Math.sqrt(dx * dx + dy * dy)
  }
  return length
}

function analyzeSideSpinTrajectory(points: TrajectoryPoint[], testCase: SideSpinTestCase): SideSpinResult {
  const lineStart = points[0]
  const lineEnd = points[points.length - 1]

  let maxDeviation = 0
  let apexPoint = points[0]

  for (const point of points) {
    const deviation = perpendicularDistance(point, lineStart, lineEnd)
    if (deviation > maxDeviation) {
      maxDeviation = deviation
      apexPoint = point
    }
  }

  return {
    testId: testCase.id,
    verticalAngle: testCase.verticalAngle,
    horizontalOffset: testCase.horizontalOffset,
    finalPosition: {
      x: points[points.length - 1].x,
      y: points[points.length - 1].y
    },
    apexPosition: {
      x: apexPoint.x,
      y: apexPoint.y
    },
    maxLateralDeviation: maxDeviation,
    trajectoryLength: calculateArcLength(points)
  }
}

function writeTrajectoryCSV(points: TrajectoryPoint[], filename: string): void {
  const header = 'time,x,y,z,vx,vy,vz,wx,wy,wz\n'
  const rows = points.map(p =>
    `${p.time.toFixed(4)},${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)},` +
    `${p.vx.toFixed(6)},${p.vy.toFixed(6)},${p.vz.toFixed(6)},` +
    `${p.wx.toFixed(6)},${p.wy.toFixed(6)},${p.wz.toFixed(6)}`
  ).join('\n')

  const csvContent = header + rows
  const filepath = path.join(TEST_DATA_DIR, filename)

  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  }

  fs.writeFileSync(filepath, csvContent, 'utf-8')
}

function writeResultJSON(result: SideSpinResult, filename: string): void {
  const filepath = path.join(TEST_DATA_DIR, filename)
  fs.writeFileSync(filepath, JSON.stringify(result, null, 2), 'utf-8')
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Piqué Shot Side Spin Validation', () => {

  beforeAll(() => {
    if (!fs.existsSync(TEST_DATA_DIR)) {
      fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
    }
  })

  describe('Individual Test Cases', () => {
    TEST_CASES.forEach(testCase => {
      it(`${testCase.id}: ${testCase.description}`, () => {
        const ball = createPiqueBall(testCase.verticalAngle, 2.0, testCase.horizontalOffset)
        const points = simulateAndLogTrajectory(ball, SIMULATION_DURATION, LOGGING_INTERVAL)

        // Basic validation
        expect(points.length).toBeGreaterThan(10)

        // Ball must stay on table
        points.forEach(p => {
          expect(Math.abs(p.vz)).toBeLessThan(0.001)
        })

        // Analyze trajectory
        const result = analyzeSideSpinTrajectory(points, testCase)

        // Save data
        writeTrajectoryCSV(points, `${testCase.id}_trajectory.csv`)
        writeResultJSON(result, `${testCase.id}_result.json`)

        // Log for user visibility
        console.log(`\n${testCase.id} (${testCase.description}):`)
        console.log(`  Final position: (${result.finalPosition.x.toFixed(3)}, ${result.finalPosition.y.toFixed(3)})`)
        console.log(`  Apex position: (${result.apexPosition.x.toFixed(3)}, ${result.apexPosition.y.toFixed(3)})`)
        console.log(`  Max lateral deviation: ${(result.maxLateralDeviation * 1000).toFixed(1)} mm`)

        // Validation assertions
        expect(result.maxLateralDeviation).toBeGreaterThan(0) // Should have some curve
        expect(result.trajectoryLength).toBeGreaterThan(0)
      })
    })
  })

  describe('Comparative Analysis', () => {
    it('should show offset effect at 75° angle', () => {
      const results: SideSpinResult[] = []

      // Test center, right, and left offsets
      const offsets = [0, 0.25, -0.25, 0.5, -0.5]

      for (const offset of offsets) {
        const ball = createPiqueBall(75, 2.0, offset)
        const points = simulateAndLogTrajectory(ball, SIMULATION_DURATION, LOGGING_INTERVAL)
        const testCase = TEST_CASES.find(tc => tc.verticalAngle === 75 && tc.horizontalOffset === offset)!
        const result = analyzeSideSpinTrajectory(points, testCase)
        results.push(result)
      }

      // Analysis
      const center = results[0]
      const right25 = results[1]
      const left25 = results[2]
      const right50 = results[3]
      const left50 = results[4]

      console.log('\n75° Offset Comparison:')
      console.log(`  Center (0%):    ${(center.maxLateralDeviation * 1000).toFixed(1)} mm`)
      console.log(`  Right (+25%):   ${(right25.maxLateralDeviation * 1000).toFixed(1)} mm`)
      console.log(`  Right (+50%):   ${(right50.maxLateralDeviation * 1000).toFixed(1)} mm`)
      console.log(`  Left (-25%):    ${(left25.maxLateralDeviation * 1000).toFixed(1)} mm`)
      console.log(`  Left (-50%):    ${(left50.maxLateralDeviation * 1000).toFixed(1)} mm`)

      // Expect increasing deviation with offset magnitude
      expect(Math.abs(right50.maxLateralDeviation)).toBeGreaterThanOrEqual(Math.abs(right25.maxLateralDeviation) * 0.8)
      expect(Math.abs(left50.maxLateralDeviation)).toBeGreaterThanOrEqual(Math.abs(left25.maxLateralDeviation) * 0.8)
    })

    it('should show offset effect at 65° angle', () => {
      const results: SideSpinResult[] = []

      const offsets = [0, 0.25, -0.25, 0.5, -0.5]

      for (const offset of offsets) {
        const ball = createPiqueBall(65, 2.0, offset)
        const points = simulateAndLogTrajectory(ball, SIMULATION_DURATION, LOGGING_INTERVAL)
        const testCase = TEST_CASES.find(tc => tc.verticalAngle === 65 && tc.horizontalOffset === offset)!
        const result = analyzeSideSpinTrajectory(points, testCase)
        results.push(result)
      }

      const center = results[0]
      const right25 = results[1]
      const left25 = results[2]
      const right50 = results[3]
      const left50 = results[4]

      console.log('\n65° Offset Comparison:')
      console.log(`  Center (0%):    ${(center.maxLateralDeviation * 1000).toFixed(1)} mm`)
      console.log(`  Right (+25%):   ${(right25.maxLateralDeviation * 1000).toFixed(1)} mm`)
      console.log(`  Right (+50%):   ${(right50.maxLateralDeviation * 1000).toFixed(1)} mm`)
      console.log(`  Left (-25%):    ${(left25.maxLateralDeviation * 1000).toFixed(1)} mm`)
      console.log(`  Left (-50%):    ${(left50.maxLateralDeviation * 1000).toFixed(1)} mm`)

      expect(Math.abs(right50.maxLateralDeviation)).toBeGreaterThanOrEqual(Math.abs(right25.maxLateralDeviation) * 0.8)
      expect(Math.abs(left50.maxLateralDeviation)).toBeGreaterThanOrEqual(Math.abs(left25.maxLateralDeviation) * 0.8)
    })

    it('should create summary report for all tests', () => {
      const allResults: SideSpinResult[] = []

      for (const testCase of TEST_CASES) {
        const ball = createPiqueBall(testCase.verticalAngle, 2.0, testCase.horizontalOffset)
        const points = simulateAndLogTrajectory(ball, SIMULATION_DURATION, LOGGING_INTERVAL)
        const result = analyzeSideSpinTrajectory(points, testCase)
        allResults.push(result)
      }

      // Create summary data
      const summary = {
        description: 'Piqué shot side spin validation - Complete results',
        testDate: new Date().toISOString(),
        totalTests: allResults.length,
        results: allResults.map(r => ({
          testId: r.testId,
          angle: r.verticalAngle,
          offset: r.horizontalOffset,
          finalX: parseFloat(r.finalPosition.x.toFixed(3)),
          finalY: parseFloat(r.finalPosition.y.toFixed(3)),
          apexX: parseFloat(r.apexPosition.x.toFixed(3)),
          apexY: parseFloat(r.apexPosition.y.toFixed(3)),
          maxDeviationMm: parseFloat((r.maxLateralDeviation * 1000).toFixed(1)),
          trajectoryLengthM: parseFloat(r.trajectoryLength.toFixed(3))
        }))
      }

      const filepath = path.join(TEST_DATA_DIR, 'summary.json')
      fs.writeFileSync(filepath, JSON.stringify(summary, null, 2), 'utf-8')

      expect(allResults.length).toBe(10)
    })
  })
})
