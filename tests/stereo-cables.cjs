const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict");
const { audio, stereo } = vm.runInNewContext(
  ["audio-ports.js", "connector-picker.js", "audio-stereo.js", "audio-setup.js"]
    .map((f) => fs.readFileSync(__dirname + "/../" + f, "utf8"))
    .join("\n") + "\n({audio:AudioSetup,stereo:AudioStereo})",
);
const p = (
  id,
  direction,
  connector,
  channels = 1,
  audio_role = "independent",
  group_name = "",
) => ({
  id,
  name: id,
  direction,
  connector,
  channels,
  audio_role,
  group_name,
  signal: "line",
  gender: "female",
});
const board = {
  width: 10,
  depth: 6,
  nodes: [
    {
      id: "ddj",
      label: "DDJ-FLX6-GT",
      x: 10,
      y: 20,
      ports: [p("MASTER", "out", "rca_pair", 2, "stereo")],
    },
    {
      id: "yamaha",
      label: "MG06X",
      x: 60,
      y: 20,
      ports: [
        p("CH3", "in", "jack_ts", 1, "left_mono", "3/4"),
        p("CH4", "in", "jack_ts", 1, "right", "3/4"),
      ],
    },
  ],
  edges: [],
};
const edge = {
  id: "cable",
  stereo: true,
  from_node: "ddj",
  from_port: "MASTER",
  to_node: "yamaha",
  to_port: "CH3",
  to_right_port: "CH4",
  length: 3,
};
audio.compatible(board, edge);
board.edges.push(edge);
assert.equal(audio.grouped(board)[0].quantity, 1);
assert.match(
  audio.cable(board, edge).label,
  /2 RCA mâles → 2 × Jack 6,35 TS mâle/,
);
assert.match(audio.cable(board, edge).to, /L : CH3 \/ R : CH4/);
assert.equal(stereo.choices(board, "in").length, 0);
assert.throws(
  () => audio.compatible(board, { ...edge, id: "duplicate" }),
  /déjà utilisé/,
);
assert.throws(
  () =>
    audio.compatible(
      { ...board, edges: [] },
      { ...edge, to_right_port: "CH3" },
    ),
  /distinctes/,
);
assert.throws(
  () => audio.compatible({ ...board, edges: [] }, { ...edge, stereo: false }),
  /distinctes/,
);
assert.throws(
  () =>
    audio.compatible(
      { ...board, edges: [] },
      { ...edge, to_right_port: undefined },
    ),
  /stéréo/,
);
board.edges = [];
board.nodes[0].ports = [
  p("Master L", "out", "rca", 1, "left", "Master"),
  p("Master R", "out", "rca", 1, "right", "Master"),
];
const paired = { ...edge, from_port: "Master L", from_right_port: "Master R" };
assert.match(
  audio.cable(board, paired).label,
  /2 × RCA mono mâle → 2 × Jack 6,35 TS mâle/,
);
assert.equal(stereo.choices(board, "out").length, 1);
console.log(
  "PASS: existing stereo RCA → dual jacks, paired RCA → paired jacks, one cable assembly, both branches occupied and malformed/reused branches rejected",
);
