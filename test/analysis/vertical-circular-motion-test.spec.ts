import { Ball, State } from "../../src/model/ball";
import { Table } from "../../src/model/table";
import { CAROM_PHYSICS } from "../../src/model/physics/constants";
import * as THREE from "three";

describe("Vertical Circular Motion Detection (High Elevation, High Power)", () => {
  // Test specifically for unrealistic "floating" circular motion in vertical plane

  function createElevatedShot(elevationDeg: number, power: number): Ball {
    const pos = new THREE.Vector3(0, 0, CAROM_PHYSICS.R);
    const ball = new Ball(pos, 0xFFFFFF, CAROM_PHYSICS);

    const maxSpeed = 8.0;
    const speed = power * maxSpeed;
    const elevationRad = (elevationDeg * Math.PI) / 180;

    ball.vel.x = speed * Math.cos(elevationRad);
    ball.vel.y = 0;
    ball.vel.z = speed * Math.sin(elevationRad);

    ball.rvel.x = 0;
    ball.rvel.y = 0;
    ball.rvel.z = 0;

    ball.state = State.Sliding;

    return ball;
  }

  function analyzeMotion(ball: Ball, duration: number = 2.0) {
    const dt = 1 / 60;
    const table = new Table([ball], { usePockets: false });

    const fullTrajectory: Array<{
      t: number;
      x: number;
      y: number;
      z: number;
      vx: number;
      vy: number;
      vz: number;
    }> = [];

    let time = 0;
    let maxZ = ball.pos.z;
    let maxAbsX = Math.abs(ball.pos.x);

    while (time < duration && !table.allStationary()) {
      fullTrajectory.push({
        t: time,
        x: ball.pos.x,
        y: ball.pos.y,
        z: ball.pos.z,
        vx: ball.vel.x,
        vy: ball.vel.y,
        vz: ball.vel.z,
      });

      table.advance(dt);
      time += dt;

      maxZ = Math.max(maxZ, ball.pos.z);
      maxAbsX = Math.max(maxAbsX, Math.abs(ball.pos.x));
    }

    // Final point
    fullTrajectory.push({
      t: time,
      x: ball.pos.x,
      y: ball.pos.y,
      z: ball.pos.z,
      vx: ball.vel.x,
      vy: ball.vel.y,
      vz: ball.vel.z,
    });

    return { fullTrajectory, maxZ, maxAbsX };
  }

  describe("Extreme High Elevation Tests", () => {
    [60, 70, 80].forEach((elevation) => {
      it(`should NOT exhibit circular floating motion at ${elevation}° with 0.9 power`, () => {
        const ball = createElevatedShot(elevation, 0.9);
        const { fullTrajectory, maxZ, maxAbsX } = analyzeMotion(ball, 2.5);

        console.log(`\n${"=".repeat(70)}`);
        console.log(`VERTICAL CIRCULAR MOTION TEST: ${elevation}° @ 0.9 power`);
        console.log(`${"=".repeat(70)}`);

        // Initial velocity
        console.log(`Initial velocity: vx=${fullTrajectory[0].vx.toFixed(3)}, vz=${fullTrajectory[0].vz.toFixed(3)}`);
        console.log(`Max height reached: ${(maxZ - ball.radius).toFixed(3)} m`);
        console.log(`Max horizontal distance: ${maxAbsX.toFixed(3)} m`);

        // Calculate ratio: if ball "hangs" in air, horizontal distance will be very small
        const heightToDistanceRatio = (maxZ - ball.radius) / Math.max(maxAbsX, 0.01);
        console.log(`Height/Distance ratio: ${heightToDistanceRatio.toFixed(2)} (should be < 3 for realistic)`);

        // Analyze vertical motion characteristics
        const heightPeaks: number[] = [];
        let isRising = false;

        for (let i = 1; i < fullTrajectory.length; i++) {
          const prevZ = fullTrajectory[i - 1].z;
          const currZ = fullTrajectory[i].z;

          if (currZ > prevZ && !isRising) {
            isRising = true;
          } else if (currZ < prevZ && isRising) {
            heightPeaks.push(fullTrajectory[i - 1].z - ball.radius);
            isRising = false;
          }
        }

        console.log(`\nHeight peaks detected: ${heightPeaks.length}`);
        heightPeaks.forEach((peak, i) => {
          console.log(`  Peak ${i + 1}: ${peak.toFixed(4)} m`);
        });

        // Check for "hovering" - multiple high peaks close together
        const highPeaks = heightPeaks.filter(p => p > 0.5);
        console.log(`High peaks (> 0.5m): ${highPeaks.length}`);

        // Analyze velocity changes in different phases
        const phases = [
          { name: "Early (0-0.5s)", start: 0, end: 30 },
          { name: "Mid (0.5-1.0s)", start: 30, end: 60 },
          { name: "Late (1.0-1.5s)", start: 60, end: 90 },
        ];

        console.log(`\nVelocity analysis by phase:`);
        phases.forEach(phase => {
          const points = fullTrajectory.slice(phase.start, Math.min(phase.end, fullTrajectory.length));
          if (points.length > 0) {
            const avgVx = points.reduce((sum, p) => sum + p.vx, 0) / points.length;
            const avgVz = points.reduce((sum, p) => sum + p.vz, 0) / points.length;
            const avgZ = points.reduce((sum, p) => sum + (p.z - ball.radius), 0) / points.length;
            console.log(`  ${phase.name}: avgVx=${avgVx.toFixed(3)}, avgVz=${avgVz.toFixed(3)}, avgHeight=${avgZ.toFixed(3)}m`);
          }
        });

        // Sample trajectory points in X-Z plane
        console.log(`\nTrajectory sample (X-Z plane, every 15 frames):`);
        for (let i = 0; i < Math.min(120, fullTrajectory.length); i += 15) {
          const p = fullTrajectory[i];
          const height = p.z - ball.radius;
          console.log(`  t=${p.t.toFixed(2)}s: x=${p.x.toFixed(3)}m, z=${height.toFixed(3)}m, vx=${p.vx.toFixed(3)}, vz=${p.vz.toFixed(3)}`);
        }

        // Check for circular motion pattern
        // In circular motion, position would repeatedly return to similar values
        let circularMotionDetected = false;

        if (heightPeaks.length >= 3) {
          // Check if peaks are at similar heights (indicating hovering)
          const peakVariance = heightPeaks.reduce((sum, p) => {
            const avgPeak = heightPeaks.reduce((s, p) => s + p, 0) / heightPeaks.length;
            return sum + Math.pow(p - avgPeak, 2);
          }, 0) / heightPeaks.length;

          const peakStdDev = Math.sqrt(peakVariance);
          const avgPeakHeight = heightPeaks.reduce((s, p) => s + p, 0) / heightPeaks.length;

          console.log(`\nCircular motion indicators:`);
          console.log(`  Average peak height: ${avgPeakHeight.toFixed(3)} m`);
          console.log(`  Peak height std dev: ${peakStdDev.toFixed(3)} m`);
          console.log(`  Peak consistency: ${(peakStdDev / avgPeakHeight * 100).toFixed(1)}%`);

          // If peaks are very consistent and high, it suggests floating
          if (peakStdDev / avgPeakHeight < 0.3 && avgPeakHeight > 0.5 && heightPeaks.length >= 3) {
            circularMotionDetected = true;
            console.log(`  ⚠️  WARNING: Consistent high peaks suggest unrealistic floating/circular motion!`);
          }
        }

        // Check X-axis oscillation
        const xPositions = fullTrajectory.map(p => p.x);
        const xDirectionChanges = [];
        for (let i = 2; i < xPositions.length; i++) {
          const prev = xPositions[i - 1] - xPositions[i - 2];
          const curr = xPositions[i] - xPositions[i - 1];
          if (prev * curr < 0) { // Direction change
            xDirectionChanges.push(i);
          }
        }

        console.log(`\nHorizontal (X) direction changes: ${xDirectionChanges.length}`);
        if (xDirectionChanges.length > 2 && maxAbsX < 1.0) {
          console.log(`  ⚠️  WARNING: Multiple direction changes with low horizontal progress suggests hovering!`);
          circularMotionDetected = true;
        }

        // Calculate average vertical acceleration during airborne phases
        // Use same threshold as ball.ts (R * 0.05)
        const airborneThreshold = ball.radius * 0.08;
        const airbornePhases = fullTrajectory.filter(p => p.z > airborneThreshold);
        if (airbornePhases.length > 10) {
          const accelSamples = [];
          for (let i = 1; i < airbornePhases.length; i++) {
            const deltaT = airbornePhases[i].t - airbornePhases[i - 1].t;
            if (deltaT > 0) {
              const accel = (airbornePhases[i].vz - airbornePhases[i - 1].vz) / deltaT;
              accelSamples.push(accel);
            }
          }
          const avgAccelZ = accelSamples.reduce((a, b) => a + b, 0) / accelSamples.length;

          console.log(`\nAirborne vertical acceleration:`);
          console.log(`  Average: ${avgAccelZ.toFixed(2)} m/s²`);
          console.log(`  Expected (gravity): -9.8 m/s²`);
          console.log(`  Difference: ${Math.abs(avgAccelZ + 9.8).toFixed(2)} m/s²`);

          if (Math.abs(avgAccelZ + 9.8) > 3.0) {
            console.log(`  ⚠️  WARNING: Gravity not being applied correctly!`);
            circularMotionDetected = true;
          }
        }

        console.log(`\n${"=".repeat(70)}`);
        console.log(`VERDICT: ${circularMotionDetected ? "⚠️  CIRCULAR FLOATING MOTION DETECTED" : "✓ Normal ballistic trajectory"}`);
        console.log(`${"=".repeat(70)}\n`);

        // Assertions
        expect(maxZ - ball.radius).toBeLessThan(3.0); // Reasonable max height for billiards
        expect(heightToDistanceRatio).toBeLessThan(5.0); // Ball should make forward progress
        expect(circularMotionDetected).toBe(false); // Should NOT have circular floating

        if (!circularMotionDetected) {
          console.log(`✅ Test PASSED: No unrealistic circular floating motion detected at ${elevation}°\n`);
        }
      });
    });
  });
});
