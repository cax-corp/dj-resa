/* Search only data the signed-in account is already allowed to read. */
const EventSearch = (() => {
  const sources = [
    ["project_tasks", "Tâches", "conductor", (x) => x.label],
    ["schedule_items", "Planning", "conductor", (x) => x.title],
    ["project_guests", "Invités", "guests", (x) => x.full_name],
    ["project_contacts", "Prestataires", "contacts", (x) => x.full_name],
    ["project_documents", "Documents", "documents", (x) => x.name],
    ["project_tracks", "Musique", null, (x) => x.title],
    ["project_operation_items", "Fiches opérationnelles", null, (x) => x.label],
    ["project_companion_items", "Suivi de l’événement", null, (x) => x.label],
    ["equipment_setting_presets", "Réglages", "settings", (x) => x.name],
  ];
  const normalize = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr");
  async function open(p = null, initial = "") {
    const root = p ? $("#tool-content") : app;
    if (!p) app.innerHTML = '<div id="global-event-search"></div>';
    const target = p ? root : $("#global-event-search");
    target.innerHTML = `<div class="page-head"><div><h1>${p ? "Recherche dans le projet" : "Recherche transversale"}</h1><p>Retrouvez les noms, fiches, consignes et noms de documents accessibles à votre compte.</p></div></div><form id="event-search-form" class="companion-search-form"><label>Rechercher<input type="search" name="query" value="${esc(initial || parseHash().params.get("q") || "")}" placeholder="Micro, arrivée du traiteur, nom d’une personne…" autofocus></label><label>Type d’information<select name="source"><option value="">Tout</option>${sources.map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}</select></label><button class="btn">Rechercher</button></form><p class="tool-note">La recherche porte sur les informations enregistrées et les noms des documents, pas sur le contenu des fichiers.</p><p id="event-search-status" role="status">Chargement des informations…</p><div id="event-search-results"></div>`;
    const projects = p
        ? [p]
        : await EventCompanion.list("projects", {}, "title"),
      projectMap = new Map(projects.map((x) => [x.id, x])),
      failures = [],
      results = [];
    const loaded = await Promise.allSettled(
      sources.map(async ([table, label, section, title]) => ({
        table,
        label,
        section,
        title,
        rows: await EventCompanion.list(table, p ? { project_id: p.id } : {}),
      })),
    );
    for (let i = 0; i < loaded.length; i++) {
      const r = loaded[i];
      if (r.status === "rejected") {
        failures.push(sources[i][1]);
        continue;
      }
      const s = r.value;
      for (const x of s.rows) {
        if (!projectMap.has(x.project_id)) continue;
        results.push({
          source: s.table,
          group: s.label,
          title: s.title(x),
          text: normalize(
            [
              s.title(x),
              ...Object.values(x.details || {}),
              x.notes,
              x.description,
              x.role,
              x.company,
              x.speaker,
              x.cue,
              x.song,
              x.artist,
              x.table_name,
            ]
              .filter(Boolean)
              .join(" "),
          ),
          project: projectMap.get(x.project_id),
          section: [
            "project_operation_items",
            "project_companion_items",
          ].includes(s.table)
            ? x.tool
            : s.section,
          id: x.id,
        });
      }
    }
    if (!target.isConnected) return;
    const form = $("#event-search-form");
    let timer;
    const draw = () => {
      const query = normalize(form.elements.query.value.trim()),
        source = form.elements.source.value,
        matched =
          query.length < 2
            ? []
            : results.filter(
                (x) =>
                  (!source || x.source === source) && x.text.includes(query),
              );
      $("#event-search-status").textContent =
        (query.length < 2
          ? "Saisissez au moins deux caractères."
          : `${matched.length} résultat(s).`) +
        (failures.length
          ? " Certaines sources sont indisponibles : " +
            failures.join(", ") +
            "."
          : "");
      $("#event-search-results").innerHTML =
        matched
          .slice(0, 250)
          .map((x) => {
            const projectUrl = `#/${me.role === "admin" ? "admin/projets" : "projets"}/${x.project.id}`,
              href =
                x.source === "project_documents"
                  ? `#/document/${x.id}`
                  : x.section
                    ? `#/outils/${x.project.id}?section=${x.section}&focus=${x.id}`
                    : projectUrl;
            return `<article class="card companion-search-result"><span class="eyebrow">${esc(x.group)}</span><a href="${href}"><h3>${esc(x.title)}</h3></a><p class="muted">${esc(x.project.title)}${x.section ? " · " + esc(ProjectToolBrowser.available(x.project.event_type)[x.section] || x.section) : ""}</p></article>`;
          })
          .join("") +
        (matched.length > 250
          ? '<p class="tool-note">Affinez votre recherche pour afficher les autres résultats.</p>'
          : "");
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      draw();
    };
    form.elements.query.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(draw, 180);
    };
    form.elements.source.onchange = draw;
    draw();
  }
  return { open };
})();

