import { Ball, State } from "../../src/model/ball";
import { Table } from "../../src/model/table";
import { CAROM_PHYSICS, CAROM_TABLE_LENGTH, CAROM_TABLE_WIDTH } from "../../src/model/physics/constants";
import * as THREE from "three";

describe("High Elevation Trajectory Analysis (Three Cushion Mode)", () => {
  // Helper function to calculate expected velocity components
  function calculateExpectedVelocity(
    power: number,
    elevationDeg: number,
    aimAngleDeg: number
  ) {
    const maxSpeed = 8.0;
    const speed = power * maxSpeed;
    const elevationRad = (elevationDeg * Math.PI) / 180;
    const aimAngleRad = (aimAngleDeg * Math.PI) / 180;

    // Expected velocity components
    const horizontalSpeed = speed * Math.cos(elevationRad);
    const verticalSpeed = speed * Math.sin(elevationRad);

    return {
      vx: horizontalSpeed * Math.cos(aimAngleRad),
      vy: horizontalSpeed * Math.sin(aimAngleRad),
      vz: verticalSpeed,
      horizontalMagnitude: horizontalSpeed,
      verticalMagnitude: verticalSpeed,
    };
  }

  // Helper function to create a cue ball at table center with elevated velocity
  function createCueBallWithElevatedShot(
    elevationDeg: number,
    power: number,
    aimAngleDeg: number = 0
  ): Ball {
    // Create ball at table center with CAROM physics
    const pos = new THREE.Vector3(0, 0, CAROM_PHYSICS.R);
    const ball = new Ball(pos, 0xFFFFFF, CAROM_PHYSICS);

    // Calculate and set velocity
    const vel = calculateExpectedVelocity(power, elevationDeg, aimAngleDeg);
    ball.vel.x = vel.vx;
    ball.vel.y = vel.vy;
    ball.vel.z = vel.vz;

    // Set spin to zero initially
    ball.rvel.x = 0;
    ball.rvel.y = 0;
    ball.rvel.z = 0;

    // Set ball state to Sliding so physics will be applied
    ball.state = State.Sliding;

    return ball;
  }

  // Helper function to simulate and track ball motion
  function simulateAndTrack(ball: Ball, maxTime: number = 3.0) {
    const dt = 1 / 60;
    const table = new Table([ball], { usePockets: false });

    const trajectory: Array<{
      time: number;
      pos: { x: number; y: number; z: number };
      vel: { x: number; y: number; z: number };
      height: number;
    }> = [];

    let time = 0;
    let maxHeight = ball.pos.z;
    let stepsInAir = 0;
    let totalSteps = 0;

    // Initial state
    trajectory.push({
      time: 0,
      pos: { x: ball.pos.x, y: ball.pos.y, z: ball.pos.z },
      vel: { x: ball.vel.x, y: ball.vel.y, z: ball.vel.z },
      height: ball.pos.z,
    });

    while (time < maxTime && !table.allStationary()) {
      table.advance(dt);
      time += dt;
      totalSteps++;

      const currentHeight = ball.pos.z;
      if (currentHeight > ball.radius * 1.05) {
        stepsInAir++;
      }
      maxHeight = Math.max(maxHeight, currentHeight);

      // Record trajectory every 10 steps
      if (totalSteps % 10 === 0) {
        trajectory.push({
          time: time,
          pos: { x: ball.pos.x, y: ball.pos.y, z: ball.pos.z },
          vel: { x: ball.vel.x, y: ball.vel.y, z: ball.vel.z },
          height: currentHeight,
        });
      }
    }

    return {
      trajectory,
      maxHeight,
      stepsInAir,
      totalSteps,
      airTimeRatio: stepsInAir / totalSteps,
      finalPos: {
        x: ball.pos.x,
        y: ball.pos.y,
        z: ball.pos.z,
      },
    };
  }

  describe("10 Elevation Steps from 25° to 70°", () => {
    const elevations = [25, 30, 35, 40, 45, 50, 55, 60, 65, 70];
    const power = 0.8; // High power
    const aimAngle = 0; // Straight shot

    elevations.forEach((elevation) => {
      it(`should produce realistic trajectory at ${elevation}° elevation`, () => {
        // Calculate expected velocity
        const expected = calculateExpectedVelocity(power, elevation, aimAngle);

        console.log(`\n${"=".repeat(60)}`);
        console.log(`ELEVATION TEST: ${elevation}° with power ${power}`);
        console.log(`${"=".repeat(60)}`);
        console.log(`Expected velocity components:`);
        console.log(`  Horizontal: ${expected.horizontalMagnitude.toFixed(4)} m/s`);
        console.log(`  Vertical: ${expected.verticalMagnitude.toFixed(4)} m/s`);
        console.log(`  vx: ${expected.vx.toFixed(4)}, vy: ${expected.vy.toFixed(4)}, vz: ${expected.vz.toFixed(4)}`);

        // Create ball with elevated shot
        const cueBall = createCueBallWithElevatedShot(elevation, power, aimAngle);

        // Check initial velocity
        const actualVel = {
          vx: cueBall.vel.x,
          vy: cueBall.vel.y,
          vz: cueBall.vel.z,
        };
        const actualHorizontal = Math.sqrt(actualVel.vx ** 2 + actualVel.vy ** 2);
        const actualVertical = actualVel.vz;

        console.log(`\nActual velocity components after shot setup:`);
        console.log(`  Horizontal: ${actualHorizontal.toFixed(4)} m/s`);
        console.log(`  Vertical: ${actualVertical.toFixed(4)} m/s`);
        console.log(`  vx: ${actualVel.vx.toFixed(4)}, vy: ${actualVel.vy.toFixed(4)}, vz: ${actualVel.vz.toFixed(4)}`);

        // Verify shot direction
        const horizontalAngle = Math.atan2(actualVel.vy, actualVel.vx);
        const horizontalAngleDeg = (horizontalAngle * 180) / Math.PI;
        console.log(`\nShot direction (horizontal angle): ${horizontalAngleDeg.toFixed(2)}°`);
        console.log(`Expected aim angle: ${aimAngle}°`);

        // Check that shot direction matches aim (within tolerance)
        expect(Math.abs(horizontalAngleDeg - aimAngle)).toBeLessThan(1.0);

        // Simulate and track motion
        const result = simulateAndTrack(cueBall, 3.0);

        console.log(`\nTrajectory Analysis:`);
        console.log(`  Max height reached: ${(result.maxHeight - cueBall.radius).toFixed(4)} m`);
        console.log(`  Air time ratio: ${(result.airTimeRatio * 100).toFixed(1)}%`);
        console.log(`  Steps in air: ${result.stepsInAir} / ${result.totalSteps}`);
        console.log(`  Final position: x=${result.finalPos.x.toFixed(3)}, y=${result.finalPos.y.toFixed(3)}`);

        // Calculate theoretical maximum height using physics
        // h_max = (v_z^2) / (2 * g)
        const g = 9.8; // gravity
        const theoreticalMaxHeight = (expected.verticalMagnitude ** 2) / (2 * g);
        console.log(`\nTheoretical max height: ${theoreticalMaxHeight.toFixed(4)} m`);

        // Calculate realistic flight time: t = 2 * v_z / g
        const theoreticalFlightTime = (2 * expected.verticalMagnitude) / g;
        console.log(`Theoretical flight time: ${theoreticalFlightTime.toFixed(4)} s`);

        // Calculate horizontal distance traveled
        const horizontalDistance = Math.sqrt(
          (result.finalPos.x - 0) ** 2 + (result.finalPos.y - 0) ** 2
        );
        console.log(`Horizontal distance traveled: ${horizontalDistance.toFixed(3)} m`);

        // Theoretical horizontal distance: d = v_horizontal * flight_time
        const theoreticalDistance = expected.horizontalMagnitude * theoreticalFlightTime;
        console.log(`Theoretical horizontal distance: ${theoreticalDistance.toFixed(3)} m`);

        // Print first few trajectory points
        console.log(`\nFirst 5 trajectory points:`);
        result.trajectory.slice(0, 5).forEach((point, i) => {
          console.log(
            `  [${i}] t=${point.time.toFixed(3)}s: ` +
            `pos=(${point.pos.x.toFixed(3)}, ${point.pos.y.toFixed(3)}, ${point.pos.z.toFixed(3)}) ` +
            `vel=(${point.vel.x.toFixed(3)}, ${point.vel.y.toFixed(3)}, ${point.vel.z.toFixed(3)}) ` +
            `height=${(point.height - cueBall.radius).toFixed(4)}m`
          );
        });

        // Reality checks
        console.log(`\n${"=".repeat(60)}`);
        console.log(`REALITY CHECKS:`);
        console.log(`${"=".repeat(60)}`);

        // 1. Maximum height should be reasonable
        const maxHeightAboveTable = result.maxHeight - cueBall.radius;
        console.log(`1. Max height: ${maxHeightAboveTable.toFixed(4)} m`);
        if (maxHeightAboveTable > 1.0) {
          console.log(`   ⚠️  WARNING: Height exceeds 1m (unrealistic for billiards!)`);
        } else if (maxHeightAboveTable > 0.5) {
          console.log(`   ⚠️  WARNING: Height exceeds 0.5m (quite high)`);
        } else {
          console.log(`   ✓ Height seems reasonable`);
        }

        // 2. Ball should not float or move in circles
        const verticalVelocityChanges = [];
        for (let i = 1; i < result.trajectory.length; i++) {
          verticalVelocityChanges.push(
            result.trajectory[i].vel.z - result.trajectory[i - 1].vel.z
          );
        }

        if (verticalVelocityChanges.length > 0) {
          const avgVerticalAccel =
            verticalVelocityChanges.reduce((a, b) => a + b, 0) / verticalVelocityChanges.length / (1/60 * 10);
          console.log(`2. Average vertical acceleration: ${avgVerticalAccel.toFixed(2)} m/s²`);
          console.log(`   Expected (gravity): -9.8 m/s²`);
          if (Math.abs(avgVerticalAccel + 9.8) > 2.0) {
            console.log(`   ⚠️  WARNING: Vertical acceleration differs significantly from gravity`);
          } else {
            console.log(`   ✓ Vertical acceleration matches gravity`);
          }
        }

        // 3. Horizontal velocity should decrease due to rolling resistance
        const initialHorizontalVel = actualHorizontal;
        const finalHorizontalVel = Math.sqrt(
          cueBall.vel.x ** 2 + cueBall.vel.y ** 2
        );
        console.log(`3. Horizontal velocity: ${initialHorizontalVel.toFixed(3)} → ${finalHorizontalVel.toFixed(3)} m/s`);
        if (finalHorizontalVel > initialHorizontalVel * 0.8) {
          console.log(`   ⚠️  WARNING: Horizontal velocity didn't decrease much (low friction?)`);
        } else {
          console.log(`   ✓ Horizontal velocity decreased as expected`);
        }

        // 4. Check for circular motion (unrealistic)
        if (result.trajectory.length > 20) {
          const midPoint = Math.floor(result.trajectory.length / 2);
          const earlyPoints = result.trajectory.slice(5, 10);
          const latePoints = result.trajectory.slice(midPoint, midPoint + 5);

          if (earlyPoints.length > 0 && latePoints.length > 0) {
            const earlyAvgHeight = earlyPoints.reduce((sum, p) => sum + p.height, 0) / earlyPoints.length;
            const lateAvgHeight = latePoints.reduce((sum, p) => sum + p.height, 0) / latePoints.length;

            console.log(`4. Height comparison: early=${earlyAvgHeight.toFixed(4)}m, late=${lateAvgHeight.toFixed(4)}m`);
            if (lateAvgHeight > earlyAvgHeight && lateAvgHeight > cueBall.radius * 1.5) {
              console.log(`   ⚠️  WARNING: Ball appears to be gaining height (unrealistic circular motion?)`);
            } else {
              console.log(`   ✓ No signs of circular floating motion`);
            }
          }
        }

        console.log(`${"=".repeat(60)}\n`);

        // Assertions
        expect(result.maxHeight).toBeGreaterThan(cueBall.radius); // Ball should leave table
        expect(maxHeightAboveTable).toBeLessThan(1.0); // But not too high (unrealistic)

        // At high elevations, should spend significant time in air
        if (elevation >= 45) {
          expect(result.airTimeRatio).toBeGreaterThan(0.05);
        }
      });
    });
  });

  describe("Realistic Physics Validation", () => {
    it("should apply consistent gravity throughout flight", () => {
      const cueBall = createCueBallWithElevatedShot(45, 0.8, 0);

      const dt = 1 / 60;
      const velocityHistory: number[] = [];
      const accelerationHistory: number[] = [];

      const table = new Table([cueBall], { usePockets: false });

      // Track vertical velocity and acceleration
      for (let i = 0; i < 120; i++) {
        velocityHistory.push(cueBall.vel.z);
        table.advance(dt);

        if (i > 0) {
          const accel = (cueBall.vel.z - velocityHistory[i]) / dt;
          accelerationHistory.push(accel);
        }
      }

      console.log(`\n${"=".repeat(60)}`);
      console.log(`GRAVITY CONSISTENCY TEST`);
      console.log(`${"=".repeat(60)}`);

      // Calculate average acceleration when ball is in air
      const airAccelerations = accelerationHistory.filter((_, i) => {
        return cueBall.pos.z > cueBall.radius * 1.05; // In air
      });

      if (airAccelerations.length > 0) {
        const avgAccel = airAccelerations.reduce((a, b) => a + b, 0) / airAccelerations.length;
        console.log(`Average vertical acceleration in air: ${avgAccel.toFixed(2)} m/s²`);
        console.log(`Expected (gravity): -9.8 m/s²`);
        console.log(`Difference: ${Math.abs(avgAccel + 9.8).toFixed(2)} m/s²`);

        // Gravity should be consistent and close to -9.8 m/s²
        expect(Math.abs(avgAccel + 9.8)).toBeLessThan(2.0);
      }
    });

    it("should not exhibit circular floating motion at high elevation/power", () => {
      const cueBall = createCueBallWithElevatedShot(60, 0.9, 0);

      const dt = 1 / 60;
      const positions: Array<{ x: number; y: number; z: number; t: number }> = [];

      const table = new Table([cueBall], { usePockets: false });

      // Track position for 2 seconds
      for (let i = 0; i < 120; i++) {
        positions.push({
          x: cueBall.pos.x,
          y: cueBall.pos.y,
          z: cueBall.pos.z,
          t: i * dt,
        });
        table.advance(dt);
      }

      console.log(`\n${"=".repeat(60)}`);
      console.log(`CIRCULAR MOTION CHECK`);
      console.log(`${"=".repeat(60)}`);

      // Check if ball returns to similar height multiple times (indication of circular motion)
      let heightPeaks = 0;
      let isRising = false;

      for (let i = 1; i < positions.length; i++) {
        const prevHeight = positions[i - 1].z;
        const currHeight = positions[i].z;

        if (currHeight > prevHeight && !isRising) {
          isRising = true;
        } else if (currHeight < prevHeight && isRising) {
          heightPeaks++;
          isRising = false;
          console.log(`Peak ${heightPeaks} at t=${positions[i-1].t.toFixed(3)}s, height=${(positions[i-1].z - cueBall.radius).toFixed(4)}m`);
        }
      }

      console.log(`Total height peaks detected: ${heightPeaks}`);

      // Should have at most 2 peaks (going up then down, potentially one bounce)
      // If more than 3 peaks, it's exhibiting unrealistic circular motion
      expect(heightPeaks).toBeLessThanOrEqual(3);

      // Check horizontal progress
      const initialX = positions[0].x;
      const finalX = positions[positions.length - 1].x;
      const horizontalProgress = Math.abs(finalX - initialX);

      console.log(`Horizontal progress: ${horizontalProgress.toFixed(3)} m`);

      // Ball should make reasonable horizontal progress
      expect(horizontalProgress).toBeGreaterThan(0.1);
    });
  });
});
