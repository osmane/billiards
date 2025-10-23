import { CENTER, BALL_R, AIM_LINE_LEN, AXIS_X } from './config.js';
import { rot, rayCircleIntersection } from './geometry.js';

export function drawAimLineFrom(tipLocal, degSpin, gx, gy, target, elLine, elGlow, elContact, forcedDir = null){
  const tip = rot(tipLocal.x, tipLocal.y, degSpin);
  const tipX = gx + tip.x;
  const tipY = gy + tip.y;

  let dir;
  if (forcedDir){
    const mag = Math.hypot(forcedDir.x, forcedDir.y) || 1;
    dir = { x: forcedDir.x / mag, y: forcedDir.y / mag };
  } else {
    const dx = target.x - tipX;
    const dy = target.y - tipY;
    const len = Math.hypot(dx, dy) || 1;
    dir = { x: dx / len, y: dy / len };
  }

  const tContact = rayCircleIntersection(tipX, tipY, dir.x, dir.y, CENTER.x, CENTER.y, BALL_R);
  const length = tContact !== null ? Math.min(tContact, AIM_LINE_LEN) : AIM_LINE_LEN;

  const endX = tipX + dir.x * length;
  const endY = tipY + dir.y * length;

  if (tContact !== null && tContact <= AIM_LINE_LEN){
    elLine.setAttribute('x1', tipX.toFixed(3));
    elLine.setAttribute('y1', tipY.toFixed(3));
    elLine.setAttribute('x2', endX.toFixed(3));
    elLine.setAttribute('y2', endY.toFixed(3));
    elLine.style.visibility = 'visible';

    elGlow.setAttribute('x1', tipX.toFixed(3));
    elGlow.setAttribute('y1', tipY.toFixed(3));
    elGlow.setAttribute('x2', endX.toFixed(3));
    elGlow.setAttribute('y2', endY.toFixed(3));
    elGlow.style.visibility = 'visible';

    const contactX = tipX + dir.x * tContact;
    const contactY = tipY + dir.y * tContact;
    elContact.setAttribute('cx', contactX.toFixed(3));
    elContact.setAttribute('cy', contactY.toFixed(3));
    elContact.style.display = 'block';

    const crossesAxis = (tipX - AXIS_X) * (contactX - AXIS_X) <= 0;
    return { contact: { x: contactX, y: contactY, dir }, crossesAxis };
  }

  elLine.style.visibility = 'hidden';
  elGlow.style.visibility = 'hidden';
  elContact.style.display = 'none';
  return { contact: null, crossesAxis: false };
}
