/* Stereo groups belong to equipment. Physical socket IDs and saved setup copies stay unchanged. */
const AudioGroups = (() => {
  function markup(ports) {
    const groups = AudioPorts.groups(ports);
    return `<section class="audio-group-section"><div class="tool-toolbar"><div><h3>Groupes de prises</h3><p class="tool-note">Un groupe stéréo, deux prises physiques. L/Mono seule = mono ; L + R = stéréo, si l’appareil prévoit ce fonctionnement.</p></div><div class="actions"><button type="button" class="btn" id="group-existing-ports">Grouper deux prises existantes</button><button type="button" class="btn" id="add-stereo-pair">Créer une paire de prises</button></div></div><div class="audio-group-grid">${groups.map((g, i) => `<article class="card audio-port-group" data-audio-group="${i}"><div class="tool-toolbar"><strong>${esc(g.name)} · ${g.direction === "in" ? "Entrée" : "Sortie"} stéréo</strong><div class="actions"><button type="button" class="btn small" data-edit-audio-group="${i}">Modifier le groupe</button><button type="button" class="btn small" data-ungroup-audio="${i}">Dissocier</button></div></div><div class="audio-group-sockets">${[g.left, g.right].map((p, j) => `<div>${AudioConnectors.icon(p.connector)}<strong>${j ? "R" : g.mono ? "L / Mono" : "L"}</strong><span>${esc(p.name)}</span><small>${esc(AudioConnectors.labels[p.connector])}</small></div>`).join("")}</div><p class="audio-group-behavior">${g.mono ? "L / Mono seule → mono · L + R → stéréo" : "Gauche + droite → stéréo"}</p></article>`).join("") || '<p class="empty">Aucun groupe configuré. Regroupez vos prises L et R existantes ou créez une paire.</p>'}</div></section>`;
  }
  function bind(dialog, gear, ports, reload) {
    const groups = AudioPorts.groups(ports);
    dialog.querySelector("#group-existing-ports").onclick = () =>
      edit(gear, ports, null, reload);
    Production.buttons(
      "[data-edit-audio-group]",
      (b) =>
        edit(gear, ports, groups[Number(b.dataset.editAudioGroup)], reload),
      dialog,
    );
    Production.buttons(
      "[data-ungroup-audio]",
      async (b) => {
        const g = groups[Number(b.dataset.ungroupAudio)];
        if (
          !confirm(
            "Dissocier ce groupe ? Les deux prises et les setups enregistrés seront conservés.",
          )
        )
          return;
        await Production.write(
          sb.rpc("clear_equipment_stereo_group", {
            gear_id: gear.id,
            left_id: g.left.id,
            right_id: g.right.id,
          }),
        );
        toast("Groupe dissocié, prises conservées");
        await reload();
      },
      dialog,
    );
  }
  function edit(gear, ports, group, reload) {
    const existing = AudioPorts.groups(ports),
      members = new Set(
        existing
          .filter((g) => g !== group && (!group || g.left.id !== group.left.id))
          .flatMap((g) => [g.left.id, g.right.id]),
      );
    const available = ports.filter(
      (p) =>
        Number(p.channels) === 1 &&
        (p.alternatives || []).every((v) => Number(v.channels) === 1) &&
        !members.has(p.id),
    );
    const popup = document.createElement("dialog");
    popup.className = "audio-dialog";
    popup.id = "equipment-group-dialog";
    popup.setAttribute("aria-labelledby", "equipment-group-title");
    popup.innerHTML = `<h2 id="equipment-group-title">${group ? "Modifier le groupe stéréo" : "Grouper deux prises existantes"}</h2><p>Les deux prises restent sur l’appareil. Ce groupe sera sélectionnable comme une seule entrée ou sortie dans le setup.</p><form class="stack"><label>Nom du groupe<input name="group_label" required maxlength="100" placeholder="CH 3 / 4"></label><label>Prise gauche L / Mono<select name="left_id" required><option value="">Choisir la prise gauche</option>${available.map((p) => `<option value="${p.id}">${esc(p.name)} · ${p.direction === "in" ? "Entrée" : "Sortie"} · ${esc(AudioConnectors.labels[p.connector])}</option>`).join("")}</select></label><label>Prise droite R<select name="right_id" required></select></label><label class="audio-group-check"><input name="mono_when_right_empty" type="checkbox" checked> Sur cet appareil, L seule fonctionne en mono quand R est libre</label><p class="tool-note">Activez cette option uniquement pour une paire marquée L/Mono sur l’appareil. Une sortie L/R ne somme pas automatiquement le son en mono.</p><div class="actions"><button class="btn primary">Enregistrer le groupe</button><button type="button" class="btn" data-cancel-group>Annuler</button></div></form>`;
    app.append(popup);
    popup.showModal();
    const form = popup.querySelector("form");
    function rightOptions() {
      const l = available.find((p) => p.id === form.elements.left_id.value),
        prior = form.elements.right_id.value;
      form.elements.right_id.innerHTML =
        '<option value="">Choisir la prise droite</option>' +
        available
          .filter((p) => l && p.direction === l.direction && p.id !== l.id)
          .map(
            (p) =>
              `<option value="${p.id}">${esc(p.name)} · ${esc(AudioConnectors.labels[p.connector])}</option>`,
          )
          .join("");
      form.elements.right_id.value = prior;
      form.elements.mono_when_right_empty.disabled = l?.direction === "out";
      if (l?.direction === "out")
        form.elements.mono_when_right_empty.checked = false;
    }
    form.elements.left_id.onchange = rightOptions;
    if (group) {
      form.elements.group_label.value = group.name;
      form.elements.left_id.value = group.left.id;
      rightOptions();
      form.elements.right_id.value = group.right.id;
      form.elements.mono_when_right_empty.checked = group.mono;
    } else rightOptions();
    popup.querySelector("[data-cancel-group]").onclick = () => popup.close();
    popup.addEventListener("close", () => popup.remove(), { once: true });
    Production.submit(form, async (f) => {
      await Production.write(
        sb.rpc("set_equipment_stereo_group", {
          gear_id: gear.id,
          left_id: f.elements.left_id.value,
          right_id: f.elements.right_id.value,
          group_label: f.elements.group_label.value.trim(),
          mono_when_right_empty:
            f.elements.mono_when_right_empty.checked &&
            !f.elements.mono_when_right_empty.disabled,
        }),
      );
      popup.close();
      toast("Groupe stéréo enregistré");
      await reload();
    });
  }
  return { markup, bind };
})();
