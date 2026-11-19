/* Event workspaces: structured records plus connected operational views. */
const EventCompanion = (() => {
  const text = (key, label, extra = {}) => ({
      key,
      label,
      type: "text",
      max: 300,
      ...extra,
    }),
    area = (key, label) => text(key, label, { type: "textarea", max: 2000 }),
    num = (key, label, value = 0, extra = {}) => ({
      key,
      label,
      type: "number",
      min: 0,
      max: 1000000,
      step: 1,
      value,
      ...extra,
    }),
    date = (key, label, type = "datetime-local") => ({ key, label, type }),
    choice = (key, label, options) => ({ key, label, type: "select", options });
  const pending = {
      pending: "À préparer",
      ready: "Prêt",
      doing: "En cours",
      done: "Terminé",
      cancelled: "Annulé",
    },
    priority = () =>
      choice("priority", "Priorité", {
        normal: "Normale",
        high: "Haute",
        critical: "Critique",
      }),
    phone = () => text("phone", "Téléphone", { type: "tel", max: 50 }),
    doc = () => text("document_id", "Document du projet", { max: 36 }),
    url = () => text("url", "Lien du support", { type: "url", max: 2000 });
  const record = (
    title,
    group,
    singular,
    fields,
    summary,
    status = pending,
    intro = "",
  ) => ({
    storage: "project_companion_items",
    title,
    group,
    singular,
    label: "Intitulé",
    icon: "grid",
    status,
    fields,
    summary,
    intro:
      intro ||
      "Préparez les informations, attribuez un responsable et suivez les suites à donner.",
  });
  const recordTools = {
    issues: record(
      "Imprévus",
      "planning",
      "un imprévu",
      [
        priority(),
        text("location", "Zone / matériel concerné"),
        date("reported_at", "Signalé le"),
        date("due_at", "À résoudre avant"),
        area("problem", "Problème"),
        area("resolution", "Actions et résolution"),
      ],
      ["priority", "location", "due_at"],
      {
        new: "À traiter",
        doing: "Pris en charge",
        resolved: "Résolu",
        closed: "Clôturé",
      },
    ),
    fallbacks: record(
      "Plans de remplacement",
      "planning",
      "une solution de remplacement",
      [
        text("element", "Élément indispensable"),
        text("trigger", "Quand déclencher ce plan"),
        text("replacement", "Remplaçant / matériel / espace"),
        phone(),
        area("procedure", "Étapes de mise en œuvre"),
        date("checked_at", "Solution vérifiée le"),
      ],
      ["element", "replacement"],
      {
        draft: "À définir",
        ready: "Vérifié",
        activated: "Activé",
        done: "Terminé",
      },
    ),
    decisions: record(
      "Décisions à prendre",
      "planning",
      "une décision",
      [
        text("decision_maker", "Personne qui doit décider"),
        date("due_at", "Réponse attendue avant"),
        area("question", "Question et possibilités"),
        area("decision", "Décision retenue"),
      ],
      ["decision_maker", "due_at"],
      { pending: "En attente", decided: "Décidé", cancelled: "Sans suite" },
    ),
    changes: record(
      "Changements et consignes",
      "planning",
      "un changement",
      [
        date("effective_at", "Prend effet le"),
        text("recipients", "Personnes / équipes concernées"),
        area("before", "Ancienne information"),
        area("after", "Nouvelle information"),
        area("instructions", "Actions attendues"),
      ],
      ["effective_at", "recipients"],
      {
        draft: "Brouillon",
        published: "À prendre en compte",
        closed: "Clôturé",
      },
      "Publiez une consigne et consultez les confirmations de lecture des comptes connectés. Toute modification rend les confirmations précédentes obsolètes.",
    ),
    handovers: record(
      "Passages de relais",
      "planning",
      "une transmission",
      [
        text("from_person", "Transmis par"),
        text("to_person", "Transmis à"),
        date("starts_at", "Prise de relais"),
        area("remaining", "Missions restantes"),
        area("equipment", "Matériel / clés confiés"),
        area("instructions", "Informations importantes"),
      ],
      ["from_person", "to_person", "starts_at"],
      {
        pending: "À transmettre",
        published: "Transmis",
        done: "Relais terminé",
      },
    ),
    rollcall: record(
      "Appel et disponibilités",
      "planning",
      "une personne",
      [
        text("role", "Mission / fonction"),
        phone(),
        date("expected_at", "Arrivée attendue"),
        date("arrived_at", "Arrivée réelle"),
        text("replacement", "Remplaçant possible"),
        area("availability", "Disponibilités et missions supplémentaires"),
      ],
      ["role", "expected_at"],
      {
        expected: "Attendu",
        present: "Présent",
        available: "Disponible",
        absent: "Absent",
        left: "Parti",
      },
    ),
    logbook: record(
      "Main courante",
      "tracking",
      "une entrée au journal",
      [
        date("occurred_at", "Date et heure des faits"),
        choice("kind", "Type", {
          fact: "Fait",
          decision: "Décision",
          intervention: "Intervention",
          incident: "Incident",
        }),
        text("location", "Lieu"),
        area("facts", "Faits et décisions"),
        area("followup", "Suites à donner"),
      ],
      ["occurred_at", "kind"],
      { recorded: "Consigné", followup: "Suivi nécessaire", closed: "Clôturé" },
    ),
    interventions: record(
      "Fiches d’intervention",
      "program",
      "une intervention",
      [
        date("starts_at", "Début"),
        date("ends_at", "Fin"),
        text("participants", "Participants / intervenants"),
        text("host", "Présentateur / référent"),
        text("music", "Musique / jingle"),
        text("equipment", "Micros et matériel"),
        text("cue", "Signal de départ"),
        area("instructions", "Déroulement et consignes"),
      ],
      ["starts_at", "participants", "cue"],
    ),
    media_queue: record(
      "Médias à diffuser",
      "program",
      "un support",
      [
        choice("kind", "Type", {
          video: "Vidéo",
          slides: "Diaporama",
          audio: "Audio / jingle",
          image: "Image",
          other: "Autre",
        }),
        num("order", "Ordre de passage"),
        doc(),
        url(),
        num("duration_seconds", "Durée prévue (secondes)", null),
        text("cue", "Moment / signal de lancement"),
        area("instructions", "Consignes de diffusion"),
      ],
      ["order", "kind", "cue"],
    ),
    media_checks: record(
      "Vérification des supports",
      "technical",
      "une vérification",
      [
        doc(),
        date("checked_at", "Vérifié le"),
        choice("listening", "Écoute / visionnage", {
          pending: "À vérifier humainement",
          ok: "Validé par écoute / visionnage",
          failed: "Anomalie constatée",
        }),
        area("result", "Résultat du contrôle"),
        text("device", "Navigateur / appareil de test"),
      ],
      ["checked_at", "listening"],
      { pending: "À tester", checked: "Contrôlé", failed: "À corriger" },
    ),
    diagnostics: record(
      "Diagnostic technique",
      "technical",
      "un diagnostic",
      [
        choice("symptom", "Symptôme", {
          no_sound: "Aucun son",
          one_side: "Un seul côté",
          noise: "Bruit / grésillement",
          feedback: "Larsen",
          distortion: "Distorsion",
          light: "Éclairage sans réponse",
        }),
        text("device", "Appareil / chaîne concernée"),
        area("checks", "Vérifications réalisées"),
        area("result", "Résultat et prochaine action"),
      ],
      ["symptom", "device"],
      {
        pending: "En cours",
        resolved: "Résolu",
        blocked: "Intervention nécessaire",
      },
    ),
    opening_checks: record(
      "Contrôle avant ouverture",
      "planning",
      "un contrôle",
      [
        choice("category", "Zone", {
          technical: "Technique",
          welcome: "Accueil",
          catering: "Restauration",
          venue: "Lieu",
          team: "Équipe",
        }),
        text("location", "Emplacement"),
        date("due_at", "À contrôler avant"),
        area("instructions", "Points à vérifier"),
      ],
      ["category", "location"],
      { pending: "À vérifier", checked: "Vérifié", issue: "Anomalie" },
    ),
    onsite_requests: record(
      "Interventions sur place",
      "planning",
      "une demande",
      [
        priority(),
        text("location", "Zone"),
        date("due_at", "À faire avant"),
        area("request", "Intervention demandée"),
        area("result", "Intervention réalisée"),
      ],
      ["priority", "location", "due_at"],
      {
        new: "Nouvelle",
        assigned: "Attribuée",
        doing: "En cours",
        done: "Réalisée",
        cancelled: "Annulée",
      },
    ),
    cloakroom: record(
      "Vestiaire et objets confiés",
      "people",
      "un dépôt",
      [
        text("ticket", "Numéro de ticket", { required: true, max: 100 }),
        text("owner", "Nom / repère du déposant"),
        num("quantity", "Nombre d’objets", 1, { required: true, min: 1 }),
        text("storage", "Emplacement"),
        date("deposited_at", "Déposé le"),
        date("returned_at", "Restitué le"),
        area("description", "Description et repères"),
      ],
      ["ticket", "storage", "quantity"],
      { stored: "Conservé", claimed: "Réclamé", returned: "Restitué" },
    ),
    special_needs: record(
      "Besoins particuliers",
      "people",
      "un aménagement",
      [
        text("guest", "Personne / groupe concerné"),
        choice("kind", "Besoin", {
          mobility: "Mobilité",
          hearing: "Audition",
          accompaniment: "Accompagnement",
          quiet: "Espace calme",
          placement: "Placement",
          other: "Autre",
        }),
        text("location", "Lieu / équipement prévu"),
        area("need", "Aménagement demandé"),
        area("response", "Réponse et accompagnement prévus"),
      ],
      ["guest", "kind", "location"],
    ),
    practical_info: record(
      "Informations pratiques",
      "people",
      "une information",
      [
        choice("category", "Rubrique", {
          directions: "Itinéraire",
          parking: "Stationnement",
          access: "Accès",
          hours: "Horaires",
          instructions: "Consignes",
          contact: "Contact utile",
        }),
        choice("audience", "Diffusion", {
          private: "Interne uniquement",
          public: "Inclure dans le lien public",
        }),
        area("body", "Information à communiquer"),
        url(),
      ],
      ["category", "audience"],
      { draft: "Brouillon", published: "Publié", closed: "Retiré" },
      "Seules les fiches publiées et explicitement marquées pour le lien public sont visibles sans connexion. Le lien peut être fermé à tout moment.",
    ),
    signage: record(
      "Signalétique",
      "people",
      "un panneau",
      [
        choice("kind", "Pictogramme", {
          pin: "Direction",
          people: "Accueil",
          home: "Salle",
          utensils: "Repas",
          coffee: "Boissons",
          grid: "Sans pictogramme",
        }),
        choice("arrow", "Flèche", {
          none: "Aucune",
          left: "Gauche",
          right: "Droite",
          up: "Tout droit",
          down: "En bas",
        }),
        area("body", "Texte complémentaire"),
        choice("orientation", "Format", {
          portrait: "Portrait",
          landscape: "Paysage",
        }),
      ],
      ["arrow", "orientation"],
    ),
    queues: record(
      "Files et affluence",
      "people",
      "un point de suivi",
      [
        text("location", "Point d’accueil / service"),
        num("waiting", "Personnes en attente", 0, { required: true }),
        num("threshold", "Seuil de renfort", 20, { required: true, min: 1 }),
        num("staff", "Personnes affectées", 1),
        num("wait_minutes", "Attente estimée (minutes)"),
        date("checked_at", "Relevé le"),
        area("action", "Réponse envisagée"),
      ],
      ["waiting", "wait_minutes", "staff"],
      {
        normal: "Fluide",
        busy: "Chargé",
        reinforce: "Renfort nécessaire",
        closed: "Fermé",
      },
    ),
    meal_service: record(
      "Service des repas",
      "people",
      "une table ou un groupe",
      [
        text("table_name", "Table / groupe"),
        text("menu", "Menu / service"),
        num("expected", "Repas attendus", 0, { required: true }),
        num("prepared", "Repas prêts", 0, { required: true }),
        num("served", "Repas servis", 0, { required: true }),
        area("dietary", "Adaptations alimentaires à respecter"),
        text("service_team", "Équipe de service"),
      ],
      ["table_name", "expected", "served"],
      {
        pending: "À préparer",
        preparing: "En préparation",
        ready: "Prêt à envoyer",
        served: "Servi",
      },
    ),
    replenishment: record(
      "Réapprovisionnement",
      "logistics",
      "une demande de réapprovisionnement",
      [
        text("supply_id", "Consommable concerné", { max: 36 }),
        num("quantity", "Quantité à apporter", 1, {
          required: true,
          min: 0.01,
          step: 0.01,
        }),
        text("unit", "Unité"),
        text("source", "Lieu d’achat / stock de départ"),
        text("destination", "À livrer à"),
        date("due_at", "Nécessaire avant"),
      ],
      ["quantity", "unit", "destination"],
      {
        needed: "À fournir",
        assigned: "Attribué",
        ordered: "En cours",
        received: "Reçu",
        cancelled: "Annulé",
      },
    ),
    orders: record(
      "Commandes et livraisons",
      "logistics",
      "une commande",
      [
        text("supplier", "Fournisseur"),
        phone(),
        text("reference", "Référence"),
        date("expected_at", "Livraison attendue"),
        text("destination", "Livrer à"),
        num("ordered", "Quantité commandée", 1, {
          required: true,
          min: 0.01,
          step: 0.01,
        }),
        num("received", "Quantité reçue", 0, { required: true, step: 0.01 }),
        text("unit", "Unité"),
        area("contents", "Contenu et éléments manquants"),
        doc(),
      ],
      ["supplier", "expected_at", "received"],
      {
        pending: "À commander",
        ordered: "Commandé",
        partial: "Reçu partiellement",
        received: "Reçu",
        cancelled: "Annulé",
      },
    ),
    borrowed: record(
      "Matériel prêté ou emprunté",
      "logistics",
      "un prêt",
      [
        text("owner", "Propriétaire"),
        phone(),
        num("quantity", "Quantité confiée", 1, { required: true, min: 1 }),
        num("returned", "Quantité rendue", 0, { required: true }),
        date("starts_at", "Remise"),
        date("due_at", "Retour prévu"),
        text("storage", "Emplacement actuel"),
        area("condition", "État et accessoires"),
        doc(),
      ],
      ["owner", "quantity", "returned"],
      {
        planned: "À récupérer",
        received: "Récupéré",
        partial: "Retour partiel",
        returned: "Rendu",
      },
    ),
    keys: record(
      "Clés et badges",
      "logistics",
      "une clé ou un badge",
      [
        text("reference", "Numéro / repère"),
        text("holder", "Personne qui le détient"),
        text("zone", "Portes / zones accessibles"),
        date("issued_at", "Remis le"),
        date("due_at", "Retour attendu"),
        date("returned_at", "Rendu le"),
      ],
      ["holder", "zone", "due_at"],
      {
        available: "Disponible",
        issued: "Confié",
        returned: "Rendu",
        lost: "À retrouver",
      },
    ),
    venue_checks: record(
      "État des lieux",
      "logistics",
      "un constat",
      [
        choice("phase", "Moment", {
          arrival: "À l’arrivée",
          departure: "Au départ",
        }),
        text("zone", "Pièce / zone"),
        choice("condition", "État", {
          ok: "Conforme",
          existing: "Défaut déjà présent",
          new: "Anomalie à traiter",
        }),
        area("description", "Constat"),
        doc(),
        text("validated_by", "Constat validé avec"),
        date("checked_at", "Constaté le"),
      ],
      ["phase", "zone", "condition"],
    ),
    cleaning: record(
      "Nettoyage et déchets",
      "logistics",
      "un passage",
      [
        text("zone", "Zone"),
        date("due_at", "Passage prévu"),
        text("supplies", "Produits et matériel"),
        text("waste", "Bacs / tri / évacuation"),
        area("instructions", "Consignes de remise en état"),
      ],
      ["zone", "due_at"],
    ),
    urgent_expenses: record(
      "Achats et remboursements",
      "tracking",
      "une dépense",
      [
        choice("category", "Catégorie", {
          travel: "Déplacement",
          staff: "Équipe",
          equipment: "Matériel",
          purchase: "Achats",
          other: "Autre",
        }),
        num("amount", "Montant (€)", 0, { required: true, step: 0.01 }),
        text("paid_by", "Avancé par"),
        text("reimburse_to", "À rembourser à"),
        date("purchased_at", "Achat réalisé le"),
        doc(),
        text("reference", "Référence du justificatif"),
      ],
      ["amount", "paid_by", "reimburse_to"],
      {
        pending: "À valider",
        approved: "Validé",
        reimbursed: "Remboursé",
        declined: "Refusé",
      },
      "Espace privé administrateur. Le transfert vers les frais de rentabilité est explicite et ne se fait qu’une fois.",
    ),
    extras: record(
      "Suppléments sur place",
      "tracking",
      "une prestation complémentaire",
      [
        num("quantity", "Quantité", 1, {
          required: true,
          min: 0.001,
          step: 0.001,
        }),
        num("unit_price", "Prix unitaire (€)", 0, {
          required: true,
          step: 0.01,
        }),
        choice("unit", "Unité", {
          forfait: "Forfait",
          heure: "Heure",
          unite: "Unité",
        }),
        area("scope", "Prestation convenue"),
        text("approved_by", "Accord donné par"),
        date("approved_at", "Accord recueilli le"),
        doc(),
      ],
      ["quantity", "unit_price", "approved_by"],
      {
        proposed: "À proposer",
        approved: "Accord recueilli",
        declined: "Refusé",
        invoiced: "Ajouté au devis",
      },
      "Privé administrateur. Notez l’accord du client et son justificatif avant le transfert explicite vers le devis.",
    ),
    claims: record(
      "Réclamations et engagements",
      "tracking",
      "une demande",
      [
        text("requester", "Demandeur"),
        phone(),
        priority(),
        area("request", "Demande / insatisfaction"),
        area("response", "Réponse apportée"),
        area("commitment", "Engagement pris"),
        date("due_at", "Suite attendue avant"),
      ],
      ["requester", "priority", "due_at"],
      {
        new: "À examiner",
        responded: "Répondu",
        followup: "Engagement à tenir",
        closed: "Clôturé",
      },
    ),
    closing_checks: record(
      "Clôture de l’événement",
      "tracking",
      "un point de clôture",
      [
        choice("category", "Rubrique", {
          people: "Personnes",
          equipment: "Matériel",
          venue: "Lieu",
          keys: "Clés et accès",
          paperwork: "Suivi",
        }),
        text("location", "Zone"),
        area("instructions", "Vérification à réaliser"),
        date("checked_at", "Vérifié le"),
      ],
      ["category", "location"],
      { pending: "À vérifier", checked: "Vérifié", issue: "Suite nécessaire" },
    ),
    lessons: record(
      "Retours réutilisables",
      "tracking",
      "une amélioration",
      [
        text("source", "Événement / problème d’origine"),
        area("problem", "Ce qui s’est passé"),
        area("improvement", "Amélioration retenue"),
        text("task_label", "Tâche à ajouter aux prochains projets"),
        choice("event_type", "Prestations concernées", {
          all: "Toutes",
          mariage: "Mariage",
          anniversaire: "Anniversaire",
          entreprise: "Entreprise",
          association: "Association",
          soiree_privee: "Soirée privée",
          autre: "Autre",
        }),
        priority(),
      ],
      ["source", "task_label"],
      {
        draft: "À analyser",
        ready: "Prêt à réutiliser",
        applied: "Mis en application",
      },
    ),
  };
  const views = {
    live: "Pilotage du jour J",
    briefs: "Briefs par personne",
    regie_clock: "Horloge de régie",
    schedule_shift: "Recalcul du programme",
    setup_check: "Vérification du setup",
    settings: "Fiches de réglages",
    tech_tools: "Boîte à outils technique",
    labels: "Étiquettes de repérage",
    project_search: "Recherche dans le projet",
  };
  const viewGroups = {
    live: "planning",
    briefs: "planning",
    regie_clock: "planning",
    schedule_shift: "planning",
    setup_check: "technical",
    settings: "technical",
    tech_tools: "technical",
    labels: "logistics",
    project_search: "planning",
  };
  const privateTools = ["urgent_expenses", "extras"];
  Object.assign(ProjectOperations.tools, recordTools);
  const sections = () =>
    Object.fromEntries(
      Object.entries({
        ...Object.fromEntries(
          Object.entries(recordTools).map(([k, v]) => [k, v.title]),
        ),
        ...views,
      }).filter(([key]) => me.role === "admin" || !privateTools.includes(key)),
    );
  const handles = (key) => !!recordTools[key] || !!views[key];
  async function list(table, filters = {}, order = "created_at") {
    const result = [];
    for (let start = 0; ; start += 500) {
      let q = sb.from(table).select("*");
      for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
      if (order) q = q.order(order);
      const { data, error } = await q.order("id").range(start, start + 499);
      if (error) throw error;
      result.push(...(data || []));
      if ((data || []).length < 500) return result;
    }
  }
  const write = async (q) => {
    const { data, error } = await q;
    if (error) throw error;
    return data;
  };
  const run = async (button, fn) => {
    button.disabled = true;
    try {
      await fn();
    } catch (e) {
      ERR(e);
    } finally {
      button.disabled = false;
    }
  };
  const toolLink = (p, key, label) =>
    `<a class="btn small" href="#/outils/${encodeURIComponent(p.id)}?section=${key}">${esc(label || sections()[key] || ProjectToolBrowser.available(p.event_type)[key] || key)}</a>`;
  function print(p, title, html) {
    document.getElementById("print-sheet")?.remove();
    const sheet = document.createElement("section");
    sheet.id = "print-sheet";
    sheet.className = "print-sheet companion-print";
    sheet.innerHTML = `<header><p>Syntra · ${esc(title)}</p><h1>${esc(p.title)}</h1></header>${html}`;
    document.body.append(sheet);
    document.body.dataset.print = "sheet";
    window.addEventListener(
      "afterprint",
      () => {
        delete document.body.dataset.print;
        sheet.remove();
      },
      { once: true },
    );
    window.print();
  }
  const sourcePayload = (tool, label, details = {}, status) => ({
    tool,
    label,
    details,
    project_id: null,
    status: status || Object.keys(recordTools[tool].status)[0],
  });
  async function insert(p, tool, label, details = {}, status) {
    return write(
      sb
        .from("project_companion_items")
        .insert({
          ...sourcePayload(tool, label, details, status),
          project_id: p.id,
        })
        .select("id")
        .single(),
    );
  }
  const action = async (iid, kind, target) =>
    write(
      sb.rpc("apply_project_operation_action", {
        item_id: iid,
        action_kind: kind,
        target_project: target || null,
      }),
    );
  function focus() {
    const id = parseHash().params.get("focus");
    if (id && /^[0-9a-f-]{36}$/i.test(id)) {
      const row = document.querySelector(`[data-ops-item="${id}"]`);
      row?.scrollIntoView({ block: "center" });
      if (row?.querySelector("details"))
        row.querySelector("details").open = true;
    }
  }
  async function open(key, p, reload) {
    if (privateTools.includes(key) && me.role !== "admin")
      throw Error("Accès réservé à l’administrateur.");
    if (key === "settings") return EquipmentSettings.open(p, reload);
    if (key === "project_search") return EventSearch.open(p);
    if (views[key]) return EventLive.open(key, p, reload);
    const context = await ProjectOperations.open(key, p, reload);
    await augment(key, p, context.items, reload);
    focus();
  }
  async function augment(key, p, items, reload) {
    const root = $("#tool-content"),
      panel = document.createElement("section");
    panel.className = "companion-panel";
    root.prepend(panel);
    const acknowledgements = ["changes", "handovers"].includes(key)
      ? await list("operation_acknowledgements", { project_id: p.id })
      : [];
    const decorateRows = () => {
      if (key === "logbook") {
        for (const item of items) {
          const row = root.querySelector(`[data-ops-item="${item.id}"]`);
          if (row && !row.querySelector(".companion-record-time")) {
            const time = document.createElement("time");
            time.className = "muted companion-record-time";
            time.textContent = fmtDateTime(item.created_at);
            row.append(time);
          }
        }
      }

      if (["changes", "handovers"].includes(key)) {
        for (const item of items.filter((x) => x.status === "published")) {
          const row = root.querySelector(`[data-ops-item="${item.id}"]`);
          if (!row || row.querySelector(".companion-ack")) continue;
          const confirmed = acknowledgements.filter(
              (a) => a.item_id === item.id && a.item_revision === item.revision,
            ),
            mine = confirmed.some((a) => a.user_id === me.id);
          const box = document.createElement("div");
          box.className = "actions companion-ack";
          box.innerHTML = `<span class="muted">${confirmed.length} confirmation(s) pour cette version</span><button class="btn small" ${mine ? "disabled" : ""}>${mine ? "Lecture confirmée" : "Confirmer ma lecture"}</button>`;
          box.querySelector("button").onclick = (e) =>
            run(e.currentTarget, async () => {
              await write(
                sb.rpc("acknowledge_operation_item", {
                  item_id: item.id,
                  expected_revision: item.revision,
                }),
              );
              await reload();
            });
          row.append(box);
        }
      }
      if (p._canEdit) {
        for (const item of items) {
          const row = root.querySelector(`[data-ops-item="${item.id}"]`);
          if (!row) continue;
          const actions = [];
          if (
            ["issues", "decisions", "lessons", "onsite_requests"].includes(key)
          )
            actions.push(["task", "Créer une tâche"]);
          if (key === "issues") actions.push(["log", "Consigner au journal"]);
          if (key === "interventions")
            actions.push(["schedule", "Ajouter au planning"]);
          if (
            key === "urgent_expenses" &&
            me.role === "admin" &&
            ["approved", "reimbursed"].includes(item.status)
          )
            actions.push(["cost", "Ajouter aux frais de rentabilité"]);
          if (
            key === "extras" &&
            me.role === "admin" &&
            ["approved", "invoiced"].includes(item.status)
          )
            actions.push(["quote", "Ajouter au devis"]);
          if (
            key === "replenishment" &&
            item.status === "received" &&
            item.details.supply_id
          )
            actions.push(["restock", "Ajouter au stock du consommable"]);
          if (key === "rollcall" && item.status === "expected")
            actions.push(["present", "Marquer présent"]);
          for (const [kind, label] of actions) {
            if (row.querySelector(`[data-companion-action="${kind}"]`))
              continue;
            const button = document.createElement("button");
            button.dataset.companionAction = kind;
            button.className = "btn small";
            button.textContent = label;
            button.onclick = () =>
              run(button, async () => {
                if (kind === "present") {
                  await write(
                    sb
                      .from("project_companion_items")
                      .update({
                        status: "present",
                        details: {
                          ...item.details,
                          arrived_at: localDateTime(),
                        },
                        revision: item.revision + 1,
                      })
                      .eq("id", item.id)
                      .eq("project_id", p.id)
                      .eq("revision", item.revision)
                      .select("id")
                      .single(),
                  );
                } else {
                  const result = await action(item.id, kind, p.id);
                  toast(
                    result?.already_applied
                      ? "Cette action avait déjà été effectuée."
                      : "Action effectuée.",
                  );
                }
                await reload();
              });
            row.querySelector(".tool-row-actions")?.append(button);
          }
        }
      }
    };
    if (
      key === "logbook" &&
      $("#ops-form") &&
      !$("#ops-form").elements.record_id.value &&
      !$("#ops-form").elements.occurred_at.value
    )
      $("#ops-form").elements.occurred_at.value = localDateTime();
    root.companionRefresh = decorateRows;
    decorateRows();
    if (
      [
        "opening_checks",
        "closing_checks",
        "meal_service",
        "replenishment",
      ].includes(key) &&
      p._canEdit
    ) {
      panel.insertAdjacentHTML(
        "beforeend",
        `<button class="btn" id="companion-seed">${{ opening_checks: "Créer la checklist adaptée à ce projet", closing_checks: "Créer la checklist de clôture", meal_service: "Reprendre les groupes d’invités", replenishment: "Préparer les réapprovisionnements manquants" }[key]}</button><p class="tool-note">Ajoute uniquement les éléments manquants. Les fiches existantes et leurs états sont conservés.</p>`,
      );
      panel.querySelector("#companion-seed").onclick = (e) =>
        run(e.currentTarget, async () => {
          const count = await write(
            sb.rpc("seed_project_operation_checks", { pid: p.id, kind: key }),
          );
          toast(`${count} élément(s) ajouté(s).`);
          await reload();
        });
    }
    if (key === "diagnostics") await EventLive.diagnostic(panel, p);
    if (key === "media_checks") await EventLive.mediaCheck(panel, p, reload);
    if (key === "practical_info") await practical(panel, p);
    if (key === "signage")
      panel.insertAdjacentHTML(
        "beforeend",
        `<button class="btn" id="companion-print-signs">Imprimer les panneaux</button>`,
      );
    if (key === "signage")
      panel.querySelector("button").onclick = () =>
        print(
          p,
          "Signalétique",
          items
            .filter((x) => x.status !== "cancelled")
            .map(
              (x) =>
                `<article class="paper-sign paper-sign-${x.details.orientation || "portrait"}">${ProjectIcons.svg(x.details.kind || "pin", 70)}<h1>${esc(x.label)}</h1><p>${esc(x.details.body || "")}</p><strong>${{ left: "←", right: "→", up: "↑", down: "↓", none: "" }[x.details.arrow] || ""}</strong></article>`,
            )
            .join(""),
        );
    if (key === "lessons") {
      const lessons = await list("project_companion_items", {
        tool: "lessons",
      });
      panel.insertAdjacentHTML(
        "beforeend",
        `<details class="card"><summary>Réutiliser les retours de mes autres projets</summary>${
          lessons
            .filter((x) => x.project_id !== p.id && x.status !== "draft")
            .map(
              (x) =>
                `<div class="companion-result"><strong>${esc(x.label)}</strong><p>${esc(x.details.improvement || "")}</p>${p._canEdit ? `<button class="btn small" data-copy-lesson="${x.id}">Créer une tâche dans ce projet</button>` : ""}</div>`,
            )
            .join("") || '<p class="empty">Aucun autre retour disponible.</p>'
        }</details>`,
      );
      panel.querySelectorAll("[data-copy-lesson]").forEach(
        (b) =>
          (b.onclick = () =>
            run(b, async () => {
              await action(b.dataset.copyLesson, "task", p.id);
              toast("Tâche ajoutée ou déjà présente.");
            })),
      );
    }
    if (
      [
        "queues",
        "orders",
        "borrowed",
        "meal_service",
        "extras",
        "urgent_expenses",
      ].includes(key)
    ) {
      const n = (v) => Number(v) || 0;
      const messages = items
        .filter((x) => !["cancelled", "declined"].includes(x.status))
        .map((x) => {
          const d = x.details;
          if (key === "queues" && n(d.waiting) >= n(d.threshold))
            return `${x.label} : seuil de renfort atteint (${d.waiting} personnes)`;
          if (key === "orders")
            return `${x.label} : ${Math.max(0, n(d.ordered) - n(d.received))} ${d.unit || ""} à recevoir`;
          if (key === "borrowed")
            return `${x.label} : ${Math.max(0, n(d.quantity) - n(d.returned))} à rendre`;
          if (key === "meal_service")
            return `${x.label} : ${Math.max(0, n(d.expected) - n(d.served))} repas restant à servir`;
          if (key === "extras")
            return `${x.label} : ${fmtEur(Math.round((n(d.quantity) * 1000 * n(d.unit_price) * 100) / 1000) / 100)}`;
          if (key === "urgent_expenses")
            return `${x.label} : ${fmtEur(n(d.amount))} · ${x.status === "reimbursed" ? "remboursé" : "remboursement à suivre"}`;
        })
        .filter(Boolean);
      panel.insertAdjacentHTML(
        "beforeend",
        `<div class="card companion-summary">${messages.map((m) => `<p>${esc(m)}</p>`).join("") || '<p class="muted">Aucun suivi chiffré pour le moment.</p>'}</div>`,
      );
    }
    // Document selection is limited to the project's documents visible to this account.
    if (recordTools[key].fields.some((f) => f.key === "document_id")) {
      const docs = await list(
          "project_documents",
          { project_id: p.id },
          "name",
        ),
        input = $("#ops-form [name=document_id]");
      if (input) {
        const selected = input.value,
          select = document.createElement("select");
        select.name = "document_id";
        select.innerHTML =
          '<option value="">Aucun document</option>' +
          docs
            .map((d) => `<option value="${d.id}">${esc(d.name)}</option>`)
            .join("");
        select.value = selected;
        input.replaceWith(select);
      }
      for (const item of items) {
        const doc = docs.find((d) => d.id === item.details.document_id);
        if (doc) {
          const a = document.createElement("a");
          a.className = "btn small";
          a.href = `#/document/${doc.id}`;
          a.target = "_blank";
          a.rel = "noopener";
          a.textContent = "Ouvrir " + doc.name;
          root.querySelector(`[data-ops-item="${item.id}"]`)?.append(a);
        }
      }
      panel.insertAdjacentHTML(
        "beforeend",
        toolLink(p, "documents", "Ajouter / consulter les documents et photos"),
      );
    }
  }
  const localDateTime = () => {
    const d = new Date();
    return new Date(d - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  async function practical(panel, p) {
    const links =
      me.role === "admin"
        ? await list("project_practical_links", { project_id: p.id })
        : [];
    panel.innerHTML += `<div class="card"><h3>Lien d’informations pratiques</h3><p class="tool-note">Avant de créer un lien, vérifiez les fiches publiées avec la diffusion « Inclure dans le lien public ». Elles seront lisibles par toute personne possédant ce lien.</p>${me.role === "admin" ? '<button class="btn" id="create-practical-link">Créer un lien public</button>' : '<p class="muted">La création et la fermeture des liens sont réservées à l’administrateur.</p>'}${links
      .map((l) => {
        const url = location.origin + location.pathname + "#/infos/" + l.token;
        return `<div class="companion-result"><input readonly aria-label="Lien d’informations pratiques" value="${esc(url)}"><div class="actions"><a class="btn small" href="${url}" target="_blank" rel="noopener">Ouvrir</a><button class="btn small" data-practical-copy="${l.token}">Copier</button><button class="btn small" data-practical-qr="${l.token}">Télécharger le QR</button><button class="btn small" data-practical-close="${l.id}">${l.is_open ? "Fermer" : "Rouvrir"}</button></div></div>`;
      })
      .join("")}</div>`;
    panel
      .querySelector("#create-practical-link")
      ?.addEventListener("click", (e) =>
        run(e.currentTarget, async () => {
          await write(
            sb
              .from("project_practical_links")
              .insert({ project_id: p.id })
              .select("id")
              .single(),
          );
          await practicalRefresh();
        }),
      );
    async function practicalRefresh() {
      go(`outils/${p.id}?section=practical_info`);
    }
    panel
      .querySelectorAll("[data-practical-qr]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            Enhancements.downloadQR(
              location.origin +
                location.pathname +
                "#/infos/" +
                b.dataset.practicalQr,
              "infos-pratiques.png",
            )),
      );
    panel.querySelectorAll("[data-practical-close]").forEach(
      (b) =>
        (b.onclick = () =>
          run(b, async () => {
            const old = links.find((l) => l.id === b.dataset.practicalClose);
            await write(
              sb
                .from("project_practical_links")
                .update({ is_open: !old.is_open })
                .eq("id", old.id)
                .eq("project_id", p.id)
                .select("id")
                .single(),
            );
            await practicalRefresh();
          })),
    );
  }
  async function publicInfo(token) {
    const { data, error } = await sb.rpc("get_practical_project", {
      link_token: token,
    });
    if (error) throw error;
    if (!data) {
      app.innerHTML =
        '<section class="card public-page"><h1>Lien indisponible</h1><p>Ce lien est fermé ou n’existe pas.</p></section>';
      return;
    }
    app.innerHTML = `<section class="public-page"><div class="page-head"><div><h1>${esc(data.title)}</h1><p>${data.event_date ? esc(fmtDate(data.event_date)) : ""}</p></div></div><div class="tool-list">${(data.information || []).map((x) => `<article class="card"><h2>${esc(x.label)}</h2><p class="companion-preserve">${esc(x.body)}</p>${x.url && /^https?:\/\//i.test(x.url) ? `<a class="btn" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">Ouvrir le lien ↗</a>` : ""}</article>`).join("") || '<p class="empty">Les informations pratiques seront disponibles ici prochainement.</p>'}</div></section>`;
  }
  return {
    recordTools,
    views,
    viewGroups,
    privateTools,
    sections,
    handles,
    open,
    list,
    write,
    run,
    toolLink,
    print,
    insert,
    action,
    localDateTime,
    publicInfo,
  };
})();
