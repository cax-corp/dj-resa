/* A socket is physical; its accepted plugs are alternatives, never extra sockets. */
const AudioPorts = (() => {
  const signalLabels = {
    mic: "Micro",
    line: "Ligne",
    speaker: "Puissance HP",
    aes3: "AES/EBU",
    spdif: "S/PDIF",
    adat: "ADAT",
    dante: "Dante",
    avb: "AVB",
    usb: "USB audio",
  };
  function signature(ports) {
    return JSON.stringify(
      ports
        .map((p) => ({
          id: p.id,
          name: p.name,
          direction: p.direction,
          connector: p.connector,
          gender: p.gender,
          signal: p.signal,
          channels: Number(p.channels),
          group_name: p.group_name || "",
          audio_role: p.audio_role || "independent",
          alternatives: (p.alternatives || [])
            .map((v) => ({
              id: v.id,
              connector: v.connector,
              gender: v.gender,
              signal: v.signal,
              channels: Number(v.channels),
            }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
  }
  const roles = {
    independent: "Indépendant / mono",
    left_mono: "L / Mono",
    left: "Gauche (L)",
    right: "Droite (R)",
    stereo: "Stéréo sur une seule prise",
  };
  const variant = (
    connector,
    signal = "line",
    channels = 1,
    gender = "female",
  ) => ({ id: crypto.randomUUID(), connector, signal, channels, gender });
  function variants(port) {
    return [
      {
        id: "primary",
        connector: port.connector,
        signal: port.signal,
        channels: port.channels,
        gender: port.gender,
      },
      ...(port.alternatives || []),
    ];
  }
  function resolve(port, id = "primary") {
    const spec = variants(port).find((v) => v.id === (id || "primary"));
    if (!spec)
      throw new Error(
        "Cette fiche n’est plus disponible sur la prise. Choisissez-la à nouveau.",
      );
    return {
      ...port,
      connector: spec.connector,
      signal: spec.signal,
      channels: spec.channels,
      gender: spec.gender,
    };
  }
  function combo() {
    return [variant("xlr3", "line"), variant("jack_trs"), variant("jack_ts")];
  }
  function mg06x() {
    const socket = (
      name,
      direction,
      connector,
      group_name,
      audio_role = "independent",
      extra = {},
    ) => ({
      name,
      direction,
      connector,
      group_name,
      audio_role,
      gender: direction === "out" && connector === "xlr3" ? "male" : "female",
      signal: "line",
      channels: 1,
      alternatives: [],
      ...extra,
    });
    return [
      socket("CH 1 / L · MIC/LINE", "in", "xlr3", "CH 1 / 2", "independent", {
        signal: "mic",
        alternatives: combo(),
      }),
      socket("CH 2 / R · MIC/LINE", "in", "xlr3", "CH 1 / 2", "independent", {
        signal: "mic",
        alternatives: combo(),
      }),
      socket("CH 3 · L / Mono", "in", "jack_ts", "CH 3 / 4", "left_mono"),
      socket("CH 4 · R", "in", "jack_ts", "CH 3 / 4", "right"),
      socket("CH 5 · L / Mono", "in", "jack_ts", "CH 5 / 6", "left_mono"),
      socket("CH 6 · R", "in", "jack_ts", "CH 5 / 6", "right"),
      socket("STEREO OUT · XLR L", "out", "xlr3", "STEREO OUT XLR", "left"),
      socket("STEREO OUT · XLR R", "out", "xlr3", "STEREO OUT XLR", "right"),
      socket(
        "STEREO OUT · Jack L",
        "out",
        "jack_trs",
        "STEREO OUT Jack",
        "left",
        { alternatives: [variant("jack_ts", "line", 1, "female")] },
      ),
      socket(
        "STEREO OUT · Jack R",
        "out",
        "jack_trs",
        "STEREO OUT Jack",
        "right",
        { alternatives: [variant("jack_ts", "line", 1, "female")] },
      ),
      socket("PHONES · Casque", "out", "jack_trs", "Casque", "stereo", {
        channels: 2,
      }),
    ];
  }
  function groups(ports) {
    const grouped = new Map();
    for (const port of ports) {
      if (
        !port.group_name ||
        !["left", "left_mono", "right"].includes(port.audio_role)
      )
        continue;
      const key = port.direction + "|" + port.group_name;
      if (!grouped.has(key))
        grouped.set(key, {
          name: port.group_name,
          direction: port.direction,
          lefts: [],
          rights: [],
        });
      grouped
        .get(key)
        [port.audio_role === "right" ? "rights" : "lefts"].push(port);
    }
    return [...grouped.values()]
      .filter((g) => g.lefts.length === 1 && g.rights.length === 1)
      .map((g) => ({
        name: g.name,
        direction: g.direction,
        left: g.lefts[0],
        right: g.rights[0],
        mono: g.direction === "in" && g.lefts[0].audio_role === "left_mono",
      }));
  }
  function groupNotes(board) {
    const notes = [];
    for (const node of board.nodes) {
      const groups = new Map();
      for (const port of node.ports.filter(
        (p) => p.direction === "in" && p.group_name,
      )) {
        if (!groups.has(port.group_name)) groups.set(port.group_name, []);
        groups.get(port.group_name).push(port);
      }
      for (const [name, ports] of groups) {
        const left = ports.find((p) =>
            ["left_mono", "left"].includes(p.audio_role),
          ),
          right = ports.find((p) => p.audio_role === "right");
        if (!left || !right) continue;
        const used = (p) =>
          board.edges.some(
            (e) =>
              e.to_node === node.id &&
              (e.to_port === p.id || e.to_right_port === p.id),
          );
        if (used(left) && used(right))
          notes.push(
            `${node.label} · ${name} : gauche et droite raccordées (stéréo).`,
          );
        else if (used(left) && left.audio_role === "left_mono")
          notes.push(
            `${node.label} · ${name} : utilisation mono via L / Mono, entrée R libre.`,
          );
        else if (used(right) && !used(left))
          notes.push(
            `${node.label} · ${name} : seule l’entrée R est raccordée. Pour une source mono, utilisez L / Mono si l’appareil le prévoit.`,
          );
      }
    }
    return notes;
  }
  return {
    roles,
    variants,
    resolve,
    combo,
    mg06x,
    groups,
    groupNotes,
    signalLabels,
    signature,
  };
})();
