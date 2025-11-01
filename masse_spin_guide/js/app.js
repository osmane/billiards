import {
  CENTER,
  ORBIT_R,
  AIM_R,
  CUE_CORNERS,
  CUE_H,
  TIP_CENTER,
  TIP_LEFT,
  TIP_RIGHT,
  TABLE_FLOOR_Y,
  COLLISION_EPS,
  AXIS_X,
  ORBIT_MAX,
  CUE_ELEVATION_MAX,
  BALL_R,
  CUE_W
} from './config.js';
import { toRad, toDeg, normalizeAngle, formatAngle, rot } from './geometry.js';
import { drawAimLineFrom } from './lasers.js';
import { updateSpinIndicators } from './spin.js';

const svg = document.getElementById('scene');
const elCueGroup = document.getElementById('cueGroup');
const spinTargetSlider = document.getElementById('spinTargetSlider');
const spinTargetMarker = document.getElementById('spinTargetMarker');
const cueElevationEl = document.getElementById('cueElevation');
const cueLocationEl = document.getElementById('cueLocation');
const spinValueEl = document.getElementById('spinValue');
const statusMessageEl = document.getElementById('statusMessage');

const elAimLineC = document.getElementById('aimLineC');
const elAimLineCGlow = document.getElementById('aimLineCGlow');
const elAimLineL = document.getElementById('aimLineL');
const elAimLineLGlow = document.getElementById('aimLineLGlow');
const elAimLineR = document.getElementById('aimLineR');
const elAimLineRGlow = document.getElementById('aimLineRGlow');
const elContactC = document.getElementById('contactC');
const elContactL = document.getElementById('contactL');
const elContactR = document.getElementById('contactR');
const spinGroup = document.getElementById('spinArrows');
const spinLines = Array.from(spinGroup.getElementsByClassName('spinArrow'));

let aimAngle = 0;
let orbitAngle = 0;
const targetPoint = { x: CENTER.x + AIM_R, y: CENTER.y };

function setStatusMessage(message){
  statusMessageEl.textContent = message || '';
}

function reportInvalid(reason){
  const message = 'Invalid shot';
  setStatusMessage(message);
  if (reason){
    console.warn(`${message}: ${reason}`);
  } else {
    console.warn(message);
  }
}

function getTargetForAngle(angle){
  const rad = toRad(angle);
  return {
    x: CENTER.x + AIM_R * Math.cos(rad),
    y: CENTER.y + AIM_R * Math.sin(rad)
  };
}

function computeGroupRotation(gx, gy, target){
  const vecToTarget = { x: target.x - gx, y: target.y - gy };
  const baseAngle = Math.atan2(vecToTarget.y, vecToTarget.x);
  return toDeg(baseAngle) + 90;
}

function computeMaxCueY(gx, gy, groupRot){
  let maxY = -Infinity;
  CUE_CORNERS.forEach(pt => {
    const rotated = rot(pt.x, pt.y, groupRot);
    const worldY = gy + rotated.y;
    if (worldY > maxY) maxY = worldY;
  });
  return maxY;
}

function computeMinCueX(gx, gy, groupRot){
  let minX = Infinity;
  CUE_CORNERS.forEach(pt => {
    const rotated = rot(pt.x, pt.y, groupRot);
    const worldX = gx + rotated.x;
    if (worldX < minX) minX = worldX;
  });
  return minX;
}

function checkCueBallCollision(gx, gy, groupRot){
  // Check all 4 edges of the cue
  const corners = CUE_CORNERS.map(pt => {
    const rotated = rot(pt.x, pt.y, groupRot);
    return { x: gx + rotated.x, y: gy + rotated.y };
  });

  // The 4 edges of the cue: top, right, bottom, left
  const edges = [
    { p1: corners[0], p2: corners[1] }, // top edge (cue tip)
    { p1: corners[1], p2: corners[3] }, // right edge
    { p1: corners[3], p2: corners[2] }, // bottom edge (butt)
    { p1: corners[2], p2: corners[0] }  // left edge
  ];

  // Calculate the closest distance to the ball for each edge
  for (const edge of edges){
    const { p1, p2 } = edge;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);

    if (len < 0.001) continue;

    // Find the closest point on the edge
    const t = Math.max(0, Math.min(1,
      ((CENTER.x - p1.x) * dx + (CENTER.y - p1.y) * dy) / (len * len)
    ));

    const closestX = p1.x + t * dx;
    const closestY = p1.y + t * dy;
    const distToCenter = Math.hypot(closestX - CENTER.x, closestY - CENTER.y);

    if (distToCenter < BALL_R - COLLISION_EPS){
      return true; // Collision detected
    }
  }

  return false;
}

