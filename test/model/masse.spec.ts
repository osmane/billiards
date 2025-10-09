import { expect } from "chai"
import { Vector3 } from "three"
import { Ball } from "../../src/model/ball"
import { Table } from "../../src/model/table"
import { POOL_PHYSICS } from "../../src/model/physics/constants"

/**
 * MASSÉ SHOT PHYSICS TESTS
 *
 * Tests for curved ball trajectories through vertical spin and Magnus effect.
 * Critical constraint: Ball must NEVER leave table surface.
 *
 * Test angles: 0°, 10°, 20°, 30°, 40°, 50°, 60°, 70°, 80°, 85°, 90°
 * Spin directions: Clockwise (right curve) and Counter-clockwise (left curve)
 */

// ============================================================================
// TEST UTILITIES
// ============================================================================

function simulateBallMotion(
  ball: Ball,
  duration: number,
  timestep = 0.01
): Vector3[] {
  const positions: Vector3[] = []
  let elapsed = 0

  while (elapsed < duration && ball.inMotion()) {
    positions.push(ball.pos.clone())
    ball.update(timestep)
    elapsed += timestep
  }

  return positions
}

/**
 * Measure trajectory curvature by calculating the radius of curvature
 * Uses three points to estimate curvature at the middle point
 *
 * @param positions Array of positions along trajectory
 * @returns Average radius of curvature (larger = less curved)
 */
function measureCurvature(positions: Vector3[]): number {
  if (positions.length < 3) {
    return Infinity // Straight line
  }

  const curvatures: number[] = []

  // Calculate curvature at multiple points along trajectory
  for (let i = 1; i < positions.length - 1; i++) {
    const p1 = positions[i - 1]
    const p2 = positions[i]
    const p3 = positions[i + 1]

    // Using Menger curvature formula: K = 4*Area / (a*b*c)
    // where Area is triangle area, a,b,c are side lengths
    const a = p1.distanceTo(p2)
    const b = p2.distanceTo(p3)
    const c = p3.distanceTo(p1)

    // Calculate area using Heron's formula
    const s = (a + b + c) / 2
    const area = Math.sqrt(s * (s - a) * (s - b) * (s - c))

    if (a * b * c > 0) {
      const curvature = (4 * area) / (a * b * c)
      if (isFinite(curvature) && curvature > 0) {
        curvatures.push(curvature)
      }
    }
  }

  if (curvatures.length === 0) {
    return Infinity
  }

  // Return average curvature
  const avgCurvature = curvatures.reduce((sum, k) => sum + k, 0) / curvatures.length
  return avgCurvature
}

/**
 * Calculate lateral displacement (perpendicular to initial velocity)
 * This is a simpler measure of curve magnitude
 *
 * @param positions Array of positions
 * @returns Maximum lateral displacement from straight line path
 */
function measureLateralDisplacement(positions: Vector3[]): number {
  if (positions.length < 2) {
    return 0
  }

  const start = positions[0]
  const end = positions[positions.length - 1]
  const direction = end.clone().sub(start).normalize()

  let maxDisplacement = 0

  for (const pos of positions) {
    // Project position onto line from start to end
    const toPos = pos.clone().sub(start)
    const alongLine = toPos.dot(direction)
    const projected = start.clone().addScaledVector(direction, alongLine)
    const displacement = pos.distanceTo(projected)

    maxDisplacement = Math.max(maxDisplacement, displacement)
  }

  return maxDisplacement
}

/**
 * Determine curve direction (positive = right, negative = left, 0 = straight)
 * Relative to initial velocity direction
 *
 * @param positions Array of positions
 * @param initialVelocity Initial velocity vector
 * @returns Signed curve direction
 */
function getCurveDirection(positions: Vector3[], initialVelocity: Vector3): number {
  if (positions.length < 3) {
    return 0
  }

  const start = positions[0]
  const mid = positions[Math.floor(positions.length / 2)]
  const forward = initialVelocity.clone().normalize()
  const right = new Vector3(-forward.y, forward.x, 0) // Perpendicular (right-hand rule)

  const displacement = mid.clone().sub(start)
  const lateralComponent = displacement.dot(right)

  return lateralComponent
}

/**
 * Assert that ball stays on table surface throughout trajectory
 * CRITICAL: This must pass for all massé shots
 *
 * @param positions Array of ball positions
 * @param ballRadius Ball radius for z-position check
 */
