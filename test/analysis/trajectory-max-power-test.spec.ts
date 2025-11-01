/**
 * @jest-environment jsdom
 */

import { Ball, State } from "../../src/model/ball";
import { Table } from "../../src/model/table";
import { TrajectoryPredictor } from "../../src/model/trajectorypredictor";
import { CAROM_PHYSICS, CAROM_BALL_RADIUS } from "../../src/model/physics/constants";
import { AimEvent } from "../../src/events/aimevent";
import * as THREE from "three";
import { Cue } from "../../src/view/cue";
import { applyShotFromPose } from "../../src/model/physics/shot";

/**
 * Test Suite: Maximum Power Trajectory Test
 *
 * Purpose: Test trajectory prediction with MAXIMUM power to detect
 * any discrepancies that only appear at high velocities.
 */
describe("Trajectory Prediction at Maximum Power", () => {

  it("should match real simulation at 100% max power (straight shot)", () => {
    // Create table with 3 balls
    const cueBall = new Ball(new THREE.Vector3(0, 0, CAROM_PHYSICS.R), 0xFFFFFF, CAROM_PHYSICS);
    const ball1 = new Ball(new THREE.Vector3(0.3, 0, CAROM_PHYSICS.R), 0xFF0000, CAROM_PHYSICS);
    const ball2 = new Ball(new THREE.Vector3(-0.3, 0.2, CAROM_PHYSICS.R), 0x0000FF, CAROM_PHYSICS);

    const table = new Table([cueBall, ball1, ball2]);
    table.cue = new Cue(undefined, CAROM_PHYSICS.R);

    // MAXIMUM POWER TEST
    const maxPower = 160 * CAROM_BALL_RADIUS; // 4.92 m/s
    const angle = 0; // Straight along X axis
    const elevation = 0; // No elevation
    const offset = new THREE.Vector3(0, 0, 0); // Center hit

    console.log(`\n${"=".repeat(70)}`);
    console.log(`MAXIMUM POWER TEST (100%)`);
    console.log(`${"=".repeat(70)}`);
    console.log(`Max Power: ${maxPower.toFixed(3)} m/s`);

    const aim = new AimEvent();
    aim.angle = angle;
    aim.offset = offset;
    aim.power = maxPower; // 100% POWER
    aim.elevation = elevation;

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
      power: maxPower
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

    console.log(`Predicted points: ${cueBallPrediction!.points.length}`);
    console.log(`Real trajectory points: ${realTrajectory.length}`);
    console.log(`\nComparing trajectories:`);
    console.log(`${"=".repeat(70)}`);

    // STEP 3: Compare trajectories
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

    // Assertions: Error should be very small
    expect(avgError).toBeLessThan(0.001); // Less than 1mm average error
    expect(maxError).toBeLessThan(0.005); // Less than 5mm max error
  });

  it("should match real simulation at 80% max power (with spin)", () => {
    const cueBall = new Ball(new THREE.Vector3(0, 0, CAROM_PHYSICS.R), 0xFFFFFF, CAROM_PHYSICS);
    const table = new Table([cueBall]);
    table.cue = new Cue(undefined, CAROM_PHYSICS.R);

    const maxPower = 160 * CAROM_BALL_RADIUS;
    const power = maxPower * 0.8; // 80% power
    const angle = Math.PI / 4; // 45 degrees
    const elevation = 0.1;
    const offset = new THREE.Vector3(0.3, -0.6, 0); // Right english + backspin

    console.log(`\n${"=".repeat(70)}`);
    console.log(`HIGH POWER WITH SPIN TEST (80%)`);
    console.log(`${"=".repeat(70)}`);
    console.log(`Power: ${power.toFixed(3)} m/s (${(power/maxPower*100).toFixed(0)}%)`);
    console.log(`Offset: x=${offset.x}, y=${offset.y} (english + backspin)`);

    const aim = new AimEvent();
    aim.angle = angle;
    aim.offset = offset;
    aim.power = power;
    aim.elevation = elevation;

    table.cue.aim = aim;
    table.cue.elevation = elevation;
    table.cue.masseMode = true;

    const horizontalDir = new THREE.Vector3(Math.cos(angle + Math.PI), Math.sin(angle + Math.PI), 0);
    const rightAxis = new THREE.Vector3(-horizontalDir.y, horizontalDir.x, 0).normalize();
    const cueDir = horizontalDir.clone();
    cueDir.applyAxisAngle(rightAxis, elevation);
    cueDir.normalize();

    table.cue.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), cueDir);

    const hitPoint = cueBall.pos.clone().add(new THREE.Vector3(
      offset.x * CAROM_PHYSICS.R,
      offset.y * CAROM_PHYSICS.R,
      offset.z * CAROM_PHYSICS.R
    ));
    table.cue.hitPointMesh.position.copy(hitPoint);

    const predictor = new TrajectoryPredictor();
    const predictions = predictor.predictTrajectory(table, aim, undefined, true, elevation);

    const cueBallPrediction = predictions.find(p => p.ballId === cueBall.id);
    expect(cueBallPrediction).toBeDefined();

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

    console.log(`Predicted points: ${cueBallPrediction!.points.length}`);
    console.log(`Real trajectory points: ${realTrajectory.length}`);

    let maxError = 0;
    let avgError = 0;
    let comparisonCount = 0;

    for (let i = 0; i < realTrajectory.length && i < 20; i++) {
      const realTime = realTrajectory[i].time;

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

    // For high power with spin, allow slightly more tolerance
    expect(avgError).toBeLessThan(0.002); // Less than 2mm average error
    expect(maxError).toBeLessThan(0.010); // Less than 10mm max error
  });
});
