/* Connected day-of-event tools. All writes remain scoped and explicit. */
const EventLive = (() => {
  const api = () => EventCompanion,
    n = (v) => Number(v) || 0;
  const minutes = (value) => {
    const m = /^(\d\d):(\d\d)/.exec(value || "");
    return m ? n(m[1]) * 60 + n(m[2]) : null;
  };
  const clockString = (value) =>
    `${String(Math.floor(value / 60) % 24).padStart(2, "0")}:${String(Math.floor(value) % 60).padStart(2, "0")}`;
  const h = (title, text = "") =>
    `<div class="tool-toolbar"><div><h2>${esc(title)}</h2><p class="tool-note">${esc(text)}</p></div></div>`;
  const card = (title, body) =>
    `<section class="card"><h3>${esc(title)}</h3>${body}</section>`;
  const listHtml = (rows) =>
    rows.length
      ? `<ul class="companion-simple-list">${rows.map((x) => `<li>${x}</li>`).join("")}</ul>`
      : '<p class="empty">Aucun élément.</p>';
  async function data(p) {
    const [schedule, tasks, ops, contacts, previousOps] = await Promise.all([
      api().list("schedule_items", { project_id: p.id }),
      api().list("project_tasks", { project_id: p.id }),
      api().list("project_companion_items", { project_id: p.id }),
      api().list("project_contacts", { project_id: p.id }),
      api().list("project_operation_items", { project_id: p.id }),
    ]);
    return {
      schedule: WorkHours.sort(schedule),
      tasks,
      ops: [...ops, ...previousOps],
      contacts,
    };
  }
  async function open(key, p, reload) {
    if (key === "live") return pilot(p, reload);
    if (key === "briefs") return briefs(p);
    if (key === "regie_clock") return clock(p, reload);
    if (key === "schedule_shift") return shift(p, reload);
    if (key === "setup_check") return setup(p);
    if (key === "tech_tools") return calculators(p);
    if (key === "labels") return labels(p);
  }
  async function pilot(p, reload) {
    const d = await data(p),
      root = $("#tool-content");
    let busy = false;
    const draw = () => {
      const now = new Date(),
        eventDay = p.event_date
          ? Math.floor(
              (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
                Date.parse(p.event_date + "T00:00:00Z")) /
                86400000,
            )
          : null,
        t =
          eventDay == null
            ? null
            : eventDay * 1440 + now.getHours() * 60 + now.getMinutes();
      const timed = d.schedule.filter(
          (s) => minutes(s.start_time) != null && s.day_offset != null,
        ),
        current =
          d.schedule.find((s) => s.run_state === "current") ||
          timed.find((s) => {
            const at = s.day_offset * 1440 + minutes(s.start_time),
              len = WorkHours.duration(s);
            return t != null && t >= at && len && t < at + len;
          }),
        next = timed.find(
          (s) =>
            t != null &&
            s.day_offset * 1440 + minutes(s.start_time) > t &&
            s.run_state !== "done",
        );
      const openIssues = d.ops.filter(
          (x) =>
            ["issues", "onsite_requests"].includes(x.tool) &&
            !["resolved", "closed", "done", "cancelled"].includes(x.status),
        ),
        decisions = d.ops.filter(
          (x) => x.tool === "decisions" && x.status === "pending",
        ),
        late = d.tasks.filter(
          (x) =>
            !x.done &&
            x.due_date &&
            x.due_date < api().localDateTime().slice(0, 10),
        ),
        changes = d.ops.filter(
          (x) => x.tool === "changes" && x.status === "published",
        );
      root.innerHTML =
        h(
          "Pilotage du jour J",
          "Une vue issue du planning et des fiches du projet. Les données sont actualisées automatiquement toutes les minutes. Vous pouvez aussi demander une actualisation immédiate.",
        ) +
        `<div class="companion-live-head"><time>${now.toLocaleTimeString("fr-FR")}</time><button class="btn" id="refresh-live">Actualiser les données</button></div><div class="production-metrics">${[
          ["Imprévus ouverts", openIssues.length],
          ["Décisions attendues", decisions.length],
          ["Tâches en retard", late.length],
        ]
          .map(([label, value]) => card(label, `<strong>${value}</strong>`))
          .join(
            "",
          )}</div><div class="companion-grid">${card("Maintenant", current ? `<h2>${esc(current.title)}</h2><p>${esc(WorkHours.label(current, p.event_date))} · ${esc(current.start_time || "")}</p>` : p.event_date ? "<p>Aucun créneau courant identifié.</p>" : "<p>Renseignez la date du projet pour situer le programme.</p>")}${card("À suivre", next ? `<h2>${esc(next.title)}</h2><p>${esc(WorkHours.label(next, p.event_date))} · ${esc(next.start_time)}</p>` : "<p>Aucun prochain créneau daté.</p>")}${card("À traiter", listHtml(openIssues.slice(0, 12).map((x) => `<a href="#/outils/${p.id}?section=${x.tool}&focus=${x.id}">${esc(x.label)}</a> · ${esc(x.details.responsible || "Responsable à désigner")}`)))}${card("Consignes publiées", listHtml(changes.map((x) => `<a href="#/outils/${p.id}?section=changes&focus=${x.id}">${esc(x.label)}</a>`)))}</div><div class="actions">${["regie_clock", "schedule_shift", "opening_checks", "rollcall", "closing_checks"].map((k) => api().toolLink(p, k)).join("")}</div>`;
      $("#refresh-live").onclick = (e) =>
        api().run(e.currentTarget, async () => {
          if (busy) return;
          busy = true;
          await reload();
        });
    };
    draw();
    const timer = setInterval(() => {
      if (!root.isConnected) {
        clearInterval(timer);
        return;
      }
      if (!busy && !document.hidden) {
        busy = true;
        clearInterval(timer);
        reload().catch(ERR);
      }
    }, 60000);
  }
  async function briefs(p) {
    const d = await data(p),
      root = $("#tool-content"),
      names = [
        ...new Set(
          [
            ...d.tasks.map((x) => x.assignee),
            ...d.ops.map((x) => x.details.responsible),
            ...d.schedule.map((x) => x.speaker),
            ...d.contacts.map((x) => x.full_name),
          ].filter(Boolean),
        ),
      ].sort();
    root.innerHTML =
      h(
        "Briefs par personne",
        "Choisissez un nom tel qu’il apparaît dans les affectations. Les contacts communs peuvent être inclus dans la fiche.",
      ) +
      `<form id="person-brief-form" class="production-inline"><label>Personne<input name="person" list="brief-names" required placeholder="Nom du responsable"><datalist id="brief-names">${names.map((x) => `<option value="${esc(x)}">`).join("")}</datalist></label><label class="check"><input type="checkbox" name="contacts" checked>Inclure les contacts du projet</label><button class="btn primary">Préparer le brief</button></form><div id="person-brief"></div>`;
    $("#person-brief-form").onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target),
        person = String(fd.get("person")).trim(),
        norm = (x) =>
          String(x || "")
            .trim()
            .toLocaleLowerCase("fr"),
        match = (x) => norm(x) === norm(person),
        schedule = d.schedule.filter((x) => match(x.speaker)),
        tasks = d.tasks.filter((x) => match(x.assignee)),
        ops = d.ops.filter(
          (x) =>
            match(x.details.responsible) ||
            match(x.details.to_person) ||
            match(x.details.host) ||
            match(x.details.service_team),
        );
      const html = `<h2>Brief · ${esc(person)}</h2><p>${p.event_date ? esc(fmtDate(p.event_date)) : ""} · ${esc(p.location || "")}</p>${card("Interventions", listHtml(schedule.map((x) => `${esc(WorkHours.label(x, p.event_date))} ${esc(x.start_time || "")} · ${esc(x.title)}${x.cue ? " — " + esc(x.cue) : ""}`)))}${card("Missions", listHtml(tasks.map((x) => `${x.done ? "✓" : "□"} ${esc(x.label)}${x.due_date ? " · " + esc(fmtDate(x.due_date)) : ""}`)))}${card("Consignes et fiches affectées", listHtml(ops.map((x) => `<strong>${esc(x.label)}</strong> · ${esc(ProjectOperations.tools[x.tool]?.title || x.tool)}<br>${esc(x.details.instructions || x.details.after || x.details.remaining || x.details.request || x.details.notes || "")}`)))}${fd.has("contacts") ? card("Contacts utiles", listHtml(d.contacts.map((x) => `${esc(x.full_name)} · ${esc(x.role || "")} · ${esc(x.phone || "")} ${esc(x.email || "")}`))) : ""}`;
      $("#person-brief").innerHTML =
        `<button class="btn no-print" id="print-person-brief">Imprimer ce brief</button><article class="card">${html}</article>`;
      $("#print-person-brief").onclick = () =>
        api().print(p, "Brief de " + person, html);
    };
  }
  async function clock(p, reload) {
    const root = $("#tool-content"),
      rows = await api().list("project_regie_clocks", { project_id: p.id }),
      saved = rows[0] || {
        mode: "stopwatch",
        elapsed_ms: 0,
        duration_ms: 300000,
        running_since: null,
        revision: 0,
      };
    root.innerHTML =
      h(
        "Horloge de régie",
        "Le chronomètre utilise des horodatages et reste cohérent après un rechargement. Les commandes sont partagées avec les comptes autorisés du projet.",
      ) +
      `<section class="card regie-clock"><div id="regie-wall-clock"></div><output id="regie-timer" aria-label="Temps écoulé ou restant"></output>${p._canEdit ? `<form id="regie-clock-form" class="stack"><div class="row-2"><label>Mode<select name="mode"><option value="stopwatch">Chronomètre</option><option value="countdown">Compte à rebours</option></select></label><label>Durée du compte à rebours (minutes)<input name="duration" type="number" min="0.01" max="10080" step="0.01" value="${saved.duration_ms / 60000}" required></label></div><div class="actions"><button class="btn" name="command" value="start">${saved.running_since ? "Actualiser / démarrer" : "Démarrer / reprendre"}</button><button class="btn" name="command" value="pause">Pause</button><button class="btn" name="command" value="reset">Réinitialiser</button></div></form>` : ""}<button class="btn small" id="reload-regie-clock">Actualiser les commandes partagées</button></section>`;
    if ($("#regie-clock-form"))
      $("#regie-clock-form").elements.mode.value = saved.mode;
    const elapsed = () =>
      n(saved.elapsed_ms) +
      (saved.running_since
        ? Math.max(0, Date.now() - Date.parse(saved.running_since))
        : 0);
    const tick = () => {
      if (!root.isConnected) {
        clearInterval(timer);
        return;
      }
      $("#regie-wall-clock").textContent = new Date().toLocaleTimeString(
        "fr-FR",
      );
      const ms =
          saved.mode === "countdown"
            ? Math.max(0, saved.duration_ms - elapsed())
            : elapsed(),
        seconds = Math.floor(ms / 1000);
      $("#regie-timer").textContent =
        `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
      $("#regie-timer").classList.toggle(
        "clock-finished",
        saved.mode === "countdown" && ms === 0,
      );
    };
    let timer = setInterval(tick, 250);
    tick();
    $("#reload-regie-clock").onclick = reload;
    if (p._canEdit)
      $("#regie-clock-form").onsubmit = (e) => {
        e.preventDefault();
        const button = e.submitter,
          fd = new FormData(e.target),
          command = button.value;
        api().run(button, async () => {
          const mode = fd.get("mode"),
            duration_ms = Math.round(n(fd.get("duration")) * 60000),
            changed = mode !== saved.mode,
            elapsed_ms =
              command === "reset" || changed ? 0 : Math.round(elapsed()),
            payload = {
              project_id: p.id,
              mode,
              duration_ms,
              elapsed_ms,
              running_since:
                command === "start" ? new Date().toISOString() : null,
              revision: saved.revision + 1,
            };
          await api().write(
            saved.revision
              ? sb
                  .from("project_regie_clocks")
                  .update(payload)
                  .eq("project_id", p.id)
                  .eq("revision", saved.revision)
                  .select("project_id")
                  .single()
              : sb
                  .from("project_regie_clocks")
                  .insert(payload)
                  .select("project_id")
                  .single(),
          );
          await reload();
        });
      };
  }
  function shiftPreview(items, delta, locked, fromId) {
    const sorted = WorkHours.sort(items),
      start = fromId ? sorted.findIndex((x) => x.id === fromId) : 0;
    const changes = [];
    for (let i = Math.max(0, start); i < sorted.length; i++) {
      const x = sorted[i];
      if (locked.has(x.id) || minutes(x.start_time) == null) continue;
      if (x.day_offset == null)
        throw Error(
          "Confirmez d’abord le jour de chaque créneau à décaler dans le planning.",
        );
      const begin = x.day_offset * 1440 + minutes(x.start_time) + delta,
        day = Math.floor(begin / 1440),
        end = minutes(x.end_time);
      if (day < -7 || day > 30)
        throw Error("Le décalage dépasse les jours autorisés (J−7 à J+30).");
      const time = clockString(((begin % 1440) + 1440) % 1440),
        endTime =
          end == null
            ? null
            : clockString((((end + delta) % 1440) + 1440) % 1440);
      changes.push({
        id: x.id,
        original_day: x.day_offset,
        original_start: x.start_time,
        original_end: x.end_time,
        day_offset: day,
        start_time: time,
        end_time: endTime,
      });
    }
    return changes;
  }
  async function shift(p, reload) {
    const root = $("#tool-content"),
      items = await api().list("schedule_items", { project_id: p.id });
    root.innerHTML =
      h(
        "Recalcul du programme",
        "Prévisualisez un décalage à partir d’une étape, conservez les horaires impératifs, puis appliquez explicitement. Les dates et passages de minuit sont conservés.",
      ) +
      `<form id="shift-form" class="stack card"><div class="row-2"><label>Décalage (minutes, négatif pour avancer)<input name="delta" type="number" min="-10080" max="10080" value="15" step="1" required></label><label>À partir de<select name="from"><option value="">Tout le programme</option>${WorkHours.sort(
        items,
      )
        .map(
          (x) =>
            `<option value="${x.id}">${esc(x.title)} · ${esc(x.start_time || "")}</option>`,
        )
        .join(
          "",
        )}</select></label></div><fieldset><legend>Horaires impératifs à conserver</legend>${WorkHours.sort(
        items,
      )
        .map(
          (x) =>
            `<label class="check"><input name="locked" type="checkbox" value="${x.id}">${esc(x.title)} · ${esc(WorkHours.label(x, p.event_date))} ${esc(x.start_time || "")}</label>`,
        )
        .join(
          "",
        )}</fieldset><button class="btn">Prévisualiser</button></form><div id="shift-preview"></div>`;
    let preview = [];
    $("#shift-form").onsubmit = (e) => {
      e.preventDefault();
      try {
        const fd = new FormData(e.target),
          locked = new Set(fd.getAll("locked")),
          delta = n(fd.get("delta"));
        preview = shiftPreview(items, delta, locked, fd.get("from"));
        const updated = items.map((x) => {
            const c = preview.find((c) => c.id === x.id);
            return c ? { ...x, ...c } : x;
          }),
          conflicts = [];
        for (const a of updated.filter(
          (x) => !locked.has(x.id) && preview.some((c) => c.id === x.id),
        ))
          for (const b of updated.filter((x) => locked.has(x.id))) {
            const at = n(a.day_offset) * 1440 + minutes(a.start_time),
              bt = n(b.day_offset) * 1440 + minutes(b.start_time),
              ad = WorkHours.duration(a),
              bd = WorkHours.duration(b);
            if (ad && bd && at < bt + bd && bt < at + ad)
              conflicts.push(
                `${a.title} chevauche l’horaire impératif « ${b.title} »`,
              );
          }
        $("#shift-preview").innerHTML = card(
          "Aperçu",
          listHtml(
            preview.map((c) => {
              const old = items.find((x) => x.id === c.id);
              return `<strong>${esc(old.title)}</strong> : ${esc(WorkHours.label(old, p.event_date))} ${esc(old.start_time || "")} → ${esc(WorkHours.label(c, p.event_date))} ${esc(c.start_time)}${c.end_time ? " – " + esc(c.end_time) : ""}`;
            }),
          ) +
            conflicts
              .map((c) => `<p class="ops-alert">${esc(c)}</p>`)
              .join("") +
            (p._canEdit
              ? `<button id="apply-shift" class="btn primary" ${!preview.length || conflicts.length ? "disabled" : ""}>Appliquer ce décalage</button>`
              : '<p class="muted">Consultation seule : aperçu sans modification.</p>'),
        );
        if ($("#apply-shift"))
          $("#apply-shift").onclick = (e) =>
            api().run(e.currentTarget, async () => {
              await api().write(
                sb.rpc("shift_project_schedule", {
                  pid: p.id,
                  changes: preview,
                }),
              );
              toast(
                "Planning décalé. Les tarifs appliqués n’ont pas été recalculés.",
              );
              await reload();
            });
      } catch (error) {
        ERR(error);
      }
    };
  }
  async function setup(p) {
    const root = $("#tool-content"),
      [boards, reservations] = await Promise.all([
        api().list("project_setups", { project_id: p.id }),
        me.role === "client"
          ? []
          : api().list("equipment_reservations", { project_id: p.id }),
      ]);
    const board = boards[0]?.layout,
      results = [];
    if (!board) results.push("Aucun setup enregistré.");
    else {
      for (const edge of board.edges || []) {
        try {
          AudioSetup.compatible(board, edge, edge.id);
        } catch (error) {
          results.push(
            `Liaison ${board.nodes.find((n) => n.id === edge.from_node)?.label || "source"} → ${board.nodes.find((n) => n.id === edge.to_node)?.label || "destination"} : ${error.message}`,
          );
        }
      }
      for (const node of board.nodes || []) {
        if (
          !(board.edges || []).some(
            (e) => e.from_node === node.id || e.to_node === node.id,
          )
        )
          results.push(`${node.label} : aucune liaison configurée.`);
        if (
          reservations.length &&
          !reservations.some(
            (r) =>
              r.equipment_id === node.equipment_id &&
              r.state !== "cancelled" &&
              r.quantity >= node.unit,
          )
        )
          results.push(
            `${node.label} : exemplaire absent de la sélection de matériel actuelle.`,
          );
      }
      results.push(...AudioPorts.groupNotes(board));
    }
    let cables = [];
    if (board)
      try {
        cables = AudioSetup.cables(board);
      } catch (error) {
        results.push(error.message);
      }
    root.innerHTML =
      h(
        "Vérification du setup",
        "Analyse du plan enregistré, des formats de signal et de la sélection actuelle. Les câbles restent à vérifier physiquement au chargement.",
      ) +
      card(
        "Points à vérifier",
        results.length
          ? listHtml(results.map(esc))
          : "<p>Les liaisons enregistrées passent les contrôles de compatibilité. Effectuez les essais sur place.</p>",
      ) +
      card(
        "Câbles prévus",
        listHtml(
          cables.map((x) =>
            esc(
              typeof x === "string"
                ? x
                : x.error ||
                    [x.label, x.length + " m", x.from + " → " + x.to].join(
                      " · ",
                    ),
            ),
          ),
        ),
      ) +
      `<div class="actions">${api().toolLink(p, "setup")}${api().toolLink(p, "loading")}${api().toolLink(p, "diagnostics")}</div>`;
  }
  function calculators(p) {
    const root = $("#tool-content");
    root.innerHTML =
      h(
        "Boîte à outils technique",
        "Calculs de repérage et références de connectique. Les résultats ne remplacent pas les mesures sur le lieu.",
      ) +
      `<div class="companion-grid"><form class="card stack" id="delay-calculator"><h3>Retard acoustique</h3><label>Distance de compensation (m)<input name="distance" type="number" min="0" max="10000" step="0.01" value="10"></label><label>Température (°C)<input name="temperature" type="number" min="-30" max="60" value="20"></label><output></output><p class="tool-note">Distance ÷ vitesse du son (331,3 + 0,606 × température). À affiner par mesure.</p></form><form class="card stack" id="unit-calculator"><h3>Conversions</h3><label>Valeur<input name="value" type="number" step="any" value="1"></label><label>Conversion<select name="kind"><option value="meters">Mètres → pieds</option><option value="feet">Pieds → mètres</option><option value="kg">Kilogrammes → livres</option><option value="lbs">Livres → kilogrammes</option><option value="dbu">dBu → V RMS</option><option value="dbv">dBV → V RMS</option><option value="volts">V RMS → dBu</option></select></label><output></output></form></div><section class="card"><h3>Répertoire des connectiques</h3><input type="search" id="connector-reference-search" placeholder="XLR, RCA, bornier…" aria-label="Rechercher une connectique"><div class="companion-connectors" id="connector-reference-list"></div></section>`;
    const delay = $("#delay-calculator"),
      convert = $("#unit-calculator");
    const draw = () => {
      const dist = n(delay.elements.distance.value),
        temp = n(delay.elements.temperature.value);
      delay.querySelector("output").textContent =
        ((dist / (331.3 + 0.606 * temp)) * 1000).toFixed(2) + " ms";
      const v = Number(convert.elements.value.value),
        kind = convert.elements.kind.value;
      const result = {
        meters: () => [v / 0.3048, "ft"],
        feet: () => [v * 0.3048, "m"],
        kg: () => [v / 0.45359237, "lb"],
        lbs: () => [v * 0.45359237, "kg"],
        dbu: () => [0.775 * 10 ** (v / 20), "V RMS"],
        dbv: () => [10 ** (v / 20), "V RMS"],
        volts: () => [v > 0 ? 20 * Math.log10(v / 0.775) : NaN, "dBu"],
      }[kind]();
      convert.querySelector("output").textContent = Number.isFinite(result[0])
        ? result[0].toLocaleString("fr-FR", { maximumFractionDigits: 4 }) +
          " " +
          result[1]
        : "Une tension positive est nécessaire.";
    };
    [delay, convert].forEach((f) => {
      f.oninput = draw;
      f.onsubmit = (e) => e.preventDefault();
    });
    draw();
    const connectors = () => {
      const q = $("#connector-reference-search").value.toLowerCase();
      $("#connector-reference-list").innerHTML = AudioConnectors.items
        .filter((x) => x.join(" ").toLowerCase().includes(q))
        .map(
          ([key, title, family, , description]) =>
            `<article>${AudioConnectors.icon(key)}<strong>${esc(title)}</strong><p>${esc(description || family)}</p></article>`,
        )
        .join("");
    };
    $("#connector-reference-search").oninput = connectors;
    connectors();
  }
  async function labels(p) {
    const root = $("#tool-content"),
      [gear, reservations, boards] = await Promise.all([
        me.role === "client" ? [] : api().list("equipment", {}, "name"),
        me.role === "client"
          ? []
          : api().list("equipment_reservations", { project_id: p.id }),
        api().list("project_setups", { project_id: p.id }),
      ]);
    const rows = [];
    for (const r of reservations.filter((x) => x.state !== "cancelled")) {
      const item = gear.find((g) => g.id === r.equipment_id);
      if (item)
        for (let i = 1; i <= Math.min(r.quantity, 1000); i++)
          rows.push(`${item.name} #${i}`);
    }
    const board = boards[0]?.layout;
    for (const edge of board?.edges || []) {
      const from = board.nodes.find((n) => n.id === edge.from_node),
        to = board.nodes.find((n) => n.id === edge.to_node);
      rows.push(
        `${from?.label || "Source"} → ${to?.label || "Destination"}${edge.length ? " · " + edge.length + " m" : ""}`,
      );
    }
    root.innerHTML =
      h(
        "Étiquettes de repérage",
        "Une étiquette par ligne, modifiable avant impression. Les étiquettes de matériel et de liaison reprennent le projet.",
      ) +
      `<form id="label-print-form" class="stack card"><label>Étiquettes<textarea name="labels" rows="10" maxlength="30000">${esc(rows.join("\n"))}</textarea></label><div class="row-2"><label>Copies de chaque étiquette<input name="copies" type="number" min="1" max="20" value="1" required></label><label>Colonnes sur la feuille<select name="columns"><option>2</option><option>3</option><option>4</option></select></label></div><button class="btn primary">Imprimer les étiquettes</button></form>`;
    $("#label-print-form").onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target),
        labels = String(f.get("labels"))
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 1000),
        copies = n(f.get("copies"));
      api().print(
        p,
        "Étiquettes",
        `<div class="paper-labels" style="grid-template-columns:repeat(${n(f.get("columns"))},1fr)">${labels.flatMap((label) => Array.from({ length: copies }, () => `<div><small>${esc(p.title)}</small><strong>${esc(label)}</strong></div>`)).join("")}</div>`,
      );
    };
  }
  const diagnosticSteps = {
    no_sound: [
      "Vérifier que le fichier ou la source est en lecture et produit un signal.",
      "Contrôler les volumes, faders, mute et affectations de la source vers la sortie souhaitée.",
      "Suivre le trajet dans le setup, de la source à la table, puis à la diffusion.",
      "Niveaux baissés, tester un câble connu fonctionnel et la bonne entrée.",
      "Vérifier l’alimentation et les voyants des appareils ; consigner les erreurs visibles.",
    ],
    one_side: [
      "Lire une source connue stéréo et vérifier ses réglages de balance.",
      "Vérifier le groupe L/R et les deux câbles physiques dans le setup.",
      "Contrôler les panoramiques, niveaux et affectations à chaque étape.",
      "Niveaux baissés, permuter les câbles L/R pour localiser le défaut.",
    ],
    noise: [
      "Identifier si le bruit vient d’une source précise ou de toute la diffusion.",
      "Baisser les niveaux avant de modifier le câblage.",
      "Tester un câble et une source connus fonctionnels, une étape à la fois.",
      "Éloigner les liaisons audio des alimentations et rechercher les faux contacts.",
      "Ne jamais supprimer une terre de protection ; solliciter un technicien si le défaut persiste.",
    ],
    feedback: [
      "Baisser immédiatement le niveau du micro concerné.",
      "Éloigner et orienter le micro hors de l’axe des enceintes.",
      "Réduire les micros ouverts et vérifier le niveau des retours.",
      "Reprendre les niveaux progressivement puis affiner l’égalisation si nécessaire.",
    ],
    distortion: [
      "Baisser les niveaux et repérer les voyants de saturation.",
      "Vérifier le niveau de sortie de la source puis les gains d’entrée.",
      "Vérifier que chaque entrée reçoit le bon niveau de signal (micro, ligne, puissance).",
      "Ne jamais relier une sortie d’amplificateur à une entrée ligne.",
    ],
    light: [
      "Vérifier l’alimentation, l’état et le mode de l’appareil.",
      "Contrôler l’adresse DMX, l’univers et le mode de canaux indiqué dans sa notice.",
      "Vérifier la chaîne de commande et tester un câble adapté connu fonctionnel.",
      "Tester localement l’appareil avant de rétablir la commande.",
    ],
  };
  async function diagnostic(panel, p) {
    panel.insertAdjacentHTML(
      "beforeend",
      `<section class="card"><h3>Diagnostic guidé</h3><p class="tool-note">Baissez les niveaux avant toute modification de câblage. Utilisez la notice de l’appareil pour les réglages propres au modèle.</p><label>Symptôme<select id="diagnostic-symptom">${Object.entries(
        EventCompanion.recordTools.diagnostics.fields[0].options,
      )
        .map(([k, v]) => `<option value="${k}">${esc(v)}</option>`)
        .join(
          "",
        )}</select></label><div id="diagnostic-step"></div>${api().toolLink(p, "setup", "Consulter mon setup")}${api().toolLink(p, "issues", "Signaler un imprévu")}</section>`,
    );
    let index = 0,
      passed = [];
    const render = () => {
      const key = $("#diagnostic-symptom").value,
        steps = diagnosticSteps[key];
      $("#diagnostic-step").innerHTML =
        index < steps.length
          ? `<p>Étape ${index + 1} / ${steps.length}</p><h3>${esc(steps[index])}</h3><div class="actions"><button class="btn" id="diagnostic-next">Vérifié, étape suivante</button><button class="btn" id="diagnostic-resolved">Le problème est résolu</button></div>`
          : `<p>Vérifications terminées. Si le problème persiste, faites intervenir une personne compétente et consultez vos plans de remplacement.</p><button class="btn" id="diagnostic-report">Préparer le compte rendu</button>`;
      $("#diagnostic-next")?.addEventListener("click", () => {
        passed.push(steps[index++]);
        render();
      });
      const prepare = (result) => {
        const f = $("#ops-form");
        if (!f) {
          toast(
            "Consultation seule : enregistrement réservé aux personnes autorisées.",
            false,
          );
          return;
        }
        f.elements.label.value =
          "Diagnostic · " +
          $("#diagnostic-symptom").selectedOptions[0].textContent;
        f.elements.symptom.value = key;
        f.elements.checks.value = passed.join("\n");
        f.elements.result.value = result;
        f.elements.status.value = result === "Résolu" ? "resolved" : "blocked";
        $("#ops-editor").open = true;
        f.dispatchEvent(new Event("input", { bubbles: true }));
        f.scrollIntoView({ block: "center" });
      };
      $("#diagnostic-resolved")?.addEventListener("click", () =>
        prepare("Résolu"),
      );
      $("#diagnostic-report")?.addEventListener("click", () =>
        prepare("Vérifications terminées, intervention nécessaire."),
      );
    };
    $("#diagnostic-symptom").onchange = () => {
      index = 0;
      passed = [];
      render();
    };
    render();
  }
  async function mediaCheck(panel, p) {
    const docs = await api().list(
      "project_documents",
      { project_id: p.id },
      "name",
    );
    panel.insertAdjacentHTML(
      "beforeend",
      `<section class="card"><h3>Tester un support du projet</h3><label>Document<select id="media-check-document">${docs.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join("")}</select></label><button class="btn" id="media-check-start" ${docs.length ? "" : "disabled"}>Vérifier l’accès et le format</button><div id="media-check-result" role="status"></div><p class="tool-note">Un accès réussi ne garantit pas que le son est audible ou que le contenu convient. L’écoute et le visionnage doivent être validés sur l’appareil utilisé le jour J.</p></section>`,
    );
    $("#media-check-start").onclick = (e) =>
      api().run(e.currentTarget, async () => {
        const doc = docs.find((x) => x.id === $("#media-check-document").value);
        const response = await DocumentViewer.readPrivate(doc),
          blob = await response.blob();
        let result = `Accès autorisé · ${blob.size} octets · ${doc.mime_type || blob.type || "format non précisé"}`;
        if (!blob.size) throw Error("Le document est vide.");
        if (
          ["audio/", "video/"].some((prefix) =>
            (doc.mime_type || "").startsWith(prefix),
          )
        ) {
          const element = document.createElement(
            doc.mime_type.startsWith("video/") ? "video" : "audio",
          );
          result +=
            " · " +
            (element.canPlayType(doc.mime_type)
              ? "format annoncé comme pris en charge par ce navigateur"
              : "lecture à vérifier dans une application adaptée");
        }
        $("#media-check-result").innerHTML =
          `<p>${esc(result)}</p><a class="btn small" href="#/document/${doc.id}" target="_blank" rel="noopener">Ouvrir pour écoute / visionnage</a>${p._canEdit ? '<button class="btn small" id="prepare-media-check">Préparer la fiche de contrôle</button>' : ""}`;
        $("#prepare-media-check")?.addEventListener("click", () => {
          const f = $("#ops-form");
          f.elements.label.value = "Contrôle · " + doc.name;
          f.elements.document_id.value = doc.id;
          f.elements.checked_at.value = api().localDateTime();
          f.elements.result.value = result;
          f.elements.device.value = navigator.userAgent.slice(0, 300);
          f.elements.status.value = "checked";
          $("#ops-editor").open = true;
          f.dispatchEvent(new Event("input", { bubbles: true }));
          f.scrollIntoView({ block: "center" });
        });
      });
  }
  return { open, diagnostic, mediaCheck, shiftPreview };
})();
