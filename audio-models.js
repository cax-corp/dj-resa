/* Sourced model profiles plus reusable user-entered configurations; no fabricated web lookup. */
const AudioModels = (() => {
  const clean = (s) =>
    String(s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const socket = (
    name,
    direction,
    connector,
    group_name,
    audio_role = "independent",
    extra = {},
  ) => ({
    name,
    direction,
    connector,
    group_name,
    audio_role,
    signal: "line",
    gender: "female",
    channels: 1,
    alternatives: [],
    ...extra,
  });
  function flx6() {
    return [
      socket("MASTER · RCA L", "out", "rca", "MASTER", "left"),
      socket("MASTER · RCA R", "out", "rca", "MASTER", "right"),
      socket("BOOTH · RCA L", "out", "rca", "BOOTH", "left"),
      socket("BOOTH · RCA R", "out", "rca", "BOOTH", "right"),
      socket("PHONES · Jack 6,35", "out", "jack_trs", "Casque", "stereo", {
        channels: 2,
      }),
      socket("PHONES · Mini-jack 3,5", "out", "mini_trs", "Casque", "stereo", {
        channels: 2,
      }),
      socket("MIC · Jack 6,35", "in", "jack_trs", "Micro", "independent", {
        signal: "mic",
        alternatives: [
          {
            id: crypto.randomUUID(),
            connector: "jack_ts",
            signal: "mic",
            gender: "female",
            channels: 1,
          },
        ],
      }),
      socket("USB-B · Ordinateur", "in", "usb_b", "USB", "independent", {
        signal: "usb",
      }),
    ];
  }
  const catalogue = [
    {
      name: "Pioneer DJ DDJ-FLX6-GT",
      aliases: ["ddjflx6gt", "flx6gt"],
      source:
        "https://www.pioneerdj.com/en/product/dj-controllers/ddj-flx6-gt/",
      note: "MASTER et BOOTH : RCA L/R distincts. Les sorties casque sont stéréo. USB représenté dans le sens ordinateur → contrôleur.",
      ports: flx6,
    },
    {
      name: "Pioneer DJ DDJ-FLX6",
      aliases: ["ddjflx6", "flx6"],
      source: "https://www.pioneerdj.com/en/product/dj-controllers/ddj-flx6/",
      note: "Version FLX6 : vérifiez la référence exacte avant import. MASTER et BOOTH RCA L/R.",
      ports: flx6,
    },
    {
      name: "Yamaha MG06X",
      aliases: ["mg06x"],
      source:
        "https://data.yamaha.com/files/download/other_assets/9/330989/VHN6730_MG06X_TS_En_E0_views.pdf",
      note: "2 combos MIC/LINE, CH 3/4 et 5/6 L/Mono–R, sorties XLR/jack et casque. Réglages PAD et MONO/STEREO à vérifier sur la console.",
      ports: () => AudioPorts.mg06x(),
    },
    {
      name: "Yamaha MG06",
      aliases: ["mg06"],
      source:
        "https://data.yamaha.com/files/download/other_assets/9/330989/VHN6730_MG06X_TS_En_E0_views.pdf",
      note: "Même connectique audio que la MG06X, sans effet intégré.",
      ports: () => AudioPorts.mg06x(),
    },
  ];
  function matches(item, q) {
    q = clean(q);
    if (!q) return true;
    return (
      clean(item.name).includes(q) ||
      item.aliases?.some((a) => clean(a).includes(q) || q.includes(clean(a)))
    );
  }
  async function open(gear, current, onAdd) {
    const [equipment, allPorts] = await Promise.all([
      Production.list("equipment"),
      Production.list("equipment_audio_ports"),
    ]);
    const items = [
      ...catalogue,
      ...equipment
        .filter(
          (g) =>
            g.id !== gear.id && allPorts.some((p) => p.equipment_id === g.id),
        )
        .map((g) => ({
          name: g.name,
          local: true,
          note: "Configuration déjà saisie dans votre inventaire. Vérifiez qu’il s’agit exactement du même modèle.",
          ports: () =>
            allPorts
              .filter((p) => p.equipment_id === g.id)
              .map(
                ({
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
                  name,
                  direction,
                  connector,
                  gender,
                  signal,
                  channels,
                  alternatives: (alternatives || []).map((a) => ({
                    ...a,
                    id: crypto.randomUUID(),
                  })),
                  group_name: group_name || "",
                  audio_role: audio_role || "independent",
                }),
              ),
        })),
    ];
    const dialog = document.createElement("dialog");
    dialog.id = "audio-model-search";
    dialog.className = "audio-dialog";
    dialog.setAttribute("aria-labelledby", "audio-model-title");
    dialog.innerHTML =
      '<div class="tool-toolbar"><h2 id="audio-model-title">Rechercher les prises d’un modèle</h2><button type="button" class="btn" data-close-model>Fermer</button></div><p>Fiches référencées avec source constructeur et configurations de votre inventaire. Cette recherche ne devine pas les prises d’un modèle absent.</p><label>Marque ou modèle<input type="search" autocomplete="off" placeholder="DDJ FLX6 GT, MG06X…"></label><button type="button" class="btn small" data-all-models>Voir tous les modèles</button><div data-model-results></div><div data-model-preview></div>';
    app.append(dialog);
    dialog.showModal();
    const input = dialog.querySelector("input"),
      results = dialog.querySelector("[data-model-results]"),
      preview = dialog.querySelector("[data-model-preview]");
    function render() {
      preview.innerHTML = "";
      const found = items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => matches(item, input.value));
      results.innerHTML =
        found
          .map(
            ({ item, index }) =>
              `<article class="card tool-row"><div><strong>${esc(item.name)}</strong><p class="muted">${item.local ? "Depuis votre inventaire" : "Fiche avec source constructeur"}</p></div><button type="button" class="btn small" data-model="${index}">Voir les prises</button></article>`,
          )
          .join("") ||
        '<p class="empty">Modèle absent du catalogue. Renseignez ses prises manuellement ; elles pourront ensuite être réutilisées pour un autre appareil.</p>';
      const url =
        "https://www.google.com/search?q=" +
        encodeURIComponent(
          input.value + " manuel constructeur entrées sorties connectique",
        );
      results.insertAdjacentHTML(
        "beforeend",
        `<p><a class="btn small" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Rechercher la notice sur le Web</a></p>`,
      );
      results
        .querySelectorAll("[data-model]")
        .forEach(
          (b) => (b.onclick = () => show(items[Number(b.dataset.model)])),
        );
    }
    function show(item) {
      const ports = item.ports();
      preview.innerHTML = `<section class="card"><h3>${esc(item.name)}</h3><p>${esc(item.note)}</p>${item.source ? `<p><a href="${item.source}" target="_blank" rel="noopener noreferrer">Consulter la source constructeur</a></p>` : ""}<p>${current.length ? "Des prises existent déjà : cochez uniquement celles à ajouter. Les noms différents ne peuvent pas être reconnus automatiquement comme des doublons." : "Vérifiez les prises, puis ajoutez celles dont vous avez besoin."}</p><div class="audio-model-ports">${ports
        .map((p, i) => {
          const existing = current.some(
            (c) => c.name === p.name && c.direction === p.direction,
          );
          return `<label class="audio-model-port"><input type="checkbox" data-import-port="${i}" ${existing ? "disabled" : !current.length ? "checked" : ""}><span><strong>${esc(p.name)}</strong><span>${p.direction === "in" ? "Entrée" : "Sortie"} · ${esc(AudioConnectors.labels[p.connector])}${existing ? " · Déjà présente" : ""}</span></span></label>`;
        })
        .join(
          "",
        )}</div><div class="actions"><button type="button" class="btn small" data-select-missing>Cocher toutes les prises absentes</button><button type="button" class="btn primary" data-import-model>Ajouter les prises cochées</button></div></section>`;
      preview.querySelector("[data-select-missing]").onclick = () =>
        preview
          .querySelectorAll("input:not(:disabled)")
          .forEach((i) => (i.checked = true));
      preview.querySelector("[data-import-model]").onclick = async () => {
        const chosen = [
          ...preview.querySelectorAll("input:checked:not(:disabled)"),
        ].map((i) => ports[Number(i.dataset.importPort)]);
        if (!chosen.length)
          return ERR(new Error("Cochez au moins une prise à ajouter."));
        const button = preview.querySelector("[data-import-model]");
        button.disabled = true;
        try {
          await onAdd(chosen);
          dialog.close();
        } catch (error) {
          ERR(error);
          button.disabled = false;
        }
      };
      preview.scrollIntoView({ block: "nearest" });
    }
    input.value = gear.name;
    input.oninput = render;
    dialog.querySelector("[data-all-models]").onclick = () => {
      input.value = "";
      render();
    };
    dialog.querySelector("[data-close-model]").onclick = () => dialog.close();
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    render();
    input.focus();
  }
  return { catalogue, matches, flx6, open };
})();
