/* Virtual controls record physical settings; they do not remotely control hardware. */
const EquipmentSettings = (() => {
  const fresh = (
    label,
    section = "",
    kind = "knob",
    value = 50,
    min = 0,
    max = 100,
    step = 1,
    unit = "%",
  ) => ({
    id: crypto.randomUUID(),
    label,
    section,
    kind,
    value,
    min,
    max,
    step,
    unit,
  });
  function template(model) {
    const c = [];
    if (model === "mg06x") {
      for (const channel of [1, 2]) {
        const group = "Entrée " + channel;
        for (const label of ["Gain", "Niveau"]) c.push(fresh(label, group));
        for (const label of ["Aigus", "Graves"])
          c.push(fresh(label, group, "knob", 0, -15, 15, 1, "dB"));
        c.push(
          fresh("PAD", group, "switch", 0, 0, 1, 1, ""),
          fresh("HPF", group, "switch", 0, 0, 1, 1, ""),
          fresh("FX", group, "switch", 0, 0, 1, 1, ""),
        );
      }
      for (const group of ["Entrées 3/4", "Entrées 5/6"])
        c.push(fresh("Niveau", group));
      for (const label of ["Stereo Level", "Phones", "FX RTN"])
        c.push(fresh(label, "Sorties"));
      c.push(
        fresh(
          "Mono (0) / Stereo (1)",
          "Affectation 1/2",
          "selector",
          0,
          0,
          1,
          1,
          "",
        ),
      );
    } else if (model === "flx6") {
      for (let i = 1; i <= 4; i++) {
        const group = "Voie " + i;
        for (const label of ["Trim", "HI", "MID", "LOW", "Filter"])
          c.push(fresh(label, group));
        c.push(fresh("Fader", group, "fader", 75));
      }
      for (const label of [
        "Master Level",
        "Headphones Level",
        "Headphones Mix",
      ])
        c.push(fresh(label, "Master"));
      c.push(fresh("Crossfader", "Master", "fader", 50));
    } else c.push(fresh("Niveau", "Principal"));
    return c;
  }
  const percent = (c) => ((c.value - c.min) / (c.max - c.min)) * 100;
  function control(c, editable) {
    const angle = -135 + percent(c) * 2.7,
      number = Number(c.value).toLocaleString("fr-FR", {
        maximumFractionDigits: 4,
      });
    return `<article class="setting-control setting-${c.kind}" data-setting-control="${c.id}"><label id="label-${c.id}">${esc(c.label)}</label>${c.kind === "knob" ? `<div class="virtual-knob" data-knob="${c.id}" style="--knob-angle:${angle}deg" aria-hidden="true"><span></span></div>` : ""}${
      c.kind === "switch"
        ? `<input aria-labelledby="label-${c.id}" type="checkbox" data-control-value="${c.id}" ${c.value ? "checked" : ""} ${editable ? "" : "disabled"}>`
        : c.kind === "selector"
          ? `<select aria-labelledby="label-${c.id}" data-control-value="${c.id}" ${editable ? "" : "disabled"}>${Array.from(
              {
                length: Math.min(100, Math.floor((c.max - c.min) / c.step) + 1),
              },
              (_, i) => c.min + i * c.step,
            )
              .map(
                (v) =>
                  `<option value="${v}" ${v === c.value ? "selected" : ""}>${v}${c.unit ? " " + esc(c.unit) : ""}</option>`,
              )
              .join("")}</select>`
          : `<input type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.value}" data-control-value="${c.id}" aria-labelledby="label-${c.id}" ${editable ? "" : "disabled"}>`
    }<output data-control-output="${c.id}">${number}${c.unit ? " " + esc(c.unit) : ""}</output>${editable ? `<button type="button" class="btn small" data-configure-control="${c.id}">Configurer</button>` : ""}</article>`;
  }
  async function open(p, reload) {
    const api = EventCompanion,
      [rows, docs, reservations, inventory] = await Promise.all([
        api.list("equipment_setting_presets", { project_id: p.id }, "name"),
        api.list("project_documents", { project_id: p.id }, "name"),
        me.role === "client"
          ? []
          : api.list("equipment_reservations", { project_id: p.id }),
        me.role === "client" ? [] : api.list("equipment", {}, "name"),
      ]);
    const root = $("#tool-content"),
      editable = p._canEdit,
      gear = inventory.filter((x) =>
        reservations.some(
          (r) => r.equipment_id === x.id && r.state !== "cancelled",
        ),
      );
    root.innerHTML = `<div class="tool-toolbar"><div><h2>Fiches de réglages</h2><p class="tool-note">Reproduisez les commandes de vos appareils avec des potards, faders, interrupteurs et sélecteurs. Ce sont des repères à reporter sur le matériel, sans commande à distance. Les valeurs en % décrivent une position, pas une mesure acoustique.</p></div>${api.toolLink(p, "documents", "Ajouter une photo dans Documents")}</div><div class="settings-preset-list">${rows.map((row) => `<article class="card"><h3>${esc(row.name)}</h3><p>${esc(row.device_label)}</p><p class="muted">${row.controls.length} commande(s) · version ${row.revision}</p><button type="button" class="btn" data-load-preset="${row.id}">${editable ? "Ouvrir / modifier" : "Consulter"}</button><button type="button" class="btn small" data-print-preset="${row.id}">Imprimer</button>${editable ? `<button type="button" class="btn small" data-duplicate-preset="${row.id}">Dupliquer</button><button type="button" class="btn small" data-delete-preset="${row.id}">Supprimer</button>` : ""}</article>`).join("") || '<p class="empty">Aucune configuration enregistrée pour ce projet.</p>'}</div>${editable ? '<button class="btn primary" id="new-setting-preset">Nouvelle fiche de réglages</button>' : ""}<section class="card settings-editor" id="settings-editor"><form id="equipment-setting-form" class="stack"><input type="hidden" name="preset_id"><input type="hidden" name="revision" value="0"><textarea hidden name="controls_json"></textarea><div class="row-2"><label>Nom de la configuration<input name="name" maxlength="200" required ${editable ? "" : "readonly"} placeholder="Ex. Balance soirée / discours"></label><label>Appareil<input name="device_label" maxlength="200" required ${editable ? "" : "readonly"} placeholder="Marque et modèle"></label><label>Matériel du projet (facultatif)<select name="equipment_id" ${editable ? "" : "disabled"}><option value="">Appareil renseigné librement</option>${gear.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join("")}</select></label><label>Photo de référence<select name="photo_document_id" ${editable ? "" : "disabled"}><option value="">Aucune photo</option>${docs
      .filter((d) => d.mime_type?.startsWith("image/"))
      .map((d) => `<option value="${d.id}">${esc(d.name)}</option>`)
      .join(
        "",
      )}</select></label></div><div id="setting-photo-link"></div><label>Consignes<textarea name="notes" maxlength="4000" ${editable ? "" : "readonly"}></textarea></label>${editable ? `<div class="actions"><label>Modèle de départ<select id="settings-template"><option value="generic">Appareil personnalisé</option><option value="mg06x">Yamaha MG06X</option><option value="flx6">DDJ-FLX6-GT</option></select></label><button type="button" class="btn" id="apply-setting-template">Charger le modèle</button><button type="button" class="btn" id="add-setting-control">Ajouter une commande</button></div><p class="tool-note">Glissez verticalement sur un potard, utilisez son curseur ou les flèches du clavier. Configurez le nom, le groupe, les bornes, le pas et l’unité selon les graduations réelles de l’appareil.</p>` : ""}<div id="virtual-control-board" class="virtual-control-board"></div>${editable ? '<button class="btn primary" type="submit">Enregistrer la configuration</button>' : ""}</form></section>`;
    const form = $("#equipment-setting-form"),
      f = form.elements;
    let controls = [],
      dirty = false;
    const remember = () => {
      f.controls_json.value = JSON.stringify(controls);
      dirty = true;
      form.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const updatePhoto = () => {
      $("#setting-photo-link").innerHTML = f.photo_document_id.value
        ? `<a class="btn small" target="_blank" rel="noopener" href="#/document/${esc(f.photo_document_id.value)}">Ouvrir la photo de référence</a>`
        : "";
    };
    f.photo_document_id.onchange = updatePhoto;
    form.addEventListener("input", (e) => {
      if (e.target !== f.controls_json) dirty = true;
    });
    function redraw() {
      const groups = [
        ...new Set(controls.map((c) => c.section || "Commandes")),
      ];
      $("#virtual-control-board").innerHTML = groups
        .map(
          (group) =>
            `<section><h3>${esc(group)}</h3><div class="knob-group">${controls
              .filter((c) => (c.section || "Commandes") === group)
              .map((c) => control(c, editable))
              .join("")}</div></section>`,
        )
        .join("");
      root.querySelectorAll("[data-control-value]").forEach(
        (input) =>
          (input.oninput = () => {
            const c = controls.find((c) => c.id === input.dataset.controlValue);
            c.value =
              input.type === "checkbox"
                ? input.checked
                  ? 1
                  : 0
                : Number(input.value);
            refresh(c);
            remember();
          }),
      );
      root.querySelectorAll("[data-knob]").forEach(
        (knob) =>
          (knob.onpointerdown = (event) => {
            if (!editable) return;
            event.preventDefault();
            const c = controls.find((c) => c.id === knob.dataset.knob),
              startY = event.clientY,
              startValue = c.value;
            knob.setPointerCapture(event.pointerId);
            knob.onpointermove = (move) => {
              c.value = round(
                c,
                Math.max(
                  c.min,
                  Math.min(
                    c.max,
                    startValue +
                      ((startY - move.clientY) * (c.max - c.min)) / 160,
                  ),
                ),
              );
              refresh(c);
              remember();
            };
            knob.onpointerup = () => {
              knob.onpointermove = null;
              knob.onpointerup = null;
            };
            knob.onpointercancel = () => {
              knob.onpointermove = null;
            };
          }),
      );
      root
        .querySelectorAll("[data-configure-control]")
        .forEach(
          (button) =>
            (button.onclick = () =>
              configure(
                controls.find((c) => c.id === button.dataset.configureControl),
              )),
        );
    }
    function refresh(c) {
      const row = root.querySelector(`[data-setting-control="${c.id}"]`);
      row
        ?.querySelector("[data-knob]")
        ?.style.setProperty("--knob-angle", -135 + percent(c) * 2.7 + "deg");
      const input = row?.querySelector("[data-control-value]");
      if (input) {
        if (input.type === "checkbox") input.checked = !!c.value;
        else input.value = c.value;
      }
      if (row?.querySelector("output"))
        row.querySelector("output").textContent =
          Number(c.value).toLocaleString("fr-FR", {
            maximumFractionDigits: 4,
          }) + (c.unit ? " " + c.unit : "");
    }
    function load(row, duplicate = false) {
      if (dirty && !confirm("Remplacer la configuration en cours de saisie ?"))
        return;
      Drafts.clear(form);
      form.reset();
      f.preset_id.value = duplicate ? "" : row.id || "";
      f.revision.value = duplicate ? "0" : row.revision || 0;
      f.name.value = (row.name || "") + (duplicate ? " — copie" : "");
      f.device_label.value = row.device_label || "";
      f.equipment_id.value = row.equipment_id || "";
      f.photo_document_id.value = row.photo_document_id || "";
      f.notes.value = row.notes || "";
      controls = structuredClone(row.controls || []);
      if (duplicate) controls.forEach((c) => (c.id = crypto.randomUUID()));
      remember();
      dirty = false;
      redraw();
      updatePhoto();
      $("#settings-editor").scrollIntoView({ block: "start" });
    }
    function configure(c) {
      const dialog = document.createElement("dialog");
      dialog.className = "settings-control-dialog";
      dialog.setAttribute("aria-label", "Configurer une commande");
      dialog.innerHTML = `<h2>Configurer la commande</h2><form class="stack" method="dialog"><div class="row-2"><label>Nom<input name="label" maxlength="100" value="${esc(c.label)}" required></label><label>Groupe / voie<input name="section" maxlength="100" value="${esc(c.section)}"></label><label>Type<select name="kind">${Object.entries(
        {
          knob: "Potard",
          fader: "Fader",
          switch: "Interrupteur",
          selector: "Sélecteur numérique",
        },
      )
        .map(
          ([k, v]) =>
            `<option value="${k}" ${c.kind === k ? "selected" : ""}>${v}</option>`,
        )
        .join(
          "",
        )}</select></label><label>Unité<input name="unit" maxlength="20" value="${esc(c.unit)}"></label><label>Minimum<input name="min" type="number" min="-1000000" max="1000000" step="any" value="${c.min}" required></label><label>Maximum<input name="max" type="number" min="-1000000" max="1000000" step="any" value="${c.max}" required></label><label>Pas<input name="step" type="number" min="0.0001" max="1000000" step="any" value="${c.step}" required></label><label>Valeur<input name="value" type="number" min="-1000000" max="1000000" step="any" value="${c.value}" required></label></div><p class="tool-note">Un interrupteur utilise 0 / 1. Un sélecteur numérique est limité à 100 positions.</p><div class="actions"><button class="btn primary" value="save">Appliquer</button><button type="button" class="btn" id="remove-control">Retirer cette commande</button><button type="button" class="btn" id="cancel-control">Annuler</button></div></form>`;
      document.body.append(dialog);
      dialog.showModal();
      dialog.querySelector("form").onsubmit = (e) => {
        e.preventDefault();
        const values = Object.fromEntries(new FormData(e.target));
        for (const key of ["min", "max", "value", "step"])
          values[key] = Number(values[key]);
        if (values.kind === "switch")
          Object.assign(values, {
            min: 0,
            max: 1,
            step: 1,
            value: values.value ? 1 : 0,
          });
        if (
          !(values.max > values.min) ||
          values.step <= 0 ||
          values.step > values.max - values.min ||
          values.value < values.min ||
          values.value > values.max ||
          (values.kind === "selector" &&
            (values.max - values.min) / values.step > 99)
        ) {
          toast(
            "Vérifiez les bornes, le pas et la valeur de la commande.",
            false,
          );
          return;
        }
        Object.assign(c, values);
        c.value = round(c, c.value);
        remember();
        redraw();
        dialog.close();
      };
      dialog.querySelector("#cancel-control").onclick = () => dialog.close();
      dialog.querySelector("#remove-control").onclick = () => {
        controls = controls.filter((x) => x.id !== c.id);
        remember();
        redraw();
        dialog.close();
      };
      dialog.addEventListener("keydown", (e) => {
        if (e.key === "Escape") e.stopPropagation();
      });
      dialog.onclose = () => dialog.remove();
    }
    root
      .querySelectorAll("[data-load-preset]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            load(rows.find((r) => r.id === b.dataset.loadPreset))),
      );
    root.querySelectorAll("[data-duplicate-preset]").forEach(
      (b) =>
        (b.onclick = () =>
          load(
            rows.find((r) => r.id === b.dataset.duplicatePreset),
            true,
          )),
    );
    root.querySelectorAll("[data-delete-preset]").forEach(
      (b) =>
        (b.onclick = () =>
          api.run(b, async () => {
            if (!confirm("Supprimer cette configuration enregistrée ?")) return;
            const row = rows.find((r) => r.id === b.dataset.deletePreset);
            await api.write(
              sb
                .from("equipment_setting_presets")
                .delete()
                .eq("id", row.id)
                .eq("project_id", p.id)
                .eq("revision", row.revision)
                .select("id")
                .single(),
            );
            await reload();
          })),
    );
    root.querySelectorAll("[data-print-preset]").forEach(
      (b) =>
        (b.onclick = () => {
          const row = rows.find((r) => r.id === b.dataset.printPreset);
          api.print(
            p,
            "Réglages · " + row.name,
            `<h2>${esc(row.device_label)}</h2><p>${esc(row.notes || "")}</p><div class="paper-settings">${row.controls.map((c) => `<div><span>${esc(c.section)}</span><strong>${esc(c.label)}</strong><div class="paper-potard"><i style="transform:rotate(${-135 + percent(c) * 2.7}deg)"></i></div><b>${c.value} ${esc(c.unit)}</b></div>`).join("")}</div>`,
          );
        }),
    );
    if (editable) {
      $("#new-setting-preset").onclick = () =>
        load({ controls: [], name: "", device_label: "" });
      $("#apply-setting-template").onclick = () => {
        if (
          controls.length &&
          !confirm(
            "Remplacer les commandes de la saisie en cours par ce modèle ?",
          )
        )
          return;
        const model = $("#settings-template").value;
        controls = template(model);
        if (model !== "generic")
          f.device_label.value =
            model === "mg06x" ? "Yamaha MG06X" : "DDJ-FLX6-GT";
        remember();
        redraw();
      };
      $("#add-setting-control").onclick = () => {
        if (controls.length >= 100)
          return toast("Une fiche peut contenir jusqu’à 100 commandes.", false);
        const c = fresh("Nouvelle commande");
        controls.push(c);
        remember();
        redraw();
        configure(c);
      };
      form.onsubmit = (e) => {
        e.preventDefault();
        api.run(form.querySelector("[type=submit]"), async () => {
          const draft = Drafts.begin(form);
          try {
            const payload = {
              project_id: p.id,
              name: f.name.value.trim(),
              device_label: f.device_label.value.trim(),
              equipment_id: f.equipment_id.value || null,
              photo_document_id: f.photo_document_id.value || null,
              notes: f.notes.value.trim(),
              controls,
              revision: n(f.revision.value) + 1,
            };
            const id = f.preset_id.value;
            await api.write(
              id
                ? sb
                    .from("equipment_setting_presets")
                    .update(payload)
                    .eq("id", id)
                    .eq("project_id", p.id)
                    .eq("revision", n(f.revision.value))
                    .select("id")
                    .single()
                : sb
                    .from("equipment_setting_presets")
                    .insert(payload)
                    .select("id")
                    .single(),
            );
            Drafts.finish(draft, true);
            dirty = false;
            toast("Configuration enregistrée.");
            await reload();
          } catch (error) {
            Drafts.finish(draft, false);
            throw error;
          }
        });
      };
    }
    Drafts.restore(form);
    try {
      controls = JSON.parse(f.controls_json.value || "[]");
    } catch {
      controls = [];
    }
    dirty = !!(f.name.value || controls.length);
    redraw();
    updatePhoto();
    if (!editable && !rows.length) $("#settings-editor").hidden = true;
  }
  const n = (v) => Number(v) || 0;
  function round(c, value) {
    return Number(
      Math.min(
        c.max,
        Math.max(c.min, c.min + Math.round((value - c.min) / c.step) * c.step),
      ).toFixed(6),
    );
  }
  return { open, template, round };
})();