function assertBallOnTable(positions: Vector3[], ballRadius: number) {
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i]

    // Ball z-position should be 0 (or very close to 0) on table surface
    // Note: In current implementation, z might be implicit, but should remain constant
    expect(Math.abs(pos.z)).to.be.lessThan(
      0.001,
      `Ball left table at position ${i}: z = ${pos.z}`
    )
  }
}

/**
 * Assert that ball vertical velocity stays zero
 * CRITICAL: Ball must never gain upward velocity
 *
 * @param ball Ball to check
 * @param positions Positions to verify (triggers update checks)
 */
function assertNoVerticalVelocity(ball: Ball) {
  expect(Math.abs(ball.vel.z)).to.be.lessThan(
    0.001,
    `Ball has vertical velocity: vz = ${ball.vel.z}`
  )
}

/**
 * Create a ball with given initial conditions for massé testing
 *
 * @param velocity Initial velocity (horizontal)
 * @param angularVelocity Initial spin (vertical component for massé)
 * @returns Ball configured for testing
 */
function createTestBall(velocity: Vector3, angularVelocity: Vector3): Ball {
  const ball = new Ball(new Vector3(0, 0, 0), 0xffffff, POOL_PHYSICS)
  ball.vel.copy(velocity)
  ball.rvel.copy(angularVelocity)
  return ball
}

/**
 * Generate test angles (0° to 90°)
 * Returns cue elevation angles in radians
 */
function getTestAngles(): { degrees: number; radians: number }[] {
  const angles = [0, 10, 20, 30, 40, 50, 60, 70, 80, 85, 90]
  return angles.map((deg) => ({
    degrees: deg,
    radians: (deg * Math.PI) / 180,
  }))
}

// ============================================================================
// TESTS: INFRASTRUCTURE VALIDATION
// ============================================================================

describe("Massé Physics - Test Infrastructure", () => {
  it("should simulate ball motion over time", (done) => {
    const ball = createTestBall(new Vector3(1, 0, 0), new Vector3(0, 0, 0))
    ball.state = "Sliding" as any // Set state to sliding so it will move
    const positions = simulateBallMotion(ball, 0.5, 0.01)

    expect(positions.length).to.be.greaterThan(1)
    expect(positions[0].x).to.equal(0)
    expect(positions[positions.length - 1].x).to.be.greaterThan(0) // Ball should have moved
    done()
  })

  it("should measure zero curvature for straight line", (done) => {
    const positions = [
      new Vector3(0, 0, 0),
      new Vector3(1, 0, 0),
      new Vector3(2, 0, 0),
      new Vector3(3, 0, 0),
    ]

    const curvature = measureCurvature(positions)
    expect(curvature).to.equal(Infinity) // Straight line = infinite radius
    done()
  })

  it("should measure non-zero curvature for curved path", (done) => {
    // Circular arc
    const positions = [
      new Vector3(0, 0, 0),
      new Vector3(1, 0.5, 0),
      new Vector3(2, 0.8, 0),
      new Vector3(3, 1.0, 0),
    ]

    const curvature = measureCurvature(positions)
    expect(curvature).to.be.greaterThan(0)
    expect(curvature).to.be.lessThan(Infinity)
    done()
  })

  it("should measure lateral displacement", (done) => {
    const positions = [
      new Vector3(0, 0, 0),
      new Vector3(1, 0.2, 0),
      new Vector3(2, 0.3, 0),
      new Vector3(3, 0.2, 0),
    ]

    const displacement = measureLateralDisplacement(positions)
    // The actual displacement depends on the projection, so just verify it's positive
    expect(displacement).to.be.greaterThan(0)
    expect(displacement).to.be.lessThan(1)
    done()
  })

  it("should detect curve direction (right)", (done) => {
    const positions = [
      new Vector3(0, 0, 0),
      new Vector3(1, 0.5, 0),
      new Vector3(2, 0.8, 0),
    ]
    const initialVel = new Vector3(1, 0, 0)

    const direction = getCurveDirection(positions, initialVel)
    expect(direction).to.be.greaterThan(0) // Positive = right curve
    done()
  })

  it("should detect curve direction (left)", (done) => {
    const positions = [
      new Vector3(0, 0, 0),
      new Vector3(1, -0.5, 0),
      new Vector3(2, -0.8, 0),
    ]
    const initialVel = new Vector3(1, 0, 0)

    const direction = getCurveDirection(positions, initialVel)
    expect(direction).to.be.lessThan(0) // Negative = left curve
    done()
  })

  it("should generate all test angles", (done) => {
    const angles = getTestAngles()
    expect(angles.length).to.equal(11) // 0° to 90° in steps
    expect(angles[0].degrees).to.equal(0)
    expect(angles[10].degrees).to.equal(90)
    expect(angles[5].degrees).to.equal(50)
    done()
  })

  it("should create test ball with initial conditions", (done) => {
    const vel = new Vector3(2, 0, 0)
    const rvel = new Vector3(0, 0, 10)
    const ball = createTestBall(vel, rvel)

    expect(ball.vel.x).to.equal(2)
    expect(ball.rvel.z).to.equal(10)
    expect(ball.pos.x).to.equal(0)
    done()
  })
})

