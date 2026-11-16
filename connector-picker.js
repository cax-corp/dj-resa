/* Physical connector drawings, intentionally independent of brand logos. */
const AudioConnectors = (() => {
  // id, label, family, silhouette, helpful description, automatic format size
  const items = [
    [
      "xlr3",
      "XLR 3 broches",
      "XLR et mini-XLR",
      "pins3",
      "Prise ronde à trois contacts, micro ou ligne",
    ],
    [
      "xlr4",
      "XLR 4 broches",
      "XLR et mini-XLR",
      "pins4",
      "Prise ronde à quatre contacts",
    ],
    [
      "xlr5",
      "XLR 5 broches",
      "XLR et mini-XLR",
      "pins5",
      "Prise ronde à cinq contacts",
    ],
    [
      "mini_xlr3",
      "Mini-XLR 3 broches",
      "XLR et mini-XLR",
      "mini3",
      "Petite prise ronde à verrouillage (TA3)",
    ],
    [
      "mini_xlr4",
      "Mini-XLR 4 broches",
      "XLR et mini-XLR",
      "mini4",
      "Petite prise ronde à verrouillage (TA4)",
    ],
    [
      "jack_ts",
      "Jack 6,35 TS",
      "Jacks",
      "jack1",
      "Grande fiche avec une bague isolante",
    ],
    [
      "jack_trs",
      "Jack 6,35 TRS",
      "Jacks",
      "jack2",
      "Grande fiche avec deux bagues isolantes",
    ],
    [
      "mini_ts",
      "Mini-jack 3,5 TS",
      "Jacks",
      "small1",
      "Petite fiche avec une bague isolante",
    ],
    [
      "mini_trs",
      "Mini-jack 3,5 TRS",
      "Jacks",
      "small2",
      "Petite fiche avec deux bagues isolantes",
      2,
    ],
    [
      "mini_trrs",
      "Mini-jack 3,5 TRRS",
      "Jacks",
      "small3",
      "Petite fiche avec trois bagues isolantes",
      2,
    ],
    [
      "jack_25",
      "Jack 2,5 TRS",
      "Jacks",
      "tiny2",
      "Très petite fiche à deux bagues isolantes",
      2,
    ],
    [
      "jack_25_trrs",
      "Jack 2,5 TRRS",
      "Jacks",
      "tiny3",
      "Très petite fiche à trois bagues isolantes",
      2,
    ],
    [
      "pentaconn",
      "Jack 4,4 Pentaconn",
      "Jacks",
      "jack4",
      "Fiche à quatre bagues pour casque symétrique",
      2,
    ],
    [
      "rca",
      "RCA mono",
      "RCA et coaxial",
      "rca",
      "Une prise ronde à broche centrale",
    ],
    [
      "rca_pair",
      "2 RCA stéréo",
      "RCA et coaxial",
      "pair",
      "Deux prises rouge et blanche, gauche et droite",
      2,
    ],
    [
      "bnc",
      "BNC",
      "RCA et coaxial",
      "bnc",
      "Prise coaxiale à verrouillage par baïonnette",
    ],
    [
      "binding_post",
      "Bornier HP à vis",
      "Haut-parleurs et borniers",
      "binding",
      "Bornes rouge/noir : le fil de cuivre dénudé se serre sous une vis",
    ],
    [
      "spring_clip",
      "Bornier HP à pince",
      "Haut-parleurs et borniers",
      "spring",
      "Languettes rouge/noir à enfoncer pour insérer le fil dénudé",
    ],
    [
      "euroblock2",
      "Euroblock / Phoenix 2 pôles",
      "Haut-parleurs et borniers",
      "terminal2",
      "Petit bloc à deux vis serrant les fils dénudés",
    ],
    [
      "euroblock3",
      "Euroblock / Phoenix 3 pôles",
      "Haut-parleurs et borniers",
      "terminal3",
      "Petit bloc à trois vis pour audio symétrique",
    ],
    [
      "banana",
      "Banane 4 mm",
      "Haut-parleurs et borniers",
      "banana",
      "Fiche cylindrique insérée dans une borne HP",
    ],
    [
      "speakon2",
      "Speakon NL2",
      "Haut-parleurs et borniers",
      "speak2",
      "Prise HP ronde à verrouillage, deux contacts",
    ],
    [
      "speakon4",
      "Speakon NL4",
      "Haut-parleurs et borniers",
      "speak4",
      "Prise HP ronde à verrouillage, quatre contacts",
    ],
    [
      "speakon8",
      "Speakon NL8",
      "Haut-parleurs et borniers",
      "speak8",
      "Grande prise HP ronde à huit contacts",
    ],
    ["usb_a", "USB-A", "USB", "usbA", "Prise rectangulaire classique"],
    [
      "usb_b",
      "USB-B",
      "USB",
      "usbB",
      "Prise carrée à angles supérieurs biseautés",
    ],
    ["usb_c", "USB-C", "USB", "usbC", "Petite prise ovale réversible"],
    [
      "usb_mini",
      "Mini-USB B",
      "USB",
      "miniUSB",
      "Petite prise trapézoïdale épaisse",
    ],
    [
      "usb_micro",
      "Micro-USB B",
      "USB",
      "microUSB",
      "Petite prise plate à bords biseautés",
    ],
    [
      "rj45",
      "RJ45",
      "Réseau et numérique",
      "rj45",
      "Prise réseau rectangulaire à huit contacts",
    ],
    [
      "ethercon",
      "EtherCON",
      "Réseau et numérique",
      "ethercon",
      "Prise RJ45 dans un boîtier rond à verrouillage",
    ],
    [
      "toslink",
      "Toslink",
      "Réseau et numérique",
      "toslink",
      "Prise optique carrée avec détrompeur",
    ],
    [
      "mini_toslink",
      "Mini-Toslink",
      "Réseau et numérique",
      "optical",
      "Prise optique au format mini-jack 3,5 mm",
    ],
    [
      "db25",
      "D-sub DB25 audio",
      "Multipoints",
      "db25",
      "Prise trapézoïdale à 25 contacts : vérifier le brochage",
      8,
    ],
    [
      "din5",
      "DIN 5 broches audio",
      "Multipoints",
      "din5",
      "Prise ronde ancienne à cinq contacts : vérifier le brochage",
      2,
    ],
  ];
  const labels = Object.fromEntries(items.map(([id, label]) => [id, label]));
  const terminals = ["binding_post", "spring_clip", "euroblock2", "euroblock3"];
  const usb = ["usb_a", "usb_b", "usb_c", "usb_mini", "usb_micro"];
  const network = ["rj45", "ethercon"];
  const optical = ["toslink", "mini_toslink"];
  const count = (id) => items.find((i) => i[0] === id)?.[5] || 1;
  function icon(id) {
    const shape = items.find((i) => i[0] === id)?.[3] || "pins3";
    const circle = (x, y, r = 3) => `<circle cx="${x}" cy="${y}" r="${r}"/>`;
    const pins = (n, small = false) =>
      `<circle cx="48" cy="32" r="${small ? 17 : 24}"/><path d="M42 ${small ? 15 : 8}h12v5H42z"/>` +
      Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        return circle(
          48 + Math.cos(a) * (small ? 9 : 13),
          32 + Math.sin(a) * (small ? 9 : 13),
          2.4,
        );
      }).join("");
    let drawing;
    if (/^(pins|mini|din)\d/.test(shape))
      drawing = pins(Number(shape.match(/\d/)[0]), shape.startsWith("mini"));
    else if (/^(jack|small|tiny)\d/.test(shape)) {
      const n = Number(shape.match(/\d/)[0]);
      drawing =
        '<rect x="8" y="22" width="26" height="20" rx="3"/><path d="M34 27h46l8 5-8 5H34z"/>' +
        Array.from(
          { length: n },
          (_, i) => `<path d="M${77 - i * 7} 27v10" stroke-width="3"/>`,
        ).join("");
    } else if (shape === "rca" || shape === "pair")
      drawing =
        (shape === "pair" ? '<g transform="translate(-19 0)">' : "") +
        '<circle cx="48" cy="32" r="18"/>' +
        circle(48, 32, 6) +
        (shape === "pair"
          ? '</g><g transform="translate(19 0)"><circle cx="48" cy="32" r="18"/>' +
            circle(48, 32, 6) +
            "</g>"
          : "");
    else if (shape === "bnc")
      drawing =
        '<circle cx="48" cy="32" r="20"/>' +
        circle(48, 32, 5) +
        '<path d="M23 28h6v8h-6zm44 0h6v8h-6z"/>';
    else if (shape === "binding")
      drawing =
        '<path d="M18 45h60M29 39v14m38-14v14M19 17h20v22H19zm38 0h20v22H57z"/><circle cx="29" cy="28" r="7"/><circle cx="67" cy="28" r="7"/><path d="M25 28h8m30 0h8M24 52l-8 8m46-8-8 8" stroke="#b77443"/>';
    else if (shape === "spring")
      drawing =
        '<rect x="13" y="13" width="70" height="40" rx="3"/><path d="M19 19h22v17H19zm36 0h22v17H55zM24 25h12m24 0h12"/>' +
        circle(30, 44, 4) +
        circle(66, 44, 4);
    else if (shape.startsWith("terminal")) {
      const n = Number(shape.slice(-1));
      drawing =
        '<rect x="10" y="10" width="76" height="44" rx="3"/>' +
        Array.from({ length: n }, (_, i) => {
          const x = 10 + ((i + 0.5) * 76) / n;
          return (
            circle(x, 24, 7) + `<path d="M${x - 4} 24h8m-10 15h12v10h-12z"/>`
          );
        }).join("");
    } else if (shape === "banana")
      drawing =
        '<rect x="8" y="22" width="34" height="20" rx="3"/><path d="M42 27h38q14 5 0 10H42m8-7h31m-31 4h31"/>';
    else if (shape.startsWith("speak"))
      drawing =
        '<circle cx="48" cy="32" r="25"/><circle cx="48" cy="32" r="18"/><path d="M26 14l7 7m37-7-7 7"/>' +
        Array.from({ length: Number(shape.slice(5)) }, (_, i) => {
          const a = (i / Number(shape.slice(5))) * Math.PI * 2;
          return `<rect x="${45 + Math.cos(a) * 11}" y="${30 + Math.sin(a) * 11}" width="5" height="4"/>`;
        }).join("");
    else if (shape === "usbA")
      drawing =
        '<rect x="14" y="16" width="68" height="32" rx="2"/><path d="M22 33h52v8H22zm6-10v6m13-6v6m13-6v6m13-6v6"/>';
    else if (shape === "usbB")
      drawing = '<path d="M32 12h32l10 10v30H22V22zM32 34h32v10H32z"/>';
    else if (shape === "usbC")
      drawing =
        '<rect x="13" y="19" width="70" height="26" rx="13"/><rect x="24" y="29" width="48" height="6" rx="3"/>';
    else if (shape === "miniUSB" || shape === "microUSB")
      drawing = `<path d="M20 ${shape === "miniUSB" ? 17 : 23}h56l8 10-8 13H20L12 33zM25 34h46"/>`;
    else if (shape === "rj45" || shape === "ethercon")
      drawing =
        (shape === "ethercon" ? '<circle cx="48" cy="32" r="28"/>' : "") +
        '<path d="M28 16h40v27H57v7H39v-7H28z"/>' +
        Array.from(
          { length: 8 },
          (_, i) => `<path d="M${33 + i * 4.3} 20v10"/>`,
        ).join("");
    else if (shape === "toslink")
      drawing =
        '<path d="M28 12h40l8 9v32H20V21zM34 24h28v18H34z"/>' +
        circle(48, 33, 4);
    else if (shape === "optical")
      drawing =
        '<rect x="9" y="23" width="28" height="18" rx="3"/><path d="M37 28h42l8 4-8 4H37"/>' +
        circle(82, 32, 2);
    else if (shape === "db25")
      drawing =
        '<path d="M10 16h76l-7 32H17z"/>' +
        Array.from({ length: 25 }, (_, i) =>
          circle(
            19 + (i < 13 ? i : i - 13) * 4.8 + (i < 13 ? 0 : 2.4),
            i < 13 ? 26 : 37,
            1,
          ),
        ).join("");
    return `<svg viewBox="0 0 96 64" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${drawing}</svg>`;
  }
  function choose(current, onChoose) {
    document.getElementById("connector-picker")?.remove();
    const dialog = document.createElement("dialog");
    dialog.id = "connector-picker";
    dialog.className = "connector-dialog";
    dialog.setAttribute("aria-labelledby", "connector-picker-title");
    dialog.innerHTML =
      '<div class="tool-toolbar"><div><h2 id="connector-picker-title">Choisir une connectique</h2><p class="muted">Repérez la forme de la prise sur votre appareil.</p></div><button type="button" class="btn" data-close-picker>Fermer</button></div><label class="connector-search">Rechercher<input type="search" placeholder="XLR, vis, cuivre, jack, USB…" autocomplete="off"></label><div class="connector-results"></div><p class="muted">Dessins indicatifs : les proportions et les boîtiers varient selon les appareils.</p>';
    document.body.append(dialog);
    const results = dialog.querySelector(".connector-results"),
      search = dialog.querySelector("input");
    const normalized = (s) =>
      s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    function render() {
      const query = normalized(search.value.trim());
      const filtered = items.filter((i) =>
        normalized(i.slice(1, 5).join(" ")).includes(query),
      );
      results.innerHTML =
        [...new Set(filtered.map((i) => i[2]))]
          .map(
            (group) =>
              `<section><h3>${group}</h3><div class="connector-grid">${filtered
                .filter((i) => i[2] === group)
                .map(
                  ([id, label, , , hint]) =>
                    `<button type="button" class="connector-card" data-connector="${id}" aria-pressed="${id === current}">${icon(id)}<strong>${label}</strong><span>${hint}</span></button>`,
                )
                .join("")}</div></section>`,
          )
          .join("") || '<p class="empty">Aucune connectique trouvée.</p>';
      results.querySelectorAll("[data-connector]").forEach(
        (button) =>
          (button.onclick = () => {
            onChoose(button.dataset.connector);
            dialog.close();
          }),
      );
    }
    search.oninput = render;
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dialog.close();
      }
    });
    dialog.querySelector("[data-close-picker]").onclick = () => dialog.close();
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    render();
    dialog.showModal();
    search.focus();
  }
  return {
    items,
    labels,
    terminals,
    usb,
    network,
    optical,
    count,
    icon,
    choose,
  };
})();
