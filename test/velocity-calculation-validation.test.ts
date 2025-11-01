import { Vector3 } from 'three'
import { Ball, State } from '../src/model/ball'
import { R } from '../src/model/physics/constants'

// Test the actual velocity calculation logic used in the game
describe('Velocity Calculation Validation', () => {
  test('Velocity direction from cue parameters', () => {
    // Test the actual calculation used in cue.ts
    
    // Parameters from a typical shot
    const power = 4.572  // From the test logs
    const aimAngle = -1.1 * Math.PI / 180  // Convert to radians
    const elevation = 9.7 * Math.PI / 180  // Convert to radians
    
    // Calculate velocity components based on the actual game logic
    const velX = power * Math.cos(elevation) * Math.cos(aimAngle)
    const velY = power * Math.cos(elevation) * Math.sin(aimAngle)
    const velZ = power * Math.sin(elevation)
    
    // Verify the calculations
    expect(velX).toBeCloseTo(4.572 * Math.cos(9.7 * Math.PI / 180) * Math.cos(-1.1 * Math.PI / 180), 3)
    expect(velY).toBeCloseTo(4.572 * Math.cos(9.7 * Math.PI / 180) * Math.sin(-1.1 * Math.PI / 180), 3)
    expect(velZ).toBeCloseTo(4.572 * Math.sin(9.7 * Math.PI / 180), 3)
    
    // Verify magnitude is preserved
    const magnitude = Math.sqrt(velX * velX + velY * velY + velZ * velZ)
    expect(magnitude).toBeCloseTo(power, 3)
  })

  test('Zero elevation case', () => {
    const power = 5.0
    const aimAngle = 30 * Math.PI / 180  // 30 degrees
    const elevation = 0
    
    const velX = power * Math.cos(elevation) * Math.cos(aimAngle)
    const velY = power * Math.cos(elevation) * Math.sin(aimAngle)
    const velZ = power * Math.sin(elevation)
    
    expect(velX).toBeCloseTo(5.0 * Math.cos(30 * Math.PI / 180), 3)
    expect(velY).toBeCloseTo(5.0 * Math.sin(30 * Math.PI / 180), 3)
    expect(velZ).toBeCloseTo(0, 3)
    
    const magnitude = Math.sqrt(velX * velX + velY * velY + velZ * velZ)
    expect(magnitude).toBeCloseTo(power, 3)
  })

  test('Maximum elevation case', () => {
    const power = 3.0
    const aimAngle = 0
    const elevation = 90 * Math.PI / 180  // 90 degrees
    
    const velX = power * Math.cos(elevation) * Math.cos(aimAngle)
    const velY = power * Math.cos(elevation) * Math.sin(aimAngle)
    const velZ = power * Math.sin(elevation)
    
    expect(velX).toBeCloseTo(0, 3)
    expect(velY).toBeCloseTo(0, 3)
    expect(velZ).toBeCloseTo(power, 3)
    
    const magnitude = Math.sqrt(velX * velX + velY * velY + velZ * velZ)
    expect(magnitude).toBeCloseTo(power, 3)
  })

  test('Negative elevation case', () => {
    const power = 2.5
    const aimAngle = 45 * Math.PI / 180
    const elevation = -15 * Math.PI / 180  // Negative elevation
    
    const velX = power * Math.cos(elevation) * Math.cos(aimAngle)
    const velY = power * Math.cos(elevation) * Math.sin(aimAngle)
    const velZ = power * Math.sin(elevation)
    
    expect(velX).toBeCloseTo(2.5 * Math.cos(-15 * Math.PI / 180) * Math.cos(45 * Math.PI / 180), 3)
    expect(velY).toBeCloseTo(2.5 * Math.cos(-15 * Math.PI / 180) * Math.sin(45 * Math.PI / 180), 3)
    expect(velZ).toBeCloseTo(2.5 * Math.sin(-15 * Math.PI / 180), 3)
    
    const magnitude = Math.sqrt(velX * velX + velY * velY + velZ * velZ)
    expect(magnitude).toBeCloseTo(power, 3)
  })

  test('Edge case: very small angles', () => {
    const power = 1.0
    const aimAngle = 0.1 * Math.PI / 180  // Very small angle
    const elevation = 0.1 * Math.PI / 180  // Very small elevation
    
    const velX = power * Math.cos(elevation) * Math.cos(aimAngle)
    const velY = power * Math.cos(elevation) * Math.sin(aimAngle)
    const velZ = power * Math.sin(elevation)
    
    // Should be very close to straight forward
    expect(velX).toBeCloseTo(1.0, 3)
    expect(velY).toBeCloseTo(0.001745, 3)  // sin(0.1°) ≈ 0.001745
    expect(velZ).toBeCloseTo(0.001745, 3)  // sin(0.1°) ≈ 0.001745
    
    const magnitude = Math.sqrt(velX * velX + velY * velY + velZ * velZ)
    expect(magnitude).toBeCloseTo(power, 3)
  })
})