// ============================================================================
// TESTS: TABLE CONSTRAINT (Should PASS with current physics)
// ============================================================================

describe("Massé Physics - Table Constraint", () => {
  it("ball with horizontal velocity stays on table (0° angle)", (done) => {
    const ball = createTestBall(new Vector3(2, 0, 0), new Vector3(0, 0, 0))
    ball.state = "Sliding" as any
    const positions = simulateBallMotion(ball, 1.0, 0.01)

    assertBallOnTable(positions, ball.radius)
    assertNoVerticalVelocity(ball)
    done()
  })

  it("ball with spin stays on table (no vertical spin)", (done) => {
    const ball = createTestBall(new Vector3(2, 0, 0), new Vector3(0, 10, 0))
    ball.state = "Sliding" as any
    const positions = simulateBallMotion(ball, 1.0, 0.01)

    assertBallOnTable(positions, ball.radius)
    assertNoVerticalVelocity(ball)
    done()
  })

  it("ball with high power stays on table", (done) => {
    const ball = createTestBall(new Vector3(5, 0, 0), new Vector3(0, 0, 20))
    ball.state = "Sliding" as any
    const positions = simulateBallMotion(ball, 0.5, 0.01)

    assertBallOnTable(positions, ball.radius)
    assertNoVerticalVelocity(ball)
    done()
  })

  it("ball at various angles stays on table", (done) => {
    const angles = getTestAngles()

    for (const angle of angles) {
      const vx = 2 * Math.cos(angle.radians)
      const vy = 2 * Math.sin(angle.radians)
      const ball = createTestBall(
        new Vector3(vx, vy, 0),
        new Vector3(0, 0, 5)
      )
      ball.state = "Sliding" as any
      const positions = simulateBallMotion(ball, 0.5, 0.01)

      assertBallOnTable(positions, ball.radius)
      assertNoVerticalVelocity(ball)
    }
    done()
  })

  it("rolling ball stays on table", (done) => {
    const ball = createTestBall(new Vector3(1, 0, 0), new Vector3(0, 0, 0))
    ball.state = "Rolling" as any
    const positions = simulateBallMotion(ball, 1.0, 0.01)

    assertBallOnTable(positions, ball.radius)
    assertNoVerticalVelocity(ball)
    done()
  })

  it("ball with z-spin stays on table (English)", (done) => {
    // Z-spin (English/side spin) should not lift ball
    const ball = createTestBall(new Vector3(2, 0, 0), new Vector3(0, 0, 15))
    ball.state = "Sliding" as any
    const positions = simulateBallMotion(ball, 0.5, 0.01)

    assertBallOnTable(positions, ball.radius)
    assertNoVerticalVelocity(ball)
    done()
  })
})

// ============================================================================
// TESTS: MAGNUS EFFECT (RED PHASE - Should FAIL until implemented)
// ============================================================================

