/* Audio routing is explicit. Signal mismatches are never treated as passive adapters. */
const AudioSetup = (() => {
  const connectors = AudioConnectors.labels;
  const signals = {
    mic: "Niveau micro",
    line: "Niveau ligne (console / enceinte active)",
    speaker: "Puissance HP (ampli / enceinte passive)",
    aes3: "AES/EBU",
    spdif: "S/PDIF",
    adat: "ADAT",
    dante: "Dante",
    avb: "AVB",
    usb: "USB audio",
  };
  function endpoint(board, nodeId, portId) {
    const node = board.nodes.find((n) => n.id === nodeId);
    return { node, port: node?.ports.find((p) => p.id === portId) };
  }
  function compatible(board, edge, ignoreId) {
    const from = endpoint(board, edge.from_node, edge.from_port),
      to = endpoint(board, edge.to_node, edge.to_port);
    if (!from.port || !to.port)
      throw new Error("Sélectionnez une sortie et une entrée existantes.");
    if (from.node.id === to.node.id)
      throw new Error("Choisissez deux appareils différents.");
    if (from.port.direction !== "out" || to.port.direction !== "in")
      throw new Error("La liaison doit aller d’une sortie vers une entrée.");
    if (from.port.signal !== to.port.signal)
      throw new Error(
        "Signaux incompatibles. Un câble seul ne convertit pas un niveau micro, ligne, amplifié ou numérique : prévoyez un appareil adapté.",
      );
    if (Number(from.port.channels) !== Number(to.port.channels))
      throw new Error(
        "Ces prises ne transportent pas le même format audio. Utilisez des ports L/R distincts ou un répartiteur adapté.",
      );
    const family = from.port.signal,
      a = from.port.connector,
      b = to.port.connector;
    if (
      family === "usb" &&
      (!AudioConnectors.usb.includes(a) ||
        !AudioConnectors.usb.includes(b) ||
        (a === b && a !== "usb_c"))
    )
      throw new Error(
        "Cette liaison USB nécessite un câble ou un équipement adapté au rôle des appareils.",
      );
    if (
      ["dante", "avb"].includes(family) &&
      (!AudioConnectors.network.includes(a) ||
        !AudioConnectors.network.includes(b))
    )
      throw new Error("Vérifiez la connectique réseau de cette liaison.");
    if (
      family === "adat" &&
      (!AudioConnectors.optical.includes(a) ||
        !AudioConnectors.optical.includes(b))
    )
      throw new Error("Une liaison ADAT nécessite les ports optiques adaptés.");
    if (
      family === "spdif" &&
      AudioConnectors.optical.includes(a) !==
        AudioConnectors.optical.includes(b)
    )
      throw new Error(
        "S/PDIF optique et coaxial nécessitent un convertisseur, pas un câble passif.",
      );
    if (family === "aes3" && a !== b)
      throw new Error(
        "Vérifiez l’adaptation d’impédance AES/EBU entre ces connecteurs.",
      );
    const others = board.edges.filter((e) => e.id !== ignoreId);
    if (
      others.some(
        (e) =>
          (e.from_node === edge.from_node && e.from_port === edge.from_port) ||
          (e.to_node === edge.to_node && e.to_port === edge.to_port),
      )
    )
      throw new Error(
        "Un des ports est déjà utilisé. Ajoutez un répartiteur si nécessaire.",
      );
    const visited = new Set();
    const reaches = (id) => {
      if (id === edge.from_node) return true;
      if (visited.has(id)) return false;
      visited.add(id);
      return others
        .filter((e) => e.from_node === id)
        .some((e) => reaches(e.to_node));
    };
    if (reaches(edge.to_node))
      throw new Error("Cette liaison créerait une boucle de routage.");
    return { from, to };
  }
  const cableEnd = (port) =>
    AudioConnectors.terminals.includes(port.connector)
      ? "Fil dénudé (" + connectors[port.connector] + ")"
      : (connectors[port.connector] || port.connector) +
        (port.gender === "male"
          ? " femelle"
          : port.gender === "female"
            ? " mâle"
            : "");
  function cable(board, edge) {
    const { from, to } = compatible(board, edge, edge.id);
    const dx = ((from.node.x - to.node.x) / 100) * board.width,
      dy = ((from.node.y - to.node.y) / 100) * board.depth;
    const estimate = Math.hypot(dx, dy) * 1.2 + 1;
    const length =
      Number(edge.length) > 0
        ? Number(edge.length)
        : [1, 2, 3, 5, 10, 15, 20, 25, 30, 50, 100, 200].find(
            (n) => n >= estimate,
          ) || Math.ceil(estimate);
    const prefix =
      {
        speaker: "Câble HP · ",
        aes3: "AES/EBU 110 Ω · ",
        spdif: AudioConnectors.optical.includes(from.port.connector)
          ? "Optique · "
          : "Coaxial 75 Ω · ",
        adat: "Optique ADAT · ",
        dante: "Réseau Cat 5e/6 · ",
        avb: "Réseau AVB · ",
        usb: "USB · ",
      }[from.port.signal] || "";
    return {
      label: prefix + cableEnd(from.port) + " → " + cableEnd(to.port),
      length,
      from: from.node.label + " · " + from.port.name,
      to: to.node.label + " · " + to.port.name,
      estimated: !Number(edge.length),
      signal: from.port.signal,
    };
  }
  function cables(board) {
    return board.edges.map((edge, index) => {
      try {
        return { ...cable(board, edge), id: edge.id, index: index + 1 };
      } catch (error) {
        return { id: edge.id, index: index + 1, error: error.message };
      }
    });
  }
  function grouped(board) {
    const groups = new Map();
    for (const c of cables(board)) {
      if (c.error) continue;
      const key = c.label + "|" + c.length;
      if (!groups.has(key)) groups.set(key, { ...c, quantity: 0 });
      groups.get(key).quantity++;
    }
    return [...groups.values()];
  }
  function catalogButton(id) {
    return `<button class="btn small" data-audio-catalog="${id}">Connectique audio</button>`;
  }
  function bindCatalog() {
    Production.buttons("[data-audio-catalog]", async (b) =>
      catalog(b.dataset.audioCatalog),
    );
  }
  async function catalog(equipmentId) {
    const gear = (await Production.list("equipment", { id: equipmentId }))[0];
    if (!gear) throw new Error("Matériel indisponible");
    document.getElementById("audio-catalog-dialog")?.remove();
    const dialog = document.createElement("dialog");
    dialog.id = "audio-catalog-dialog";
    dialog.className = "audio-dialog";
    app.append(dialog);
    dialog.showModal();
    async function render() {
      const ports = await Production.list("equipment_audio_ports", {
        equipment_id: equipmentId,
      });
      dialog.innerHTML = `<div class="tool-toolbar"><h2>Connectique · ${esc(gear.name)}</h2><button type="button" class="btn" id="close-audio-catalog">Fermer</button></div><p class="tool-note">Décrivez les prises physiques de votre appareil. Pour deux prises gauche / droite, créez deux ports distincts. Cliquez sur le dessin pour choisir la connectique. Les setups déjà enregistrés conservent leur copie de ces prises.</p><form id="audio-ports-${equipmentId}" class="stack"><input name="record_id" type="hidden"><div class="row-2"><label>Nom du port<input name="name" required maxlength="100" placeholder="Master gauche"></label><label>Sens<select name="direction">${Production.options({ in: "Entrée", out: "Sortie" })}</select></label><div class="connector-field"><span>Connectique</span><input name="connector" type="hidden" value="xlr3"><input name="channels" type="hidden" value="1"><button type="button" class="btn connector-choice" id="choose-audio-connector" aria-haspopup="dialog"></button></div><label>Prise de l’appareil<select name="gender">${Production.options({ female: "Femelle", male: "Mâle", none: "Non applicable" })}</select></label><label>Signal<select name="signal">${Production.options(signals, "line")}</select></label></div><div class="actions"><button class="btn primary">Enregistrer le port</button><button type="button" class="btn" id="new-audio-port">Nouveau port</button></div></form><div class="tool-list">${ports.map((p) => `<article class="card tool-row"><div><strong>${esc(p.name)}</strong><p>${p.direction === "out" ? "Sortie" : "Entrée"} · ${connectors[p.connector]} · ${signals[p.signal]} · ${p.gender === "male" ? "Mâle" : p.gender === "female" ? "Femelle" : "Sans fiche mâle/femelle"}</p></div><div class="actions"><button class="btn small" data-port-edit="${p.id}">Modifier le port</button><button class="btn small danger" data-port-remove="${p.id}">Supprimer le port</button></div></article>`).join("") || '<p class="empty">Aucun port renseigné.</p>'}</div>`;
      $("#close-audio-catalog").onclick = () => dialog.close();
      const form = dialog.querySelector("form");
      const choice = dialog.querySelector("#choose-audio-connector");
      function refreshChoice() {
        const id = form.elements.connector.value;
        choice.innerHTML =
          AudioConnectors.icon(id) +
          "<span>" +
          esc(connectors[id] || id) +
          '</span><span class="muted">Changer…</span>';
        const terminal = AudioConnectors.terminals.includes(id);
        form.elements.gender.closest("label").hidden = terminal;
        if (terminal) form.elements.gender.value = "none";
      }
      choice.onclick = () =>
        AudioConnectors.choose(form.elements.connector.value, (id) => {
          form.elements.connector.value = id;
          form.elements.channels.value = AudioConnectors.count(id);
          form.elements.gender.value = AudioConnectors.terminals.includes(id)
            ? "none"
            : "female";
          if (
            [
              "binding_post",
              "spring_clip",
              "banana",
              "speakon2",
              "speakon4",
              "speakon8",
              "euroblock2",
            ].includes(id)
          )
            form.elements.signal.value = "speaker";
          else if (AudioConnectors.usb.includes(id))
            form.elements.signal.value = "usb";
          else if (AudioConnectors.network.includes(id))
            form.elements.signal.value = "dante";
          else if (AudioConnectors.optical.includes(id))
            form.elements.signal.value = "spdif";
          else form.elements.signal.value = "line";
          refreshChoice();
          form.elements.connector.dispatchEvent(
            new Event("change", { bubbles: true }),
          );
        });
      Drafts.restore(form);
      refreshChoice();
      Production.submit(form, async (f) => {
        const { record_id, ...values } = Object.fromEntries(new FormData(f));
        values.channels = Number(values.channels);
        const query = record_id
          ? sb
              .from("equipment_audio_ports")
              .update(values)
              .eq("id", record_id)
              .eq("equipment_id", equipmentId)
          : sb
              .from("equipment_audio_ports")
              .insert({ ...values, equipment_id: equipmentId });
        await Production.write(query);
        Drafts.clear(f);
        toast("Port enregistré");
        await render();
      });
      $("#new-audio-port").onclick = () => {
        Drafts.clear(form);
        form.reset();
        form.elements.record_id.value = "";
        form.elements.connector.value = "xlr3";
        form.elements.channels.value = 1;
        refreshChoice();
      };
      Production.buttons(
        "[data-port-edit]",
        (b) => {
          const port = ports.find((p) => p.id === b.dataset.portEdit);
          for (const key of [
            "name",
            "direction",
            "connector",
            "gender",
            "signal",
            "channels",
          ])
            form.elements[key].value = port[key];
          form.elements.record_id.value = port.id;
          refreshChoice();
          form.elements.record_id.dispatchEvent(
            new Event("change", { bubbles: true }),
          );
          form.scrollIntoView({ block: "nearest" });
        },
        dialog,
      );
      Production.buttons(
        "[data-port-remove]",
        async (b) => {
          if (
            !confirm(
              "Supprimer ce port du catalogue ? Les setups existants gardent leur copie.",
            )
          )
            return;
          await Production.write(
            sb
              .from("equipment_audio_ports")
              .delete()
              .eq("id", b.dataset.portRemove)
              .eq("equipment_id", equipmentId),
          );
          await render();
        },
        dialog,
      );
    }
    await render();
  }
  async function open(p, reload) {
    const [saved, reservations, stock, ports] = await Promise.all([
      Production.list("project_setups", { project_id: p.id }),
      Production.list("equipment_reservations", { project_id: p.id }),
      Production.list("equipment"),
      Production.list("equipment_audio_ports"),
    ]);
    const selectedGear = reservations.filter((r) => r.state !== "cancelled");
    const quantities = new Map();
    selectedGear.forEach((r) =>
      quantities.set(
        r.equipment_id,
        (quantities.get(r.equipment_id) || 0) + r.quantity,
      ),
    );
    const revision = saved[0]?.revision || 0,
      base = saved[0]?.layout || {
        width: 10,
        depth: 6,
        nodes: [],
        edges: [],
        zones: [],
      };
    let state = p._canEdit
        ? StageLayout.draft(p.id, "setup", revision, base)
        : StageLayout.clone(base),
      selected = state.nodes[0]?.id || null;
    const editable = p._canEdit;
    $("#tool-content").innerHTML =
      `<div class="tool-toolbar"><h2>Setup et plan de câbles</h2><div class="actions">${editable ? '<button class="btn primary" id="save-setup">Enregistrer le setup</button><button class="btn" id="discard-setup">Reprendre le setup enregistré</button>' : ""}<button class="btn" id="setup-svg">Télécharger le plan SVG</button><button class="btn" id="print-cables">Imprimer la liste des câbles</button><button class="btn" id="print-wiring">Imprimer les liaisons</button>${me.role === "admin" ? `<a class="btn" href="#/outils/${p.id}?section=equipment">Choisir le matériel du projet</a>` : ""}</div></div><p class="tool-note">Placez vos appareils, puis reliez leurs sorties aux entrées. Les types de signaux doivent correspondre. Un changement de niveau, de protocole ou une répartition nécessite l’appareil adapté. Les longueurs automatiques sont estimées à vol d’oiseau avec 20 % de marge et 1 m supplémentaire : ajustez-les selon le cheminement réel. Sur mobile, faites défiler le plan horizontalement ou utilisez les coordonnées sous le plan.</p><p id="setup-status" role="status"></p><div class="production-stage"><svg id="setup-stage" viewBox="0 0 1000 600" role="group" aria-label="Organisation des appareils et liaisons audio" xmlns="http://www.w3.org/2000/svg"></svg></div>${editable ? `<div class="board-controls"><section class="card"><h3>Dimensions et appareils</h3><form id="setup-dimensions" class="production-inline"><label>Largeur (m)<input name="width" type="number" min="1" max="200" step="0.1" value="${state.width}" required></label><label>Profondeur (m)<input name="depth" type="number" min="1" max="200" step="0.1" value="${state.depth}" required></label><button class="btn">Appliquer au brouillon</button></form><form id="setup-add" class="production-inline"><label>Matériel sélectionné<select name="unit" required></select></label><button class="btn">Ajouter au setup</button></form><button type="button" class="btn small" id="setup-add-all">Ajouter les appareils avec connectique</button><form id="setup-node" class="stack"><label>Appareil<select name="node"></select></label><label>Nom dans ce setup<input name="label" maxlength="200"></label><div class="row-2"><label>X (%)<input name="x" type="number" min="5" max="95" step="0.1"></label><label>Y (%)<input name="y" type="number" min="7" max="93" step="0.1"></label></div><div class="actions"><button type="button" class="btn small" id="refresh-node-ports">Actualiser la connectique depuis le catalogue</button><button type="button" class="btn small danger" id="remove-setup-node">Retirer l’appareil du setup</button></div></form></section><section class="card"><h3>Relier deux appareils</h3><form id="setup-wire" class="stack"><label>Sortie<select name="from" required></select></label><label>Entrée<select name="to" required></select></label><label>Longueur choisie (m, 0 = estimation)<input name="cable_length" type="number" min="0" max="200" step="0.1" value="0" required></label><button class="btn primary">Ajouter la liaison</button></form><button type="button" class="btn small" id="suggest-wires">Relier les correspondances uniques</button><p class="tool-note">Les choix ambigus restent à définir manuellement. Pour une conversion optique/coaxiale ou de niveau audio, ajoutez un convertisseur avec sa propre connectique.</p><h3>Zones du setup</h3><form id="setup-zone" class="stack"><label>Nom de zone<input name="name" required maxlength="100" placeholder="Cabine DJ, scène, public…"></label><label>Taille de la zone<select name="size"><option value="small">Petite</option><option value="medium" selected>Moyenne</option><option value="large">Grande</option></select></label><p class="tool-note">Déplacez la zone directement dans le plan. Les blocs des appareils gardent une taille automatique.</p><button class="btn">Ajouter la zone</button></form><div id="setup-zone-list"></div></section></div>` : ""}<section class="card production-section"><h3>Câbles à prévoir</h3><div id="setup-cable-summary"></div></section><div id="setup-connections" class="tool-list"></div><div id="setup-alerts"></div>`;
    const svg = $("#setup-stage"),
      nodeForm = $("#setup-node"),
      wireForm = $("#setup-wire");
    const portCopies = (id) =>
      ports
        .filter((port) => port.equipment_id === id)
        .map(
          ({ id, name, direction, connector, gender, signal, channels }) => ({
            id,
            name,
            direction,
            connector,
            gender,
            signal,
            channels,
          }),
        );
    function remember() {
      StageLayout.remember(p.id, "setup", revision, state);
      $("#setup-status").textContent = "Brouillon modifié · à enregistrer";
    }
    function selectors() {
      if (!editable) return;
      const currentFrom = wireForm.elements.from.value,
        currentTo = wireForm.elements.to.value;
      $("#setup-add").elements.unit.innerHTML =
        '<option value="">Choisir un exemplaire</option>' +
        stock
          .filter((g) => quantities.has(g.id))
          .flatMap((g) =>
            Array.from(
              { length: Math.min(quantities.get(g.id), 80) },
              (_, i) => i + 1,
            )
              .filter(
                (unit) =>
                  !state.nodes.some(
                    (n) => n.equipment_id === g.id && n.unit === unit,
                  ),
              )
              .map(
                (unit) =>
                  `<option value="${g.id}:${unit}">${esc(g.name)} · exemplaire ${unit}</option>`,
              ),
          )
          .join("");
      nodeForm.elements.node.innerHTML = state.nodes
        .map((n) => `<option value="${n.id}">${esc(n.label)}</option>`)
        .join("");
      nodeForm.elements.node.value = selected || "";
      for (const direction of ["out", "in"]) {
        const select =
          direction === "out" ? wireForm.elements.from : wireForm.elements.to;
        select.innerHTML =
          '<option value="">Choisir un port libre</option>' +
          state.nodes
            .flatMap((n) =>
              n.ports
                .filter(
                  (port) =>
                    port.direction === direction &&
                    !state.edges.some((e) =>
                      direction === "out"
                        ? e.from_node === n.id && e.from_port === port.id
                        : e.to_node === n.id && e.to_port === port.id,
                    ),
                )
                .map(
                  (port) =>
                    `<option value="${n.id}|${port.id}">${esc(n.label)} · ${esc(port.name)} · ${signals[port.signal]}</option>`,
                ),
            )
            .join("");
        select.value = direction === "out" ? currentFrom : currentTo;
      }
    }
    function draw() {
      for (const z of state.zones) {
        z.x = Math.min(z.x, 100 - z.w);
        z.y = Math.min(z.y, 100 - z.h);
      }
      const cableRows = cables(state);
      svg.innerHTML = `<defs><marker id="audio-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#555"/></marker></defs><rect width="1000" height="600" fill="#fff"/><text x="20" y="27" fill="#666" font-family="sans-serif" font-size="15">${esc(p.title)} · ${state.width} m × ${state.depth} m</text>${state.zones.map((z) => `<g data-stage-id="${z.id}" tabindex="0" role="button" aria-label="Zone ${esc(z.name)}" style="cursor:move"><rect x="${z.x * 10}" y="${z.y * 6}" width="${z.w * 10}" height="${z.h * 6}" fill="#f9f9f9" stroke="#bbb" stroke-dasharray="6 4"/><text x="${z.x * 10 + 8}" y="${z.y * 6 + 20}" fill="#777" font-family="sans-serif" font-size="14">${esc(z.name)}</text></g>`).join("")}${state.edges
        .map((e, i) => {
          const a = state.nodes.find((n) => n.id === e.from_node),
            b = state.nodes.find((n) => n.id === e.to_node);
          if (!a || !b) return "";
          const dx = (b.x - a.x) * 10,
            dy = (b.y - a.y) * 6,
            k = Math.min(
              80 / (Math.abs(dx) || 1),
              35 / (Math.abs(dy) || 1),
              0.4,
            ),
            x1 = a.x * 10 + dx * k,
            y1 = a.y * 6 + dy * k,
            x2 = b.x * 10 - dx * k,
            y2 = b.y * 6 - dy * k;
          return `<g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#555" stroke-width="2" marker-end="url(#audio-arrow)"/><rect x="${(x1 + x2) / 2 - 15}" y="${(y1 + y2) / 2 - 12}" width="30" height="23" rx="3" fill="#fff" stroke="#bbb"/><text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 + 4}" text-anchor="middle" fill="#333" font-family="sans-serif" font-size="12">C${i + 1}</text></g>`;
        })
        .join(
          "",
        )}${state.nodes.map((n) => `<g data-stage-id="${n.id}" tabindex="0" role="button" aria-label="${esc(n.label)}" transform="translate(${n.x * 10},${n.y * 6})" style="cursor:move"><rect x="-80" y="-35" width="160" height="70" rx="6" fill="${n.id === selected ? "#202020" : "#f1f1f1"}" stroke="#555"/><text y="-8" text-anchor="middle" fill="${n.id === selected ? "#fff" : "#222"}" font-family="sans-serif" font-size="13">${esc(n.label.slice(0, 25))}</text><text y="14" text-anchor="middle" fill="${n.id === selected ? "#ddd" : "#555"}" font-family="sans-serif" font-size="11">${n.ports.filter((p) => p.direction === "in").length} entrée(s) · ${n.ports.filter((p) => p.direction === "out").length} sortie(s)</text></g>`).join("")}`;
      const groups = grouped(state);
      $("#setup-cable-summary").innerHTML = groups.length
        ? `<div class="production-table-scroll"><table class="production-table"><thead><tr><th>Type de liaison</th><th>Longueur</th><th>Quantité</th></tr></thead><tbody>${groups.map((g) => `<tr><td>${esc(g.label)}</td><td>${g.length} m</td><td>${g.quantity}</td></tr>`).join("")}</tbody></table></div>`
        : '<p class="empty">Aucune liaison définie. Reliez vos appareils pour calculer les câbles.</p>';
      $("#setup-connections").innerHTML = cableRows
        .map(
          (c) =>
            `<article class="card"><strong>C${c.index} · ${c.error ? esc(c.error) : esc(c.label)}</strong>${c.error ? "" : `<p>${esc(c.from)} → ${esc(c.to)}</p><p>${c.length} m · ${c.estimated ? "longueur estimée" : "longueur choisie"}</p>${c.signal === "speaker" ? '<p class="muted">Câble haut-parleur : section à choisir selon puissance, impédance et longueur.</p>' : ""}${["usb", "adat", "spdif", "aes3", "dante", "avb"].includes(c.signal) ? '<p class="muted">Vérifiez la longueur et les spécifications admises par les appareils pour cette liaison.</p>' : ""}`}${editable ? `<button class="btn small danger" data-remove-wire="${c.id}">Retirer cette liaison</button>` : ""}</article>`,
        )
        .join("");
      Production.buttons("[data-remove-wire]", (b) => {
        state.edges = state.edges.filter((e) => e.id !== b.dataset.removeWire);
        selectors();
        draw();
        remember();
      });
      $("#setup-alerts").innerHTML = state.nodes
        .filter(
          (n) =>
            !n.ports.length ||
            !state.edges.some(
              (e) => e.from_node === n.id || e.to_node === n.id,
            ),
        )
        .map(
          (n) =>
            `<p class="warn-text">${esc(n.label)} : ${!n.ports.length ? "connectique à renseigner ou actualiser" : "aucune liaison définie"}.</p>`,
        )
        .join("");
      if (nodeForm) {
        const n = state.nodes.find((n) => n.id === selected);
        for (const key of ["label", "x", "y"])
          nodeForm.elements[key].value = n?.[key] ?? "";
        $("#setup-zone-list").innerHTML = state.zones
          .map(
            (z) =>
              `<p>${esc(z.name)} <button type="button" class="btn small" data-remove-zone="${z.id}">Retirer la zone</button></p>`,
          )
          .join("");
        Production.buttons("[data-remove-zone]", (b) => {
          state.zones = state.zones.filter(
            (z) => z.id !== b.dataset.removeZone,
          );
          draw();
          remember();
        });
      }
    }
    function select(id) {
      selected = state.nodes.some((n) => n.id === id) ? id : selected;
      if (nodeForm) nodeForm.elements.node.value = id;
      draw();
    }
    StageLayout.drag(svg, {
      editable,
      items: () => [...state.nodes, ...state.zones],
      select,
      changed: remember,
      draw,
    });
    selectors();
    draw();
    $("#setup-status").textContent =
      JSON.stringify(state) === JSON.stringify(base)
        ? "Setup enregistré"
        : "Brouillon restauré · à enregistrer";
    $("#setup-svg").onclick = () =>
      StageLayout.downloadSVG(
        svg,
        "setup-audio.svg",
        cables(state).map((c) =>
          c.error
            ? "C" + c.index + " : " + c.error
            : "C" +
              c.index +
              " : " +
              c.from +
              " → " +
              c.to +
              " · " +
              c.label +
              " · " +
              c.length +
              " m",
        ),
      );
    $("#print-cables").onclick = () => {
      if (cables(state).some((c) => c.error))
        return ERR(
          new Error("Corrigez les liaisons invalides avant d’imprimer."),
        );
      Enhancements.printList(
        p,
        "Câbles à emporter",
        ["Liaison", "Longueur", "Quantité"],
        grouped(state).map((g) => [g.label, g.length + " m", g.quantity]),
      );
    };
    $("#print-wiring").onclick = () =>
      Enhancements.printList(
        p,
        "Liaisons audio",
        ["N°", "Sortie", "Entrée", "Câble", "Longueur"],
        cables(state).map((c) => [
          String(c.index),
          c.from || "—",
          c.to || "—",
          c.error || c.label,
          c.length ? c.length + " m" : "—",
        ]),
      );
    if (!editable) return;
    Production.buttons("#save-setup", async () => {
      for (const edge of state.edges) compatible(state, edge, edge.id);
      await Production.write(
        sb.rpc("save_project_setup", {
          pid: p.id,
          board: state,
          expected_revision: revision,
        }),
      );
      StageLayout.clear(p.id, "setup");
      toast("Setup enregistré");
      await reload();
    });
    $("#discard-setup").onclick = () => {
      if (
        !confirm("Abandonner le brouillon et reprendre le setup enregistré ?")
      )
        return;
      StageLayout.clear(p.id, "setup");
      reload();
    };
    function addNode(gearId, unit) {
      if (state.nodes.length >= 80)
        throw new Error("Limite de 80 appareils dans ce plan.");
      if (state.nodes.some((n) => n.equipment_id === gearId && n.unit === unit))
        return;
      const gear = stock.find((g) => g.id === gearId);
      if (!gear) throw new Error("Matériel indisponible");
      const i = state.nodes.length,
        n = {
          id: crypto.randomUUID(),
          equipment_id: gearId,
          unit,
          label: (gear.name + " #" + unit).slice(0, 200),
          x: 14 + (i % 5) * 18,
          y: 17 + (Math.floor(i / 5) % 4) * 21,
          ports: portCopies(gearId),
        };
      state.nodes.push(n);
      selected = n.id;
    }
    Production.submit($("#setup-add"), async (f) => {
      const [gearId, unit] = f.elements.unit.value.split(":");
      addNode(gearId, Number(unit));
      selectors();
      draw();
      remember();
    });
    Production.buttons("#setup-add-all", () => {
      for (const [id, quantity] of quantities) {
        if (!ports.some((p) => p.equipment_id === id)) continue;
        for (let unit = 1; unit <= Math.min(quantity, 80); unit++) {
          if (state.nodes.length >= 80) break;
          addNode(id, unit);
        }
      }
      selectors();
      draw();
      remember();
    });
    Production.submit($("#setup-dimensions"), async (f) => {
      state.width = Number(f.elements.width.value);
      state.depth = Number(f.elements.depth.value);
      draw();
      remember();
    });
    nodeForm.onsubmit = (e) => e.preventDefault();
    nodeForm.elements.node.onchange = () =>
      select(nodeForm.elements.node.value);
    for (const key of ["label", "x", "y"])
      nodeForm.elements[key].oninput = () => {
        const n = state.nodes.find((n) => n.id === selected);
        if (!n) return;
        n[key] =
          key === "label"
            ? nodeForm.elements[key].value
            : Math.max(
                key === "x" ? 5 : 7,
                Math.min(
                  key === "x" ? 95 : 93,
                  Number(nodeForm.elements[key].value),
                ),
              );
        draw();
        remember();
        if (key === "label") selectors();
      };
    $("#remove-setup-node").onclick = () => {
      if (
        !selected ||
        !confirm("Retirer cet appareil et ses liaisons de ce brouillon ?")
      )
        return;
      state.edges = state.edges.filter(
        (e) => e.from_node !== selected && e.to_node !== selected,
      );
      state.nodes = state.nodes.filter((n) => n.id !== selected);
      selected = state.nodes[0]?.id;
      selectors();
      draw();
      remember();
    };
    Production.buttons("#refresh-node-ports", async () => {
      const n = state.nodes.find((n) => n.id === selected);
      if (
        !n ||
        !confirm(
          "Actualiser la connectique depuis le catalogue ? Les liaisons devenues incompatibles seront retirées du brouillon.",
        )
      )
        return;
      const fresh = await Production.list("equipment_audio_ports", {
        equipment_id: n.equipment_id,
      });
      for (let i = ports.length - 1; i >= 0; i--)
        if (ports[i].equipment_id === n.equipment_id) ports.splice(i, 1);
      ports.push(...fresh);
      n.ports = portCopies(n.equipment_id);
      state.edges = state.edges.filter((edge) => {
        try {
          compatible(state, edge, edge.id);
          return true;
        } catch {
          return false;
        }
      });
      selectors();
      draw();
      remember();
    });
    Production.submit(wireForm, async (f) => {
      const [from_node, from_port] = f.elements.from.value.split("|"),
        [to_node, to_port] = f.elements.to.value.split("|");
      const edge = {
        id: crypto.randomUUID(),
        from_node,
        from_port,
        to_node,
        to_port,
        length: Number(f.elements.cable_length.value),
      };
      compatible(state, edge);
      state.edges.push(edge);
      selectors();
      draw();
      remember();
    });
    Production.buttons("#suggest-wires", () => {
      let added = 0;
      for (const n of state.nodes)
        for (const input of n.ports.filter((p) => p.direction === "in")) {
          if (
            state.edges.some(
              (e) => e.to_node === n.id && e.to_port === input.id,
            )
          )
            continue;
          const candidates = [];
          for (const src of state.nodes)
            for (const out of src.ports.filter(
              (p) => p.direction === "out" && p.connector === input.connector,
            )) {
              const edge = {
                id: crypto.randomUUID(),
                from_node: src.id,
                from_port: out.id,
                to_node: n.id,
                to_port: input.id,
                length: 0,
              };
              try {
                compatible(state, edge);
                candidates.push(edge);
              } catch {}
            }
          if (candidates.length === 1) {
            const candidate = candidates[0];
            let destinations = 0;
            for (const other of state.nodes)
              for (const port of other.ports.filter(
                (p) => p.direction === "in" && p.connector === input.connector,
              )) {
                try {
                  compatible(state, {
                    ...candidate,
                    to_node: other.id,
                    to_port: port.id,
                  });
                  destinations++;
                } catch {}
              }
            if (destinations === 1) {
              state.edges.push(candidate);
              added++;
            }
          }
        }
      selectors();
      draw();
      remember();
      toast(
        `${added} liaison(s) ajoutée(s). Les choix ambigus restent à définir.`,
      );
    });
    Production.submit($("#setup-zone"), async (f) => {
      if (state.zones.length >= 20) throw new Error("Limite de 20 zones.");
      const values = Object.fromEntries(new FormData(f));
      const z = {
        id: crypto.randomUUID(),
        name: values.name.trim(),
        x: 10,
        y: 10,
        w: { small: 20, medium: 35, large: 60 }[values.size] || 35,
        h: { small: 20, medium: 35, large: 60 }[values.size] || 35,
      };
      if (z.x + z.w > 100 || z.y + z.h > 100)
        throw new Error("La zone doit rester dans le plan.");
      state.zones.push(z);
      Drafts.clear(f);
      draw();
      remember();
    });
  }
  return {
    open,
    catalog,
    catalogButton,
    bindCatalog,
    connectors,
    signals,
    compatible,
    cable,
    cables,
    grouped,
  };
})();