const ToolPreferences = (() => {
  const cache = new Map(),
    key = (id) => `${me.id}:${id}`,
    defaultFavorites = ["live", "conductor", "guests", "documents"];
  function get(id) {
    return (
      cache.get(key(id)) || { hidden_tools: [], favorites: defaultFavorites }
    );
  }
  async function load(id) {
    const k = key(id);
    if (cache.has(k)) return get(id);
    const rows = await EventCompanion.list("project_tool_preferences", {
      project_id: id,
      user_id: me.id,
    });
    const value = rows[0] || { hidden_tools: [], favorites: defaultFavorites };
    cache.set(k, value);
    return value;
  }
  function refresh(bar) {
    if (!bar.isConnected) return;
    const id = bar.dataset.toolProject,
      available = ProjectToolBrowser.available(bar.dataset.toolType),
      prefs = get(id),
      active = bar.querySelector(".tool-current")?.getAttribute("href"),
      quick = bar.querySelector(".tool-quick-links");
    if (quick)
      quick.innerHTML = (prefs.favorites || defaultFavorites)
        .filter(
          (k) =>
            available[k] &&
            !(prefs.hidden_tools || []).includes(k) &&
            !active?.endsWith("section=" + k),
        )
        .slice(0, 4)
        .map(
          (k) =>
            `<a data-tool-group="${ProjectToolBrowser.groupFor(k)}" href="#/outils/${id}?section=${k}">${esc(available[k])}</a>`,
        )
        .join("");
  }
  function edit(id, eventType, onSaved) {
    const available = ProjectToolBrowser.available(eventType),
      prefs = get(id),
      dialog = document.createElement("dialog");
    dialog.className = "project-tools-dialog";
    dialog.setAttribute("aria-labelledby", "tool-preferences-title");
    dialog.innerHTML = `<h2 id="tool-preferences-title">Mes outils pour ce projet</h2><p class="tool-note">Ce choix personnalise votre affichage, sans modifier les droits des autres comptes. Gardez jusqu’à quatre favoris dans la barre d’accès.</p><form id="tool-preferences-form"><div class="tool-preference-list">${Object.entries(
      available,
    )
      .map(
        ([k, title]) =>
          `<div><label class="check"><input name="visible" value="${k}" type="checkbox" ${prefs.hidden_tools.includes(k) ? "" : "checked"}>${esc(title)}</label><label class="check"><input type="checkbox" name="favorite" value="${k}" ${prefs.favorites.includes(k) ? "checked" : ""}>Favori</label></div>`,
      )
      .join(
        "",
      )}</div><div class="actions"><button class="btn primary">Enregistrer mes outils</button><button type="button" class="btn" id="cancel-tool-preferences">Annuler</button></div></form>`;
    document.body.append(dialog);
    dialog.showModal();
    $("#cancel-tool-preferences").onclick = () => dialog.close();
    dialog.addEventListener("keydown", (e) => {
      if (e.key === "Escape") e.stopPropagation();
    });
    dialog.onclose = () => dialog.remove();
    $("#tool-preferences-form").onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target),
        visible = fd.getAll("visible"),
        favorites = fd.getAll("favorite").filter((k) => visible.includes(k));
      if (favorites.length > 4)
        return toast("Choisissez au maximum quatre favoris.", false);
      EventCompanion.run(e.submitter, async () => {
        const payload = {
          project_id: id,
          user_id: me.id,
          hidden_tools: Object.keys(available).filter(
            (k) => !visible.includes(k),
          ),
          favorites,
        };
        await EventCompanion.write(
          sb
            .from("project_tool_preferences")
            .upsert(payload, { onConflict: "project_id,user_id" })
            .select("project_id")
            .single(),
        );
        cache.set(key(id), payload);
        document.querySelectorAll("[data-tool-project]").forEach(refresh);
        onSaved?.();
        dialog.close();
      });
    };
  }
  new MutationObserver(() => {
    document
      .querySelectorAll("[data-tool-project]:not([data-preferences-ready])")
      .forEach((bar) => {
        bar.dataset.preferencesReady = "true";
        load(bar.dataset.toolProject)
          .then(() => refresh(bar))
          .catch(ERR);
      });
  }).observe(document.getElementById("app"), {
    childList: true,
    subtree: true,
  });
  return { get, load, edit };
})();
