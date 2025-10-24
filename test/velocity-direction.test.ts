import { Vector3, Quaternion } from 'three'
import { Cue } from '../src/view/cue'
import { Ball, State } from '../src/model/ball'
import { Table } from '../src/model/table'
import { R } from '../src/model/physics/constants'

// Mock container and table for testing
const mockContainer = {
  view: { scene: {} },
  pausePhysics: jest.fn(),
  updateTrajectoryPrediction: jest.fn(),
  trajectoryRenderer: { clearTrajectories: jest.fn() }
}

const mockTable = {
  cueball: { pos: new Vector3(0, 0, 0), radius: R },
  balls: [],
  mesh: null
}

describe('Velocity Direction Tests', () => {
  let cue: Cue
  let ball: Ball

  beforeEach(() => {
    cue = new Cue(mockContainer, R)
    ball = new Ball(new Vector3(0, 0, 0), R)
    ball.state = State.Sliding
  })

  test('Horizontal shot (0° elevation) should match cue direction', () => {
    // Setup horizontal shot
    cue.aim.angle = 0 // Straight forward
    cue.elevation = 0 // No elevation
    cue.aim.power = 10
    
    // Hit the ball
    cue.hit(ball)
    
    // Velocity should be in X direction (forward)
    expect(ball.vel.x).toBeCloseTo(10, 2)
    expect(ball.vel.y).toBeCloseTo(0, 2)
    expect(ball.vel.z).toBeCloseTo(0, 2)
  })

  test('45° elevation shot should have correct components', () => {
    // Setup 45° elevation shot
    cue.aim.angle = 0 // Straight forward
    cue.elevation = Math.PI / 4 // 45°
    cue.aim.power = 10
    
    // Hit the ball
    cue.hit(ball)
    
    // Velocity should have equal X and Z components
    const expectedHorizontal = 10 * Math.cos(Math.PI / 4) // ~7.07
    const expectedVertical = 10 * Math.sin(Math.PI / 4)   // ~7.07
    
    expect(ball.vel.x).toBeCloseTo(expectedHorizontal, 2)
    expect(ball.vel.y).toBeCloseTo(0, 2)
    expect(ball.vel.z).toBeCloseTo(expectedVertical, 2)
  })

  test('90° elevation shot should be purely vertical', () => {
    // Setup 90° elevation shot
    cue.aim.angle = 0 // Straight forward
    cue.elevation = Math.PI / 2 // 90°
    cue.aim.power = 10
    
    // Hit the ball
    cue.hit(ball)
    
    // Velocity should be purely in Z direction (up)
    expect(ball.vel.x).toBeCloseTo(0, 2)
    expect(ball.vel.y).toBeCloseTo(0, 2)
    expect(ball.vel.z).toBeCloseTo(10, 2)
  })

  test('Angled shot with elevation should have correct components', () => {
    // Setup 45° angle with 30° elevation
    cue.aim.angle = Math.PI / 4 // 45° angle
    cue.elevation = Math.PI / 6 // 30° elevation
    cue.aim.power = 10
    
    // Hit the ball
    cue.hit(ball)
    
    const cosElev = Math.cos(Math.PI / 6) // ~0.866
    const sinElev = Math.sin(Math.PI / 6) // ~0.5
    
    // Expected components
    const expectedX = 10 * cosElev * Math.cos(Math.PI / 4) // ~6.12
    const expectedY = 10 * cosElev * Math.sin(Math.PI / 4) // ~6.12
    const expectedZ = 10 * sinElev // 5.0
    
    expect(ball.vel.x).toBeCloseTo(expectedX, 2)
    expect(ball.vel.y).toBeCloseTo(expectedY, 2)
    expect(ball.vel.z).toBeCloseTo(expectedZ, 2)
  })

  test('Coordinate system mapping should be consistent', () => {
    // Test that cue mesh direction maps correctly to game coordinates
    
    // Create a mock cue mesh with known orientation
    const testQuaternion = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4)
    cue.mesh.setRotationFromQuaternion(testQuaternion)
    
    cue.aim.angle = 0
    cue.elevation = 0
    cue.aim.power = 1
    
    cue.hit(ball)
    
    // With 45° rotation around Y axis, cue should point in XZ plane
    const cueDirection = new Vector3(0, 0, 1).applyQuaternion(testQuaternion)
    
    // Verify the mapping
    expect(ball.vel.x).toBeCloseTo(cueDirection.z, 2)
    expect(ball.vel.y).toBeCloseTo(cueDirection.x, 2)
    expect(ball.vel.z).toBeCloseTo(cueDirection.y, 2)
  })
})
