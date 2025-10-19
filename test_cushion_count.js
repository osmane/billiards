// Quick test to count cushions in telemetry test
const { decodeReplay, prepareThreeCushionEnvironment, createThreeCushionContainer, applyReplayState } = require('./test/helpers/threecushionReplay');
const { initDom, canvas3d } = require('./test/view/dom');

const REPLAY_URL = "http://localhost:8080/?ruletype=threecushion&state=%28'init%21%5BC%2CB%2CJ70E%2A215530396FNEEK747378752F7096K883651733F%2A1EEK494757503%5D~shots%21%5B%28'type%21'AIM'~offset%21%28'xLyLzH%29~angle%21J02%2A%2A%2A%2A%2A4~power%214.572~pos%21%28'x%21C~y%21B~zH%29~iLelevationH.17%29%5D~startDnowDscoreLwholeGame%21false~v%211%29N00BJ1773N61511E34CJ7098N49591064D%211760838856654~K9F%2C0.H%210J-0.KE9LH~N%2A0%01NLKJHFEDCB%2A_";

initDom();
prepareThreeCushionEnvironment();

const state = decodeReplay(REPLAY_URL);
const container = createThreeCushionContainer(canvas3d);
const { cueBall } = applyReplayState(container, state);

container.table.cue.hit(cueBall);

let elapsed = 0;
const maxTimeSeconds = 30;
const stepSeconds = 1 / 60;
let prevOutcomeCount = 0;
let cushionCount = 0;

while (elapsed < maxTimeSeconds) {
  container.advance(stepSeconds);
  
  const newOutcomes = container.table.outcome.slice(prevOutcomeCount);
  for (const outcome of newOutcomes) {
    if (outcome.type === 'cushion' && outcome.ball.id === cueBall.id) {
      cushionCount++;
    }
  }
  prevOutcomeCount = container.table.outcome.length;
  
  elapsed += stepSeconds;
  if (container.table.allStationary()) {
    break;
  }
}

console.log('Cue ball cushion hits:', cushionCount);
console.log('Duration:', elapsed.toFixed(2), 's');
console.log('Total outcomes:', container.table.outcome.length);
