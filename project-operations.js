/* Structured event workspaces. Shared persistence; each tool retains its own fields and workflow. */
const ProjectOperations = (() => {
  const text = (key, label, extra = {}) => ({
    key,
    label,
    type: "text",
    max: 300,
    ...extra,
  });
  const area = (key, label) =>
    text(key, label, { type: "textarea", max: 2000 });
  const num = (key, label, value = 0, extra = {}) => ({
    key,
    label,
    type: "number",
    min: 0,
    max: 1000000,
    step: 1,
    value,
    ...extra,
  });
  const date = (key, label, type = "date") => ({ key, label, type });
  const select = (key, label, options) => ({
    key,
    label,
    type: "select",
    options,
  });
  const states = (...pairs) => Object.fromEntries(pairs);
  const planned = states(
    ["planned", "À préparer"],
    ["ready", "Prêt"],
    ["done", "Terminé"],
    ["cancelled", "Annulé"],
  );
  const tools = {
    meals: {
      title: "Repas et menus",
      icon: "utensils",
      group: "people",
      singular: "un menu ou un service",
      intro:
        "Préparez les menus et quantités, avec les besoins alimentaires de la liste d’invités.",
      label: "Menu / service",
      status: states(
        ["planned", "À prévoir"],
        ["confirmed", "Confirmé"],
        ["served", "Servi"],
        ["cancelled", "Annulé"],
      ),
      fields: [
        num("quantity", "Nombre de repas", 1, { required: true }),
        text("service", "Service / groupe / table"),
        text("provider", "Traiteur / responsable"),
        date("starts_at", "Heure du service", "datetime-local"),
        area("menu", "Composition du menu"),
        area("dietary", "Allergies et adaptations prévues"),
      ],
      summary: ["quantity", "service", "provider"],
    },
    lodging: {
      title: "Hébergement",
      icon: "home",
      group: "logistics",
      singular: "un hébergement",
      intro:
        "Répartissez les couchages et suivez les réservations et les personnes hébergées.",
      label: "Hébergement / chambre",
      status: states(
        ["pending", "À réserver"],
        ["booked", "Réservé"],
        ["checked_in", "Arrivés"],
        ["cancelled", "Annulé"],
      ),
      fields: [
        text("address", "Adresse"),
        num("capacity", "Couchages disponibles", 1, { required: true }),
        num("occupants", "Personnes prévues", 0, { required: true }),
        date("starts_on", "Arrivée"),
        date("ends_on", "Départ"),
        text("contact", "Contact sur place"),
        text("phone", "Téléphone", { type: "tel", max: 50 }),
        text("reference", "Référence de réservation"),
        area("guests", "Personnes / foyers hébergés"),
      ],
      summary: ["occupants", "capacity", "starts_on"],
    },
    transport: {
      title: "Transports et navettes",
      icon: "pin",
      group: "logistics",
      singular: "un trajet",
      intro:
        "Organisez les trajets, véhicules, horaires et groupes de passagers.",
      label: "Trajet / navette",
      status: planned,
      fields: [
        text("departure", "Point de départ"),
        text("destination", "Destination"),
        date("starts_at", "Départ", "datetime-local"),
        date("ends_at", "Arrivée", "datetime-local"),
        text("vehicle", "Véhicule"),
        text("driver", "Conducteur"),
        text("phone", "Téléphone du conducteur", { type: "tel", max: 50 }),
        num("capacity", "Places passagers", 1, { required: true }),
        num("passengers", "Passagers prévus", 0, { required: true }),
        area("guests", "Passagers / groupes"),
      ],
      summary: ["starts_at", "departure", "destination"],
    },
    lighting: {
      title: "Éclairage",
      icon: "sun",
      group: "technical",
      singular: "une ambiance",
      intro:
        "Préparez les ambiances par zone et les changements de lumière du programme.",
      label: "Ambiance / scène lumière",
      status: planned,
      fields: [
        text("zone", "Zone"),
        text("fixtures", "Appareils utilisés"),
        num("quantity", "Nombre d’appareils", 1, { required: true }),
        text("colors", "Couleurs / température"),
        text("cue", "Déclenchement / moment du programme"),
        date("starts_at", "Horaire prévu", "datetime-local"),
        num("universe", "Univers DMX", null, { min: 1, max: 32768 }),
        num("address", "Adresse DMX de départ", null, { min: 1, max: 512 }),
        area("instructions", "Intensité, effets et consignes"),
      ],
      summary: ["zone", "colors", "cue"],
    },
    power: {
      title: "Électricité",
      icon: "speaker",
      group: "technical",
      singular: "un appareil alimenté",
      intro:
        "Répartissez les consommateurs par circuit et estimez leur puissance totale.",
      label: "Appareil / groupe d’appareils",
      status: states(
        ["planned", "À prévoir"],
        ["checked", "Vérifié"],
        ["done", "Installé"],
        ["cancelled", "Retiré"],
      ),
      fields: [
        text("circuit", "Nom du circuit", { required: true }),
        text("location", "Prise / emplacement"),
        num("watts", "Puissance absorbée par appareil (W)", null, {
          step: 0.1,
        }),
        num("quantity", "Quantité", 1, { required: true }),
        num("voltage", "Tension du circuit (V)", 230, {
          required: true,
          min: 1,
          max: 1000,
          step: 0.1,
        }),
        num("amps", "Calibre du circuit (A)", 16, {
          required: true,
          min: 0.1,
          max: 1000,
          step: 0.1,
        }),
        text("connection", "Prise / rallonge / multiprise"),
        area("instructions", "Consignes électriques"),
      ],
      summary: ["circuit", "watts", "quantity"],
    },
    loading: {
      title: "Chargement",
      icon: "briefcase",
      group: "logistics",
      singular: "un élément à charger",
      intro:
        "Répartissez le matériel entre les caisses et véhicules, puis cochez le départ et le retour.",
      label: "Matériel / caisse",
      status: states(
        ["pending", "À charger"],
        ["loaded", "Chargé"],
        ["returned", "De retour"],
        ["cancelled", "Retiré"],
      ),
      fields: [
        num("quantity", "Quantité", 1, { required: true }),
        text("case_name", "Caisse / contenant"),
        text("vehicle", "Véhicule"),
        num("load_order", "Ordre de chargement", 0, { max: 10000 }),
        text("destination", "Zone à l’arrivée"),
      ],
      summary: ["quantity", "case_name", "vehicle"],
    },
    activities: {
      title: "Animations",
      icon: "party",
      group: "program",
      singular: "une animation",
      intro:
        "Préparez les jeux, discours et interventions, avec le matériel et les consignes nécessaires.",
      label: "Animation / intervention",
      status: planned,
      fields: [
        date("starts_at", "Début", "datetime-local"),
        date("ends_at", "Fin", "datetime-local"),
        text("host", "Animateur / intervenant"),
        text("audience", "Public / participants"),
        text("location", "Espace"),
        area("requirements", "Matériel et préparation"),
        area("instructions", "Déroulement / consignes"),
      ],
      summary: ["starts_at", "host", "location"],
    },
    media: {
      title: "Photos et vidéos",
      icon: "camera",
      group: "program",
      singular: "un moment ou un album",
      intro:
        "Listez les prises de vue importantes, les consignes et les albums à consulter.",
      label: "Moment / album",
      status: planned,
      fields: [
        select("kind", "Type", {
          photo: "Photo",
          video: "Vidéo",
          album: "Album / galerie",
        }),
        date("starts_at", "Moment prévu", "datetime-local"),
        text("photographer", "Photographe / vidéaste"),
        text("location", "Lieu de prise de vue"),
        text("url", "Lien de l’album / du support", { type: "url", max: 2000 }),
        area("shot_list", "Personnes, plans et consignes"),
        date("due_on", "Livraison attendue"),
      ],
      summary: ["kind", "photographer", "starts_at"],
    },
    decoration: {
      title: "Décoration",
      icon: "flower",
      group: "logistics",
      singular: "un élément de décoration",
      intro:
        "Préparez la décoration par espace et suivez l’installation et le rangement.",
      label: "Élément / ensemble",
      status: states(
        ["planned", "À préparer"],
        ["ready", "Prêt"],
        ["installed", "Installé"],
        ["returned", "Rangé"],
      ),
      fields: [
        text("zone", "Espace / table"),
        num("quantity", "Quantité", 1, { required: true }),
        text("style", "Style / couleurs"),
        text("provider", "Fournisseur / propriétaire"),
        date("starts_at", "Installation", "datetime-local"),
        date("ends_at", "Démontage", "datetime-local"),
        area("instructions", "Mise en place et accessoires"),
      ],
      summary: ["zone", "quantity", "provider"],
    },
    access: {
      title: "Accueil et accès",
      icon: "people",
      group: "people",
      singular: "un accès ou un groupe",
      intro:
        "Organisez les points d’accueil, les badges, les arrivées et les besoins d’accessibilité.",
      label: "Point d’accueil / groupe",
      status: planned,
      fields: [
        text("location", "Entrée / point d’accueil"),
        text("badge", "Badge / accréditation / consigne"),
        num("expected", "Personnes attendues", 0, { required: true }),
        num("arrived", "Personnes arrivées", 0, { required: true }),
        date("starts_at", "Ouverture", "datetime-local"),
        date("ends_at", "Fermeture", "datetime-local"),
        area("accessibility", "Accessibilité et accompagnement"),
        area("parking", "Stationnement / accès véhicules"),
      ],
      summary: ["location", "expected", "arrived"],
    },
    safety: {
      title: "Sécurité",
      icon: "handshake",
      group: "tracking",
      singular: "une consigne ou un incident",
      intro:
        "Centralisez les consignes, contacts d’urgence, vérifications et incidents.",
      label: "Consigne / contact / incident",
      status: states(
        ["pending", "À vérifier"],
        ["checked", "Vérifié"],
        ["issue", "À traiter"],
        ["done", "Résolu"],
      ),
      fields: [
        select("kind", "Type", {
          instruction: "Consigne",
          contact: "Contact d’urgence",
          check: "Vérification",
          incident: "Incident",
        }),
        select("priority", "Priorité", {
          normal: "Normale",
          high: "Haute",
          critical: "Critique",
        }),
        text("location", "Zone / point de rassemblement"),
        text("phone", "Téléphone utile", { type: "tel", max: 50 }),
        date("due_on", "Échéance de vérification"),
        area("procedure", "Procédure / faits et actions"),
      ],
      summary: ["kind", "priority", "location"],
    },
    permits: {
      title: "Autorisations et assurances",
      icon: "presentation",
      group: "tracking",
      singular: "une autorisation ou assurance",
      intro: "Suivez les démarches, justificatifs et dates de validité.",
      label: "Document / démarche",
      status: states(
        ["pending", "À demander"],
        ["requested", "Demandé"],
        ["approved", "Validé"],
        ["expired", "Expiré / refusé"],
      ),
      fields: [
        select("kind", "Type", {
          permission: "Autorisation",
          insurance: "Assurance",
          agreement: "Accord du lieu",
          license: "Licence / déclaration",
          other: "Autre",
        }),
        text("issuer", "Organisme / interlocuteur"),
        text("reference", "Référence"),
        date("due_on", "Date limite de demande"),
        date("valid_until", "Valable jusqu’au"),
        text("url", "Lien du justificatif", { type: "url", max: 2000 }),
        area("requirements", "Pièces à fournir / conditions"),
      ],
      summary: ["kind", "due_on", "valid_until"],
    },
    lost_found: {
      title: "Objets perdus",
      icon: "gift",
      group: "tracking",
      singular: "un objet retrouvé",
      intro: "Répertoriez les objets retrouvés et suivez leur restitution.",
      label: "Objet retrouvé",
      status: states(
        ["stored", "Conservé"],
        ["claimed", "Réclamé"],
        ["returned", "Restitué"],
      ),
      fields: [
        date("found_at", "Trouvé le", "datetime-local"),
        text("location", "Lieu de découverte"),
        text("storage", "Lieu de conservation"),
        text("claimant", "Personne qui le réclame"),
        text("phone", "Téléphone", { type: "tel", max: 50 }),
        date("returned_at", "Restitué le", "datetime-local"),
        area("description", "Description / éléments de vérification"),
      ],
      summary: ["found_at", "storage", "claimant"],
    },
    supplies: {
      title: "Consommables",
      icon: "coffee",
      group: "logistics",
      singular: "un consommable",
      intro:
        "Préparez les quantités, suivez la consommation et repérez ce qui manque.",
      label: "Consommable",
      status: planned,
      fields: [
        text("unit", "Unité (pièces, litres, paquets…)", { required: true }),
        num("required", "Quantité nécessaire", 1, {
          required: true,
          step: 0.01,
        }),
        num("available", "Stock disponible au départ", 0, {
          required: true,
          step: 0.01,
        }),
        num("consumed", "Quantité consommée", 0, {
          required: true,
          step: 0.01,
        }),
        text("location", "Stockage"),
        text("provider", "Fournisseur"),
      ],
      summary: ["required", "available", "consumed"],
    },
  };
  const sharedFields = [
    text("responsible", "Responsable"),
    area("notes", "Notes complémentaires"),
  ];
  const fieldsFor = (key) => [...tools[key].fields, ...sharedFields];
  const sections = () =>
    Object.fromEntries(Object.entries(tools).map(([key, t]) => [key, t.title]));
  async function list(table, filters, order = "created_at") {
    const all = [];
    for (let offset = 0; ; offset += 500) {
      let query = sb.from(table).select("*");
      for (const [key, value] of Object.entries(filters))
        query = query.eq(key, value);
      const { data, error } = await query
        .order(order)
        .order("id")
        .range(offset, offset + 499);
      if (error) throw error;
      all.push(...(data || []));
      if ((data || []).length < 500) return all;
    }
  }
  const n = (value) => Number(value) || 0;
  const total = (items, key) =>
    items.reduce((sum, x) => sum + n(x.details[key]), 0);
  const metric = (label, value) =>
    `<div class="tool-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  const formatNumber = (value) =>
    new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
  const link = (p, section, label) =>
    `<a class="btn small" href="#/outils/${encodeURIComponent(p.id)}?section=${section}">${esc(label)}</a>`;
  function display(f, value) {
    if (value == null || value === "") return "—";
    if (f.type === "select") return f.options[value] || value;
    if (f.type === "number") return formatNumber(value);
    if (f.type === "date") return fmtDate(value);
    if (f.type === "datetime-local")
      return fmtDate(value.slice(0, 10)) + " · " + value.slice(11, 16);
    return value;
  }
  function input(f, value) {
    const attrs = `name="${f.key}" ${f.required ? "required" : ""}`;
    let control;
    if (f.type === "textarea")
      control = `<textarea ${attrs} maxlength="${f.max}" rows="3">${esc(value ?? "")}</textarea>`;
    else if (f.type === "select")
      control = `<select ${attrs}>${Object.entries(f.options)
        .map(
          ([v, label]) =>
            `<option value="${v}" ${value === v ? "selected" : ""}>${esc(label)}</option>`,
        )
        .join("")}</select>`;
    else
      control = `<input ${attrs} type="${f.type}" value="${esc(value ?? f.value ?? "")}" ${f.max != null ? (f.type === "number" ? `min="${f.min}" max="${f.max}" step="${f.step}"` : `maxlength="${f.max}"`) : ""} ${f.type === "url" ? 'placeholder="https://…"' : ""}>`;
    return `<label class="${f.type === "textarea" ? "span-2" : ""}">${esc(f.label)}${control}</label>`;
  }
  function stats(key, items, guests) {
    const active = items.filter((x) => x.status !== "cancelled");
    const base = metric("Fiches", items.length);
    if (key === "meals")
      return (
        base +
        metric(
          "Invités confirmés",
          guests
            .filter((g) => g.response === "confirmed")
            .reduce((s, g) => s + 1 + n(g.companions), 0),
        ) +
        metric("Repas prévus", total(active, "quantity"))
      );
    if (key === "lodging")
      return (
        base +
        metric("Couchages", total(active, "capacity")) +
        metric("Personnes prévues", total(active, "occupants"))
      );
    if (key === "transport")
      return (
        base +
        metric("Places passagers", total(active, "capacity")) +
        metric("Passagers prévus", total(active, "passengers"))
      );
    if (key === "loading")
      return (
        base +
        metric(
          "À charger",
          items.filter((x) => x.status === "pending").length,
        ) +
        metric(
          "Chargés / de retour",
          items.filter((x) => ["loaded", "returned"].includes(x.status)).length,
        )
      );
    if (key === "access")
      return (
        base +
        metric("Attendus", total(active, "expected")) +
        metric("Arrivés", total(active, "arrived"))
      );
    if (key === "lost_found")
      return (
        base +
        metric(
          "À restituer",
          items.filter((x) => x.status !== "returned").length,
        ) +
        metric("Restitués", items.filter((x) => x.status === "returned").length)
      );
    if (key === "supplies")
      return (
        base +
        metric(
          "Références à compléter",
          active.filter(
            (x) =>
              n(x.details.available) - n(x.details.consumed) <
              n(x.details.required),
          ).length,
        )
      );
    if (key === "power")
      return (
        base +
        metric(
          "Puissance renseignée",
          formatNumber(
            active.reduce(
              (s, x) => s + n(x.details.watts) * n(x.details.quantity),
              0,
            ),
          ) + " W",
        ) +
        metric(
          "Puissances inconnues",
          active.filter((x) => x.details.watts == null).length,
        )
      );
    if (key === "permits")
      return (
        base +
        metric(
          "À obtenir",
          items.filter((x) => ["pending", "requested"].includes(x.status))
            .length,
        ) +
        metric("Validés", items.filter((x) => x.status === "approved").length)
      );
    return (
      base +
      metric(
        "En préparation",
        items.filter((x) =>
          Object.keys(tools[key].status).slice(0, 2).includes(x.status),
        ).length,
      )
    );
  }
  function warnings(key, item) {
    const d = item.details;
    if (item.status === "cancelled") return "";
    const messages = [];
    if (key === "lodging" && n(d.occupants) > n(d.capacity))
      messages.push("Couchages insuffisants");
    if (key === "transport" && n(d.passengers) > n(d.capacity))
      messages.push("Places passagers insuffisantes");
    if (key === "supplies") {
      const remaining = n(d.available) - n(d.consumed),
        missing = Math.max(0, n(d.required) - remaining);
      if (missing)
        messages.push(`${formatNumber(missing)} ${d.unit || ""} à compléter`);
    }
    if (key === "power" && d.watts == null)
      messages.push("Puissance à renseigner");
    const today = new Date().toLocaleDateString("en-CA");
    if (key === "permits" && d.valid_until && d.valid_until < today)
      messages.push("Validité dépassée");
    if (
      key === "permits" &&
      d.due_on &&
      d.due_on < today &&
      ["pending", "requested"].includes(item.status)
    )
      messages.push("Échéance dépassée");
    return messages
      .map((t) => `<span class="ops-alert">${esc(t)}</span>`)
      .join("");
  }
  function circuits(items) {
    const groups = new Map();
    for (const item of items.filter((x) => x.status !== "cancelled")) {
      const d = item.details,
        key = (d.circuit || "Sans circuit").trim().toLocaleLowerCase("fr");
      const group = groups.get(key) || {
        name: d.circuit || "Sans circuit",
        watts: 0,
        capacity: Infinity,
        unknown: 0,
        ratings: new Set(),
      };
      group.watts += n(d.watts) * n(d.quantity);
      group.capacity = Math.min(group.capacity, n(d.voltage) * n(d.amps));
      group.unknown += d.watts == null ? 1 : 0;
      group.ratings.add(`${d.voltage} V / ${d.amps} A`);
      groups.set(key, group);
    }
    return `<section class="card ops-circuits"><h3>Charge par circuit</h3><p class="tool-note">Estimation en monophasé : W = V × A. Utilisez la puissance absorbée maximale indiquée sur chaque appareil. Ce calcul ne vérifie ni les protections, ni les sections de câbles, ni les pointes de courant.</p>${[...groups.values()].map((g) => `<div class="ops-circuit"><strong>${esc(g.name)}</strong><span>${formatNumber(g.watts)} W / ${formatNumber(g.capacity)} W${g.capacity ? " · " + formatNumber((100 * g.watts) / g.capacity) + " %" : ""}</span>${g.watts > g.capacity ? '<span class="ops-alert">Capacité dépassée</span>' : ""}${g.unknown ? `<span class="ops-alert">${g.unknown} puissance(s) inconnue(s)</span>` : ""}${g.ratings.size > 1 ? '<span class="ops-alert">Calibres différents saisis : capacité minimale retenue</span>' : ""}</div>`).join("") || '<p class="empty">Ajoutez un appareil pour calculer la charge de son circuit.</p>'}</section>`;
  }
  function dietary(guests) {
    const relevant = guests.filter(
      (g) => g.response !== "declined" && g.dietary,
    );
    return `<details class="card ops-dietary"><summary>Besoins alimentaires des invités · ${relevant.length}</summary><p class="tool-note">Données de la liste d’invités, mises à jour à chaque ouverture. Les besoins des accompagnants restent à confirmer avec chaque foyer.</p>${relevant.map((g) => `<p><strong>${esc(g.full_name)}</strong> <span class="muted">${g.response === "confirmed" ? "Confirmé" : "En attente"}${g.table_name ? " · " + esc(g.table_name) : ""}</span><br>${esc(g.dietary)}</p>`).join("") || '<p class="empty">Aucun besoin alimentaire renseigné.</p>'}</details>`;
  }
  function validate(key, details) {
    const d = details;
    for (const [a, b] of [
      ["starts_at", "ends_at"],
      ["starts_on", "ends_on"],
    ])
      if (d[a] && d[b] && d[b] < d[a])
        throw Error("La fin doit être postérieure au début.");
    if (key === "supplies" && n(d.consumed) > n(d.available))
      throw Error("La consommation ne peut pas dépasser le stock disponible.");
    for (const f of fieldsFor(key))
      if (f.type === "url" && d[f.key]) {
        const url = new URL(d[f.key]);
        if (!["http:", "https:"].includes(url.protocol))
          throw Error("Utilisez un lien http ou https.");
      }
  }
  async function open(key, p, reload) {
    const t = tools[key],
      table = t.storage || "project_operation_items",
      fields = fieldsFor(key),
      editable = !!p._canEdit;
    const [items, guests] = await Promise.all([
      list(table, { project_id: p.id, tool: key }),
      key === "meals"
        ? list("project_guests", { project_id: p.id }, "full_name")
        : Promise.resolve([]),
    ]);
    if (key === "loading")
      items.sort(
        (a, b) =>
          n(a.details.load_order) - n(b.details.load_order) ||
          a.label.localeCompare(b.label, "fr"),
      );
    const chronology = [
      "activities",
      "transport",
      "media",
      "lighting",
      "decoration",
    ].includes(key)
      ? "starts_at"
      : key === "lodging"
        ? "starts_on"
        : key === "permits"
          ? "due_on"
          : key === "lost_found"
            ? "found_at"
            : null;
    if (chronology)
      items.sort((a, b) =>
        (a.details[chronology] || "9999").localeCompare(
          b.details[chronology] || "9999",
        ),
      );
    const root = $("#tool-content");
    root.classList.add("ops-workspace");
    root.innerHTML = `<div class="tool-toolbar"><div><h2>${esc(t.title)}</h2><p class="tool-note">${esc(t.intro)}</p></div><div class="actions"><button class="btn small" id="ops-print">Imprimer</button>${key === "loading" && editable && (me.role === "admin" || me.role === "dj") ? '<button class="btn small" id="ops-import-gear">Reprendre le matériel du projet</button>' : ""}</div></div><div class="tool-metrics">${stats(key, items, guests)}</div>${key === "meals" ? dietary(guests) : ""}${key === "power" ? circuits(items) : ""}${key === "permits" ? `<p>${link(p, "documents", "Ouvrir les documents du projet")}</p>` : ""}${editable ? `<details class="card tool-editor" id="ops-editor"><summary>Ajouter ${esc(t.singular)}</summary><form id="ops-form" class="stack"><input name="record_id" type="hidden"><input name="record_revision" type="hidden"><div class="row-2"><label>${esc(t.label)}<input name="label" maxlength="200" required></label>${input(select("status", "État", t.status), Object.keys(t.status)[0])}${fields.map((f) => input(f)).join("")}</div><div class="actions"><button class="btn primary">Enregistrer</button><button class="btn" type="button" id="ops-reset">Nouveau / annuler la modification</button></div></form></details>` : '<p class="tool-note">Consultation seule sur ce projet.</p>'}<div class="ops-filters no-print"><label>Rechercher<input type="search" id="ops-search" placeholder="Nom, responsable, notes…"></label><label>État<select id="ops-filter"><option value="">Tous les états</option>${Object.entries(
      t.status,
    )
      .map(([v, label]) => `<option value="${v}">${esc(label)}</option>`)
      .join(
        "",
      )}</select></label><span id="ops-result-count" class="muted" role="status"></span></div><div id="ops-list" class="tool-list"></div>`;
    const renderList = () => {
      const query = $("#ops-search").value.trim().toLocaleLowerCase("fr"),
        filter = $("#ops-filter").value;
      const shown = items.filter(
        (x) =>
          (!filter || x.status === filter) &&
          (!query ||
            [x.label, ...Object.values(x.details)]
              .join(" ")
              .toLocaleLowerCase("fr")
              .includes(query)),
      );
      $("#ops-result-count").textContent = `${shown.length} / ${items.length}`;
      $("#ops-list").innerHTML =
        shown
          .map(
            (x) =>
              `<article class="card ops-item" data-ops-item="${esc(x.id)}"><div class="ops-item-heading"><div><h3>${esc(x.label)}</h3><p class="muted">${t.summary
                .filter((k) => x.details[k] != null && x.details[k] !== "")
                .map((k) => {
                  const f = fields.find((f) => f.key === k);
                  return esc(f.label) + " : " + esc(display(f, x.details[k]));
                })
                .join(
                  " · ",
                )}</p></div><span class="ops-state">${esc(t.status[x.status])}</span></div><div class="ops-alerts">${warnings(key, x)}</div><details class="ops-item-details"><summary>Détails</summary><dl class="ops-details">${fields
                .filter(
                  (f) => x.details[f.key] != null && x.details[f.key] !== "",
                )
                .map(
                  (f) =>
                    `<div><dt>${esc(f.label)}</dt><dd>${f.type === "url" ? `<a target="_blank" rel="noopener noreferrer" href="${esc(x.details[f.key])}">Ouvrir le lien ↗</a>` : esc(display(f, x.details[f.key]))}</dd></div>`,
                )
                .join(
                  "",
                )}</dl></details>${editable ? `<div class="tool-row-actions no-print"><button class="btn small" data-ops-edit="${esc(x.id)}">Modifier</button>${key === "loading" && x.status !== "cancelled" ? `<button class="btn small" data-ops-next="${esc(x.id)}" ${x.status === "returned" ? "disabled" : ""}>${x.status === "pending" ? "Marquer chargé" : x.status === "loaded" ? "Marquer de retour" : "De retour"}</button>` : ""}<button class="btn small" data-ops-delete="${esc(x.id)}">Supprimer</button></div>` : ""}</article>`,
          )
          .join("") ||
        '<p class="empty">Aucun élément. Ajoutez une première fiche ou modifiez vos filtres.</p>';
      root
        .querySelectorAll("[data-ops-edit]")
        .forEach(
          (b) =>
            (b.onclick = () =>
              edit(items.find((x) => x.id === b.dataset.opsEdit))),
        );
      root.querySelectorAll("[data-ops-delete]").forEach(
        (b) =>
          (b.onclick = () =>
            act(b, async () => {
              if (!confirm("Supprimer cette fiche ?")) return;
              const x = items.find((x) => x.id === b.dataset.opsDelete);
              await save(
                sb
                  .from(table)
                  .delete()
                  .eq("id", x.id)
                  .eq("project_id", p.id)
                  .eq("tool", key)
                  .eq("revision", x.revision)
                  .select("id")
                  .single(),
              );
              await reload();
            })),
      );
      root.querySelectorAll("[data-ops-next]").forEach(
        (b) =>
          (b.onclick = () =>
            act(b, async () => {
              const x = items.find((x) => x.id === b.dataset.opsNext);
              await save(
                sb
                  .from(table)
                  .update({
                    status: x.status === "pending" ? "loaded" : "returned",
                    revision: x.revision + 1,
                  })
                  .eq("id", x.id)
                  .eq("project_id", p.id)
                  .eq("tool", key)
                  .eq("revision", x.revision)
                  .select("id")
                  .single(),
              );
              await reload();
            })),
      );
      root.companionRefresh?.();
    };
    const form = $("#ops-form");
    function edit(x) {
      const draft =
        form.elements.record_id.value ||
        Array.from(form.elements).some(
          (e) =>
            e.name &&
            !["record_id", "record_revision"].includes(e.name) &&
            (e.tagName === "SELECT"
              ? e.selectedIndex !== 0
              : e.value !== e.defaultValue),
        );
      if (draft && !confirm("Remplacer la saisie en cours par cette fiche ?"))
        return;
      Drafts.clear(form);
      form.reset();
      form.elements.record_id.value = x.id;
      form.elements.record_revision.value = x.revision;
      form.elements.label.value = x.label;
      form.elements.status.value = x.status;
      for (const f of fields)
        form.elements[f.key].value = x.details[f.key] ?? "";
      $("#ops-editor").open = true;
      form.dispatchEvent(new Event("change", { bubbles: true }));
      $("#ops-editor").scrollIntoView({ block: "start", behavior: "smooth" });
      form.elements.label.focus({ preventScroll: true });
    }
    renderList();
    $("#ops-search").oninput = renderList;
    $("#ops-filter").onchange = renderList;
    $("#ops-print").onclick = () =>
      Enhancements.printList(
        p,
        t.title,
        [t.label, "État", "Informations"],
        items.map((x) => [
          x.label,
          t.status[x.status],
          fields
            .filter((f) => x.details[f.key] != null && x.details[f.key] !== "")
            .map((f) => f.label + " : " + display(f, x.details[f.key]))
            .join("\n"),
        ]),
      );
    if (form) {
      Drafts.restore(form);
      $("#ops-reset").onclick = () => {
        Drafts.clear(form);
        form.reset();
        form.elements.record_id.value = "";
        form.elements.record_revision.value = "";
      };
      form.onsubmit = (event) => {
        event.preventDefault();
        act(form.querySelector("button"), async () => {
          const draft = Drafts.begin(form);
          try {
            const fd = new FormData(form),
              details = {};
            for (const f of fields) {
              const value = String(fd.get(f.key) || "").trim();
              details[f.key] =
                f.type === "number"
                  ? value === ""
                    ? null
                    : Number(value)
                  : value;
            }
            validate(key, details);
            const id = fd.get("record_id"),
              revision = n(fd.get("record_revision"));
            const payload = {
              label: String(fd.get("label")).trim(),
              status: fd.get("status"),
              details,
            };
            const query = id
              ? sb
                  .from(table)
                  .update({ ...payload, revision: revision + 1 })
                  .eq("id", id)
                  .eq("project_id", p.id)
                  .eq("tool", key)
                  .eq("revision", revision)
              : sb
                  .from(table)
                  .insert({ ...payload, project_id: p.id, tool: key });
            await save(query.select("id").single());
            Drafts.finish(draft, true);
            toast("Fiche enregistrée");
            await reload();
          } catch (error) {
            Drafts.finish(draft, false);
            throw error;
          }
        });
      };
    }
    if ($("#ops-import-gear"))
      $("#ops-import-gear").onclick = () =>
        act($("#ops-import-gear"), async () => {
          const { data, error } = await sb.rpc("import_project_loading", {
            pid: p.id,
          });
          if (error) throw error;
          toast(
            `${data} élément(s) ajouté(s). Les fiches déjà importées sont conservées.`,
          );
          await reload();
        });
    return { items, root, form };
  }
  async function save(query) {
    const { data, error } = await query;
    if (error)
      throw Error(
        error.code === "PGRST116"
          ? "Cette fiche a changé ailleurs. Rechargez la page avant de réessayer."
          : error.message,
      );
    return data;
  }
  async function act(button, fn) {
    button.disabled = true;
    try {
      await fn();
    } catch (error) {
      ERR(error);
    } finally {
      button.disabled = false;
    }
  }
  return { tools, fieldsFor, sections, open };
})();
