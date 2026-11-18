/* One compact entry point for every project tool; existing deep links remain unchanged. */
const ProjectToolBrowser = (() => {
  const categories = {
    planning: ["Préparation et pilotage", "grid"],
    people: ["Invités et accueil", "people"],
    logistics: ["Logistique", "briefcase"],
    technical: ["Technique et musique", "mixer"],
    program: ["Programme et souvenirs", "camera"],
    tracking: ["Suivi et démarches", "presentation"],
  };
  const groups = {
    preparation: "planning",
    conductor: "planning",
    team: "planning",
    documents: "planning",
    contacts: "planning",
    guests: "people",
    rsvp: "people",
    seating: "people",
    equipment: "technical",
    venue: "logistics",
    setup: "technical",
    music_import: "technical",
    requests: "technical",
    profit: "tracking",
    debrief: "tracking",
  };
  const url = (id, key) => `#/outils/${encodeURIComponent(id)}?section=${key}`;
  function available(eventType) {
    return {
      ...(me.role !== "dj" && EventExperience.profile(eventType)
        ? { preparation: "Préparation " + EventTypes.label(eventType) }
        : {}),
      guests: "Invités",
      conductor: "Planning",
      contacts: "Prestataires",
      documents: "Documents",
      ...Production.sections(),
      ...(me.role === "admin"
        ? {
            requests: "Demandes musicales",
            equipment: "Matériel",
            venue: "Lieu",
            debrief: "Bilan",
          }
        : {}),
      ...ProjectOperations.sections(),
    };
  }
  function bar(id, eventType, active) {
    const sections = available(eventType),
      quick = ["conductor", "guests", "documents"].filter((k) => k !== active);
    return `<section class="project-tool-launcher no-print" data-tool-project="${esc(id)}" data-tool-type="${esc(eventType || "")}" aria-label="Outils du projet"><div class="tool-launcher-title"><span class="eyebrow">Outils du projet</span>${active ? `<a class="active tool-current" aria-current="page" href="${url(id, active)}">${esc(sections[active] || "Outils")}</a>` : '<span class="muted tool-launcher-hint">Préparer, organiser et suivre</span>'}</div><nav class="tool-quick-links" aria-label="Accès rapides">${quick.map((k) => `<a href="${url(id, k)}">${esc(sections[k])}</a>`).join("")}</nav><button class="btn" type="button" data-browse-tools aria-haspopup="dialog">Tous les outils <span class="tool-count">${Object.keys(sections).length}</span><span aria-hidden="true">⌕</span></button></section>`;
  }
  const normalize = (s) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr");
  function show(bar, trigger) {
    document.getElementById("project-tools-dialog")?.remove();
    const id = bar.dataset.toolProject,
      sections = available(bar.dataset.toolType),
      current = bar.querySelector("[aria-current]")?.getAttribute("href");
    const dialog = document.createElement("dialog");
    dialog.id = "project-tools-dialog";
    dialog.className = "project-tools-dialog";
    dialog.setAttribute("aria-labelledby", "project-tools-title");
    dialog.innerHTML = `<div class="tool-dialog-head"><div><h2 id="project-tools-title">Les outils du projet</h2><p class="muted">Retrouvez vos outils par activité.</p></div><button type="button" class="btn small" data-close-tools>Fermer</button></div><label class="tool-dialog-search">Rechercher un outil<input type="search" id="project-tools-search" placeholder="Repas, câbles, invités…" autocomplete="off"></label><nav class="tool-category-filter" aria-label="Catégories d’outils"><button class="active" data-tool-category="all" aria-pressed="true">Tout</button>${Object.entries(
      categories,
    )
      .map(
        ([key, [label]]) =>
          `<button data-tool-category="${key}" aria-pressed="false">${esc(label)}</button>`,
      )
      .join(
        "",
      )}</nav><div id="project-tools-groups" class="tool-browser-groups"></div><p id="project-tools-count" class="muted" role="status"></p>`;
    document.body.append(dialog);
    let category = "all";
    const render = () => {
      const query = normalize(dialog.querySelector("input").value.trim()),
        matches = Object.entries(sections).filter(([key, title]) => {
          const group =
            ProjectOperations.tools[key]?.group || groups[key] || "planning";
          return (
            (category === "all" || category === group) &&
            (!query ||
              normalize(
                title +
                  " " +
                  categories[group][0] +
                  " " +
                  (ProjectOperations.tools[key]?.intro || ""),
              ).includes(query))
          );
        });
      dialog.querySelector("#project-tools-groups").innerHTML =
        Object.entries(categories)
          .map(([key, [title, icon]]) => {
            const links = matches.filter(
              ([k]) =>
                (ProjectOperations.tools[k]?.group ||
                  groups[k] ||
                  "planning") === key,
            );
            return links.length
              ? `<section class="tool-browser-category"><h3>${ProjectIcons.svg(icon, 18)}${esc(title)}</h3><div>${links.map(([k, title]) => `<a href="${url(id, k)}" ${current === url(id, k) ? 'aria-current="page"' : ""}>${esc(title)}<span aria-hidden="true">→</span></a>`).join("")}</div></section>`
              : "";
          })
          .join("") ||
        '<p class="empty">Aucun outil trouvé. Essayez un autre mot ou une autre catégorie.</p>';
      dialog.querySelector("#project-tools-count").textContent =
        `${matches.length} outil${matches.length === 1 ? "" : "s"}`;
      dialog
        .querySelectorAll("#project-tools-groups a")
        .forEach((a) => (a.onclick = () => dialog.close()));
    };
    dialog.querySelectorAll("[data-tool-category]").forEach(
      (b) =>
        (b.onclick = () => {
          category = b.dataset.toolCategory;
          dialog.querySelectorAll("[data-tool-category]").forEach((x) => {
            x.classList.toggle("active", x === b);
            x.setAttribute("aria-pressed", String(x === b));
          });
          render();
        }),
    );
    dialog.querySelector("input").oninput = render;
    dialog.querySelector("[data-close-tools]").onclick = () => dialog.close();
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        event.preventDefault();
        dialog.close();
      }
    });
    dialog.addEventListener(
      "close",
      () => {
        dialog.remove();
        if (trigger.isConnected) trigger.focus();
      },
      { once: true },
    );
    const onRoute = () => dialog.close();
    window.addEventListener("hashchange", onRoute, { once: true });
    dialog.addEventListener(
      "close",
      () => window.removeEventListener("hashchange", onRoute),
      { once: true },
    );
    render();
    dialog.showModal();
    dialog.querySelector("input").focus();
  }
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-browse-tools]");
    if (trigger) show(trigger.closest("[data-tool-project]"), trigger);
  });
  return { bar, available };
})();
