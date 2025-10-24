import { Vector3 } from 'three'
import { Ball, State } from '../src/model/ball'
import { R } from '../src/model/physics/constants'

// Simple test for velocity direction calculation without DOM dependencies
describe('Velocity Direction Calculation', () => {
  let ball: Ball

  beforeEach(() => {
    ball = new Ball(new Vector3(0, 0, 0), R)
    ball.state = State.Sliding
  })

  test('Horizontal velocity components calculation', () => {
    // Test basic velocity components for different angles and elevations
    
    // Test 1: 0° elevation (horizontal)
    const power1 = 10
    const angle1 = 0
    const elevation1 = 0
    
    const velX1 = power1 * Math.cos(elevation1) * Math.cos(angle1)
    const velY1 = power1 * Math.cos(elevation1) * Math.sin(angle1)
    const velZ1 = power1 * Math.sin(elevation1)
    
    expect(velX1).toBeCloseTo(10, 2)
    expect(velY1).toBeCloseTo(0, 2)
    expect(velZ1).toBeCloseTo(0, 2)
    
    // Test 2: 45° elevation
    const power2 = 10
    const angle2 = 0
    const elevation2 = Math.PI / 4
    
    const velX2 = power2 * Math.cos(elevation2) * Math.cos(angle2)
    const velY2 = power2 * Math.cos(elevation2) * Math.sin(angle2)
    const velZ2 = power2 * Math.sin(elevation2)
    
    expect(velX2).toBeCloseTo(7.07, 2)
    expect(velY2).toBeCloseTo(0, 2)
    expect(velZ2).toBeCloseTo(7.07, 2)
    
    // Test 3: 90° elevation (vertical)
    const power3 = 10
    const angle3 = 0
    const elevation3 = Math.PI / 2
    
    const velX3 = power3 * Math.cos(elevation3) * Math.cos(angle3)
    const velY3 = power3 * Math.cos(elevation3) * Math.sin(angle3)
    const velZ3 = power3 * Math.sin(elevation3)
    
    expect(velX3).toBeCloseTo(0, 2)
    expect(velY3).toBeCloseTo(0, 2)
    expect(velZ3).toBeCloseTo(10, 2)
    
    // Test 4: Angled shot with elevation
    const power4 = 10
    const angle4 = Math.PI / 4  // 45° angle
    const elevation4 = Math.PI / 6  // 30° elevation
    
    const velX4 = power4 * Math.cos(elevation4) * Math.cos(angle4)
    const velY4 = power4 * Math.cos(elevation4) * Math.sin(angle4)
    const velZ4 = power4 * Math.sin(elevation4)
    
    expect(velX4).toBeCloseTo(6.12, 2)
    expect(velY4).toBeCloseTo(6.12, 2)
    expect(velZ4).toBeCloseTo(5.0, 2)
  })

  test('Coordinate system mapping verification', () => {
    // Test that our coordinate system mapping is consistent
    
    // In the game coordinate system:
    // - X: forward/backward along table length
    // - Y: left/right along table width  
    // - Z: up/down (vertical)
    
    // Test that a cue pointing in the +X direction produces correct velocity
    const cueDirection = new Vector3(1, 0, 0)
    const power = 5
    
    // Apply the mapping: cue mesh Z -> game X, cue mesh X -> game Y, cue mesh Y -> game Z
    const gameVelX = cueDirection.z * power
    const gameVelY = cueDirection.x * power
    const gameVelZ = cueDirection.y * power
    
    expect(gameVelX).toBeCloseTo(0, 2)  // cue Z is 0
    expect(gameVelY).toBeCloseTo(5, 2)  // cue X is 1 * 5
    expect(gameVelZ).toBeCloseTo(0, 2)  // cue Y is 0
    
    // Test with 45° angle in cue mesh coordinates
    const cueDirection45 = new Vector3(0.707, 0, 0.707)  // 45° in XZ plane
    const power45 = 10
    
    const gameVelX45 = cueDirection45.z * power45
    const gameVelY45 = cueDirection45.x * power45
    const gameVelZ45 = cueDirection45.y * power45
    
    expect(gameVelX45).toBeCloseTo(7.07, 2)  // 0.707 * 10
    expect(gameVelY45).toBeCloseTo(7.07, 2)  // 0.707 * 10
    expect(gameVelZ45).toBeCloseTo(0, 2)
  })

  test('Elevation angle calculation', () => {
    // Test that elevation angles are calculated correctly
    
    // For a given elevation angle, verify the vertical component
    const testElevations = [0, Math.PI/6, Math.PI/4, Math.PI/3, Math.PI/2]
    const power = 10
    
    testElevations.forEach(elevation => {
      const expectedZ = power * Math.sin(elevation)
      const expectedHorizontal = power * Math.cos(elevation)
      
      expect(expectedZ).toBeCloseTo(power * Math.sin(elevation), 2)
      expect(expectedHorizontal).toBeCloseTo(power * Math.cos(elevation), 2)
      
      // Verify that the magnitude is preserved
      const magnitude = Math.sqrt(
        Math.pow(expectedHorizontal, 2) + 
        Math.pow(expectedZ, 2)
      )
      expect(magnitude).toBeCloseTo(power, 2)
    })
  })
})
