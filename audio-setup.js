/* Audio routing is explicit. Signal mismatches are never treated as passive adapters. */
const AudioSetup = (() => {
  const connectors = AudioConnectors.labels;
  const signals = {
    mic: "Niveau micro",
    line: "Niveau ligne (sortie console / entrée ampli ou enceinte active)",
    speaker: "Puissance HP (sortie ampli / entrée enceinte passive)",
    aes3: "AES/EBU",
    spdif: "S/PDIF",
    adat: "ADAT",
    dante: "Dante",
    avb: "AVB",
    usb: "USB audio",
  };
  function endpoint(board, nodeId, portId, variantId) {
    const node = board.nodes.find((n) => n.id === nodeId);
    const physical = node?.ports.find((p) => p.id === portId);
    return {
      node,
      port: physical ? AudioPorts.resolve(physical, variantId) : null,
    };
  }
  function compatible(board, edge, ignoreId) {
    const from = AudioStereo.side(board, edge, "from"),
      to = AudioStereo.side(board, edge, "to");
    if (from.node.id === to.node.id)
      throw new Error("Choisissez deux appareils différents.");
    if (
      from.ports.some((p) => p.signal !== to.port.signal) ||
      to.ports.some((p) => p.signal !== from.port.signal)
    )
      throw new Error(
        "Signaux incompatibles. Un câble seul ne convertit pas les niveaux audio.",
      );
    if (from.channels !== to.channels)
      throw new Error(
        "Pour relier une sortie stéréo à deux entrées mono, utilisez « Cordon stéréo L/R ».",
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
          (e.from_node === edge.from_node &&
            AudioStereo.used(e, "from").some((id) =>
              AudioStereo.used(edge, "from").includes(id),
            )) ||
          (e.to_node === edge.to_node &&
            AudioStereo.used(e, "to").some((id) =>
              AudioStereo.used(edge, "to").includes(id),
            )),
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
  function stereoEnd(ports) {
    if (ports.length === 1 && ports[0].connector === "rca_pair")
      return (
        "2 RCA " +
        (ports[0].gender === "female"
          ? "mâles"
          : ports[0].gender === "male"
            ? "femelles"
            : "")
      );
    if (
      ports.length === 2 &&
      ports[0].connector === ports[1].connector &&
      ports[0].gender === ports[1].gender
    )
      return "2 × " + cableEnd(ports[0]);
    return ports.map(cableEnd).join(" + ");
  }
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
      label:
        prefix +
        (edge.stereo
          ? stereoEnd(from.ports) + " → " + stereoEnd(to.ports)
          : cableEnd(from.port) + " → " + cableEnd(to.port)),
      length,
      from:
        from.node.label +
        " · " +
        from.ports
          .map(
            (p, i) =>
              (from.ports.length > 1 ? (i ? "R : " : "L : ") : "") + p.name,
          )
          .join(" / "),
      to:
        to.node.label +
        " · " +
        to.ports
          .map(
            (p, i) =>
              (to.ports.length > 1 ? (i ? "R : " : "L : ") : "") + p.name,
          )
          .join(" / "),
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
      dialog.innerHTML = `<div class="tool-toolbar"><h2>Connectique · ${esc(gear.name)}</h2><button type="button" class="btn" id="close-audio-catalog">Fermer</button></div><p class="tool-note">Décrivez les prises physiques et leurs groupes sur l’appareil. Une entrée L/Mono–R est un groupe stéréo composé de deux prises. Cliquez sur le dessin pour choisir la connectique. Les setups déjà enregistrés conservent leur copie de ces prises.</p><div class="actions audio-model-launch"><button type="button" class="btn primary" id="search-audio-model">Rechercher un modèle</button><span class="muted">Préremplir depuis une fiche ou un autre appareil.</span></div>${AudioGroups.markup(ports)}<details class="audio-individual-editor"><summary>Ajouter ou modifier une prise individuelle</summary><form id="audio-ports-${equipmentId}" class="stack"><input name="record_id" type="hidden"><div class="row-2"><label>Nom du port<input name="name" required maxlength="100" placeholder="Master gauche"></label><label>Sens<select name="direction">${Production.options({ in: "Entrée", out: "Sortie" })}</select></label><div class="connector-field"><span>Connectique</span><input name="connector" type="hidden" value="xlr3"><input name="channels" type="hidden" value="1"><button type="button" class="btn connector-choice" id="choose-audio-connector" aria-haspopup="dialog"></button></div><label>Prise de l’appareil<select name="gender">${Production.options({ female: "Femelle", male: "Mâle", none: "Non applicable" })}</select></label><label>Signal de cette prise<select name="signal">${Production.options(signals, "line")}</select><small class="tool-note">L’entrée d’un ampli reçoit du niveau ligne. Ses sorties vers des enceintes passives sont de puissance HP.</small></label><label>Groupe / repère (facultatif)<input name="group_name" maxlength="100" placeholder="CH 3 / 4, AUX, Master…"></label><label>Repère audio<select name="audio_role">${Production.options(AudioPorts.roles, "independent")}</select></label></div><input name="alternatives" type="hidden" value="[]"><section class="audio-alternatives"><h3>Autres fiches acceptées sur cette même prise</h3><p class="tool-note">Pour une prise combo ou plusieurs niveaux acceptés : ajoutez les possibilités ici. Une seule fiche pourra y être branchée à la fois. Pour deux prises L/R distinctes, utilisez « Ajouter une paire L/Mono–R » ci-dessous.</p><div id="audio-alternatives-list"></div><button type="button" class="btn small" id="add-audio-alternative">Ajouter une possibilité sur cette prise</button></section><div class="actions"><button class="btn primary">Enregistrer le port</button><button type="button" class="btn" id="new-audio-port">Nouveau port</button></div></form></details><section class="card audio-helpers"><h3>Ajouter rapidement des prises</h3><div class="actions"><button type="button" class="btn" id="add-mg06x">Ajouter le modèle Yamaha MG06X</button></div><p class="tool-note">Les ajouts complètent la liste sans remplacer vos prises. Modèle MG06X : 2 combos MIC/LINE, entrées 3/4 et 5/6, sorties stéréo XLR et jack, casque. Vérifiez les réglages MIC/LINE, PAD, MONO/STEREO et le manuel avant branchement.</p></section><div class="tool-list">${
        ports
          .map(
            (p) =>
              `<article class="card tool-row"><div><strong>${esc(p.name)}</strong><p>${p.direction === "out" ? "Sortie" : "Entrée"} · ${AudioPorts.variants(
                p,
              )
                .map(
                  (v) =>
                    esc(connectors[v.connector]) +
                    " · " +
                    esc(signals[v.signal]),
                )
                .join(
                  " / ",
                )} ${p.group_name ? " · " + esc(p.group_name) : ""} ${p.audio_role && p.audio_role !== "independent" ? " · " + esc(AudioPorts.roles[p.audio_role]) : ""} · ${p.gender === "male" ? "Mâle" : p.gender === "female" ? "Femelle" : "Sans fiche mâle/femelle"}</p></div><div class="actions"><button class="btn small" data-port-edit="${p.id}">Modifier le port</button><button class="btn small danger" data-port-remove="${p.id}">Supprimer le port</button></div></article>`,
          )
          .join("") || '<p class="empty">Aucun port renseigné.</p>'
      }</div>`;
      $("#close-audio-catalog").onclick = () => dialog.close();
      AudioGroups.bind(dialog, gear, ports, render);
      dialog.querySelector(".audio-individual-editor").open = true;
      const form = dialog.querySelector("form");
      const choice = dialog.querySelector("#choose-audio-connector");
      function alternatives() {
        return JSON.parse(form.elements.alternatives.value || "[]");
      }
      function saveAlternatives(items) {
        form.elements.alternatives.value = JSON.stringify(items);
        form.elements.alternatives.dispatchEvent(
          new Event("change", { bubbles: true }),
        );
        refreshChoice();
      }
      function renderAlternatives() {
        const list = dialog.querySelector("#audio-alternatives-list");
        list.innerHTML =
          alternatives()
            .map(
              (v) =>
                `<div class="audio-alternative" data-variant="${esc(v.id)}">${AudioConnectors.icon(v.connector)}<strong>${esc(connectors[v.connector])}</strong><label>Signal<select data-alt-signal>${Production.options(signals, v.signal)}</select></label><label>Prise<select data-alt-gender>${Production.options({ female: "Femelle", male: "Mâle", none: "Non applicable" }, v.gender)}</select></label><button type="button" class="btn small danger" data-alt-remove>Retirer</button></div>`,
            )
            .join("") ||
          '<p class="muted">Une seule fiche acceptée pour le moment.</p>';
        list.querySelectorAll("[data-variant]").forEach((row) => {
          const update = (key, value) => {
            const items = alternatives();
            items.find((v) => v.id === row.dataset.variant)[key] = value;
            saveAlternatives(items);
          };
          row.querySelector("[data-alt-signal]").onchange = (e) =>
            update("signal", e.target.value);
          row.querySelector("[data-alt-gender]").onchange = (e) =>
            update("gender", e.target.value);
          row.querySelector("[data-alt-remove]").onclick = () =>
            saveAlternatives(
              alternatives().filter((v) => v.id !== row.dataset.variant),
            );
        });
      }
      dialog.querySelector("#add-audio-alternative").onclick = () => {
        if (alternatives().length >= 8)
          return ERR(
            new Error("Limite de 8 possibilités supplémentaires par prise."),
          );
        AudioConnectors.choose("", (id) => {
          if (id === "combo_xlr_jack")
            return ERR(
              new Error(
                "Choisissez la fiche précise à ajouter (XLR, jack TS ou TRS).",
              ),
            );
          saveAlternatives([
            ...alternatives(),
            {
              id: crypto.randomUUID(),
              connector: id,
              signal: form.elements.signal.value,
              gender: AudioConnectors.terminals.includes(id)
                ? "none"
                : form.elements.gender.value,
              channels: Number(form.elements.channels.value),
            },
          ]);
        });
      };
      function refreshChoice() {
        const physical = form.elements.connector.value;
        const id =
          physical === "xlr3" &&
          alternatives().some((v) =>
            ["jack_ts", "jack_trs"].includes(v.connector),
          )
            ? "combo_xlr_jack"
            : physical;
        choice.innerHTML =
          AudioConnectors.icon(id) +
          "<span>" +
          esc(connectors[id] || id) +
          '</span><span class="muted">Changer…</span>';
        const terminal = AudioConnectors.terminals.includes(id);
        form.elements.gender.closest("label").hidden = terminal;
        if (terminal) form.elements.gender.value = "none";
        renderAlternatives();
      }
      choice.onclick = () =>
        AudioConnectors.choose(form.elements.connector.value, (id) => {
          if (id === "combo_xlr_jack") {
            form.elements.connector.value = "xlr3";
            form.elements.signal.value = "mic";
            form.elements.channels.value = 1;
            form.elements.gender.value = "female";
            form.elements.audio_role.value = "independent";
            saveAlternatives(AudioPorts.combo());
            refreshChoice();
            form.elements.connector.dispatchEvent(
              new Event("change", { bubbles: true }),
            );
            return;
          }
          form.elements.connector.value = id;
          form.elements.channels.value =
            form.elements.audio_role.value === "stereo"
              ? 2
              : ["left", "right", "left_mono"].includes(
                    form.elements.audio_role.value,
                  )
                ? 1
                : AudioConnectors.count(id);
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
      form.elements.audio_role.onchange = () => {
        const role = form.elements.audio_role.value;
        const count =
          role === "stereo"
            ? 2
            : role === "independent"
              ? AudioConnectors.count(form.elements.connector.value)
              : 1;
        form.elements.channels.value = count;
        saveAlternatives(
          alternatives().map((v) => ({ ...v, channels: count })),
        );
      };
      Production.submit(form, async (f) => {
        const { record_id, ...values } = Object.fromEntries(new FormData(f));
        values.channels = Number(values.channels);
        values.alternatives = JSON.parse(values.alternatives || "[]");
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
        form.elements.alternatives.value = "[]";
        refreshChoice();
      };
      async function addMissing(candidates) {
        const missing = candidates.filter(
          (c) =>
            !ports.some(
              (p) => p.name === c.name && p.direction === c.direction,
            ),
        );
        if (!missing.length) return toast("Ces prises existent déjà.");
        await Production.write(
          sb
            .from("equipment_audio_ports")
            .insert(missing.map((c) => ({ ...c, equipment_id: equipmentId }))),
        );
        toast(`${missing.length} prise(s) ajoutée(s)`);
        await render();
      }
      Production.buttons("#search-audio-model", () =>
        AudioModels.open(gear, ports, addMissing),
      );
      Production.buttons("#add-mg06x", async () => {
        if (
          !confirm(
            "Ajouter les prises du modèle Yamaha MG06X ? Vos prises existantes seront conservées.",
          )
        )
          return;
        await addMissing(AudioPorts.mg06x());
      });
      dialog.querySelector("#add-stereo-pair").onclick = () => {
        const popup = document.createElement("dialog");
        popup.className = "audio-dialog";
        popup.id = "stereo-pair-dialog";
        popup.setAttribute("aria-label", "Ajouter une paire L/Mono–R");
        popup.innerHTML = `<h2>Ajouter une paire L/Mono–R</h2><p>Un seul groupe stéréo composé de deux prises physiques.</p><form class="stack"><label>Nom du groupe<input name="group" required maxlength="80" placeholder="CH 3 / 4"></label><label>Sens<select name="direction">${Production.options({ in: "Entrées", out: "Sorties" })}</select></label><label>Type de paire<select name="kind"><option value="left_mono">L/Mono + R</option><option value="left">L + R</option></select></label><input name="pair_connector" type="hidden" value="jack_ts"><label>Connectique des deux prises<button type="button" class="btn connector-choice" data-pair-connector></button></label><label>Prise sur l’appareil<select name="pair_gender">${Production.options({ female: "Femelle", male: "Mâle", none: "Non applicable" })}</select></label><p class="tool-note">Deux prises de niveau ligne. Les prises L et R seront créées dans le même groupe. Le mode L/Mono est proposé pour les entrées uniquement.</p><div class="actions"><button class="btn primary">Ajouter les deux prises</button><button type="button" class="btn" data-cancel-pair>Annuler</button></div></form>`;
        app.append(popup);
        popup.showModal();
        popup.querySelector("[data-cancel-pair]").onclick = () => popup.close();
        popup.addEventListener("close", () => popup.remove(), { once: true });
        const pairForm = popup.querySelector("form"),
          pairButton = popup.querySelector("[data-pair-connector]");
        function pairIcon() {
          const id = pairForm.elements.pair_connector.value;
          pairButton.innerHTML =
            AudioConnectors.icon(id) +
            "<span>" +
            esc(connectors[id]) +
            "</span>";
        }
        pairButton.onclick = () =>
          AudioConnectors.choose(
            pairForm.elements.pair_connector.value,
            (id) => {
              if (
                !["jack_ts", "jack_trs", "rca", "xlr3", "mini_ts"].includes(id)
              )
                return ERR(
                  new Error("Choisissez une prise mono : jack, RCA ou XLR."),
                );
              pairForm.elements.pair_connector.value = id;
              pairIcon();
            },
          );
        pairForm.elements.direction.onchange = () => {
          const output = pairForm.elements.direction.value === "out";
          pairForm.elements.kind.querySelector('[value="left_mono"]').disabled =
            output;
          if (output) pairForm.elements.kind.value = "left";
        };
        pairIcon();
        Production.submit(pairForm, async (f) => {
          const group = f.elements.group.value.trim(),
            direction = f.elements.direction.value;
          if (!group) throw new Error("Donnez un nom au groupe.");
          if (
            ports.some(
              (p) =>
                p.direction === direction &&
                p.group_name === group &&
                ["left", "left_mono", "right"].includes(p.audio_role),
            )
          )
            throw new Error(
              "Ce groupe existe déjà. Modifiez-le ou choisissez un autre nom.",
            );
          const spec = {
            direction,
            connector: f.elements.pair_connector.value,
            signal: "line",
            gender: f.elements.pair_gender.value,
            channels: 1,
            alternatives: [],
            group_name: group,
          };
          await addMissing([
            {
              ...spec,
              name:
                group +
                " · " +
                (f.elements.kind.value === "left_mono" ? "L / Mono" : "L"),
              audio_role: f.elements.kind.value,
            },
            { ...spec, name: group + " · R", audio_role: "right" },
          ]);
          popup.close();
        });
      };
      Production.buttons(
        "[data-port-edit]",
        (b) => {
          dialog.querySelector(".audio-individual-editor").open = true;
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
          form.elements.group_name.value = port.group_name || "";
          form.elements.audio_role.value = port.audio_role || "independent";
          form.elements.alternatives.value = JSON.stringify(
            port.alternatives || [],
          );
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
      `<div class="tool-toolbar"><h2>Setup et plan de câbles</h2><div class="actions">${editable ? '<button class="btn primary" id="save-setup">Enregistrer le setup</button><button class="btn" id="discard-setup">Reprendre le setup enregistré</button>' : ""}<button class="btn" id="setup-svg">Télécharger le plan SVG</button><button class="btn" id="print-cables">Imprimer la liste des câbles</button><button class="btn" id="print-wiring">Imprimer les liaisons</button>${me.role === "admin" ? `<a class="btn" href="#/outils/${p.id}?section=equipment">Choisir le matériel du projet</a>` : ""}</div></div><p class="tool-note">Placez vos appareils, puis reliez leurs sorties aux entrées. Les types de signaux doivent correspondre. Un changement de niveau, de protocole ou une répartition nécessite l’appareil adapté. Les longueurs automatiques sont estimées à vol d’oiseau avec 20 % de marge et 1 m supplémentaire : ajustez-les selon le cheminement réel. Sur mobile, faites défiler le plan horizontalement ou utilisez les coordonnées sous le plan.</p><p id="setup-status" role="status"></p><div id="setup-catalogue-diff"></div><div id="setup-input-groups" class="setup-group-states"></div><div class="production-stage"><svg id="setup-stage" viewBox="0 0 1000 600" role="group" aria-label="Organisation des appareils et liaisons audio" xmlns="http://www.w3.org/2000/svg"></svg></div>${editable ? `<div class="board-controls"><section class="card"><h3>Dimensions et appareils</h3><form id="setup-dimensions" class="production-inline"><label>Largeur (m)<input name="width" type="number" min="1" max="200" step="0.1" value="${state.width}" required></label><label>Profondeur (m)<input name="depth" type="number" min="1" max="200" step="0.1" value="${state.depth}" required></label><button class="btn">Appliquer au brouillon</button></form><form id="setup-add" class="production-inline"><label>Matériel sélectionné<select name="unit" required></select></label><button class="btn">Ajouter au setup</button></form><button type="button" class="btn small" id="setup-add-all">Ajouter les appareils avec connectique</button><form id="setup-node" class="stack"><label>Appareil<select name="node"></select></label><label>Nom dans ce setup<input name="label" maxlength="200"></label><div class="row-2"><label>X (%)<input name="x" type="number" min="5" max="95" step="0.1"></label><label>Y (%)<input name="y" type="number" min="7" max="93" step="0.1"></label></div><div class="actions"><button type="button" class="btn small" id="refresh-node-ports">Actualiser la connectique depuis le catalogue</button><button type="button" class="btn small danger" id="remove-setup-node">Retirer l’appareil du setup</button></div></form></section><section class="card"><h3>Relier deux appareils</h3><form id="setup-wire" class="stack"><label>Sortie / groupe de sorties<select name="from" required></select></label><label>Entrée / groupe stéréo<select name="to" required></select></label><div id="wire-selection-details" class="wire-selection-details" aria-live="polite"></div><div id="wire-pairing-help" class="wire-pairing-help" aria-live="polite"></div><label>Longueur choisie (m, 0 = estimation)<input name="cable_length" type="number" min="0" max="200" step="0.1" value="0" required></label><button class="btn primary">Ajouter la liaison</button></form><button type="button" class="btn" id="add-stereo-cable">Cordon stéréo L/R</button><p class="tool-note">Une sortie stéréo RCA ou mini-jack vers deux entrées séparées, ou deux sorties L/R vers une prise stéréo. Un seul cordon, deux voies distinctes.</p><button type="button" class="btn small" id="suggest-wires">Relier les correspondances uniques</button><p class="tool-note">Les choix ambigus restent à définir manuellement. Pour une conversion optique/coaxiale ou de niveau audio, ajoutez un convertisseur avec sa propre connectique.</p><h3>Zones du setup</h3><form id="setup-zone" class="stack"><label>Nom de zone<input name="name" required maxlength="100" placeholder="Cabine DJ, scène, public…"></label><label>Taille de la zone<select name="size"><option value="small">Petite</option><option value="medium" selected>Moyenne</option><option value="large">Grande</option></select></label><p class="tool-note">Déplacez la zone directement dans le plan. Les blocs des appareils gardent une taille automatique.</p><button class="btn">Ajouter la zone</button></form><div id="setup-zone-list"></div></section></div>` : ""}<section class="card production-section"><h3>Câbles à prévoir</h3><div id="setup-cable-summary"></div></section><div id="setup-connections" class="tool-list"></div><div id="setup-alerts"></div>`;
    const svg = $("#setup-stage"),
      nodeForm = $("#setup-node"),
      wireForm = $("#setup-wire");
    const wiringChoices = { from: [], to: [] };
    const groupChoiceValue = (c) =>
      "group:" +
      [c.node, c.port, c.variant, c.right_port, c.right_variant].join("|");
    const portCopies = (id) =>
      ports
        .filter((port) => port.equipment_id === id)
        .map(
          ({
            id,
            name,
            direction,
            connector,
            gender,
            signal,
            channels,
            alternatives,
            group_name,
            audio_role,
          }) => ({
            id,
            name,
            direction,
            connector,
            gender,
            signal,
            channels,
            alternatives: alternatives || [],
            group_name: group_name || "",
            audio_role: audio_role || "independent",
          }),
        );
    function remember() {
      StageLayout.remember(p.id, "setup", revision, state);
      $("#setup-status").textContent = "Brouillon modifié · à enregistrer";
    }
    function portGroupLabel(node, port) {
      const group = AudioPorts.groups(node.ports).find(
        (g) => g.left.id === port.id || g.right.id === port.id,
      );
      if (!group) return "";
      const isLeft = group.left.id === port.id,
        mate = isLeft ? group.right : group.left,
        key = port.direction === "out" ? "from" : "to";
      const mateUsed = state.edges.some(
        (e) =>
          e[key + "_node"] === node.id &&
          AudioStereo.used(e, key).includes(mate.id),
      );
      const mode =
        group.direction === "out"
          ? isLeft
            ? "L"
            : "R"
          : isLeft && group.mono
            ? mateUsed
              ? "L · complète la stéréo"
              : "Mono via L/Mono"
            : mateUsed
              ? isLeft
                ? "L · complète la stéréo"
                : "R · complète la stéréo"
              : isLeft
                ? "L seule"
                : "R seule";
      return " · " + esc(group.name) + " — " + mode;
    }
    function changedCatalogueNodes() {
      return state.nodes.filter(
        (n) =>
          AudioPorts.signature(n.ports) !==
          AudioPorts.signature(portCopies(n.equipment_id)),
      );
    }
    function wireChoice(key) {
      const value = wireForm.elements[key].value;
      if (!value) return null;
      if (value.startsWith("group:"))
        return (
          wiringChoices[key].find((c) => groupChoiceValue(c) === value) || null
        );
      const [node, port, variant = "primary"] = value.split("|");
      return { node, port, variant };
    }
    function choiceInfo(choice) {
      if (!choice) return null;
      const node = state.nodes.find((n) => n.id === choice.node);
      if (!node) return null;
      const specs = [
        { id: choice.port, variant: choice.variant },
        ...(choice.right_port
          ? [{ id: choice.right_port, variant: choice.right_variant }]
          : []),
      ]
        .map(({ id, variant }) => {
          const p = node.ports.find((p) => p.id === id);
          return p ? AudioPorts.resolve(p, variant) : null;
        })
        .filter(Boolean);
      return {
        node,
        specs,
        channels: specs.reduce((n, p) => n + Number(p.channels), 0),
      };
    }
    function selectionDetails() {
      $("#wire-selection-details").innerHTML = ["from", "to"]
        .map((key) => {
          const info = choiceInfo(wireChoice(key));
          if (!info) return "";
          const { node, specs, channels } = info;
          const format =
            channels === 2
              ? "Stéréo · " +
                (specs.length === 2
                  ? "2 prises L + R"
                  : "prise / ensemble stéréo")
              : channels === 1
                ? "Mono · 1 prise"
                : "Format numérique / multiple";
          return `<p><strong>${key === "from" ? "Sortie" : "Entrée"} : ${esc(node.label)}</strong><b class="wire-format">${format}</b><span>${specs.map((p) => esc(p.name) + " · " + esc(connectors[p.connector]) + " · <b>" + esc(AudioPorts.signalLabels[p.signal] || p.signal) + "</b>").join("<br>")}</span></p>`;
        })
        .join("");
    }
    function updateWireSelection(autoPair = false) {
      const help = $("#wire-pairing-help");
      help.innerHTML = "";
      const selections = { from: wireChoice("from"), to: wireChoice("to") },
        infos = {
          from: choiceInfo(selections.from),
          to: choiceInfo(selections.to),
        };
      if (
        !infos.from ||
        !infos.to ||
        infos.from.channels === infos.to.channels ||
        ![infos.from.channels, infos.to.channels].every((n) =>
          [1, 2].includes(n),
        ) ||
        [...infos.from.specs, ...infos.to.specs].some(
          (p) => p.signal !== "line",
        )
      ) {
        selectionDetails();
        return false;
      }
      const key = infos.from.channels === 1 ? "from" : "to";
      const pairs = AudioStereo.matchingPairs(
        state,
        key === "from" ? "out" : "in",
        selections[key],
      );
      if (pairs.length === 1 && autoPair) {
        const value = groupChoiceValue(pairs[0]);
        if (
          [...wireForm.elements[key].options].some((o) => o.value === value)
        ) {
          wireForm.elements[key].value = value;
          help.innerHTML =
            '<p>Le groupe stéréo complet a été sélectionné : les prises L et R ci-dessus seront utilisées.</p><button type="button" class="btn small" data-reset-mono>Recommencer avec des prises mono</button>';
          help.querySelector("[data-reset-mono]").onclick = () => {
            wireForm.elements.from.value = "";
            wireForm.elements.to.value = "";
            updateWireSelection(false);
            wireForm.elements.from.focus();
          };
          selectionDetails();
          return false;
        }
      }
      help.innerHTML = `<p>Un côté est stéréo (L + R), l’autre n’utilise qu’une prise mono. ${pairs.length ? "Choisissez le groupe complet pour utiliser ses deux prises." : "Choisissez une paire complète ou indiquez les deux prises L et R manuellement. Une seule prise ne reçoit pas les deux voies stéréo."}</p>${pairs.map((c, i) => `<button type="button" class="btn small" data-pair-choice="${i}">Utiliser ${esc(c.label)}</button>`).join("")}<button type="button" class="btn small" data-manual-stereo>Choisir les deux prises L/R</button>`;
      help.querySelectorAll("[data-pair-choice]").forEach(
        (b) =>
          (b.onclick = () => {
            wireForm.elements[key].value = groupChoiceValue(
              pairs[Number(b.dataset.pairChoice)],
            );
            updateWireSelection(false);
          }),
      );
      help.querySelector("[data-manual-stereo]").onclick = () =>
        $("#add-stereo-cable").click();
      selectionDetails();
      return true;
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
        const key = direction === "out" ? "from" : "to";
        wiringChoices[key] = AudioStereo.choices(state, direction).filter(
          (c) => c.right_port,
        );
        const groups = wiringChoices[key]
          .map((c, i) => {
            const n = state.nodes.find((n) => n.id === c.node),
              l = n.ports.find((p) => p.id === c.port),
              r = n.ports.find((p) => p.id === c.right_port);
            return `<option value="${esc(groupChoiceValue(c))}">${esc(n.label)} · ${esc(l.group_name)} — Stéréo (L + R) · ${esc(connectors[AudioPorts.resolve(l, c.variant).connector])} / ${esc(connectors[AudioPorts.resolve(r, c.right_variant).connector])}</option>`;
          })
          .join("");
        select.innerHTML =
          '<option value="">Choisir une prise ou un groupe</option>' +
          (groups
            ? '<optgroup label="Groupes stéréo de l’appareil">' +
              groups +
              "</optgroup>"
            : "") +
          state.nodes
            .flatMap((n) =>
              n.ports
                .filter(
                  (port) =>
                    port.direction === direction &&
                    !state.edges.some((e) =>
                      direction === "out"
                        ? e.from_node === n.id &&
                          AudioStereo.used(e, "from").includes(port.id)
                        : e.to_node === n.id &&
                          AudioStereo.used(e, "to").includes(port.id),
                    ),
                )
                .flatMap((port) =>
                  AudioPorts.variants(port).map(
                    (v) =>
                      `<option value="${n.id}|${port.id}${v.id === "primary" ? "" : "|" + v.id}">${esc(n.label)} · ${esc(port.name)}${portGroupLabel(n, port)} · ${esc(connectors[v.connector])} · ${esc(signals[v.signal])}</option>`,
                  ),
                ),
            )
            .join("");
        select.value = direction === "out" ? currentFrom : currentTo;
      }
      updateWireSelection(false);
    }
    wireForm?.elements.from.addEventListener("change", () =>
      updateWireSelection(true),
    );
    wireForm?.elements.to.addEventListener("change", () =>
      updateWireSelection(true),
    );
    function draw() {
      const changed = changedCatalogueNodes();
      $("#setup-catalogue-diff").innerHTML = changed.length
        ? `<section class="card catalogue-diff"><strong>Connectique du catalogue modifiée</strong><p>Ce plan utilise une ancienne copie pour : ${changed.map((n) => esc(n.label)).join(", ")}.</p>${editable ? '<button type="button" class="btn primary" id="apply-catalogue-changes">Reprendre les modifications dans ce brouillon</button><p class="tool-note">Les liaisons sont conservées. Celles devenues incompatibles seront signalées. Le plan enregistré reste inchangé jusqu’à son enregistrement.</p>' : '<p class="tool-note">Un éditeur peut reprendre les modifications dans le brouillon.</p>'}</section>`
        : "";
      Production.buttons("#apply-catalogue-changes", async () => {
        const fresh = await Production.list("equipment_audio_ports");
        ports.splice(0, ports.length, ...fresh);
        for (const n of changedCatalogueNodes())
          n.ports = portCopies(n.equipment_id);
        selectors();
        draw();
        remember();
        toast(
          "Connectique actualisée dans le brouillon · enregistrement nécessaire",
        );
      });
      for (const z of state.zones) {
        z.x = Math.min(z.x, 100 - z.w);
        z.y = Math.min(z.y, 100 - z.h);
      }
      $("#setup-input-groups").innerHTML = state.nodes
        .flatMap((n) =>
          AudioPorts.groups(n.ports)
            .filter((g) => g.direction === "in")
            .map((g) => {
              const used = (p) =>
                state.edges.some(
                  (e) =>
                    e.to_node === n.id &&
                    AudioStereo.used(e, "to").includes(p.id),
                );
              const l = used(g.left),
                r = used(g.right);
              const mode =
                l && r
                  ? "Stéréo · L + R"
                  : l && g.mono
                    ? "Mono · L/Mono seule"
                    : r && !l
                      ? "R seule · voie droite"
                      : l
                        ? "L seule · voie gauche"
                        : "Non raccordé";
              return `<article class="card setup-group-state"><strong>${esc(n.label)} · ${esc(g.name)}</strong><span>${mode}</span><small>${g.mono ? "R libre : L/Mono alimente les deux côtés du groupe." : "Paire gauche / droite."}</small></article>`;
            }),
        )
        .join("");
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
      $("#setup-alerts").insertAdjacentHTML(
        "beforeend",
        AudioPorts.groupNotes(state)
          .map((note) => `<p class="tool-note">${esc(note)}</p>`)
          .join(""),
      );
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
      if (updateWireSelection(true)) {
        $("#add-stereo-cable").click();
        return;
      }
      const source = wireChoice("from"),
        target = wireChoice("to");
      if (!source || !target)
        throw new Error("Choisissez une sortie et une entrée.");
      const {
          node: from_node,
          port: from_port,
          variant: from_variant,
        } = source,
        { node: to_node, port: to_port, variant: to_variant } = target;
      const edge = {
        id: crypto.randomUUID(),
        from_node,
        from_port,
        from_variant,
        to_node,
        to_port,
        to_variant,
        length: Number(f.elements.cable_length.value),
      };
      if (source.right_port || target.right_port) {
        edge.stereo = true;
        if (source.right_port) {
          edge.from_right_port = source.right_port;
          edge.from_right_variant = source.right_variant;
        }
        if (target.right_port) {
          edge.to_right_port = target.right_port;
          edge.to_right_variant = target.right_variant;
        }
        compatible(state, edge);
        state.edges.push(edge);
        selectors();
        draw();
        remember();
        return;
      }
      const sourcePort = endpoint(
          state,
          from_node,
          from_port,
          from_variant,
        ).port,
        targetPort = endpoint(state, to_node, to_port, to_variant).port;
      if (
        sourcePort?.signal === "line" &&
        targetPort?.signal === "line" &&
        Number(sourcePort.channels) !== Number(targetPort.channels) &&
        [1, 2].includes(Number(sourcePort.channels)) &&
        [1, 2].includes(Number(targetPort.channels))
      ) {
        $("#add-stereo-cable").click();
        toast("Complétez les deux branches du cordon stéréo.");
        return;
      }
      compatible(state, edge);
      state.edges.push(edge);
      selectors();
      draw();
      remember();
    });
    $("#add-stereo-cable").onclick = () => {
      const popup = document.createElement("dialog");
      popup.className = "audio-dialog";
      popup.id = "stereo-cable-dialog";
      popup.setAttribute("aria-label", "Ajouter un cordon stéréo L/R");
      const sides = {
        source: {
          stereo: AudioStereo.choices(state, "out"),
          mono: AudioStereo.monoChoices(state, "out"),
        },
        target: {
          stereo: AudioStereo.choices(state, "in"),
          mono: AudioStereo.monoChoices(state, "in"),
        },
      };
      const sideForm = (key, label) =>
        `<label>${label}<select name="${key}" required><option value="">Choisir</option>${sides[key].stereo.map((s, i) => `<option value="${i}">${esc(s.label)}</option>`).join("")}<option value="manual">Choisir deux prises L/R manuellement…</option></select></label><div data-manual="${key}" hidden><label>Prise gauche (L)<select name="${key}_left"><option value="">Choisir la prise gauche</option>${sides[key].mono.map((p, i) => `<option value="${i}">${esc(p.label)}</option>`).join("")}</select></label><label>Prise droite (R)<select name="${key}_right"><option value="">Choisir la prise droite</option></select></label></div>`;
      popup.innerHTML = `<h2>Cordon stéréo L/R</h2><p>Le côté gauche reste sur L et le côté droit sur R. Cette liaison ne mélange pas deux signaux en mono.</p><form class="stack">${sideForm("source", "Sortie stéréo / paire L–R")}${sideForm("target", "Entrée stéréo / paire L–R")}<label>Longueur du cordon (m, 0 = estimation)<input name="cable_length" type="number" min="0" max="200" step="0.1" value="0" required></label><p class="tool-note">Les prises déjà configurées en « 2 RCA stéréo » fonctionnent directement. Vos deux jacks n’ont pas de groupe ? Sélectionnez-les manuellement, sans modifier le catalogue.</p><div class="actions"><button class="btn primary">Ajouter le cordon</button><button type="button" class="btn" data-close-stereo>Annuler</button></div></form>`;
      app.append(popup);
      popup.showModal();
      popup.querySelector("[data-close-stereo]").onclick = () => popup.close();
      popup.addEventListener("close", () => popup.remove(), { once: true });
      const form = popup.querySelector("form");
      for (const key of ["source", "target"]) {
        const select = form.elements[key],
          left = form.elements[key + "_left"],
          right = form.elements[key + "_right"];
        select.onchange = () => {
          const manual = select.value === "manual";
          popup.querySelector('[data-manual="' + key + '"]').hidden = !manual;
          left.required = right.required = manual;
        };
        left.onchange = () => {
          const chosen = sides[key].mono[Number(left.value)];
          right.innerHTML =
            '<option value="">Choisir la prise droite</option>' +
            sides[key].mono
              .map((p, i) =>
                chosen && p.node === chosen.node && p.port !== chosen.port
                  ? `<option value="${i}">${esc(p.label)}</option>`
                  : "",
              )
              .join("");
        };
        const prior = wireChoice(key === "source" ? "from" : "to");
        if (prior) {
          const matching = sides[key].stereo
            .map((s, i) => ({ s, i }))
            .filter(
              ({ s }) =>
                s.node === prior.node &&
                (prior.right_port
                  ? s.port === prior.port &&
                    s.variant === prior.variant &&
                    s.right_port === prior.right_port &&
                    s.right_variant === prior.right_variant
                  : (s.port === prior.port && s.variant === prior.variant) ||
                    (s.right_port === prior.port &&
                      s.right_variant === prior.variant)),
            );
          if (matching.length === 1) select.value = String(matching[0].i);
          else if (!prior.right_port && choiceInfo(prior)?.channels === 1) {
            select.value = "manual";
            select.onchange();
            const n = state.nodes.find((n) => n.id === prior.node),
              physical = n?.ports.find((p) => p.id === prior.port);
            const index = sides[key].mono.findIndex(
              (p) =>
                p.node === prior.node &&
                p.port === prior.port &&
                p.variant === prior.variant,
            );
            if (index >= 0 && physical?.audio_role !== "right") {
              left.value = String(index);
              left.onchange();
            }
          }
        }
      }
      Production.submit(form, async (f) => {
        function pick(key) {
          if (f.elements[key].value !== "manual")
            return sides[key].stereo[Number(f.elements[key].value)];
          const l = sides[key].mono[Number(f.elements[key + "_left"].value)],
            r = sides[key].mono[Number(f.elements[key + "_right"].value)];
          if (!l || !r || l.node !== r.node || l.port === r.port)
            throw new Error(
              "Choisissez L et R sur deux prises distinctes du même appareil.",
            );
          return { ...l, right_port: r.port, right_variant: r.variant };
        }
        const src = pick("source"),
          dst = pick("target");
        if (!src || !dst)
          throw new Error("Choisissez une sortie et une entrée stéréo.");
        const edge = {
          id: crypto.randomUUID(),
          stereo: true,
          from_node: src.node,
          from_port: src.port,
          from_variant: src.variant,
          to_node: dst.node,
          to_port: dst.port,
          to_variant: dst.variant,
          length: Number(f.elements.cable_length.value),
        };
        if (src.right_port) {
          edge.from_right_port = src.right_port;
          edge.from_right_variant = src.right_variant;
        }
        if (dst.right_port) {
          edge.to_right_port = dst.right_port;
          edge.to_right_variant = dst.right_variant;
        }
        compatible(state, edge);
        state.edges.push(edge);
        selectors();
        draw();
        remember();
        popup.close();
      });
    };
    Production.buttons("#suggest-wires", () => {
      let added = 0;
      for (const node of state.nodes)
        for (const input of node.ports.filter((p) => p.direction === "in")) {
          if (
            state.edges.some(
              (e) =>
                e.to_node === node.id &&
                AudioStereo.used(e, "to").includes(input.id),
            )
          )
            continue;
          const candidates = [];
          for (const accepted of AudioPorts.variants(input))
            for (const source of state.nodes)
              for (const output of source.ports.filter(
                (p) => p.direction === "out",
              ))
                for (const plug of AudioPorts.variants(output)) {
                  if (plug.connector !== accepted.connector) continue;
                  const edge = {
                    id: crypto.randomUUID(),
                    from_node: source.id,
                    from_port: output.id,
                    from_variant: plug.id,
                    to_node: node.id,
                    to_port: input.id,
                    to_variant: accepted.id,
                    length: 0,
                  };
                  try {
                    compatible(state, edge);
                    candidates.push(edge);
                  } catch {}
                }
          if (candidates.length !== 1) continue;
          const candidate = candidates[0],
            source = endpoint(
              state,
              candidate.from_node,
              candidate.from_port,
              candidate.from_variant,
            );
          let destinations = 0;
          for (const other of state.nodes)
            for (const port of other.ports.filter((p) => p.direction === "in"))
              for (const option of AudioPorts.variants(port)) {
                if (option.connector !== source.port.connector) continue;
                try {
                  compatible(state, {
                    ...candidate,
                    to_node: other.id,
                    to_port: port.id,
                    to_variant: option.id,
                  });
                  destinations++;
                } catch {}
              }
          if (destinations === 1) {
            state.edges.push(candidate);
            added++;
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