function evaluateState(orbitCandidate, aimCandidate){
  const targetCandidate = getTargetForAngle(aimCandidate);
  const orbitRad = toRad(-orbitCandidate);
  const gx = CENTER.x + ORBIT_R * Math.cos(orbitRad);
  const gy = CENTER.y + ORBIT_R * Math.sin(orbitRad);
  const groupRot = computeGroupRotation(gx, gy, targetCandidate);

  if (computeMaxCueY(gx, gy, groupRot) > TABLE_FLOOR_Y + COLLISION_EPS){
    return {
      valid: false,
      reason: 'Cue is touching the table floor line.'
    };
  }

  if (computeMinCueX(gx, gy, groupRot) < AXIS_X){
    return {
      valid: false,
      reason: 'Cue cannot cross the center axis.'
    };
  }

  if (checkCueBallCollision(gx, gy, groupRot)){
    return {
      valid: false,
      reason: 'Cue is touching the ball.'
    };
  }

  const tipWorld = rot(TIP_CENTER.x, TIP_CENTER.y, groupRot);
  const dx = targetCandidate.x - (gx + tipWorld.x);
  const dy = targetCandidate.y - (gy + tipWorld.y);
  const len = Math.hypot(dx, dy) || 1;
  const baseDir = { x: dx / len, y: dy / len };
  const rawTipAngle = toDeg(Math.atan2(baseDir.y, baseDir.x));
  const cueElevationDeg = normalizeAngle(180 - rawTipAngle);

  return {
    valid: true,
    computed: {
      orbitRad,
      gx,
      gy,
      groupRot,
      baseDir,
      cueElevationDeg,
      target: targetCandidate
    }
  };
}

function applyTargetToMarker(){
  spinTargetMarker.setAttribute('cx', targetPoint.x.toFixed(3));
  spinTargetMarker.setAttribute('cy', targetPoint.y.toFixed(3));
}

function setAim(angleDeg){
  const candidate = normalizeAngle(angleDeg);
  const evaluation = evaluateState(orbitAngle, candidate);
  if (!evaluation.valid){
    reportInvalid(evaluation.reason);
    return false;
  }

  aimAngle = candidate;
  targetPoint.x = evaluation.computed.target.x;
  targetPoint.y = evaluation.computed.target.y;
  applyTargetToMarker();
  setStatusMessage('');
  update();
  return true;
}

function setOrbit(angleDeg){
  const normalized = normalizeAngle(angleDeg);
  const evaluation = evaluateState(normalized, aimAngle);
  if (!evaluation.valid){
    reportInvalid(evaluation.reason);
    return false;
  }

  orbitAngle = normalized;
  setStatusMessage('');
  update();
  return true;
}

function update(){
  const evaluation = evaluateState(orbitAngle, aimAngle);
  if (!evaluation.valid){
    reportInvalid(evaluation.reason);
    return;
  }

  const { gx, gy, groupRot, baseDir: evaluationDir, cueElevationDeg, target } = evaluation.computed;

  targetPoint.x = target.x;
  targetPoint.y = target.y;
  applyTargetToMarker();

  elCueGroup.setAttribute('transform', `translate(${gx.toFixed(3)},${gy.toFixed(3)}) rotate(${groupRot})`);
  cueLocationEl.textContent = formatAngle(orbitAngle);
  setStatusMessage('');

  const centerResult = drawAimLineFrom(TIP_CENTER, groupRot, gx, gy, targetPoint, elAimLineC, elAimLineCGlow, elContactC);
  const forcedDir = centerResult.contact ? centerResult.contact.dir : evaluationDir;
  const leftResult = drawAimLineFrom(TIP_LEFT, groupRot, gx, gy, targetPoint, elAimLineL, elAimLineLGlow, elContactL, forcedDir);
  const rightResult = drawAimLineFrom(TIP_RIGHT, groupRot, gx, gy, targetPoint, elAimLineR, elAimLineRGlow, elContactR, forcedDir);

  cueElevationEl.textContent = formatAngle(cueElevationDeg);

  const aimLineStates = [
    { line: elAimLineC, glow: elAimLineCGlow, contactEl: elContactC, data: centerResult },
    { line: elAimLineL, glow: elAimLineLGlow, contactEl: elContactL, data: leftResult },
    { line: elAimLineR, glow: elAimLineRGlow, contactEl: elContactR, data: rightResult }
  ];

  const axisCrossCount = aimLineStates.reduce((sum, { data }) => sum + (data.contact && data.crossesAxis ? 1 : 0), 0);

  const contactsForSpin = [];
  aimLineStates.forEach(({ line, glow, contactEl, data }) => {
    if (!data.contact) return;

    if (axisCrossCount >= 2 && data.crossesAxis){
      line.style.visibility = 'hidden';
      glow.style.visibility = 'hidden';
      contactEl.style.display = 'none';
      return;
    }

    contactsForSpin.push(data.contact);
  });

  // Check if at least one aim line intersects with the ball
  const anyAimLineContactsBall = aimLineStates.some(({ data }) => data.contact !== null);

  // Rule 1: If 2+ aim lines cross the vertical axis AND at least one aim line contacts the ball
  const aimLineFrictionRisk = (axisCrossCount >= 2) && anyAimLineContactsBall;

  // Rule 2: Imaginary line extended from the cue butt check
  const cueButt = { x: 0, y: CUE_H / 2 };
  const cueButtWorld = rot(cueButt.x, cueButt.y, groupRot);
  const cueButtX = gx + cueButtWorld.x;
  const cueButtY = gy + cueButtWorld.y;

  const cueTip = { x: 0, y: -CUE_H / 2 };
  const cueTipWorld = rot(cueTip.x, cueTip.y, groupRot);
  const cueTipX = gx + cueTipWorld.x;
  const cueTipY = gy + cueTipWorld.y;

  const cueDirX = cueTipX - cueButtX;
  const cueDirY = cueTipY - cueButtY;
  const cueLen = Math.hypot(cueDirX, cueDirY) || 1;
  const cueDirNormX = cueDirX / cueLen;
  const cueDirNormY = cueDirY / cueLen;

  const extendDirX = -cueDirNormX;
  const extendDirY = -cueDirNormY;

  let cueButtFrictionRisk = false;
  if (Math.abs(extendDirX) > 0.001){
    const t = (AXIS_X - cueButtX) / extendDirX;
    if (t > 0){
      const towardsTip = (extendDirX * cueDirNormX + extendDirY * cueDirNormY) > 0;
      if (!towardsTip && anyAimLineContactsBall){
        cueButtFrictionRisk = true;
      }
    }
  }

  // Rule 3: Cue is too close to the ball (almost touching) - friction risk
  const ballProximityRisk = checkCueBallCollision(gx, gy, groupRot);

  if (aimLineFrictionRisk || cueButtFrictionRisk || ballProximityRisk){
    setStatusMessage('Friction risk');
  } else if (contactsForSpin.length === 0){
    setStatusMessage('No contact');
  } else if (contactsForSpin.length === 1){
    setStatusMessage('Insufficient contact');
  } else {
    setStatusMessage('');
  }

  updateSpinIndicators(contactsForSpin, spinGroup, spinLines, spinValueEl);
}

