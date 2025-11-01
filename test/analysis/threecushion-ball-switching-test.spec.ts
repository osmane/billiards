/**
 * @jest-environment jsdom
 */

import { Ball } from "../../src/model/ball";
import { Table } from "../../src/model/table";
import { TrajectoryPredictor } from "../../src/model/trajectorypredictor";
import { CAROM_PHYSICS, CAROM_BALL_RADIUS } from "../../src/model/physics/constants";
import { AimEvent } from "../../src/events/aimevent";
import * as THREE from "three";
import { Cue } from "../../src/view/cue";
import { applyShotFromPose } from "../../src/model/physics/shot";

/**
 * Test Suite: Three Cushion Ball Switching
 *
 * Purpose: Test trajectory prediction when different balls are used as cue ball
 * (simulating player turn changes in 3-cushion billiards)
 */
describe("Three Cushion Ball Switching Trajectory Test", () => {

  it("should correctly predict trajectory when switching cue balls (ball 0 -> ball 1)", () => {
    // Create 3-cushion setup with 3 balls
    // Ball IDs will be 0, 1, 2 (auto-incremented by Ball constructor)
    const ball0 = new Ball(new THREE.Vector3(-0.3, 0, CAROM_PHYSICS.R), 0xFFFFFF, CAROM_PHYSICS);
    const ball1 = new Ball(new THREE.Vector3(0, 0, CAROM_PHYSICS.R), 0xFFFF00, CAROM_PHYSICS);
    const ball2 = new Ball(new THREE.Vector3(0.3, 0, CAROM_PHYSICS.R), 0xFF0000, CAROM_PHYSICS);

    console.log(`\n${"=".repeat(70)}`);
    console.log(`THREE CUSHION BALL SWITCHING TEST`);
    console.log(`${"=".repeat(70)}`);
    console.log(`Ball 0 ID: ${ball0.id}, Position: (${ball0.pos.x.toFixed(2)}, ${ball0.pos.y.toFixed(2)})`);
    console.log(`Ball 1 ID: ${ball1.id}, Position: (${ball1.pos.x.toFixed(2)}, ${ball1.pos.y.toFixed(2)})`);
    console.log(`Ball 2 ID: ${ball2.id}, Position: (${ball2.pos.x.toFixed(2)}, ${ball2.pos.y.toFixed(2)})`);

    // SCENARIO 1: Player 1 plays with ball 0 (white)
    // ===============================================
    console.log(`\n--- SCENARIO 1: Playing with Ball 0 (${ball0.id}) ---`);

    const table1 = new Table([ball0, ball1, ball2]);
    table1.cueball = ball0; // Set ball 0 as cue ball
    table1.cue = new Cue(undefined, CAROM_PHYSICS.R);

    const maxPower = 160 * CAROM_BALL_RADIUS;
    const power = maxPower * 0.5; // 50% power
    const angle = 0; // Straight along X axis

    const aim1 = new AimEvent();
    aim1.angle = angle;
    aim1.offset = new THREE.Vector3(0, 0, 0); // Center hit
    aim1.power = power;
    aim1.i = 0; // Explicitly set aim.i to 0 (ball 0 is cue ball)

    table1.cue.aim = aim1;

    // Predict trajectory
    const predictor = new TrajectoryPredictor();
    const predictions1 = predictor.predictTrajectory(table1, aim1, undefined, false, 0);

    const ball0Prediction = predictions1.find(p => p.ballId === ball0.id);
    expect(ball0Prediction).toBeDefined();
    console.log(`Ball 0 prediction points: ${ball0Prediction!.points.length}`);

    // Run real simulation
    const serialized1 = table1.serialise();
    const simTable1 = Table.fromSerialised(serialized1);

    const cueDir1 = new THREE.Vector3(Math.cos(angle + Math.PI), Math.sin(angle + Math.PI), 0).normalize();
    const hitPoint1 = ball0.pos.clone();

    applyShotFromPose(simTable1.balls[0], {
      cueDir: cueDir1,
      hitPointWorld: hitPoint1,
      elevation: 0,
      power: power
    });

    const dt = 1 / 512;
    const realTrajectory1: Array<{ pos: THREE.Vector3; time: number }> = [];
    let time1 = 0;
    const maxTime = 0.5;

    realTrajectory1.push({ pos: simTable1.balls[0].pos.clone(), time: 0 });

    while (time1 < maxTime && !simTable1.allStationary()) {
      simTable1.advance(dt);
      time1 += dt;

      if (realTrajectory1.length === 0 || time1 - realTrajectory1[realTrajectory1.length - 1].time >= 0.008) {
        realTrajectory1.push({ pos: simTable1.balls[0].pos.clone(), time: time1 });
      }
    }

    console.log(`Real trajectory points: ${realTrajectory1.length}`);

    // Compare
    let maxError1 = 0;
    let avgError1 = 0;
    let comparisonCount1 = 0;

    for (let i = 0; i < Math.min(realTrajectory1.length, ball0Prediction!.points.length, 10); i++) {
      const realTime = realTrajectory1[i].time;
      let closestPredicted = ball0Prediction!.points[0];
      let minTimeDiff = Math.abs(ball0Prediction!.points[0].time - realTime);

      for (const pred of ball0Prediction!.points) {
        const timeDiff = Math.abs(pred.time - realTime);
        if (timeDiff < minTimeDiff) {
          minTimeDiff = timeDiff;
          closestPredicted = pred;
        }
      }

      const predicted = new THREE.Vector3(
        closestPredicted.position.x,
        closestPredicted.position.y,
        closestPredicted.position.z
      );
      const real = realTrajectory1[i].pos;
      const error = predicted.distanceTo(real);

      maxError1 = Math.max(maxError1, error);
      avgError1 += error;
      comparisonCount1++;
    }

    avgError1 /= comparisonCount1;

    console.log(`Scenario 1 - Max error: ${(maxError1 * 1000).toFixed(2)}mm`);
    console.log(`Scenario 1 - Avg error: ${(avgError1 * 1000).toFixed(2)}mm`);

    // SCENARIO 2: Player 2 plays with ball 1 (yellow)
    // =================================================
    console.log(`\n--- SCENARIO 2: Playing with Ball 1 (${ball1.id}) ---`);

    // Reset balls to original positions
    ball0.pos.set(-0.3, 0, CAROM_PHYSICS.R);
    ball1.pos.set(0, 0, CAROM_PHYSICS.R);
    ball2.pos.set(0.3, 0, CAROM_PHYSICS.R);
    ball0.vel.set(0, 0, 0);
    ball1.vel.set(0, 0, 0);
    ball2.vel.set(0, 0, 0);

    const table2 = new Table([ball0, ball1, ball2]);
    table2.cueball = ball1; // NOW ball 1 is cue ball
    table2.cue = new Cue(undefined, CAROM_PHYSICS.R);

    const aim2 = new AimEvent();
    aim2.angle = angle;
    aim2.offset = new THREE.Vector3(0, 0, 0);
    aim2.power = power;
    aim2.i = 1; // Explicitly set aim.i to 1 (ball 1 is cue ball)

    table2.cue.aim = aim2;

    const predictions2 = predictor.predictTrajectory(table2, aim2, undefined, false, 0);

    const ball1Prediction = predictions2.find(p => p.ballId === ball1.id);
    expect(ball1Prediction).toBeDefined();
    console.log(`Ball 1 prediction points: ${ball1Prediction!.points.length}`);

    // Run real simulation
    const serialized2 = table2.serialise();
    const simTable2 = Table.fromSerialised(serialized2);

    console.log(`Serialized cueballId: ${serialized2.cueballId}`);
    console.log(`Deserialized cueball: ${simTable2.cueball.id}`);
    console.log(`Expected cueball: ${ball1.id}`);

    // CRITICAL CHECK: After deserialization, cueball should still be ball 1
    expect(simTable2.cueball.id).toBe(ball1.id);

    const hitPoint2 = ball1.pos.clone();

    applyShotFromPose(simTable2.cueball, {
      cueDir: cueDir1,
      hitPointWorld: hitPoint2,
      elevation: 0,
      power: power
    });

    const realTrajectory2: Array<{ pos: THREE.Vector3; time: number }> = [];
    let time2 = 0;

    realTrajectory2.push({ pos: simTable2.cueball.pos.clone(), time: 0 });

    while (time2 < maxTime && !simTable2.allStationary()) {
      simTable2.advance(dt);
      time2 += dt;

      if (realTrajectory2.length === 0 || time2 - realTrajectory2[realTrajectory2.length - 1].time >= 0.008) {
        realTrajectory2.push({ pos: simTable2.cueball.pos.clone(), time: time2 });
      }
    }

    console.log(`Real trajectory points: ${realTrajectory2.length}`);

    // Compare
    let maxError2 = 0;
    let avgError2 = 0;
    let comparisonCount2 = 0;

    for (let i = 0; i < Math.min(realTrajectory2.length, ball1Prediction!.points.length, 10); i++) {
      const realTime = realTrajectory2[i].time;
      let closestPredicted = ball1Prediction!.points[0];
      let minTimeDiff = Math.abs(ball1Prediction!.points[0].time - realTime);

      for (const pred of ball1Prediction!.points) {
        const timeDiff = Math.abs(pred.time - realTime);
        if (timeDiff < minTimeDiff) {
          minTimeDiff = timeDiff;
          closestPredicted = pred;
        }
      }

      const predicted = new THREE.Vector3(
        closestPredicted.position.x,
        closestPredicted.position.y,
        closestPredicted.position.z
      );
      const real = realTrajectory2[i].pos;
      const error = predicted.distanceTo(real);

      maxError2 = Math.max(maxError2, error);
      avgError2 += error;
      comparisonCount2++;
    }

    avgError2 /= comparisonCount2;

    console.log(`Scenario 2 - Max error: ${(maxError2 * 1000).toFixed(2)}mm`);
    console.log(`Scenario 2 - Avg error: ${(avgError2 * 1000).toFixed(2)}mm`);

    console.log(`\n${"=".repeat(70)}`);
    console.log(`FINAL RESULTS:`);
    console.log(`${"=".repeat(70)}`);
    console.log(`Both scenarios should have < 1mm error`);
    console.log(`Scenario 1 (Ball 0): ${(avgError1 * 1000).toFixed(2)}mm avg`);
    console.log(`Scenario 2 (Ball 1): ${(avgError2 * 1000).toFixed(2)}mm avg`);
    console.log(`${"=".repeat(70)}\n`);

    // Assertions
    expect(avgError1).toBeLessThan(0.001); // Less than 1mm
    expect(avgError2).toBeLessThan(0.001); // Less than 1mm
    expect(maxError1).toBeLessThan(0.005); // Less than 5mm
    expect(maxError2).toBeLessThan(0.005); // Less than 5mm
  });
});
