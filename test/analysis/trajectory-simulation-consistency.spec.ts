/**
 * @jest-environment jsdom
 */

import { Ball, State } from "../../src/model/ball";
import { Table } from "../../src/model/table";
import { TrajectoryPredictor } from "../../src/model/trajectorypredictor";
import { CAROM_PHYSICS } from "../../src/model/physics/constants";
import { AimEvent } from "../../src/events/aimevent";
import * as THREE from "three";
import { Cue } from "../../src/view/cue";
import { applyShotFromPose } from "../../src/model/physics/shot";

/**
 * Test Suite: Trajectory Lines vs Real Simulation Consistency
 *
 * Purpose: Verify that trajectory prediction lines accurately match
 * the actual ball paths during real simulation.
 *
 * This test was created to fix the bug where trajectory lines didn't
 * match real ball movement because TrajectoryPredictor was using
 * incorrect property paths (table.cue.cue.mesh instead of table.cue.mesh)
 */
describe("Trajectory Lines vs Real Simulation Consistency", () => {

  describe("Basic Shot Comparison", () => {
    it("should produce identical ball positions for simple straight shot", () => {
      // Create table with 3 balls
      const cueBall = new Ball(new THREE.Vector3(0, 0, CAROM_PHYSICS.R), 0xFFFFFF, CAROM_PHYSICS);
      const ball1 = new Ball(new THREE.Vector3(0.3, 0, CAROM_PHYSICS.R), 0xFF0000, CAROM_PHYSICS);
      const ball2 = new Ball(new THREE.Vector3(-0.3, 0.2, CAROM_PHYSICS.R), 0x0000FF, CAROM_PHYSICS);

      const table = new Table([cueBall, ball1, ball2]);
      table.cue = new Cue(undefined, CAROM_PHYSICS.R);

      // Setup aim
      const power = 2.0;
      const angle = 0; // Straight along X axis
      const elevation = 0; // No elevation
      const offset = new THREE.Vector3(0, 0, 0); // Center hit

      // FIX: AimEvent constructor takes no parameters, set fields manually
      const aim = new AimEvent();
      aim.angle = angle;
      aim.offset = offset;
      aim.power = power;
      aim.elevation = elevation;

      // Setup cue mesh for proper trajectory prediction
      table.cue.aim = aim;
      table.cue.elevation = elevation;

      // Calculate cue direction
      const cueDir = new THREE.Vector3(Math.cos(angle + Math.PI), Math.sin(angle + Math.PI), 0).normalize();
      table.cue.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), cueDir);

      // Set hit point mesh position
      const hitPoint = cueBall.pos.clone();
      table.cue.hitPointMesh.position.copy(hitPoint);

      // STEP 1: Get trajectory prediction
      const predictor = new TrajectoryPredictor();
      const predictions = predictor.predictTrajectory(table, aim, undefined, false, elevation);

      const cueBallPrediction = predictions.find(p => p.ballId === cueBall.id);
      expect(cueBallPrediction).toBeDefined();
      expect(cueBallPrediction!.points.length).toBeGreaterThan(1);

      // STEP 2: Run real simulation with same parameters
      applyShotFromPose(cueBall, {
        cueDir: cueDir,
        hitPointWorld: hitPoint,
        elevation: elevation,
        power: power
      });

      const dt = 1 / 512; // ENGINE_DT
      const realTrajectory: Array<{ pos: THREE.Vector3; time: number }> = [];

      let time = 0;
      const maxTime = 0.5; // 0.5 seconds

      // Record initial position
      realTrajectory.push({ pos: cueBall.pos.clone(), time: 0 });

      while (time < maxTime && !table.allStationary()) {
        table.advance(dt);
        time += dt;

        // Sample every 0.008 seconds (TRAJECTORY_SAMPLE_DT)
        if (realTrajectory.length === 0 || time - realTrajectory[realTrajectory.length - 1].time >= 0.008) {
          realTrajectory.push({ pos: cueBall.pos.clone(), time });
        }
      }

      console.log(`\n${"=".repeat(70)}`);
      console.log(`TRAJECTORY PREDICTION vs REAL SIMULATION COMPARISON`);
      console.log(`${"=".repeat(70)}`);
      console.log(`Shot parameters: power=${power}, angle=${angle}°, elevation=${elevation}°`);
      console.log(`Predicted points: ${cueBallPrediction!.points.length}`);
      console.log(`Real trajectory points: ${realTrajectory.length}`);

      // STEP 3: Compare trajectories at matching time points
      // FIX: Trajectory predictor samples cue ball at every ENGINE_DT (fine-grained)
      // but we need to compare at TRAJECTORY_SAMPLE_DT intervals to match real simulation
      const TRAJECTORY_SAMPLE_DT = 0.008;

      console.log(`\nComparing trajectories at ${TRAJECTORY_SAMPLE_DT}s intervals:`);
      console.log(`${"=".repeat(70)}`);

      let maxError = 0;
      let avgError = 0;
      let comparisonCount = 0;

      for (let i = 0; i < realTrajectory.length && i < 20; i++) {
        const realTime = realTrajectory[i].time;

        // Find predicted point closest to this time
        let closestPredicted = cueBallPrediction!.points[0];
        let minTimeDiff = Math.abs(cueBallPrediction!.points[0].time - realTime);

        for (const pred of cueBallPrediction!.points) {
          const timeDiff = Math.abs(pred.time - realTime);
          if (timeDiff < minTimeDiff) {
            minTimeDiff = timeDiff;
            closestPredicted = pred;
          }
        }

        const predicted = closestPredicted.position;
        const real = realTrajectory[i].pos;

        const dx = predicted.x - real.x;
        const dy = predicted.y - real.y;
        const dz = predicted.z - real.z;
        const error = Math.sqrt(dx * dx + dy * dy + dz * dz);

        maxError = Math.max(maxError, error);
        avgError += error;
        comparisonCount++;

        if (i < 10) {
          console.log(
            `Point ${i.toString().padStart(2)} (t=${realTime.toFixed(3)}s): ` +
            `Pred=(${predicted.x.toFixed(4)}, ${predicted.y.toFixed(4)}, ${predicted.z.toFixed(4)}) ` +
            `Real=(${real.x.toFixed(4)}, ${real.y.toFixed(4)}, ${real.z.toFixed(4)}) ` +
            `Error=${(error * 1000).toFixed(2)}mm`
          );
        }
      }

      avgError /= comparisonCount;

      console.log(`\n${"=".repeat(70)}`);
      console.log(`ERROR STATISTICS:`);
      console.log(`  Maximum error: ${(maxError * 1000).toFixed(2)} mm`);
      console.log(`  Average error: ${(avgError * 1000).toFixed(2)} mm`);
      console.log(`${"=".repeat(70)}\n`);

      // Assertions: Error should be very small (< 1mm for first few points)
      expect(avgError).toBeLessThan(0.001); // Less than 1mm average error
      expect(maxError).toBeLessThan(0.005); // Less than 5mm max error
    });

    it("should produce identical ball positions for elevated shot", () => {
      // Create table with cue ball only
      const cueBall = new Ball(new THREE.Vector3(0, 0, CAROM_PHYSICS.R), 0xFFFFFF, CAROM_PHYSICS);
      const table = new Table([cueBall]);
      table.cue = new Cue(undefined, CAROM_PHYSICS.R);

      // Setup elevated shot
      const power = 3.0;
      const angle = 0;
      const elevation = 0.3; // 30 degrees elevation
      const offset = new THREE.Vector3(0, -0.5, 0); // Backspin

      // FIX: AimEvent constructor takes no parameters, set fields manually
      const aim = new AimEvent();
      aim.angle = angle;
      aim.offset = offset;
      aim.power = power;
      aim.elevation = elevation;

      table.cue.aim = aim;
      table.cue.elevation = elevation;
      table.cue.masseMode = true;

      // Calculate cue direction with elevation
      const horizontalDir = new THREE.Vector3(Math.cos(angle + Math.PI), Math.sin(angle + Math.PI), 0);
      const rightAxis = new THREE.Vector3(-horizontalDir.y, horizontalDir.x, 0).normalize();
      const cueDir = horizontalDir.clone();
      cueDir.applyAxisAngle(rightAxis, elevation);
      cueDir.normalize();

      table.cue.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), cueDir);

      // Calculate hit point using arcsin mapping (matches Cue.updateHitPoint and predictor)
      const clamp = (x: number) => Math.max(-1, Math.min(1, x));
      const baseDir = new THREE.Vector3(Math.cos(angle + Math.PI), Math.sin(angle + Math.PI), 0);
      let hitDir = new THREE.Vector3(baseDir.x, baseDir.y, 0);
      const horizAngle = -Math.asin(clamp(offset.x));
      hitDir.applyAxisAngle(new THREE.Vector3(0, 0, 1), horizAngle);
      const vertAxis = new THREE.Vector3(-baseDir.y, baseDir.x, 0).normalize();
      const vertAngle = -Math.asin(clamp(offset.y));
      hitDir.applyAxisAngle(vertAxis, vertAngle);
      hitDir.normalize();
      const hitPoint = cueBall.pos.clone().addScaledVector(hitDir, CAROM_PHYSICS.R);
      table.cue.hitPointMesh.position.copy(hitPoint);

      // Get trajectory prediction
      const predictor = new TrajectoryPredictor();
      const predictions = predictor.predictTrajectory(table, aim, undefined, true, elevation);

      const cueBallPrediction = predictions.find(p => p.ballId === cueBall.id);
      expect(cueBallPrediction).toBeDefined();

      // Run real simulation
      applyShotFromPose(cueBall, {
        cueDir: cueDir,
        hitPointWorld: hitPoint,
        elevation: elevation,
        power: power
      });

      const dt = 1 / 512;
      const realTrajectory: Array<{ pos: THREE.Vector3; time: number }> = [];

      let time = 0;
      const maxTime = 1.0;

      realTrajectory.push({ pos: cueBall.pos.clone(), time: 0 });

      while (time < maxTime && !table.allStationary()) {
        table.advance(dt);
        time += dt;

        if (realTrajectory.length === 0 || time - realTrajectory[realTrajectory.length - 1].time >= 0.008) {
          realTrajectory.push({ pos: cueBall.pos.clone(), time });
        }
      }

      console.log(`\n${"=".repeat(70)}`);
      console.log(`ELEVATED SHOT COMPARISON`);
      console.log(`${"=".repeat(70)}`);
      console.log(`Shot: power=${power}, elevation=${elevation.toFixed(2)}, offset=${offset.y}`);
      console.log(`Predicted points: ${cueBallPrediction!.points.length}`);
      console.log(`Real trajectory points: ${realTrajectory.length}`);

      // FIX: Compare at matching time points
      const TRAJECTORY_SAMPLE_DT = 0.008;
      let maxError = 0;
      let avgError = 0;
      let comparisonCount = 0;

      for (let i = 0; i < realTrajectory.length && i < 20; i++) {
        const realTime = realTrajectory[i].time;

        // Find predicted point closest to this time
        let closestPredicted = cueBallPrediction!.points[0];
        let minTimeDiff = Math.abs(cueBallPrediction!.points[0].time - realTime);

        for (const pred of cueBallPrediction!.points) {
          const timeDiff = Math.abs(pred.time - realTime);
          if (timeDiff < minTimeDiff) {
            minTimeDiff = timeDiff;
            closestPredicted = pred;
          }
        }

        const predicted = closestPredicted.position;
        const real = realTrajectory[i].pos;

        const dx = predicted.x - real.x;
        const dy = predicted.y - real.y;
        const dz = predicted.z - real.z;
        const error = Math.sqrt(dx * dx + dy * dy + dz * dz);

        maxError = Math.max(maxError, error);
        avgError += error;
        comparisonCount++;

        if (i < 10) {
          console.log(
            `Point ${i.toString().padStart(2)} (t=${realTime.toFixed(3)}s): ` +
            `Pred=(${predicted.x.toFixed(4)}, ${predicted.y.toFixed(4)}, ${predicted.z.toFixed(4)}) ` +
            `Real=(${real.x.toFixed(4)}, ${real.y.toFixed(4)}, ${real.z.toFixed(4)}) ` +
            `Error=${(error * 1000).toFixed(2)}mm`
          );
        }
      }

      avgError /= comparisonCount;

      console.log(`\n${"=".repeat(70)}`);
      console.log(`ERROR STATISTICS:`);
      console.log(`  Maximum error: ${(maxError * 1000).toFixed(2)} mm`);
      console.log(`  Average error: ${(avgError * 1000).toFixed(2)} mm`);
      console.log(`${"=".repeat(70)}\n`);

      // For elevated shots, allow slightly more error due to complex physics
      expect(avgError).toBeLessThan(0.002); // Less than 2mm average error
      expect(maxError).toBeLessThan(0.010); // Less than 10mm max error
    });
  });

  describe("Collision Prediction", () => {
    it("should predict ball-ball collision at same position as real simulation", () => {
      // Setup: Cue ball aimed directly at object ball
      const cueBall = new Ball(new THREE.Vector3(-0.5, 0, CAROM_PHYSICS.R), 0xFFFFFF, CAROM_PHYSICS);
      const objectBall = new Ball(new THREE.Vector3(0.5, 0, CAROM_PHYSICS.R), 0xFF0000, CAROM_PHYSICS);

      const table = new Table([cueBall, objectBall]);
      table.cue = new Cue(undefined, CAROM_PHYSICS.R);

      const power = 2.0;
      const angle = 0; // Straight shot
      const elevation = 0;
      const offset = new THREE.Vector3(0, 0, 0);

      // FIX: AimEvent constructor takes no parameters, set fields manually
      const aim = new AimEvent();
      aim.angle = angle;
      aim.offset = offset;
      aim.power = power;
      aim.elevation = elevation;
      table.cue.aim = aim;
      table.cue.elevation = elevation;

      const cueDir = new THREE.Vector3(Math.cos(angle + Math.PI), Math.sin(angle + Math.PI), 0).normalize();
      table.cue.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), cueDir);
      table.cue.hitPointMesh.position.copy(cueBall.pos.clone());

      // Get trajectory prediction
      const predictor = new TrajectoryPredictor();
      const predictions = predictor.predictTrajectory(table, aim, undefined, false, elevation);

      const cueBallPrediction = predictions.find(p => p.ballId === cueBall.id);
      expect(cueBallPrediction).toBeDefined();

      // Check if prediction detected collision
      const predictedImpactIndex = cueBallPrediction!.firstImpactIndex;
      expect(predictedImpactIndex).toBeDefined();

      const predictedImpactPos = cueBallPrediction!.points[predictedImpactIndex!].position;

      console.log(`\n${"=".repeat(70)}`);
      console.log(`COLLISION PREDICTION TEST`);
      console.log(`${"=".repeat(70)}`);
      console.log(`Predicted impact at index ${predictedImpactIndex}`);
      console.log(`Predicted impact position: (${predictedImpactPos.x.toFixed(4)}, ${predictedImpactPos.y.toFixed(4)}, ${predictedImpactPos.z.toFixed(4)})`);

      // Run real simulation and detect collision
      applyShotFromPose(cueBall, {
        cueDir: cueDir,
        hitPointWorld: cueBall.pos.clone(),
        elevation: elevation,
        power: power
      });

      const dt = 1 / 512;
      let time = 0;
      let collisionDetected = false;
      let realImpactPos: THREE.Vector3 | null = null;

      const initialOutcomeCount = table.outcome.length;

      while (time < 2.0 && !table.allStationary()) {
        table.advance(dt);
        time += dt;

        // Check for collision outcome
        if (!collisionDetected && table.outcome.length > initialOutcomeCount) {
          collisionDetected = true;
          realImpactPos = cueBall.pos.clone();
          console.log(`Real collision at time ${time.toFixed(4)}s`);
          console.log(`Real impact position: (${realImpactPos.x.toFixed(4)}, ${realImpactPos.y.toFixed(4)}, ${realImpactPos.z.toFixed(4)})`);
        }
      }

      expect(collisionDetected).toBe(true);
      expect(realImpactPos).not.toBeNull();

      // Compare predicted vs real collision positions
      const dx = predictedImpactPos.x - realImpactPos!.x;
      const dy = predictedImpactPos.y - realImpactPos!.y;
      const dz = predictedImpactPos.z - realImpactPos!.z;
      const error = Math.sqrt(dx * dx + dy * dy + dz * dz);

      console.log(`\nCollision position error: ${(error * 1000).toFixed(2)} mm`);
      console.log(`${"=".repeat(70)}\n`);

      // Collision position should match within 5mm
      expect(error).toBeLessThan(0.005);
    });
  });
});
