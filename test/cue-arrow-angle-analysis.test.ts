import { Vector3 } from 'three'
import { unitAtAngle, upCross } from '../src/utils/utils'

// Analysis of angle difference between cue stick and velocity direction
describe('Cue Stick vs Velocity Arrow Angle Analysis', () => {
  test('Angle difference calculation for various elevations', () => {
    const testCases = [
      { elevation: 0, expectedAngleDiff: 0 },
      { elevation: 15 * Math.PI / 180, expectedAngleDiff: 15 },
      { elevation: 30 * Math.PI / 180, expectedAngleDiff: 30 },
      { elevation: 45 * Math.PI / 180, expectedAngleDiff: 45 },
      { elevation: 60 * Math.PI / 180, expectedAngleDiff: 60 },
      { elevation: 75 * Math.PI / 180, expectedAngleDiff: 75 },
      { elevation: 90 * Math.PI / 180, expectedAngleDiff: 90 }
    ]

    testCases.forEach(({ elevation, expectedAngleDiff }) => {
      const aimAngle = 0 // Straight forward for simplicity
      const power = 5.0
      
      // Cue stick direction (from cue.ts)
      const cueDirection = unitAtAngle(aimAngle + Math.PI)
      const cueDirection3D = new Vector3(
        cueDirection.x * Math.cos(elevation),
        cueDirection.y * Math.cos(elevation),
        Math.sin(elevation)
      ).normalize()

      // Velocity direction (black arrow)
      const velocityDirection = new Vector3(
        Math.cos(elevation) * Math.cos(aimAngle),
        Math.cos(elevation) * Math.sin(aimAngle),
        Math.sin(elevation)
      ).normalize()

      // Calculate angle difference
      const dotProduct = cueDirection3D.dot(velocityDirection)
      const angleDiff = Math.acos(Math.max(-1, Math.min(1, dotProduct))) * (180 / Math.PI)

      console.log(`Elevation: ${(elevation * 180 / Math.PI).toFixed(1)}°`)
      console.log(`Cue Direction: (${cueDirection3D.x.toFixed(3)}, ${cueDirection3D.y.toFixed(3)}, ${cueDirection3D.z.toFixed(3)})`)
      console.log(`Velocity Direction: (${velocityDirection.x.toFixed(3)}, ${velocityDirection.y.toFixed(3)}, ${velocityDirection.z.toFixed(3)})`)
      console.log(`Angle Difference: ${angleDiff.toFixed(2)}°`)
      console.log('---')

      // For straight shots, they should be identical
      expect(angleDiff).toBeCloseTo(expectedAngleDiff, 1)
    })
  })

  test('Angle difference with horizontal aim variations', () => {
    const elevation = 30 * Math.PI / 180
    const testAngles = [0, 15, 30, 45, 60, 90, 135, 180, 270]

    testAngles.forEach(angle => {
      const angleRad = angle * Math.PI / 180
      
      // Cue stick direction
      const cueDirection = unitAtAngle(angleRad + Math.PI)
      const cueDirection3D = new Vector3(
        cueDirection.x * Math.cos(elevation),
        cueDirection.y * Math.cos(elevation),
        Math.sin(elevation)
      ).normalize()

      // Velocity direction
      const velocityDirection = new Vector3(
        Math.cos(elevation) * Math.cos(angleRad),
        Math.cos(elevation) * Math.sin(angleRad),
        Math.sin(elevation)
      ).normalize()

      // Calculate angle difference
      const dotProduct = cueDirection3D.dot(velocityDirection)
      const angleDiff = Math.acos(Math.max(-1, Math.min(1, dotProduct))) * (180 / Math.PI)

      console.log(`Aim Angle: ${angle}°`)
      console.log(`Angle Difference: ${angleDiff.toFixed(2)}°`)
      
      // Should be very close to 0 for all angles
      expect(angleDiff).toBeCloseTo(0, 1)
    })
  })

  test('Real game scenario analysis', () => {
    // Based on actual game parameters from logs
    const elevation = 9.7 * Math.PI / 180
    const aimAngle = -1.1 * Math.PI / 180
    const power = 4.572

    // Cue stick direction (from cue.ts debug logs)
    const cueDirection = unitAtAngle(aimAngle + Math.PI)
    const cueDirection3D = new Vector3(
      cueDirection.x * Math.cos(elevation),
      cueDirection.y * Math.cos(elevation),
      Math.sin(elevation)
    ).normalize()

    // Velocity direction (black arrow)
    const velocityDirection = new Vector3(
      Math.cos(elevation) * Math.cos(aimAngle),
      Math.cos(elevation) * Math.sin(aimAngle),
      Math.sin(elevation)
    ).normalize()

    // Calculate angle difference
    const dotProduct = cueDirection3D.dot(velocityDirection)
    const angleDiff = Math.acos(Math.max(-1, Math.min(1, dotProduct))) * (180 / Math.PI)

    console.log('Real Game Scenario:')
    console.log(`Elevation: ${(elevation * 180 / Math.PI).toFixed(1)}°`)
    console.log(`Aim Angle: ${(aimAngle * 180 / Math.PI).toFixed(1)}°`)
    console.log(`Power: ${power}`)
    console.log(`Cue Direction: (${cueDirection3D.x.toFixed(4)}, ${cueDirection3D.y.toFixed(4)}, ${cueDirection3D.z.toFixed(4)})`)
    console.log(`Velocity Direction: (${velocityDirection.x.toFixed(4)}, ${velocityDirection.y.toFixed(4)}, ${velocityDirection.z.toFixed(4)})`)
    console.log(`Angle Difference: ${angleDiff.toFixed(3)}°`)

    // In the actual implementation, these should be identical
    expect(angleDiff).toBeLessThan(0.001)
  })

  test('Coordinate system verification', () => {
    // Verify the coordinate system mapping from cue.ts
    const elevation = 25 * Math.PI / 180
    const aimAngle = 45 * Math.PI / 180

    // From cue.ts: 
    // ball.vel.x = cueDirection.z * aim.power
    // ball.vel.y = cueDirection.x * aim.power  
    // ball.vel.z = cueDirection.y * aim.power

    const cueDirection = unitAtAngle(aimAngle + Math.PI)
    const cueDirection3D = new Vector3(
      cueDirection.x * Math.cos(elevation),
      cueDirection.y * Math.cos(elevation),
      Math.sin(elevation)
    )

    // Standard velocity calculation
    const velocity = new Vector3(
      Math.cos(elevation) * Math.cos(aimAngle),
      Math.cos(elevation) * Math.sin(aimAngle),
      Math.sin(elevation)
    )

    // The difference should be exactly 0 when properly aligned
    const difference = cueDirection3D.clone().sub(velocity)
    const magnitude = difference.length()

    expect(magnitude).toBeLessThan(0.0001)
  })
})
