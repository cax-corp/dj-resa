const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
const audio = vm.runInNewContext(
  fs.readFileSync(__dirname + '/../audio-setup.js', 'utf8') + '\nAudioSetup'
);
const port = (
  id,
  direction,
  signal = 'line',
  connector = 'xlr3',
  gender = direction === 'out' ? 'male' : 'female',
  channels = 1
) => ({ id, name: id, direction, signal, connector, gender, channels });
const a = {
    id: 'a',
    label: 'Controller',
    x: 50,
    y: 80,
    ports: [port('L', 'out'), port('R', 'out')],
  },
  b = { id: 'b', label: 'Speaker L', x: 20, y: 20, ports: [port('in', 'in')] },
  c = { id: 'c', label: 'Speaker R', x: 80, y: 20, ports: [port('in', 'in')] };
const board = { width: 10, depth: 6, nodes: [a, b, c], edges: [] };
const left = { id: '1', from_node: 'a', from_port: 'L', to_node: 'b', to_port: 'in', length: 5 },
  right = { id: '2', from_node: 'a', from_port: 'R', to_node: 'c', to_port: 'in', length: 5 };
audio.compatible(board, left);
board.edges.push(left);
audio.compatible(board, right);
board.edges.push(right);
assert.equal(audio.grouped(board).length, 1);
assert.equal(audio.grouped(board)[0].quantity, 2);
assert.equal(audio.grouped(board)[0].length, 5);
assert.match(audio.grouped(board)[0].label, /XLR 3 broches femelle → XLR 3 broches mâle/);
assert.throws(() => audio.compatible(board, { ...right, id: '3' }), /déjà utilisé/);
const mismatch = {
  ...board,
  edges: [],
  nodes: [{ ...a, ports: [port('L', 'out', 'speaker', 'speakon4')] }, b],
};
assert.throws(() => audio.compatible(mismatch, left), /Signaux incompatibles/);
const digital = {
  ...board,
  edges: [],
  nodes: [
    { ...a, ports: [port('L', 'out', 'spdif', 'toslink', 'none', 2)] },
    { ...b, ports: [port('in', 'in', 'spdif', 'rca', 'female', 2)] },
  ],
};
assert.throws(() => audio.compatible(digital, left), /convertisseur/);
const usb = {
  ...board,
  edges: [],
  nodes: [
    { ...a, ports: [port('L', 'out', 'usb', 'usb_a')] },
    { ...b, ports: [port('in', 'in', 'usb', 'usb_a')] },
  ],
};
assert.throws(() => audio.compatible(usb, left), /USB/);
const stereo = {
  ...board,
  edges: [],
  nodes: [
    { ...a, ports: [port('L', 'out', 'line', 'mini_trs', 'female', 2)] },
    { ...b, ports: [port('in', 'in', 'line', 'rca_pair', 'female', 2)] },
  ],
};
audio.compatible(stereo, left);
assert.match(audio.cable(stereo, left).label, /Mini-jack.*2 RCA/);
assert.ok(
  audio.cable({ ...board, edges: [{ ...left, length: 0 }] }, { ...left, length: 0 }).length >=
    Math.hypot(3, 3.6) * 1.2 + 1
);
console.log(
  'PASS: stereo L/R yields two cables, correct mating genders, manual/estimated lengths, speaker/line rejection, digital converter requirement, USB roles, stereo breakout and port occupancy'
);