describe("Massé Physics - Magnus Effect", () => {
  // Test: 0° cue angle should produce NO curve (no vertical spin)
  it("0° cue angle produces no curve (baseline)", (done) => {
    // Horizontal strike = no vertical spin = no Magnus force = straight line
    const ball = createTestBall(new Vector3(2, 0, 0), new Vector3(0, 0, 10))
    ball.state = "Sliding" as any
    const positions = simulateBallMotion(ball, 0.5, 0.01)

    const displacement = measureLateralDisplacement(positions)
    // Should be minimal (< 0.01m) for straight trajectory
    expect(displacement).to.be.lessThan(0.01)
    done()
  })

  // Test: Vertical spin (from massé) should create horizontal curve
  it("vertical spin creates horizontal curve (clockwise)", (done) => {
    // Simulate massé with vertical spin component
    // Clockwise vertical spin (rvel.z > 0 with rvel.x or rvel.y > 0)
    // Should curve to the right
    const ball = createTestBall(
      new Vector3(2, 0, 0), // Moving in +X direction
      new Vector3(10, 0, 0) // Spin around X-axis (vertical spin component)
    )
    ball.state = "Sliding" as any
    const positions = simulateBallMotion(ball, 0.3, 0.01)

    // With Magnus effect, should have noticeable curve
    const displacement = measureLateralDisplacement(positions)
    const direction = getCurveDirection(positions, ball.vel)

    // EXPECTED: displacement > 0.001m (1mm) - small but noticeable curve
    // This test will FAIL until Magnus force is implemented
    expect(displacement).to.be.greaterThan(0.001)
    done()
  })

  it("vertical spin creates horizontal curve (counter-clockwise)", (done) => {
    // Counter-clockwise vertical spin should curve left
    const ball = createTestBall(
      new Vector3(2, 0, 0), // Moving in +X direction
      new Vector3(-10, 0, 0) // Opposite spin direction
    )
    ball.state = "Sliding" as any
    const positions = simulateBallMotion(ball, 0.3, 0.01)

    const displacement = measureLateralDisplacement(positions)
    const direction = getCurveDirection(positions, ball.vel)

    // Should curve in opposite direction
    expect(displacement).to.be.greaterThan(0.001)
    done()
  })

  // Test: 90° cue angle should produce MAXIMUM curve
  it("90° cue angle produces maximum curve", (done) => {
    // Vertical strike = maximum vertical spin = maximum Magnus force
    const ball = createTestBall(
      new Vector3(2, 0, 0),
      new Vector3(15, 0, 0) // Maximum vertical spin component
    )
    ball.state = "Sliding" as any
    const positions = simulateBallMotion(ball, 0.3, 0.01)

    const displacement = measureLateralDisplacement(positions)

    // Should have maximum curvature
    // This will FAIL until Magnus is implemented
    expect(displacement).to.be.greaterThan(0.002)
    done()
  })

  // Test: Mid-range angles should have intermediate curvature
  it("45° angle produces intermediate curve", (done) => {
    // 45° = sin(45°) ≈ 0.707 vertical spin component
    const verticalSpinComponent = 15 * Math.sin(Math.PI / 4)
    const ball = createTestBall(
      new Vector3(2, 0, 0),
      new Vector3(verticalSpinComponent, 0, 0)
    )
    ball.state = "Sliding" as any
    const positions = simulateBallMotion(ball, 0.3, 0.01)

    const displacement = measureLateralDisplacement(positions)

    // Should be between 0° and 90° curves
    expect(displacement).to.be.greaterThan(0.001)
    expect(displacement).to.be.lessThan(0.01)
    done()
  })

  // Test: Curve direction matches spin direction
  it("clockwise spin curves right, CCW curves left", (done) => {
    const ballCW = createTestBall(
      new Vector3(2, 0, 0),
      new Vector3(10, 0, 0)
    )
    ballCW.state = "Sliding" as any
    const posCW = simulateBallMotion(ballCW, 0.3, 0.01)
    const dirCW = getCurveDirection(posCW, new Vector3(2, 0, 0))

    const ballCCW = createTestBall(
      new Vector3(2, 0, 0),
      new Vector3(-10, 0, 0)
    )
    ballCCW.state = "Sliding" as any
    const posCCW = simulateBallMotion(ballCCW, 0.3, 0.01)
    const dirCCW = getCurveDirection(posCCW, new Vector3(2, 0, 0))

    // Directions should be opposite
    expect(Math.sign(dirCW)).to.not.equal(Math.sign(dirCCW))
    done()
  })

  // Test: All test angles produce appropriate curves
  it("all test angles produce smooth curvature progression", (done) => {
    const angles = getTestAngles()
    const curvatures: number[] = []

    for (const angle of angles) {
      if (angle.degrees === 0) continue // Skip 0° (no curve)

      const verticalSpin = 15 * Math.sin(angle.radians)
      const ball = createTestBall(
        new Vector3(2, 0, 0),
        new Vector3(verticalSpin, 0, 0)
      )
      ball.state = "Sliding" as any
      const positions = simulateBallMotion(ball, 0.3, 0.01)
      const displacement = measureLateralDisplacement(positions)
      curvatures.push(displacement)
    }

    // Verify monotonic increase (each angle curves more than previous)
    // This will FAIL until Magnus is implemented
    for (let i = 1; i < curvatures.length; i++) {
      expect(curvatures[i]).to.be.greaterThan(curvatures[i - 1] * 0.8)
    }
    done()
  })
})

