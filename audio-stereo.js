/* One cable assembly may carry L/R on one stereo connector or two physical sockets. */
const AudioStereo = (() => {
  const used = (edge, side) =>
    [edge[side + "_port"], edge[side + "_right_port"]].filter(Boolean);
  function side(board, edge, key) {
    const node = board.nodes.find((n) => n.id === edge[key + "_node"]);
    const ids = used(edge, key);
    if (ids.length === 2 && (!edge.stereo || ids[0] === ids[1]))
      throw new Error(
        "Choisissez deux prises physiques distinctes pour L et R.",
      );
    const ports = ids.map((id, i) => {
      const p = node?.ports.find((p) => p.id === id);
      if (!p) throw new Error("Une prise de la liaison est indisponible.");
      return AudioPorts.resolve(
        p,
        edge[key + (i ? "_right_variant" : "_variant")],
      );
    });
    if (!ports.length) throw new Error("Choisissez les prises de la liaison.");
    if (ports.some((p) => p.direction !== (key === "from" ? "out" : "in")))
      throw new Error("La liaison doit aller des sorties vers les entrées.");
    if (edge.stereo) {
      if (ports.some((p) => p.signal !== "line"))
        throw new Error(
          "Un cordon stéréo L/R relie des prises analogiques de niveau ligne.",
        );
      if (ports.length === 2 && ports.some((p) => Number(p.channels) !== 1))
        throw new Error("Chaque branche L et R doit utiliser une prise mono.");
      if (
        ports.length === 1 &&
        (Number(ports[0].channels) !== 2 ||
          ![
            "rca_pair",
            "mini_trs",
            "mini_trrs",
            "jack_trs",
            "jack_25",
            "jack_25_trrs",
            "pentaconn",
          ].includes(ports[0].connector))
      )
        throw new Error(
          "Choisissez une prise analogique stéréo ou deux prises mono L/R.",
        );
      if (
        ports.length === 2 &&
        ports.some(
          (p) =>
            !["rca", "jack_ts", "jack_trs", "xlr3", "mini_ts"].includes(
              p.connector,
            ),
        )
      )
        throw new Error(
          "Ces prises ne correspondent pas à un cordon analogique L/R.",
        );
    }
    return {
      node,
      port: ports[0],
      ports,
      channels: ports.reduce((sum, p) => sum + Number(p.channels), 0),
    };
  }
  function choices(board, direction) {
    const result = [];
    for (const node of board.nodes) {
      const free = node.ports.filter(
        (p) =>
          p.direction === direction &&
          !board.edges.some(
            (e) =>
              e[(direction === "out" ? "from" : "to") + "_node"] === node.id &&
              used(e, direction === "out" ? "from" : "to").includes(p.id),
          ),
      );
      for (const p of free)
        for (const v of AudioPorts.variants(p))
          if (
            v.signal === "line" &&
            Number(v.channels) === 2 &&
            [
              "rca_pair",
              "mini_trs",
              "mini_trrs",
              "jack_trs",
              "jack_25",
              "jack_25_trrs",
              "pentaconn",
            ].includes(v.connector)
          )
            result.push({
              node: node.id,
              port: p.id,
              variant: v.id,
              label:
                node.label +
                " · " +
                p.name +
                " · " +
                AudioConnectors.labels[v.connector],
            });
      const groups = [
        ...new Set(free.filter((p) => p.group_name).map((p) => p.group_name)),
      ];
      for (const group of groups) {
        const lefts = free.filter(
            (p) =>
              p.group_name === group &&
              ["left", "left_mono"].includes(p.audio_role),
          ),
          rights = free.filter(
            (p) => p.group_name === group && p.audio_role === "right",
          );
        for (const l of lefts)
          for (const r of rights)
            for (const lv of AudioPorts.variants(l))
              for (const rv of AudioPorts.variants(r)) {
                if (
                  lv.signal !== "line" ||
                  rv.signal !== "line" ||
                  Number(lv.channels) !== 1 ||
                  Number(rv.channels) !== 1
                )
                  continue;
                result.push({
                  node: node.id,
                  port: l.id,
                  variant: lv.id,
                  right_port: r.id,
                  right_variant: rv.id,
                  label:
                    node.label +
                    " · " +
                    group +
                    " · L → " +
                    l.name +
                    " / R → " +
                    r.name +
                    " · " +
                    AudioConnectors.labels[lv.connector] +
                    " / " +
                    AudioConnectors.labels[rv.connector],
                });
              }
      }
    }
    return result;
  }
  function monoChoices(board, direction) {
    const result = [];
    for (const node of board.nodes)
      for (const port of node.ports.filter(
        (p) =>
          p.direction === direction &&
          !board.edges.some(
            (e) =>
              e[(direction === "out" ? "from" : "to") + "_node"] === node.id &&
              used(e, direction === "out" ? "from" : "to").includes(p.id),
          ),
      ))
        for (const v of AudioPorts.variants(port)) {
          if (
            v.signal === "line" &&
            Number(v.channels) === 1 &&
            ["rca", "jack_ts", "jack_trs", "xlr3", "mini_ts"].includes(
              v.connector,
            )
          )
            result.push({
              node: node.id,
              port: port.id,
              variant: v.id,
              label:
                node.label +
                " · " +
                port.name +
                " · " +
                AudioConnectors.labels[v.connector],
            });
        }
    return result;
  }
  return { used, side, choices, monoChoices };
})();
