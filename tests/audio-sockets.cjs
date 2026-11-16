const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const { ports, audio } = vm.runInNewContext(
  ["audio-ports.js", "connector-picker.js", "audio-stereo.js", "audio-setup.js"]
    .map((f) => fs.readFileSync(__dirname + "/../" + f, "utf8"))
    .join("\n") + "\n({ports:AudioPorts,audio:AudioSetup})",
  { crypto: require("node:crypto").webcrypto },
);
const preset = ports.mg06x();
assert.equal(preset.length, 11);
assert.equal(ports.variants(preset[0]).length, 4);
assert.equal(preset.find((p) => p.name.includes("PHONES")).channels, 2);
const source = {
  id: "source",
  label: "Lecteur",
  x: 10,
  y: 10,
  ports: [
    {
      id: "out",
      name: "Out",
      connector: "jack_trs",
      gender: "female",
      signal: "line",
      direction: "out",
      channels: 1,
    },
  ],
};
const mixer = {
  id: "mixer",
  label: "MG06X",
  x: 50,
  y: 50,
  ports: preset.map((p, i) => ({ ...p, id: "p" + i })),
};
const board = { width: 10, depth: 6, nodes: [source, mixer], edges: [] };
const jack = mixer.ports[0].alternatives.find(
  (v) => v.connector === "jack_trs",
);
const edge = {
  id: "edge",
  from_node: "source",
  from_port: "out",
  to_node: "mixer",
  to_port: "p0",
  to_variant: jack.id,
  length: 3,
};
assert.match(
  audio.cable(board, edge).label,
  /Jack 6,35 TRS mâle → Jack 6,35 TRS mâle/,
);
assert.throws(
  () => audio.compatible(board, { ...edge, to_variant: "primary" }),
  /Signaux incompatibles/,
);
assert.throws(
  () => audio.compatible(board, { ...edge, to_variant: "unknown" }),
  /plus disponible/,
);
board.edges = [edge];
assert.throws(
  () =>
    audio.compatible(board, {
      ...edge,
      id: "edge2",
      to_variant: mixer.ports[0].alternatives[0].id,
    }),
  /déjà utilisé/,
);
board.edges = [{ ...edge, to_port: "p2", to_variant: "primary" }];
assert.match(ports.groupNotes(board).join(" "), /utilisation mono/);
board.edges.push({
  ...edge,
  id: "edge2",
  to_port: "p3",
  to_variant: "primary",
});
assert.match(ports.groupNotes(board).join(" "), /gauche et droite/);
board.edges.shift();
assert.match(ports.groupNotes(board).join(" "), /seule l’entrée R/);
console.log(
  "PASS: MG06X physical sockets, mic/line combo options, exact cable ends, shared socket occupancy, unknown variants, stereo/mono and independent L/R",
);

assert.equal(ports.groups(preset).length, 4);
assert.equal(ports.groups(preset).filter(g=>g.mono).length, 2);
const ambiguous = [{...preset[2],id:'left1'}, {...preset[2],id:'left2'}, {...preset[3],id:'right'}];
assert.equal(ports.groups(ambiguous).length, 0, 'Ambiguous legacy labels must not invent physical groups');