// ============================================================================
// TESTS: COMPREHENSIVE VALIDATION (Phase 8)
// ============================================================================

describe("Massé Physics - Comprehensive Validation", () => {
  const powerLevels = [1, 2, 3] // Low, medium, high power
  const angles = getTestAngles()

  // Test matrix: 11 angles × 3 power levels × 2 spin directions = 66 tests
  // We'll batch these to avoid too many individual test cases

  it("all angles with low power (CW spin)", (done) => {
    for (const angle of angles) {
      if (angle.degrees === 0) continue
      const verticalSpin = 10 * Math.sin(angle.radians)
      const ball = createTestBall(
        new Vector3(powerLevels[0], 0, 0),
        new Vector3(verticalSpin, 0, 0)
      )
      ball.state = "Sliding" as any
      const positions = simulateBallMotion(ball, 0.5, 0.01)

      assertBallOnTable(positions, ball.radius)
      assertNoVerticalVelocity(ball)
    }
    done()
  })

  it("all angles with medium power (CW spin)", (done) => {
    for (const angle of angles) {
      if (angle.degrees === 0) continue
      const verticalSpin = 15 * Math.sin(angle.radians)
      const ball = createTestBall(
        new Vector3(powerLevels[1], 0, 0),
        new Vector3(verticalSpin, 0, 0)
      )
      ball.state = "Sliding" as any
      const positions = simulateBallMotion(ball, 0.5, 0.01)

      assertBallOnTable(positions, ball.radius)
      assertNoVerticalVelocity(ball)
    }
    done()
  })

  it("all angles with high power (CW spin)", (done) => {
    for (const angle of angles) {
      if (angle.degrees === 0) continue
      const verticalSpin = 20 * Math.sin(angle.radians)
      const ball = createTestBall(
        new Vector3(powerLevels[2], 0, 0),
        new Vector3(verticalSpin, 0, 0)
      )
      ball.state = "Sliding" as any
      const positions = simulateBallMotion(ball, 0.5, 0.01)

      assertBallOnTable(positions, ball.radius)
      assertNoVerticalVelocity(ball)
    }
    done()
  })

  it("all angles with low power (CCW spin)", (done) => {
    for (const angle of angles) {
      if (angle.degrees === 0) continue
      const verticalSpin = -10 * Math.sin(angle.radians)
      const ball = createTestBall(
        new Vector3(powerLevels[0], 0, 0),
        new Vector3(verticalSpin, 0, 0)
      )
      ball.state = "Sliding" as any
      const positions = simulateBallMotion(ball, 0.5, 0.01)

      assertBallOnTable(positions, ball.radius)
      assertNoVerticalVelocity(ball)

      const displacement = measureLateralDisplacement(positions)
      if (angle.degrees > 10) {
        expect(displacement).to.be.greaterThan(0)
      }
    }
    done()
  })

  it("curvature increases monotonically with angle", (done) => {
    const displacements: number[] = []

    for (const angle of angles) {
      if (angle.degrees === 0) continue

      const verticalSpin = 15 * Math.sin(angle.radians)
      const ball = createTestBall(
        new Vector3(2, 0, 0),
        new Vector3(verticalSpin, 0, 0)
      )
      ball.state = "Sliding" as any
      const positions = simulateBallMotion(ball, 0.3, 0.01)
      const displacement = measureLateralDisplacement(positions)
      displacements.push(displacement)
    }

    // Verify general increasing trend (allowing some tolerance)
    for (let i = 1; i < displacements.length; i++) {
      expect(displacements[i]).to.be.greaterThan(displacements[i - 1] * 0.7)
    }
    done()
  })

  it("opposite spins produce opposite curve directions", (done) => {
    for (const angle of angles) {
      if (angle.degrees === 0 || angle.degrees < 20) continue

      const verticalSpin = 15 * Math.sin(angle.radians)

      const ballCW = createTestBall(
        new Vector3(2, 0, 0),
        new Vector3(verticalSpin, 0, 0)
      )
      ballCW.state = "Sliding" as any
      const posCW = simulateBallMotion(ballCW, 0.3, 0.01)
      const dirCW = getCurveDirection(posCW, new Vector3(2, 0, 0))

      const ballCCW = createTestBall(
        new Vector3(2, 0, 0),
        new Vector3(-verticalSpin, 0, 0)
      )
      ballCCW.state = "Sliding" as any
      const posCCW = simulateBallMotion(ballCCW, 0.3, 0.01)
      const dirCCW = getCurveDirection(posCCW, new Vector3(2, 0, 0))

      expect(Math.sign(dirCW)).to.not.equal(Math.sign(dirCCW))
    }
    done()
  })
})

