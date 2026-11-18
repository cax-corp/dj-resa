/* Optional commercial lines. Prices are copied to the project, never kept live-linked. */
const TariffAddons = (() => {
  const lineAmount = (quantity, price) =>
    Math.round((Math.round(quantity * 1000) * Math.round(price * 100)) / 1000) /
    100;
  const units = { forfait: "Forfait", heure: "Heure", unite: "Unité" };
  const opts = (map, value) =>
    Object.entries(map)
      .map(
        ([key, label]) =>
          `<option value="${esc(key)}" ${key === value ? "selected" : ""}>${esc(label)}</option>`,
      )
      .join("");
  async function all() {
    const result = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await sb
        .from("rate_addons")
        .select("*")
        .order("name")
        .order("id")
        .range(start, start + 499);
      if (error) throw error;
      result.push(...(data || []));
      if ((data || []).length < 500) return result;
    }
  }
  async function write(query) {
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }
  const priceInput = (amount) =>
    `<input name="amount" type="number" min="0" max="1000000" step="0.01" value="${amount ?? ""}" placeholder="À définir">`;
  function submit(form, fn) {
    form.onsubmit = async (event) => {
      event.preventDefault();
      const button = form.querySelector(
        "button[type=submit],button:not([type])",
      );
      button.disabled = true;
      const draft = Drafts.begin(form);
      try {
        await fn(new FormData(form));
        Drafts.finish(draft, true);
      } catch (e) {
        Drafts.finish(draft, false);
        ERR(e);
      } finally {
        button.disabled = false;
      }
    };
  }
  const data = (fd) => ({
    name: String(fd.get("name") || "").trim(),
    amount: fd.get("amount") === "" ? null : Number(fd.get("amount")),
    unit: fd.get("unit"),
    event_type: fd.get("event_type") || null,
    description: String(fd.get("description") || "").trim(),
    active: fd.has("active"),
  });
  function catalogFields(row = {}) {
    return `<div class="row-2"><label>Nom de l’option<input name="name" required maxlength="200" value="${esc(row.name || "")}" placeholder="Ex. Accès au logiciel Syntra"></label><label>Prix unitaire (€)${priceInput(row.amount)}</label><label>Unité<select name="unit">${opts(units, row.unit || "forfait")}</select></label><label>Type de prestation<select name="event_type">${EventTypes.options(row.event_type, "Toutes les prestations")}</select></label><label class="span-2">Description<textarea name="description" maxlength="2000" rows="2">${esc(row.description || "")}</textarea></label><label class="check"><input name="active" type="checkbox" ${row.active !== false ? "checked" : ""}>Proposer cette option dans les projets</label></div>`;
  }
  async function catalog() {
    const root = $("#tariff-addons-catalog");
    if (!root || me.role !== "admin") return;
    const rows = await all();
    if (!root.isConnected) return;
    root.innerHTML = `<h2>Options et prestations additionnelles</h2><p class="tool-note">Créez vos suppléments au forfait, à l’heure ou à l’unité. Un prix vide reste à définir ; 0 € signifie offert. Modifier le catalogue ne change pas les options déjà appliquées aux projets.</p><details class="card addon-new"><summary>Créer une option</summary><form id="addon-catalog-new" class="stack">${catalogFields()}<button class="btn primary">Créer l’option</button></form></details><div class="addon-catalog-list">${rows.map((row) => `<details class="addon-catalog-item"><summary><span>${esc(row.name)}${row.active ? "" : " · Inactive"}</span><span class="muted">${row.amount == null ? "Prix à définir" : fmtEur(row.amount)}${row.amount == null ? "" : " / " + units[row.unit].toLowerCase()}</span></summary><form class="stack" id="addon-catalog-${esc(row.id)}" data-addon-catalog="${esc(row.id)}">${catalogFields(row)}<button class="btn">Enregistrer l’option</button></form></details>`).join("") || '<p class="empty">Aucune option. Créez votre premier supplément.</p>'}</div>`;
    const save = async (fd, id) => {
      const payload = data(fd);
      if (!payload.name) throw Error("Renseignez le nom de l’option.");
      await write(
        (id
          ? sb.from("rate_addons").update(payload).eq("id", id)
          : sb.from("rate_addons").insert(payload)
        )
          .select("id")
          .single(),
      );
      toast("Option enregistrée");
    };
    submit($("#addon-catalog-new"), async (fd) => {
      await save(fd);
      Drafts.clear($("#addon-catalog-new"));
      await catalog();
    });
    root.querySelectorAll("[data-addon-catalog]").forEach((form) =>
      submit(form, async (fd) => {
        await save(fd, form.dataset.addonCatalog);
        Drafts.clear(form);
        await catalog();
      }),
    );
  }
  async function project(p, payments, reload) {
    const root = $("#project-addons");
    if (!root || me.role !== "admin") return;
    const catalogue = await all();
    if (!root.isConnected) return;
    const rows = payments.filter((x) => x.is_addon),
      eligible = catalogue.filter(
        (x) => x.active && (!x.event_type || x.event_type === p.event_type),
      );
    root.innerHTML = `<div class="tool-toolbar"><div><h2>Options du projet</h2><p class="tool-note">Ajoutez les prestations complémentaires au tarif de base.</p></div><a class="btn small" href="#/compte?options=1">Configurer les options</a></div><p class="addon-subtotal">Total des options : <strong>${fmtEur(rows.reduce((s, x) => s + Number(x.amount), 0))}</strong></p><div class="addon-applied-list">${rows.map((x) => `<div class="addon-applied"><div><strong>${esc(x.label)}</strong><p class="muted">${Number(x.quantity).toLocaleString("fr-FR")} × ${fmtEur(x.unit_price)} / ${units[x.addon_unit || "forfait"].toLowerCase()} · ${fmtEur(x.amount)}</p>${x.addon_description ? `<p class="muted">${esc(x.addon_description)}</p>` : ""}</div><button class="btn small" type="button" data-edit-addon="${esc(x.id)}">Modifier</button></div>`).join("") || '<p class="empty">Aucune option ajoutée au projet.</p>'}</div><details class="addon-editor" id="project-addon-editor"><summary>Ajouter ou modifier une option</summary><form id="project-addon-form" class="stack"><input type="hidden" name="record_id"><input type="hidden" name="source_id"><label>Option du catalogue<select name="catalog"><option value="">— Choisir une option —</option>${eligible.map((x) => `<option value="${esc(x.id)}">${esc(x.name)} · ${x.amount == null ? "Prix à définir" : fmtEur(x.amount)}</option>`).join("")}<option value="custom">Option personnalisée pour ce projet</option></select></label><div class="row-2"><label>Libellé sur le devis<input name="label" maxlength="200" required></label><label>Quantité<input type="number" name="quantity" min="0.001" max="1000000" step="0.001" value="1" required></label><label>Unité<select name="unit">${opts(units, "forfait")}</select></label><label>Prix unitaire (€)<input type="number" name="unit_price" min="0" max="1000000" step="0.01" required></label><label>Description<textarea name="description" maxlength="2000" rows="2"></textarea></label></div><p>Total de cette option : <strong id="project-addon-total">—</strong></p><div class="actions"><button class="btn primary">Enregistrer l’option au projet</button><button type="button" class="btn" id="reset-project-addon">Nouvelle option</button></div></form></details><p class="tool-note addon-access-note">Ces options sont des lignes de devis. L’option Syntra ne crée ni ne retire automatiquement un accès au logiciel.</p>`;
    const form = $("#project-addon-form"),
      el = form.elements;
    const refresh = () => {
      $("#project-addon-total").textContent =
        el.unit_price.value === ""
          ? "Prix à définir"
          : fmtEur(
              lineAmount(
                Number(el.quantity.value),
                Number(el.unit_price.value),
              ),
            );
    };
    form.addEventListener("input", refresh);
    el.catalog.onchange = () => {
      const option = catalogue.find((x) => x.id === el.catalog.value);
      el.source_id.value = option?.id || "";
      if (option) {
        el.label.value = option.name;
        el.unit_price.value = option.amount ?? "";
        el.description.value = option.description || "";
        el.unit.value = option.unit;
      }
      refresh();
      form.dispatchEvent(new Event("input", { bubbles: true }));
    };
    $("#reset-project-addon").onclick = () => {
      Drafts.clear(form);
      form.reset();
      el.record_id.value = "";
      el.source_id.value = "";
      refresh();
    };
    root.querySelectorAll("[data-edit-addon]").forEach(
      (button) =>
        (button.onclick = () => {
          if (
            (el.record_id.value || el.label.value) &&
            !confirm("Remplacer la saisie en cours par cette option ?")
          )
            return;
          const row = rows.find((x) => x.id === button.dataset.editAddon);
          Drafts.clear(form);
          el.record_id.value = row.id;
          el.source_id.value = row.addon_id || "";
          el.catalog.value = eligible.some((x) => x.id === row.addon_id)
            ? row.addon_id
            : "custom";
          el.label.value = row.label;
          el.quantity.value = row.quantity;
          el.unit_price.value = row.unit_price;
          el.description.value = row.addon_description || "";
          el.unit.value = row.addon_unit || "forfait";
          $("#project-addon-editor").open = true;
          refresh();
          form.dispatchEvent(new Event("input", { bubbles: true }));
          form.scrollIntoView({ block: "center" });
        }),
    );
    Drafts.restore(form);
    refresh();
    submit(form, async (fd) => {
      if (!fd.get("catalog") && !fd.get("record_id"))
        throw Error(
          "Choisissez une option du catalogue ou une option personnalisée.",
        );
      const quantity = Number(fd.get("quantity")),
        unit_price = Number(fd.get("unit_price")),
        amount = lineAmount(quantity, unit_price);
      if (!Number.isFinite(amount) || amount > 99999999.99)
        throw Error("Le total de cette option est trop élevé.");
      const payload = {
        label: String(fd.get("label")).trim(),
        quantity,
        unit_price,
        amount,
        is_addon: true,
        addon_unit: fd.get("unit"),
        is_base: false,
        addon_id: fd.get("source_id") || null,
        addon_description: String(fd.get("description") || "").trim(),
      };
      const id = fd.get("record_id");
      await write(
        (id
          ? sb
              .from("project_payments")
              .update(payload)
              .eq("id", id)
              .eq("project_id", p.id)
              .eq("is_addon", true)
          : sb.from("project_payments").insert({ ...payload, project_id: p.id })
        )
          .select("id")
          .single(),
      );
      Drafts.clear(form);
      toast("Option enregistrée au projet");
      await reload();
    });
  }
  return { catalog, project };
})();