function clientToSvgPoint(evt){
  const pt = svg.createSVGPoint();
  pt.x = evt.touches ? evt.touches[0].clientX : evt.clientX;
  pt.y = evt.touches ? evt.touches[0].clientY : evt.clientY;
  const sp = pt.matrixTransform(svg.getScreenCTM().inverse());
  return { x: sp.x, y: sp.y };
}

let aiming = false;
let orbitDragging = false;

function aimFromEvent(e){
  const pt = clientToSvgPoint(e);
  const dx = pt.x - CENTER.x;
  const dy = pt.y - CENTER.y;
  if (dx === 0 && dy === 0){
    return;
  }
  const angle = toDeg(Math.atan2(dy, dx));
  setAim(angle);
}

function startAim(e){
  aiming = true;
  aimFromEvent(e);
  if (e.pointerId !== undefined && e.target.setPointerCapture){
    e.target.setPointerCapture(e.pointerId);
  }
  e.preventDefault();
}

function moveAim(e){
  if (!aiming) return;
  aimFromEvent(e);
  e.preventDefault();
}

function endAim(){
  aiming = false;
}

function orbitFromEvent(e){
  const pt = clientToSvgPoint(e);
  const dx = pt.x - CENTER.x;
  const dy = pt.y - CENTER.y;
  if (dx === 0 && dy === 0){
    return;
  }
  const internalAngle = toDeg(Math.atan2(dy, dx));
  const classicAngle = normalizeAngle(360 - internalAngle);
  setOrbit(classicAngle);
}

function startOrbit(e){
  orbitDragging = true;
  orbitFromEvent(e);
  if (e.pointerId !== undefined && e.target.setPointerCapture){
    e.target.setPointerCapture(e.pointerId);
  }
  e.preventDefault();
}

function moveOrbit(e){
  if (!orbitDragging) return;
  orbitFromEvent(e);
  e.preventDefault();
}

function endOrbit(){
  orbitDragging = false;
}

[spinTargetSlider, spinTargetMarker].forEach(el => {
  el.addEventListener('pointerdown', startAim, { passive: false });
  el.addEventListener('touchstart', startAim, { passive: false });
});
window.addEventListener('pointermove', moveAim, { passive: false });
window.addEventListener('touchmove', moveAim, { passive: false });
window.addEventListener('pointerup', endAim);
window.addEventListener('pointercancel', endAim);
window.addEventListener('touchend', endAim);
window.addEventListener('touchcancel', endAim);

elCueGroup.addEventListener('pointerdown', startOrbit, { passive: false });
elCueGroup.addEventListener('touchstart', startOrbit, { passive: false });
window.addEventListener('pointermove', moveOrbit, { passive: false });
window.addEventListener('touchmove', moveOrbit, { passive: false });
window.addEventListener('pointerup', endOrbit);
window.addEventListener('pointercancel', endOrbit);
window.addEventListener('touchend', endOrbit);
window.addEventListener('touchcancel', endOrbit);

setAim(180);
setOrbit(0);