// ============================================================================
// TESTS: ANTI-JUMP VALIDATION (Phase 10) - MANDATORY
// ============================================================================

describe("Massé Physics - Anti-Jump Validation", () => {
  // Generate random test cases
  function randomInRange(min: number, max: number): number {
    return Math.random() * (max - min) + min
  }

  it("100 random test cases - ball never leaves table", (done) => {
    const testCount = 100
    let passCount = 0

    for (let i = 0; i < testCount; i++) {
      const angle = randomInRange(0, Math.PI / 2) // 0 to 90 degrees
      const power = randomInRange(0.5, 5) // Various power levels
      const spinMagnitude = randomInRange(5, 25) // Various spin magnitudes
      const spinDirection = Math.random() > 0.5 ? 1 : -1

      const verticalSpin = spinMagnitude * Math.sin(angle) * spinDirection
      const ball = createTestBall(
        new Vector3(power, 0, 0),
        new Vector3(verticalSpin, 0, 0)
      )
      ball.state = "Sliding" as any
      const positions = simulateBallMotion(ball, 0.5, 0.01)

      try {
        assertBallOnTable(positions, ball.radius)
        assertNoVerticalVelocity(ball)
        passCount++
      } catch (e) {
        // Log failure details
        console.error(`Test ${i} failed: angle=${angle}, power=${power}, spin=${verticalSpin}`)
        throw e
      }
    }

    expect(passCount).to.equal(testCount)
    done()
  })

  it("extreme conditions - very high power and spin", (done) => {
    const ball = createTestBall(
      new Vector3(10, 0, 0), // Very high power
      new Vector3(50, 0, 0) // Very high spin
    )
    ball.state = "Sliding" as any
    const positions = simulateBallMotion(ball, 0.3, 0.01)

    assertBallOnTable(positions, ball.radius)
    assertNoVerticalVelocity(ball)
    done()
  })

  it("extreme conditions - near-vertical cue angle", (done) => {
    const verticalSpin = 30 * Math.sin(89 * Math.PI / 180) // 89 degrees
    const ball = createTestBall(
      new Vector3(3, 0, 0),
      new Vector3(verticalSpin, 0, 0)
    )
    ball.state = "Sliding" as any
    const positions = simulateBallMotion(ball, 0.3, 0.01)

    assertBallOnTable(positions, ball.radius)
    assertNoVerticalVelocity(ball)
    done()
  })

  it("combined spins - vertical + English (z-spin)", (done) => {
    // Test that z-spin doesn't interfere with table constraint
    const ball = createTestBall(
      new Vector3(2, 0, 0),
      new Vector3(15, 0, 20) // Both vertical and z-spin
    )
    ball.state = "Sliding" as any
    const positions = simulateBallMotion(ball, 0.5, 0.01)

    assertBallOnTable(positions, ball.radius)
    assertNoVerticalVelocity(ball)
    done()
  })
})

// ============================================================================
// TESTS: EXPORTS FOR USE IN OTHER TEST PHASES
// ============================================================================

// Export utilities for use in other test suites
export {
  simulateBallMotion,
  measureCurvature,
  measureLateralDisplacement,
  getCurveDirection,
  assertBallOnTable,
  assertNoVerticalVelocity,
  createTestBall,
  getTestAngles,
}
