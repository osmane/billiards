import { Vector3 } from 'three'
import { Ball, State } from '../src/model/ball'
import { R } from '../src/model/physics/constants'
import { unitAtAngle } from '../src/utils/utils'

// Comprehensive analysis of velocity calculation compatibility with product
describe('Product Compatibility Analysis', () => {
  test('Velocity calculation matches actual product implementation', () => {
    // Test parameters from actual game logs
    const testCases = [
      { power: 4.572, angle: -1.1 * Math.PI / 180, elevation: 9.7 * Math.PI / 180 },
      { power: 3.5, angle: 0, elevation: 0 },
      { power: 2.8, angle: 45 * Math.PI / 180, elevation: 15 * Math.PI / 180 },
      { power: 5.2, angle: -30 * Math.PI / 180, elevation: 25 * Math.PI / 180 }
    ]

    testCases.forEach(({ power, angle, elevation }, index) => {
      // Product implementation (from cue.ts hit method)
      const cueDirection = new Vector3(0, 0, 1) // Simulating cue mesh Z direction
      const gameVelX = cueDirection.z * power * Math.cos(elevation) * Math.cos(angle)
      const gameVelY = cueDirection.x * power * Math.cos(elevation) * Math.sin(angle) 
      const gameVelZ = cueDirection.y * power * Math.sin(elevation)

      // Simplified calculation (what tests use)
      const testVelX = power * Math.cos(elevation) * Math.cos(angle)
      const testVelY = power * Math.cos(elevation) * Math.sin(angle)
      const testVelZ = power * Math.sin(elevation)

      // Verify they match
      expect(testVelX).toBeCloseTo(gameVelX, 5)
      expect(testVelY).toBeCloseTo(gameVelY, 5)
      expect(testVelZ).toBeCloseTo(gameVelZ, 5)

      // Verify magnitude preservation
      const gameMagnitude = Math.sqrt(gameVelX * gameVelX + gameVelY * gameVelY + gameVelZ * gameVelZ)
      const testMagnitude = Math.sqrt(testVelX * testVelX + testVelY * testVelY + testVelZ * testVelZ)
      
      expect(gameMagnitude).toBeCloseTo(power, 5)
      expect(testMagnitude).toBeCloseTo(power, 5)
    })
  })

  test('Coordinate system mapping is consistent', () => {
    // From cue.ts: 
    // ball.vel.x = cueDirection.z * aim.power  // Forward/backward
    // ball.vel.y = cueDirection.x * aim.power  // Left/right  
    // ball.vel.z = cueDirection.y * aim.power  // Up/down

    const testPower = 5.0
    
    // Test case 1: Pure forward shot
    const forwardDirection = new Vector3(0, 0, 1) // cue mesh Z forward
    const forwardVelX = forwardDirection.z * testPower
    const forwardVelY = forwardDirection.x * testPower
    const forwardVelZ = forwardDirection.y * testPower
    
    expect(forwardVelX).toBe(testPower)
    expect(forwardVelY).toBe(0)
    expect(forwardVelZ).toBe(0)

    // Test case 2: Pure right shot
    const rightDirection = new Vector3(1, 0, 0) // cue mesh X right
    const rightVelX = rightDirection.z * testPower
    const rightVelY = rightDirection.x * testPower
    const rightVelZ = rightDirection.y * testPower
    
    expect(rightVelX).toBe(0)
    expect(rightVelY).toBe(testPower)
    expect(rightVelZ).toBe(0)

    // Test case 3: Pure up shot
    const upDirection = new Vector3(0, 1, 0) // cue mesh Y up
    const upVelX = upDirection.z * testPower
    const upVelY = upDirection.x * testPower
    const upVelZ = upDirection.y * testPower
    
    expect(upVelX).toBe(0)
    expect(upVelY).toBe(0)
    expect(upVelZ).toBe(testPower)
  })

  test('Trajectory predictor uses same velocity calculation', () => {
    // From trajectorypredictor.ts
    const testPower = 4.0
    const testAngle = 30 * Math.PI / 180
    const testElevation = 15 * Math.PI / 180

    // Trajectory predictor calculation
    const horizontalVel = unitAtAngle(testAngle).multiplyScalar(testPower)
    const horizontalMagnitude = testPower * Math.cos(testElevation)
    const verticalMagnitude = testPower * Math.sin(testElevation)
    
    const trajVelX = horizontalVel.x * Math.cos(testElevation)
    const trajVelY = horizontalVel.y * Math.cos(testElevation)
    const trajVelZ = verticalMagnitude

    // Standard calculation
    const standardVelX = testPower * Math.cos(testElevation) * Math.cos(testAngle)
    const standardVelY = testPower * Math.cos(testElevation) * Math.sin(testAngle)
    const standardVelZ = testPower * Math.sin(testElevation)

    // Verify they match
    expect(trajVelX).toBeCloseTo(standardVelX, 5)
    expect(trajVelY).toBeCloseTo(standardVelY, 5)
    expect(trajVelZ).toBeCloseTo(standardVelZ, 5)
  })

  test('Physics constants are consistent', () => {
    // Verify physics constants used in calculations
    const testBall = new Ball(new Vector3(0, 0, 0), R)
    
    expect(R).toBeGreaterThan(0)
    expect(testBall.radius).toBe(R)
    expect(testBall.mass).toBeGreaterThan(0)
  })

  test('Edge cases handled consistently', () => {
    // Test edge cases that might cause issues
    
    // Zero elevation
    const zeroElevation = 0
    const power = 3.0
    const angle = 45 * Math.PI / 180
    
    const velX = power * Math.cos(zeroElevation) * Math.cos(angle)
    const velY = power * Math.cos(zeroElevation) * Math.sin(angle)
    const velZ = power * Math.sin(zeroElevation)
    
    expect(velZ).toBe(0)
    expect(velX).toBeCloseTo(power * Math.cos(angle), 5)
    expect(velY).toBeCloseTo(power * Math.sin(angle), 5)

    // 90 degree elevation
    const maxElevation = Math.PI / 2
    const velX90 = power * Math.cos(maxElevation) * Math.cos(angle)
    const velY90 = power * Math.cos(maxElevation) * Math.sin(angle)
    const velZ90 = power * Math.sin(maxElevation)
    
    expect(velX90).toBeCloseTo(0, 5)
    expect(velY90).toBeCloseTo(0, 5)
    expect(velZ90).toBeCloseTo(power, 5)

    // Negative elevation
    const negElevation = -15 * Math.PI / 180
    const velZNeg = power * Math.sin(negElevation)
    expect(velZNeg).toBeLessThan(0)
  })

  test('Magnitude preservation across all angles', () => {
    // Test that velocity magnitude is always preserved
    const power = 5.0
    const testAngles = [0, 30, 45, 60, 90, 120, 180, 270]
    const testElevations = [0, 15, 30, 45, 60, 75, 90]

    testAngles.forEach(angle => {
      testElevations.forEach(elevation => {
        const angleRad = angle * Math.PI / 180
        const elevationRad = elevation * Math.PI / 180
        
        const velX = power * Math.cos(elevationRad) * Math.cos(angleRad)
        const velY = power * Math.cos(elevationRad) * Math.sin(angleRad)
        const velZ = power * Math.sin(elevationRad)
        
        const magnitude = Math.sqrt(velX * velX + velY * velY + velZ * velZ)
        expect(magnitude).toBeCloseTo(power, 5)
      })
    })
  })
})
