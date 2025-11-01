import { CENTER, BALL_R, MIN_CONTACTS_FOR_SPIN } from './config.js';

export function updateSpinIndicators(contacts, spinGroup, spinLines, spinValueEl){
  if (contacts.length < MIN_CONTACTS_FOR_SPIN){
    spinGroup.setAttribute('visibility', 'hidden');
    spinLines.forEach(line => line.setAttribute('visibility', 'hidden'));
    spinValueEl.textContent = '0/100';
    return;
  }

  let torque = 0;
  contacts.forEach(contact => {
    const r = { x: contact.x - CENTER.x, y: contact.y - CENTER.y };
    torque += r.x * contact.dir.y - r.y * contact.dir.x;
  });

  const maxTorque = BALL_R * contacts.length;
  const spinPercent = maxTorque > 0 ? Math.min(100, Math.round((Math.abs(torque) / maxTorque) * 100)) : 0;
  spinValueEl.textContent = `${spinPercent}/100`;

  if (Math.abs(torque) < 1e-6){
    spinGroup.setAttribute('visibility', 'hidden');
    spinLines.forEach(line => line.setAttribute('visibility', 'hidden'));
    return;
  }

  const sign = torque > 0 ? 1 : -1;
  const arrowLength = 36;
  const halfLen = arrowLength / 2;

  contacts.forEach((contact, index) => {
    if (index >= spinLines.length) return;
    const line = spinLines[index];
    const radial = { x: contact.x - CENTER.x, y: contact.y - CENTER.y };
    let tangent = sign > 0 ? { x: -radial.y, y: radial.x } : { x: radial.y, y: -radial.x };
    const mag = Math.hypot(tangent.x, tangent.y) || 1;
    tangent = { x: tangent.x / mag, y: tangent.y / mag };

    const startX = contact.x - tangent.x * halfLen;
    const startY = contact.y - tangent.y * halfLen;
    const endX = contact.x + tangent.x * halfLen;
    const endY = contact.y + tangent.y * halfLen;

    line.setAttribute('x1', startX.toFixed(3));
    line.setAttribute('y1', startY.toFixed(3));
    line.setAttribute('x2', endX.toFixed(3));
    line.setAttribute('y2', endY.toFixed(3));
    line.setAttribute('visibility', 'visible');
  });

  for (let i = contacts.length; i < spinLines.length; i++){
    spinLines[i].setAttribute('visibility', 'hidden');
  }

  spinGroup.setAttribute('visibility', 'visible');
}
