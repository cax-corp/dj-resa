/* Event operations. Uses the existing authenticated Supabase client and UI helpers. */
const EventTools = (() => {
  const admin = () => me?.role === 'admin';
  const empty = (text) => `<p class="empty">${esc(text || 'Aucun élément pour le moment.')}</p>`;
  const field = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });
  const optionList = (values, selected) =>
    Object.entries(values)
      .map(
        ([value, label]) =>
          `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`
      )
      .join('');
  const ST = { pending: 'En attente', confirmed: 'Confirmé', declined: 'Décliné' };
  const REQUEST_ST = {
    pending: 'À examiner',
    accepted: 'Accepté',
    rejected: 'Refusé',
    played: 'Joué',
  };
  const GEAR_ST = {
    reserved: 'À préparer',
    loaded: 'Prêt à emporter',
    returned: 'Rangé',
    cancelled: 'Retiré',
  };
  const LEAD_ST = {
    new: 'Nouvelle',
    contacted: 'Contacté',
    quote: 'Devis en cours',
    won: 'Acceptée',
    lost: 'Perdue',
  };
  const priorityNames = { low: 'Basse', normal: 'Normale', urgent: 'Urgente' };
  const taskState = (t) => (t.done ? 'done' : t.progress_state === 'doing' ? 'doing' : 'todo');
  const projectUrl = (id) => `#/${admin() ? 'admin/projets' : 'projets'}/${id}`;
  const toolsUrl = (id, section) => `#/outils/${encodeURIComponent(id)}?section=${section}`;
  const publicUrl = (kind, token) =>
    `${location.origin}${location.pathname}#/${kind === 'music' ? 'invites' : kind === 'feedback' ? 'avis' : 'demande'}/${token}`;
  const projectOptions = (projects) =>
    Object.fromEntries(projects.map((p) => [p.id, p.title + (p.archived_at ? ' · Archivé' : '')]));
  const guestFields = [
    field('full_name', 'Nom complet', 'text', { required: true, max: 200 }),
    field('email', 'Email', 'email', { max: 254 }),
    field('phone', 'Téléphone', 'tel', { max: 50 }),
    field('response', 'Réponse', 'select', { options: ST }),
    field('companions', 'Accompagnants', 'number', { required: true, min: 0, max: 20, value: 0 }),
    field('table_name', 'Table / groupe', 'text', { max: 100 }),
    field('dietary', 'Allergies et besoins alimentaires', 'textarea', { max: 1000 }),
    field('notes', 'Notes', 'textarea', { max: 2000 }),
  ];
  const contactFields = [
    field('full_name', 'Nom complet', 'text', { required: true, max: 200 }),
    field('role', 'Rôle (traiteur, témoin…)', 'text', { max: 150 }),
    field('company', 'Société', 'text', { max: 200 }),
    field('email', 'Email', 'email', { max: 254 }),
    field('phone', 'Téléphone', 'tel', { max: 50 }),
    field('notes', 'Consignes', 'textarea', { max: 2000 }),
  ];
  const equipmentFields = [
    field('name', 'Nom du matériel', 'text', { required: true, max: 200 }),
    field('category', 'Catégorie', 'text', { max: 100 }),
    field('units', 'Quantité que je possède', 'number', {
      required: true,
      min: 1,
      max: 10000,
      value: 1,
    }),
    field('reference', 'Référence / numéro de série', 'text', { max: 200 }),
    field('notes', 'Notes et entretien', 'textarea', { max: 2000 }),
    field('active', 'Proposé dans les projets', 'checkbox', { value: true }),
  ];
  const venueFields = [
    field('name', 'Nom du lieu', 'text', { required: true, max: 200 }),
    field('address', 'Adresse', 'text', { max: 500 }),
    field('contact_name', 'Contact sur place', 'text', { max: 200 }),
    field('phone', 'Téléphone', 'tel', { max: 50 }),
    field('access_notes', 'Accès, stationnement, chargement', 'textarea', { max: 2000 }),
    field('power_notes', 'Alimentation électrique', 'textarea', { max: 2000 }),
    field('sound_notes', 'Limiteur sonore et horaires', 'textarea', { max: 2000 }),
    field('notes', 'Autres notes', 'textarea', { max: 2000 }),
  ];

  async function rows(table, filters = {}, order = 'created_at', select = '*') {
    const result = [];
    for (let offset = 0; ; offset += 500) {
      let query = sb.from(table).select(select);
      for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
      if (order) query = query.order(order);
      if (order !== 'id') query = query.order('id');
      const { data, error } = await query.range(offset, offset + 499);
      if (error) throw error;
      const batch = data || [];
      result.push(...batch);
      if (batch.length < 500) return result;
    }
  }
  async function one(table, id) {
    const { data, error } = await sb.from(table).select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  }
  async function write(query, message = 'Enregistré') {
    const { data, error } = await query;
    if (error) throw error;
    if (message) toast(message);
    return data;
  }
  function submit(form, callback) {
    form.onsubmit = async (event) => {
      event.preventDefault();
      const buttons = $$('button', form);
      buttons.forEach((b) => (b.disabled = true));
      const draft = Drafts.begin(form);
      try {
        await callback(form);
        Drafts.finish(draft, true);
      } catch (error) {
        Drafts.finish(draft, false);
        ERR(error);
      } finally {
        buttons.forEach((b) => (b.disabled = false));
      }
    };
  }
  function handle(selector, callback, root = app) {
    $$(selector, root).forEach(
      (button) =>
        (button.onclick = async (event) => {
          event.preventDefault();
          button.disabled = true;
          try {
            await callback(button);
          } catch (error) {
            ERR(error);
          } finally {
            button.disabled = false;
          }
        })
    );
  }
  function fieldsHTML(fields, values = {}) {
    return fields
      .map((f) => {
        const value = values[f.key] ?? f.value ?? '';
        const attrs = `name="${f.key}" ${f.required ? 'required' : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `${f.type === 'number' ? 'max' : 'maxlength'}="${f.max}"` : ''}`;
        if (f.type === 'checkbox')
          return `<label class="check"><input type="checkbox" ${attrs} ${value ? 'checked' : ''}><span>${esc(f.label)}</span></label>`;
        const input =
          f.type === 'textarea'
            ? `<textarea ${attrs} rows="3">${esc(value)}</textarea>`
            : f.type === 'select'
              ? `<select ${attrs}>${optionList(f.options, value)}</select>`
              : `<input ${attrs} type="${f.type}" value="${esc(value)}" ${f.type === 'number' ? `step="${f.step || 1}"` : ''}>`;
        return `<label class="${f.type === 'textarea' ? 'span-2' : ''}">${esc(f.label)}${input}</label>`;
      })
      .join('');
  }
  function valuesOf(form, fields) {
    const fd = new FormData(form);
    return Object.fromEntries(
      fields.map((f) => [
        f.key,
        f.type === 'checkbox'
          ? fd.has(f.key)
          : f.type === 'number'
            ? fd.get(f.key) === ''
              ? null
              : Number(fd.get(f.key))
            : String(fd.get(f.key) || '').trim(),
      ])
    );
  }
  function fill(form, fields, values) {
    fields.forEach((f) => {
      const el = form.elements.namedItem(f.key);
      if (f.type === 'checkbox') el.checked = values[f.key] ?? f.value ?? false;
      else el.value = values[f.key] ?? f.value ?? '';
    });
  }
  const mini = (label, value) =>
    `<div class="tool-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  const note = (text) => `<p class="tool-note">${esc(text)}</p>`;
  const head = (title, subtitle, actions = '') =>
    `<div class="page-head"><div><p class="eyebrow">Espace de travail</p><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${actions}</div>`;
  const editButtons = (id) =>
    `<div class="tool-row-actions"><button class="btn small" data-edit="${id}">Modifier</button><button class="btn small" data-remove="${id}">Retirer</button></div>`;
  const contactLines = (x) =>
    `<p class="muted">${esc([x.role, x.company].filter(Boolean).join(' · '))}</p><p>${x.email ? `<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : ''}${x.phone ? ` <a href="tel:${phoneHref(x.phone)}">${esc(x.phone)}</a>` : ''}</p>`;

  // Reusable inline editor: all mutations retain the fixed project scope.
  function collection({
    table,
    title,
    fields,
    items,
    fixed = {},
    render,
    canEdit = true,
    after,
    extra = '',
  }) {
    const root = $('#tool-content');
    root.innerHTML = `${extra}${canEdit ? `<details class="card tool-editor" id="tool-editor"><summary>Ajouter · ${esc(title)}</summary><form id="tool-editor-form" class="stack"><input type="hidden" name="record_id"><div class="row-2">${fieldsHTML(fields)}</div><div class="actions"><button class="btn primary">Enregistrer</button><button type="button" id="editor-reset" class="btn">Nouveau</button></div></form></details>` : ''}
      <div class="tool-list">${items.map((item) => `<article class="card tool-row"><div class="tool-row-content">${render(item)}</div>${canEdit ? editButtons(item.id) : ''}</article>`).join('') || empty()}</div>`;
    if (!canEdit) return;
    const form = $('#tool-editor-form');
    submit(form, async () => {
      const id = form.elements.record_id.value;
      const payload = { ...valuesOf(form, fields), ...fixed };
      let q = id ? sb.from(table).update(payload).eq('id', id) : sb.from(table).insert(payload);
      if (id) for (const [k, v] of Object.entries(fixed)) q = q.eq(k, v);
      await write(q.select('id').single());
      await after();
    });
    $('#editor-reset').onclick = () => {
      Drafts.clear(form);
      form.reset();
      form.elements.record_id.value = '';
    };
    handle('[data-edit]', async (button) => {
      const item = items.find((x) => x.id === button.dataset.edit);
      fill(form, fields, item);
      form.elements.record_id.value = item.id;
      $('#tool-editor').open = true;
      $('#tool-editor').scrollIntoView({ block: 'start' });
      $('input:not([type="hidden"]),select,textarea', form)?.focus();
    });
    handle('[data-remove]', async (button) => {
      if (!confirm('Retirer cet élément ?')) return;
      let q = sb.from(table).delete().eq('id', button.dataset.remove);
      for (const [k, v] of Object.entries(fixed)) q = q.eq(k, v);
      await write(q.select('id').single(), 'Élément retiré');
      await after();
    });
  }

  function csv(name, headers, data) {
    const cell = (value) => {
      let s = String(value ?? '');
      if (/^[=+\-@\t\r]/.test(s.trimStart())) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const content =
      '\ufeff' + [headers, ...data].map((row) => row.map(cell).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Lien copié');
    } catch {
      toast('La copie automatique est indisponible. Sélectionnez le lien dans le champ.', false);
    }
  }
  function linkCard(link) {
    const url = publicUrl(link.kind, link.token);
    return `<article class="card form-link"><div class="actions"><strong>${link.is_open ? 'Formulaire ouvert' : 'Formulaire fermé'}</strong><span class="muted">${fmtDateTime(link.created_at)}</span></div><div class="share-actions"><input readonly value="${esc(url)}" aria-label="Lien du formulaire"><button class="btn small" data-copy-form="${link.token}">Copier</button><button class="btn small" data-qr="${link.token}">QR code</button><button class="btn small" data-download-qr="${link.token}">Télécharger le QR en PNG</button><button class="btn small" data-close-form="${link.token}" data-open="${link.is_open ? 'false' : 'true'}">${link.is_open ? 'Fermer' : 'Rouvrir'}</button></div><div class="qr-preview hidden" id="qr-${link.token}"></div></article>`;
  }
  function bindLinks(links, reload) {
    handle('[data-copy-form]', (button) =>
      copy(
        publicUrl(
          links.find((x) => x.token === button.dataset.copyForm).kind,
          button.dataset.copyForm
        )
      )
    );
    handle('[data-qr]', async (button) => {
      const token = button.dataset.qr;
      const target = document.getElementById('qr-' + token);
      const link = links.find((x) => x.token === token);
      if (!target.innerHTML) {
        const qr = qrcode(0, 'M');
        qr.addData(publicUrl(link.kind, token));
        qr.make();
        target.innerHTML =
          qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true }) +
          `<p>Scanner pour ouvrir le formulaire</p>`;
      }
      target.classList.toggle('hidden');
    });
    handle('[data-download-qr]', async (button) => {
      const link = links.find((x) => x.token === button.dataset.downloadQr);
      await Enhancements.downloadQR(publicUrl(link.kind, link.token), `${link.kind}-qr-code.png`);
    });
    handle('[data-close-form]', async (button) => {
      await write(
        sb
          .from('event_form_links')
          .update({ is_open: button.dataset.open === 'true' })
          .eq('token', button.dataset.closeForm)
          .select('id')
          .single(),
        'Formulaire mis à jour'
      );
      await reload();
    });
  }

  async function projectTools(id, section = 'guests') {
    const p = await one('projects', id);
    const editable = admin() || p.status !== 'termine';
    const sections = {
      guests: 'Invités',
      requests: 'Demandes musicales',
      conductor: 'Planning',
      contacts: 'Contacts',
      documents: 'Documents',
      equipment: 'Matériel',
      venue: 'Lieu',
      debrief: 'Bilan',
    };
    const adminOnly = ['requests', 'equipment', 'venue', 'debrief'];
    if (!sections[section] || (!admin() && adminOnly.includes(section))) section = 'guests';
    app.innerHTML = `<a class="back" href="${projectUrl(id)}">← Retour au projet</a>${head(p.title, 'Outils de préparation et de suivi de l’événement')}<div class="tool-tabs" role="navigation" aria-label="Outils du projet">${Object.entries(
      sections
    )
      .filter(([k]) => admin() || !adminOnly.includes(k))
      .map(
        ([k, label]) =>
          `<a href="${toolsUrl(id, k)}" class="${k === section ? 'active' : ''}" ${k === section ? 'aria-current="page"' : ''}>${label}</a>`
      )
      .join('')}</div><div id="tool-content" aria-live="polite">${empty('Chargement…')}</div>`;
    const reload = () => projectTools(id, section);
    if (section === 'guests') {
      const items = await rows('project_guests', { project_id: id }, 'full_name');
      collection({
        table: 'project_guests',
        title: 'un invité',
        fields: guestFields,
        items,
        fixed: { project_id: id },
        canEdit: editable,
        after: reload,
        extra: `<div class="tool-metrics">${mini('Invités', items.length)}${mini(
          'Présents confirmés',
          items.filter((x) => x.response === 'confirmed').reduce((n, x) => n + 1 + x.companions, 0)
        )}${mini('En attente', items.filter((x) => x.response === 'pending').length)}</div><div class="tool-toolbar"><input id="guest-search" type="search" placeholder="Rechercher un invité, une table…" aria-label="Rechercher un invité"><button class="btn" id="export-guests">Exporter CSV</button><button class="btn" id="print-guests">Imprimer la liste</button></div>${note('Les allergies et coordonnées restent dans l’espace connecté du projet. Elles ne sont pas exposées par les liens publics.')}`,
        render: (x) =>
          `<strong>${esc(x.full_name)}</strong><span class="status">${ST[x.response]}</span><p>${x.companions} accompagnant(s)${x.table_name ? ' · ' + esc(x.table_name) : ''}</p>${contactLines(x)}${x.dietary ? `<p class="warn-text">Besoins : ${esc(x.dietary)}</p>` : ''}<p class="pre">${esc(x.notes)}</p>`,
      });
      Enhancements.mountGuestBulk(p, items, reload, editable);
      const guestSheet = GuestSheet.mount(p, items, reload, editable);
      $('#print-guests').onclick = () => Enhancements.printGuests(p, guestSheet.current());
      $('#export-guests').onclick = () =>
        csv(
          'invites.csv',
          ['Nom', 'Réponse', 'Accompagnants', 'Table', 'Email', 'Téléphone', 'Besoins', 'Notes'],
          guestSheet
            .current()
            .map((x) => [
              x.full_name,
              ST[x.response],
              x.companions,
              x.table_name,
              x.email,
              x.phone,
              x.dietary,
              x.notes,
            ])
        );
      $('#guest-search').oninput = (event) => {
        guestSheet.filter(event.target.value);
        $$('.tool-list .tool-row').forEach(
          (row) =>
            (row.hidden = !row.textContent.toLowerCase().includes(event.target.value.toLowerCase()))
        );
      };
    }
    if (section === 'contacts') {
      const items = await rows('project_contacts', { project_id: id }, 'full_name');
      collection({
        table: 'project_contacts',
        title: 'un contact / prestataire',
        fields: contactFields,
        items,
        fixed: { project_id: id },
        canEdit: editable,
        after: reload,
        render: (x) =>
          `<strong>${esc(x.full_name)}</strong>${contactLines(x)}<p class="pre">${esc(x.notes)}</p>`,
      });
    }
    if (section === 'requests') await musicRequests(p, reload);
    if (section === 'conductor') await conductor(p, editable, reload);
    if (section === 'equipment') await projectEquipment(p, reload);
    if (section === 'documents') await documents(p, reload);
    if (section === 'venue') await projectVenue(p, reload);
    if (section === 'debrief') await debrief(p, reload);
  }

  async function musicRequests(p, reload) {
    const [items, links] = await Promise.all([
      rows('guest_music_requests', { project_id: p.id }),
      rows('event_form_links', { project_id: p.id, kind: 'music' }),
    ]);
    $('#tool-content').innerHTML =
      `<div class="tool-toolbar"><h2>Suggestions des invités</h2><button class="btn primary" id="create-music-form">Créer un lien invité</button></div>${note('Le QR code est généré ici, sans transmettre le lien à un service tiers. Les invités proposent des titres ; vous seul décidez de leur traitement. Fermez le formulaire à tout moment.')}<div class="tool-list">${links.map(linkCard).join('')}</div><div class="tool-toolbar"><label>Filtrer<select id="music-filter">${optionList({ '': 'Toutes les demandes', ...REQUEST_ST }, '')}</select></label><button class="btn" id="refresh-requests">Actualiser</button></div><div class="tool-list" id="music-requests">${items.map((x) => `<article class="card tool-row" data-request-status="${x.status}"><div class="tool-row-content"><strong>${esc(x.title)}</strong> — ${esc(x.artist)}<p class="muted">${esc(x.guest_name || 'Invité')} · ${fmtDateTime(x.created_at)}</p><p class="pre">${esc(x.note)}</p></div><label>Traitement<select data-request="${x.id}" aria-label="Traitement de ${esc(x.title)}">${optionList(REQUEST_ST, x.status)}</select></label></article>`).join('') || empty('Aucune suggestion reçue.')}</div>`;
    handle('#create-music-form', async () => {
      await write(
        sb
          .from('event_form_links')
          .insert({ project_id: p.id, kind: 'music' })
          .select('id')
          .single(),
        'Lien créé'
      );
      await reload();
    });
    bindLinks(links, reload);
    $('#refresh-requests').onclick = () => reload().catch(ERR);
    $('#music-filter').onchange = (event) =>
      $$('[data-request-status]').forEach(
        (row) =>
          (row.hidden = !!event.target.value && row.dataset.requestStatus !== event.target.value)
      );
    $$('[data-request]').forEach(
      (select) =>
        (select.onchange = async () => {
          select.disabled = true;
          try {
            await write(
              sb
                .from('guest_music_requests')
                .update({ status: select.value })
                .eq('id', select.dataset.request)
                .eq('project_id', p.id)
                .select('id')
                .single()
            );
            await reload();
          } catch (e) {
            ERR(e);
            select.disabled = false;
          }
        })
    );
  }

  async function conductor(p, editable, reload) {
    const items = await rows('schedule_items', { project_id: p.id }, 'start_time');
    const fields = [
      field('start_time', 'Début', 'time', { required: true }),
      field('end_time', 'Fin', 'time'),
      field('kind', 'Type', 'select', { options: SCHEDULE_KIND }),
      field('title', 'Moment / séquence', 'text', { required: true, max: 200 }),
      field('speaker', 'Intervenant', 'text', { max: 200 }),
      field('song', 'Morceau / référence musicale', 'text', { max: 300 }),
      field('details', 'Déroulé', 'textarea', { max: 2000 }),
      field('cue', 'Consigne de lancement', 'textarea', { max: 2000 }),
    ];
    collection({
      table: 'schedule_items',
      title: 'une séquence',
      fields,
      items,
      fixed: { project_id: p.id },
      canEdit: editable,
      after: reload,
      extra: `<div class="tool-toolbar"><h2>Planning de l’événement</h2><button class="btn" id="live-mode">Mode direct</button><button class="btn" id="print-conductor">Imprimer</button></div>${note('Renseignez le début et la fin de chaque créneau pour calculer les heures de travail. Une seule séquence peut être marquée en cours à la fois.')}${WorkHours.render(items)}`,
      render: (x) =>
        `<div class="conductor-step ${x.run_state === 'current' ? 'is-current' : ''}"><div class="conductor-time">${hm(x.start_time)}${x.end_time ? ' – ' + hm(x.end_time) : ''}</div><p class="work-duration">${WorkHours.duration(x) === null ? 'Durée à compléter' : WorkHours.format(WorkHours.duration(x))}${x.end_time && x.end_time < x.start_time ? ' · fin le lendemain' : ''}</p><strong>${esc(x.title)}</strong><span class="status">${{ pending: 'À venir', current: 'En cours', done: 'Terminé' }[x.run_state || 'pending']}</span><p>${esc(x.speaker)}${x.song ? ' · ♫ ' + esc(x.song) : ''}</p><p class="pre">${esc(x.details)}</p>${x.cue ? `<p class="conductor-cue">${esc(x.cue)}</p>` : ''}${editable ? `<div class="actions no-print"><button class="btn small" data-step="${x.id}" data-state="current">Lancer</button><button class="btn small" data-step="${x.id}" data-state="done">Terminer</button><button class="btn small" data-step="${x.id}" data-state="pending">Réinitialiser</button></div>` : ''}</div>`,
    });
    // Optional end time must be SQL NULL, not an empty time literal.
    const form = $('#tool-editor-form');
    if (form)
      submit(form, async () => {
        const key = form.elements.record_id.value;
        const values = { ...valuesOf(form, fields), project_id: p.id };
        values.end_time = values.end_time || null;
        await write(
          (key
            ? sb.from('schedule_items').update(values).eq('id', key).eq('project_id', p.id)
            : sb.from('schedule_items').insert(values)
          )
            .select('id')
            .single()
        );
        await reload();
      });
    handle('[data-step]', async (button) => {
      await write(
        sb.rpc('set_conductor_step', {
          step_id: button.dataset.step,
          next_state: button.dataset.state,
        }),
        'Planning mis à jour'
      );
      await reload();
    });
    $('#live-mode').onclick = () => {
      const root = $('#tool-content');
      root.classList.toggle('conductor-live');
      $('#live-mode').textContent = root.classList.contains('conductor-live')
        ? 'Quitter le mode direct'
        : 'Mode direct';
    };
    $('#print-conductor').onclick = () => {
      document.body.dataset.view = 'conductor';
      window.print();
      document.body.dataset.view = '';
    };
  }

  async function projectEquipment(p, reload) {
    const [items, stock, allChoices, projects] = await Promise.all([
      rows('equipment_reservations', { project_id: p.id }),
      rows('equipment', {}, 'name'),
      rows('equipment_reservations'),
      rows('projects'),
    ]);
    const selected = items.filter((item) => item.state !== 'cancelled');
    const available = stock.filter(
      (gear) => gear.active && !selected.some((item) => item.equipment_id === gear.id)
    );
    const fields = [
      field('equipment_id', 'Choisir dans mon matériel', 'select', {
        required: true,
        options: Object.fromEntries(
          available.map((gear) => [gear.id, `${gear.name} · ${gear.units} en ma possession`])
        ),
      }),
      field('quantity', 'Quantité à emporter', 'number', {
        required: true,
        min: 1,
        max: 10000,
        value: 1,
      }),
    ];
    const overlaps = (gearId) => {
      if (!p.event_date) return [];
      return projects.filter(
        (other) =>
          other.id !== p.id &&
          other.event_date === p.event_date &&
          !other.archived_at &&
          other.status !== 'termine' &&
          allChoices.some(
            (choice) =>
              choice.project_id === other.id &&
              choice.equipment_id === gearId &&
              choice.state !== 'cancelled'
          )
      );
    };
    $('#tool-content').innerHTML =
      `<div class="tool-toolbar"><h2>Matériel à utiliser pour ce projet</h2><a class="btn" href="#/materiel">Mon matériel</a><button class="btn" id="export-packing">Exporter la checklist</button><button class="btn" id="print-packing">Imprimer les cases à cocher</button></div>
      ${note('Choisissez les éléments de votre propre inventaire et les quantités à emporter. Cochez chaque ligne une fois le matériel prêt.')}
      <div class="tool-metrics">${mini('Éléments choisis', selected.length)}${mini('Prêts à emporter', selected.filter((item) => item.state === 'loaded').length)}${mini('À préparer', selected.filter((item) => item.state !== 'loaded').length)}</div>
      <section class="card"><form id="gear-selection-form" class="stack"><div class="row-2">${fieldsHTML(fields)}</div><button class="btn primary" ${available.length ? '' : 'disabled'}>Ajouter au projet</button></form>
        ${!stock.some((gear) => gear.active) ? '<p class="tool-note">Commencez par ajouter ce que vous possédez dans <a href="#/materiel">Mon matériel</a>.</p>' : !available.length ? '<p class="tool-note">Tout votre matériel disponible figure déjà dans la sélection.</p>' : ''}</section>
      <div class="tool-list">${
        selected
          .map((item) => {
            const gear = stock.find((gear) => gear.id === item.equipment_id);
            const others = overlaps(item.equipment_id);
            return `<article class="card tool-row"><div class="tool-row-content"><strong>${esc(gear?.name || 'Matériel')}</strong><p class="muted">${esc(gear?.category || '')}${gear?.reference ? ' · ' + esc(gear.reference) : ''}</p>
          ${item.state === 'returned' ? '<span class="status">Rangé</span>' : ''}
          ${item.quantity > (gear?.units || 0) ? '<p class="warn-text">La quantité choisie dépasse votre inventaire actuel.</p>' : ''}
          ${others.length ? `<p class="warn-text">Également prévu le même jour sur : ${others.map((other) => `<a href="${toolsUrl(other.id, 'equipment')}">${esc(other.title)}</a>`).join(', ')}. Vérifiez votre organisation.</p>` : ''}
          <label class="check gear-prepared"><input type="checkbox" data-gear-ready="${item.id}" ${item.state === 'loaded' ? 'checked' : ''}><span>Prêt à emporter</span></label></div>
          <form class="gear-quantity-form" data-gear-quantity="${item.id}"><label>Quantité à emporter<input name="quantity" type="number" required min="1" max="${gear?.units || 10000}" value="${item.quantity}"></label><button class="btn small">Enregistrer</button></form>
          <button type="button" class="btn small" data-remove-gear="${item.id}">Retirer du projet</button></article>`;
          })
          .join('') || empty('Aucun matériel choisi pour ce projet.')
      }</div>`;
    submit($('#gear-selection-form'), async (form) => {
      const values = valuesOf(form, fields);
      const gear = available.find((gear) => gear.id === values.equipment_id);
      if (!gear || values.quantity > gear.units)
        throw new Error('Choisissez une quantité comprise dans ce que vous possédez.');
      const previous = items.find(
        (item) => item.equipment_id === gear.id && item.state === 'cancelled'
      );
      const query = previous
        ? sb
            .from('equipment_reservations')
            .update({ quantity: values.quantity, state: 'reserved' })
            .eq('id', previous.id)
            .eq('project_id', p.id)
        : sb.from('equipment_reservations').insert({
            ...values,
            project_id: p.id,
            starts_on: p.event_date || today(),
            ends_on: p.event_date || today(),
            state: 'reserved',
          });
      await write(query.select('id').single(), 'Matériel ajouté au projet');
      await reload();
    });
    $$('[data-gear-ready]').forEach(
      (checkbox) =>
        (checkbox.onchange = async () => {
          checkbox.disabled = true;
          try {
            await write(
              sb
                .from('equipment_reservations')
                .update({ state: checkbox.checked ? 'loaded' : 'reserved' })
                .eq('id', checkbox.dataset.gearReady)
                .eq('project_id', p.id)
                .select('id')
                .single(),
              'Checklist mise à jour'
            );
            await reload();
          } catch (error) {
            checkbox.checked = !checkbox.checked;
            ERR(error);
            checkbox.disabled = false;
          }
        })
    );
    $$('[data-gear-quantity]').forEach((form) =>
      submit(form, async () => {
        await write(
          sb
            .from('equipment_reservations')
            .update({ quantity: Number(new FormData(form).get('quantity')) })
            .eq('id', form.dataset.gearQuantity)
            .eq('project_id', p.id)
            .select('id')
            .single()
        );
        await reload();
      })
    );
    handle('[data-remove-gear]', async (button) => {
      await write(
        sb
          .from('equipment_reservations')
          .update({ state: 'cancelled' })
          .eq('id', button.dataset.removeGear)
          .eq('project_id', p.id)
          .select('id')
          .single(),
        'Matériel retiré de la sélection'
      );
      await reload();
    });
    $('#print-packing').onclick = () =>
      Enhancements.printList(
        p,
        'Matériel à emporter',
        ['Matériel', 'Quantité'],
        selected.map((item) => [
          stock.find((gear) => gear.id === item.equipment_id)?.name,
          item.quantity,
        ])
      );
    $('#export-packing').onclick = () =>
      csv(
        'materiel-projet.csv',
        ['Mon matériel', 'Quantité à emporter', 'Préparation'],
        selected.map((item) => [
          stock.find((gear) => gear.id === item.equipment_id)?.name,
          item.quantity,
          GEAR_ST[item.state],
        ])
      );
  }

  async function documents(p, reload) {
    const [items, links] = await Promise.all([
      rows('project_documents', { project_id: p.id }),
      admin() ? rows('document_read_links') : Promise.resolve([]),
    ]);
    $('#tool-content').innerHTML =
      `<div class="tool-toolbar"><h2>Documents du projet</h2></div>${note('Fichiers privés, 20 Mo maximum. PDF, images, texte, CSV, Word et Excel. Aucun document n’est ajouté automatiquement aux liens publics du projet.')}${admin() ? `<section class="card"><form id="document-form" class="stack"><label>Fichier<input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv,.doc,.docx,.xls,.xlsx" required></label><label class="check"><input type="checkbox" name="client_visible">Visible par le client connecté du projet</label><button class="btn primary">Importer le document</button></form></section>` : ''}<div class="tool-list">${items.map((x) => `<article class="card tool-row"><div class="tool-row-content"><strong>${esc(x.name)}</strong><p class="muted">${(x.size_bytes / 1024 / 1024).toFixed(2)} Mo · ${fmtDateTime(x.created_at)} · ${x.client_visible ? 'Visible par le client' : 'Interne'}</p><div id="doc-link-${x.id}"></div></div><div class="tool-row-actions"><a class="btn small" href="${DocumentViewer.privateURL(x.id)}" target="_blank" rel="noopener noreferrer">Ouvrir</a><button class="btn small" data-download="${x.id}">Télécharger</button>${admin() ? `<button class="btn small" data-doc-link="${x.id}">Partager un lien de lecture</button>${links.some((l) => l.document_id === x.id && l.active) ? `<button class="btn small" data-doc-revoke="${x.id}">Révoquer le lien</button>` : ''}<button class="btn small" data-doc-visible="${x.id}">${x.client_visible ? 'Masquer au client' : 'Montrer au client'}</button><button class="btn small" data-doc-delete="${x.id}">Retirer</button>` : ''}</div></article>`).join('') || empty('Aucun document.')}</div>`;
    if (admin())
      submit($('#document-form'), async (form) => {
        const file = form.elements.file.files[0];
        if (!file || file.size < 1 || file.size > 20971520)
          throw new Error('Choisissez un fichier entre 1 octet et 20 Mo.');
        const ext = file.name.split('.').pop().toLowerCase();
        const types = {
          pdf: 'application/pdf',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          png: 'image/png',
          webp: 'image/webp',
          txt: 'text/plain',
          csv: 'text/csv',
          doc: 'application/msword',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          xls: 'application/vnd.ms-excel',
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };
        if (!types[ext]) throw new Error('Ce format de fichier n’est pas accepté.');
        const path = p.id + '/' + crypto.randomUUID() + '.' + ext;
        await write(
          sb.storage
            .from('project-documents')
            .upload(path, file, { contentType: types[ext], upsert: false }),
          null
        );
        try {
          await write(
            sb
              .from('project_documents')
              .insert({
                project_id: p.id,
                name: file.name.slice(0, 250),
                storage_path: path,
                size_bytes: file.size,
                mime_type: types[ext],
                client_visible: form.elements.client_visible.checked,
              })
              .select('id')
              .single(),
            'Document importé'
          );
        } catch (error) {
          await sb.storage.from('project-documents').remove([path]);
          throw error;
        }
        await reload();
      });
    handle('[data-download]', (button) =>
      DocumentViewer.downloadPrivate(items.find((x) => x.id === button.dataset.download))
    );
    handle('[data-doc-link]', async (button) => {
      const doc = items.find((x) => x.id === button.dataset.docLink);
      let link = links.find((x) => x.document_id === doc.id && x.active);
      if (!link) {
        const result = await sb
          .from('document_read_links')
          .insert({ document_id: doc.id })
          .select('id,token,active,document_id')
          .single();
        if (result.error && result.error.code !== '23505') throw result.error;
        if (result.error) {
          const { data, error } = await sb
            .from('document_read_links')
            .select('*')
            .eq('document_id', doc.id)
            .eq('active', true)
            .single();
          if (error) throw error;
          link = data;
        } else link = result.data;
        links.push(link);
      }
      const url = DocumentViewer.shareURL(link.token);
      const target = document.getElementById('doc-link-' + doc.id);
      target.innerHTML = `<p class="muted">Toute personne disposant de ce lien peut consulter ce fichier jusqu’à sa révocation.</p><input readonly aria-label="Lien de lecture du document" value="${esc(url)}"><a class="btn small" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Ouvrir le lien de lecture</a><button class="btn small" data-doc-revoke="${doc.id}">Révoquer le lien</button>`;
      bindRevocation();
      await copy(url);
    });
    function bindRevocation() {
      handle('[data-doc-revoke]', async (button) => {
        if (!confirm('Révoquer le lien de lecture de ce document ?')) return;
        await write(
          sb
            .from('document_read_links')
            .update({ active: false })
            .eq('document_id', button.dataset.docRevoke)
            .eq('active', true),
          'Lien de lecture révoqué'
        );
        await reload();
      });
    }
    bindRevocation();
    handle('[data-doc-visible]', async (button) => {
      const doc = items.find((x) => x.id === button.dataset.docVisible);
      await write(
        sb
          .from('project_documents')
          .update({ client_visible: !doc.client_visible })
          .eq('id', doc.id)
          .eq('project_id', p.id)
          .select('id')
          .single()
      );
      await reload();
    });
    handle('[data-doc-delete]', async (button) => {
      if (
        !confirm('Retirer ce document ? Ses liens de lecture ne donneront plus accès au fichier.')
      )
        return;
      const doc = items.find((x) => x.id === button.dataset.docDelete);
      await write(sb.storage.from('project-documents').remove([doc.storage_path]), null);
      await write(
        sb
          .from('project_documents')
          .delete()
          .eq('id', doc.id)
          .eq('project_id', p.id)
          .select('id')
          .single(),
        'Document retiré'
      );
      await reload();
    });
  }

  async function projectVenue(p, reload) {
    const [venues, links] = await Promise.all([
      rows('venues', {}, 'name'),
      rows('project_venues', { project_id: p.id }),
    ]);
    const venue = venues.find((x) => x.id === links[0]?.venue_id);
    $('#tool-content').innerHTML =
      `<div class="tool-toolbar"><h2>Fiche technique du lieu</h2><a class="btn" href="#/lieux">Répertoire des lieux</a></div><section class="card"><form id="venue-link-form" class="stack"><label>Lieu associé<select name="venue_id" required><option value="">Choisir un lieu</option>${optionList(Object.fromEntries(venues.map((x) => [x.id, x.name])), venue?.id)}</select></label><button class="btn primary" ${venues.length ? '' : 'disabled'}>Associer au projet</button></form>${note('Choisissez un lieu créé dans le répertoire. Il sera utilisé partout sur le projet et dans ses liens partagés.')}</section>${
        venue
          ? `<section class="card venue-detail"><h2>${esc(venue.name)}</h2><p>${esc(venue.address)}</p><p>${esc(venue.contact_name)} · ${esc(venue.phone)}</p>${[
              ['Accès', venue.access_notes],
              ['Électricité', venue.power_notes],
              ['Son et horaires', venue.sound_notes],
              ['Notes', venue.notes],
            ]
              .map(([k, v]) => `<h3>${k}</h3><p class="pre">${esc(v || '—')}</p>`)
              .join('')}</section>`
          : empty('Aucun lieu associé.')
      }`;
    submit($('#venue-link-form'), async (form) => {
      await write(
        sb.rpc('set_project_directory_venue', {
          target_project: p.id,
          selected_venue: new FormData(form).get('venue_id'),
        }),
        'Lieu associé au projet'
      );
      await reload();
    });
  }

  async function debrief(p, reload) {
    const items = await rows('project_debriefs', { project_id: p.id });
    const current = items[0] || {};
    const fields = [
      field('rating', 'Note globale', 'select', {
        options: { '': 'Non évalué', 1: '1 / 5', 2: '2 / 5', 3: '3 / 5', 4: '4 / 5', 5: '5 / 5' },
      }),
      field('summary', 'Bilan général', 'textarea', { max: 5000 }),
      field('incidents', 'Incidents et difficultés', 'textarea', { max: 5000 }),
      field('improvements', 'À améliorer pour la prochaine fois', 'textarea', { max: 5000 }),
      field('client_feedback', 'Retour du client', 'textarea', { max: 5000 }),
    ];
    $('#tool-content').innerHTML =
      `${note('Bilan interne réservé à l’administrateur. Il n’est jamais exposé dans les vues publiques ou l’espace client.')}<section class="card"><h2>Bilan après événement</h2><form id="debrief-form" class="stack"><div class="row-2">${fieldsHTML(fields, current)}</div><button class="btn primary">Enregistrer le bilan</button></form>${current.updated_at ? `<p class="muted">Dernière modification : ${fmtDateTime(current.updated_at)}</p>` : ''}</section>`;
    await feedbackPanel(p, reload);
    submit($('#debrief-form'), async (form) => {
      const values = valuesOf(form, fields);
      values.rating = values.rating ? Number(values.rating) : null;
      await write(
        sb
          .from('project_debriefs')
          .upsert(
            { ...values, project_id: p.id, updated_at: new Date().toISOString() },
            { onConflict: 'project_id' }
          )
          .select('id')
          .single(),
        'Bilan enregistré'
      );
      await reload();
    });
  }

  async function feedbackPanel(p, reload) {
    const [links, feedback] = await Promise.all([
      rows('event_form_links', { project_id: p.id, kind: 'feedback' }),
      rows('event_feedback', { project_id: p.id }),
    ]);
    const average = feedback.length
      ? (feedback.reduce((sum, x) => sum + x.rating, 0) / feedback.length).toFixed(1)
      : '—';
    $('#tool-content').insertAdjacentHTML(
      'beforeend',
      `<section class="feedback-panel"><div class="tool-toolbar"><h2>Avis des clients et invités</h2><button id="create-feedback-link" class="btn primary">Créer un lien de retour</button></div><div class="tool-metrics">${mini('Avis reçus', feedback.length)}${mini('Note moyenne / 5', average)}</div><div class="tool-list">${links.map(linkCard).join('')}</div><div class="tool-list">${feedback.map((x) => `<article class="card"><strong>${'★'.repeat(x.rating)}${'☆'.repeat(5 - x.rating)} · ${x.rating}/5</strong><p class="muted">${esc(x.respondent || 'Anonyme')} · ${x.audience === 'client' ? 'Client / organisateur' : 'Invité'} · ${fmtDateTime(x.created_at)}</p><p class="pre">${esc(x.message)}</p></article>`).join('') || empty('Aucun avis reçu.')}</div></section>`
    );
    handle('#create-feedback-link', async () => {
      await write(
        sb
          .from('event_form_links')
          .insert({ kind: 'feedback', project_id: p.id })
          .select('id')
          .single(),
        'Lien de retour créé'
      );
      await reload();
    });
    bindLinks(links, reload);
  }

  async function inventory() {
    if (!admin()) throw new Error('Accès réservé à l’administrateur.');
    const [items, selections, projects] = await Promise.all([
      rows('equipment', {}, 'name'),
      rows('equipment_reservations', {}, 'starts_on'),
      rows('projects', {}, 'event_date'),
    ]);
    app.innerHTML =
      head(
        'Mon matériel',
        'La liste du matériel que je possède et que je choisis pour mes projets'
      ) + '<div id="tool-content"></div>';
    collection({
      table: 'equipment',
      title: 'du matériel',
      fields: equipmentFields,
      items,
      after: inventory,
      extra: note(
        'Renseignez ici votre propre matériel. Dans chaque projet, ouvrez Matériel pour choisir ce que vous emportez et préparer votre checklist.'
      ),
      render: (x) =>
        `<strong>${esc(x.name)}</strong><span class="status">${x.units} unité(s) · ${x.active ? 'Dans mon inventaire' : 'Non proposé dans les projets'}</span><p>${esc(x.category)}${x.reference ? ' · ' + esc(x.reference) : ''}</p><p class="pre">${esc(x.notes)}</p>${selections
          .filter((r) => r.equipment_id === x.id && r.state !== 'cancelled')
          .map(
            (r) =>
              `<p class="reservation-line"><a href="${toolsUrl(r.project_id, 'equipment')}">${esc(projects.find((p) => p.id === r.project_id)?.title || 'Projet')}</a> · ${r.quantity} à emporter · ${GEAR_ST[r.state]}</p>`
          )
          .join('')}`,
    });
  }
  async function venues() {
    if (!admin()) throw new Error('Accès réservé à l’administrateur.');
    const items = await rows('venues', {}, 'name');
    app.innerHTML =
      head('Lieux', 'Retrouvez les informations techniques et les consignes utiles sur place') +
      '<div id="tool-content"></div>';
    collection({
      table: 'venues',
      title: 'un lieu',
      fields: venueFields,
      items,
      after: venues,
      render: (x) =>
        `<strong>${esc(x.name)}</strong><p>${esc(x.address)}</p><p class="muted">${esc(x.contact_name)}${x.phone ? ' · ' + esc(x.phone) : ''}</p><details><summary>Informations techniques</summary>${[
          ['Accès', x.access_notes],
          ['Électricité', x.power_notes],
          ['Son', x.sound_notes],
          ['Notes', x.notes],
        ]
          .map(([k, v]) => `<p><strong>${k}</strong> · ${esc(v || '—')}</p>`)
          .join('')}</details>`,
    });
  }

  async function tasks() {
    const [projects, items] = await Promise.all([
      rows('projects', {}, 'event_date'),
      rows('project_tasks', {}, 'created_at'),
    ]);
    const editable = projects.filter((p) => admin() || p.status !== 'termine');
    const fields = [
      field('project_id', 'Projet', 'select', {
        required: true,
        options: projectOptions(editable),
      }),
      field('label', 'Chose à faire', 'text', { required: true, max: 1000 }),
      field('due_date', 'Échéance', 'date'),
      field('priority', 'Priorité', 'select', { options: priorityNames, value: 'normal' }),
      field('assignee', 'Responsable', 'text', { max: 150 }),
    ];
    app.innerHTML =
      head('À faire', 'Les tâches de tous vos projets, leurs échéances et leurs responsables') +
      `<div class="filters"><label>Projet<select id="task-project"><option value="">Tous les projets</option>${optionList(projectOptions(projects), '')}</select></label><label class="check"><input id="tasks-archived" type="checkbox">Inclure les projets archivés</label></div><details class="card tool-editor"><summary>Ajouter une tâche</summary><form id="board-task-form" class="stack"><div class="row-2">${fieldsHTML(fields)}</div><div class="actions"><button class="btn primary" ${editable.length ? '' : 'disabled'}>Ajouter la tâche</button><button type="button" id="new-board-task" class="btn">Nouvelle tâche</button></div></form></details><div id="task-board" class="task-board"></div>`;
    const draw = () => {
      const selected = $('#task-project').value;
      const includeArchived = $('#tasks-archived').checked;
      const shown = items.filter((t) => {
        const p = projects.find((p) => p.id === t.project_id);
        return p && (!selected || t.project_id === selected) && (includeArchived || !p.archived_at);
      });
      $('#task-board').innerHTML = Object.entries({
        todo: 'À faire',
        doing: 'En cours',
        done: 'Terminé',
      })
        .map(
          ([state, label]) =>
            `<section class="board-column"><h2>${label}<span>${shown.filter((t) => taskState(t) === state).length}</span></h2>${
              shown
                .filter((t) => taskState(t) === state)
                .map((t) => {
                  const p = projects.find((p) => p.id === t.project_id);
                  const canEdit = admin() || p.status !== 'termine';
                  return `<article class="card board-task ${!t.done && t.due_date && t.due_date < today() ? 'is-overdue' : ''}"><a class="muted" href="${projectUrl(t.project_id)}">${esc(p.title)}</a><h3>${esc(t.label)}</h3><p><span class="status ${t.priority === 'urgent' ? 'pending' : ''}">${priorityNames[t.priority || 'normal']}</span> ${esc(t.assignee || 'Non attribué')}</p>${t.due_date ? `<p class="${!t.done && t.due_date < today() ? 'warn-text' : 'muted'}">Échéance : ${fmtDate(t.due_date)}</p>` : ''}${canEdit ? `<label>Avancement<select data-task-state="${t.id}">${optionList({ todo: 'À faire', doing: 'En cours', done: 'Terminé' }, taskState(t))}</select></label><button class="btn small" data-task-edit="${t.id}">Échéance / responsable</button>` : ''}</article>`;
                })
                .join('') || empty('Aucune tâche.')
            }</section>`
        )
        .join('');
      $$('[data-task-state]').forEach(
        (select) =>
          (select.onchange = async () => {
            select.disabled = true;
            try {
              await write(
                sb
                  .from('project_tasks')
                  .update({ done: select.value === 'done', progress_state: select.value })
                  .eq('id', select.dataset.taskState)
                  .select('id')
                  .single()
              );
              await tasks();
            } catch (e) {
              ERR(e);
              select.disabled = false;
            }
          })
      );
      handle('[data-task-edit]', async (button) => {
        const t = items.find((t) => t.id === button.dataset.taskEdit);
        const form = $('#board-task-form');
        fill(form, fields, t);
        form.dataset.editId = t.id;
        form.closest('details').open = true;
        form.scrollIntoView({ block: 'start' });
        $('button', form).textContent = 'Enregistrer la tâche';
      });
    };
    $('#new-board-task').onclick = () => {
      const form = $('#board-task-form');
      form.reset();
      delete form.dataset.editId;
      $('button', form).textContent = 'Ajouter la tâche';
    };
    $('#task-project').onchange = draw;
    $('#tasks-archived').onchange = draw;
    draw();
    submit($('#board-task-form'), async (form) => {
      const values = valuesOf(form, fields);
      values.due_date = values.due_date || null;
      const id = form.dataset.editId;
      await write(
        (id
          ? sb.from('project_tasks').update(values).eq('id', id)
          : sb.from('project_tasks').insert(values)
        )
          .select('id')
          .single()
      );
      await tasks();
    });
  }

  function dayKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  async function calendar(month = '') {
    const parsed = /^\d{4}-\d{2}$/.test(month) ? month : today().slice(0, 7);
    const [year, m] = parsed.split('-').map(Number);
    if (m < 1 || m > 12 || year < 1900 || year > 2200) throw new Error('Mois invalide.');
    const [projects, blocks] = await Promise.all([
      rows('projects', {}, 'event_date'),
      admin() ? rows('calendar_blocks', {}, 'starts_on') : Promise.resolve([]),
    ]);
    const dated = projects.filter((p) => p.event_date && !p.archived_at);
    const first = new Date(year, m - 1, 1, 12);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7));
    const prev = dayKey(new Date(year, m - 2, 1, 12)).slice(0, 7);
    const next = dayKey(new Date(year, m, 1, 12)).slice(0, 7);
    app.innerHTML =
      head(
        'Calendrier',
        'Prestations et disponibilités',
        `<div class="actions"><a class="btn" href="#/calendrier?month=${prev}" aria-label="Mois précédent">←</a><label class="calendar-month">Mois<input type="month" id="calendar-month" value="${parsed}" min="1900-01" max="2200-12"></label><a class="btn" href="#/calendrier?month=${next}" aria-label="Mois suivant">→</a><a class="btn" href="#/calendrier">Aujourd’hui</a></div>`
      ) +
      `<section class="calendar-shell"><h2>${first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</h2><div class="calendar-grid">${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((x) => `<div class="calendar-weekday">${x}</div>`).join('')}${Array.from(
        { length: 42 },
        (_, i) => {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          const key = dayKey(d);
          const events = dated.filter((p) => p.event_date === key);
          const unavailable = blocks.filter((b) => b.starts_on <= key && b.ends_on >= key);
          const concurrent = events.filter((p) => p.status !== 'termine').length > 1;
          return `<div class="calendar-day ${d.getMonth() !== m - 1 ? 'outside' : ''} ${key === today() ? 'is-today' : ''}"><span class="day-number">${d.getDate()}</span>${concurrent ? '<span class="calendar-alert">Plusieurs prestations</span>' : ''}${unavailable.length && events.some((p) => p.status !== 'termine') ? '<span class="calendar-alert">Indisponibilité à vérifier</span>' : ''}${events.map((p) => `<a class="calendar-event" href="${projectUrl(p.id)}"><strong>${esc(p.title)}</strong><span>${STATUS[p.status]}</span></a>`).join('')}${unavailable.map((b) => `<span class="calendar-block">${esc(b.label)}</span>`).join('')}</div>`;
        }
      ).join(
        ''
      )}</div></section>${note('Les alertes signalent plusieurs prestations le même jour ou une date bloquée. Les horaires précis restent à vérifier dans les plannings des projets.')}${
        projects.some((p) => !p.event_date && !p.archived_at)
          ? `<section class="card"><h2>Dates à définir</h2>${projects
              .filter((p) => !p.event_date && !p.archived_at)
              .map((p) => `<p><a href="${projectUrl(p.id)}">${esc(p.title)} →</a></p>`)
              .join('')}</section>`
          : ''
      }${admin() ? `<details class="card tool-editor"><summary>Bloquer une période d’indisponibilité</summary><form id="block-form" class="stack"><div class="row-2">${fieldsHTML([field('label', 'Motif', 'text', { required: true, max: 200 }), field('starts_on', 'Début', 'date', { required: true }), field('ends_on', 'Fin', 'date', { required: true })])}</div><button class="btn primary">Bloquer la période</button></form></details><div class="tool-list">${blocks.map((b) => `<article class="card tool-row"><div><strong>${esc(b.label)}</strong><p>${fmtDate(b.starts_on)} → ${fmtDate(b.ends_on)}</p></div><button class="btn small" data-remove-block="${b.id}">Retirer</button></article>`).join('')}</div>` : ''}`;
    $('#calendar-month').onchange = (event) => go('calendrier?month=' + event.target.value);
    if (admin()) {
      submit($('#block-form'), async (form) => {
        const f = Object.fromEntries(new FormData(form));
        if (f.ends_on < f.starts_on) throw new Error('La fin doit suivre le début.');
        await write(sb.from('calendar_blocks').insert(f).select('id').single(), 'Période bloquée');
        await calendar(parsed);
      });
      handle('[data-remove-block]', async (button) => {
        if (!confirm('Retirer cette indisponibilité ?')) return;
        await write(
          sb
            .from('calendar_blocks')
            .delete()
            .eq('id', button.dataset.removeBlock)
            .select('id')
            .single()
        );
        await calendar(parsed);
      });
    }
  }

  async function inquiries() {
    if (!admin()) throw new Error('Accès réservé à l’administrateur.');
    const [items, clients, links] = await Promise.all([
      rows('booking_inquiries', {}, 'created_at'),
      rows('profiles', { role: 'client' }, 'full_name'),
      rows('event_form_links', { kind: 'inquiry' }),
    ]);
    const fields = [
      field('full_name', 'Nom complet', 'text', { required: true, max: 200 }),
      field('email', 'Email', 'email', { required: true, max: 254 }),
      field('phone', 'Téléphone', 'tel', { max: 50 }),
      field('event_date', 'Date souhaitée', 'date'),
      field('location', 'Lieu', 'text', { max: 500 }),
      field('budget', 'Budget estimé (€)', 'number', { min: 0, step: 0.01 }),
      field('follow_up', 'Relancer le', 'date'),
      field('status', 'Étape', 'select', { options: LEAD_ST }),
      field('message', 'Demande / notes', 'textarea', { max: 5000 }),
    ];
    app.innerHTML =
      head('Demandes entrantes', 'Suivi des prospects, relances et transformation en projet') +
      '<div id="tool-content"></div>';
    collection({
      table: 'booking_inquiries',
      title: 'une demande',
      fields,
      items: items.slice().reverse(),
      after: inquiries,
      extra: `<div class="tool-metrics">${mini('À traiter', items.filter((x) => ['new', 'contacted', 'quote'].includes(x.status)).length)}${mini('Relances échues', items.filter((x) => x.follow_up && x.follow_up <= today() && !['won', 'lost'].includes(x.status)).length)}${mini('Converties', items.filter((x) => x.project_id).length)}</div><div class="tool-toolbar"><h2>Formulaire de contact public</h2><button class="btn" id="create-intake">Créer un lien de demande</button></div><div class="tool-list">${links.map(linkCard).join('')}</div>`,
      render: (x) =>
        `<strong>${esc(x.full_name)}</strong><span class="status">${LEAD_ST[x.status]}</span>${contactLines(x)}<p>${x.event_date ? fmtDate(x.event_date) : 'Date à définir'} · ${esc(x.location || 'Lieu à définir')}${x.budget != null ? ' · ' + fmtEur(x.budget) : ''}</p><p class="pre">${esc(x.message)}</p>${x.follow_up ? `<p class="${x.follow_up <= today() && !['won', 'lost'].includes(x.status) ? 'warn-text' : 'muted'}">Relance : ${fmtDate(x.follow_up)}</p>` : ''}${x.project_id ? `<a class="btn small" href="${projectUrl(x.project_id)}">Ouvrir le projet créé</a>` : `<details class="convert-inquiry"><summary>Transformer en projet</summary><form data-convert="${x.id}" class="stack"><label>Nom du projet<input name="project_title" required maxlength="200" value="${esc('Événement · ' + x.full_name)}"></label><label>Rattacher au client<select name="target_client" required><option value="">Choisir un client</option>${optionList(Object.fromEntries(clients.map((c) => [c.id, c.full_name || c.email])), '')}</select></label><a class="muted" href="#/admin/clients/nouveau">Créer d’abord un compte client si nécessaire →</a><button class="btn small primary" ${clients.length ? '' : 'disabled'}>Créer le projet</button></form></details>`}`,
    });
    const editor = $('#tool-editor-form');
    submit(editor, async (form) => {
      const values = valuesOf(form, fields);
      values.event_date = values.event_date || null;
      values.follow_up = values.follow_up || null;
      const id = form.elements.record_id.value;
      await write(
        (id
          ? sb.from('booking_inquiries').update(values).eq('id', id)
          : sb.from('booking_inquiries').insert(values)
        )
          .select('id')
          .single()
      );
      await inquiries();
    });
    $$('[data-convert]').forEach((form) =>
      submit(form, async () => {
        const { data, error } = await sb.rpc('convert_booking_inquiry', {
          inquiry_id: form.dataset.convert,
          ...Object.fromEntries(new FormData(form)),
        });
        if (error) throw error;
        toast('Projet créé');
        go('admin/projets/' + data);
      })
    );
    handle('#create-intake', async () => {
      await write(
        sb.from('event_form_links').insert({ kind: 'inquiry' }).select('id').single(),
        'Lien de demande créé'
      );
      await inquiries();
    });
    bindLinks(links, inquiries);
  }

  async function publicForm(token, expectedKind) {
    document.body.dataset.view = 'public';
    app.innerHTML = empty('Chargement du formulaire…');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token))
      return renderUnavailableShare();
    const { data: form, error } = await sb.rpc('get_event_form', { form_token: token });
    if (error) throw error;
    if (!form || form.kind !== expectedKind) return renderUnavailableShare();
    if (!form.is_open) {
      app.innerHTML =
        '<section class="card public-form"><h1>Formulaire fermé</h1><p>Les nouvelles demandes ne sont plus acceptées.</p></section>';
      return;
    }
    if (form.kind === 'feedback') return Enhancements.feedbackForm(token, form);
    const fields =
      form.kind === 'music'
        ? [
            field('title', 'Titre du morceau', 'text', { required: true, max: 200 }),
            field('artist', 'Artiste', 'text', { required: true, max: 200 }),
            field('guest_name', 'Votre prénom / pseudo (facultatif)', 'text', { max: 100 }),
            field('note', 'Un message (facultatif)', 'textarea', { max: 500 }),
          ]
        : [
            field('full_name', 'Nom complet', 'text', { required: true, max: 200 }),
            field('email', 'Email', 'email', { required: true, max: 254 }),
            field('phone', 'Téléphone (facultatif)', 'tel', { max: 50 }),
            field('event_date', 'Date souhaitée', 'date'),
            field('location', 'Lieu', 'text', { max: 500 }),
            field('message', 'Parlez-nous de votre événement', 'textarea', { max: 5000 }),
          ];
    app.innerHTML = `<section class="card public-form"><p class="eyebrow">${form.kind === 'music' ? 'Suggestions musicales' : 'Votre événement'}</p><h1>${esc(form.title)}</h1><p class="muted">${form.kind === 'music' ? 'Proposez un morceau pour la soirée. Votre suggestion sera examinée par le DJ.' : 'Envoyez votre demande de prestation. Nous pourrons vous répondre aux coordonnées indiquées.'}</p><form id="public-event-form" class="stack"><div class="row-2">${fieldsHTML(fields)}</div><label class="form-honeypot" aria-hidden="true">Laisser vide<input name="website" tabindex="-1" autocomplete="off"></label><button class="btn primary">Envoyer ${form.kind === 'music' ? 'ma suggestion' : 'ma demande'}</button><p id="public-form-result" role="status"></p></form></section>`;
    submit($('#public-event-form'), async (element) => {
      if (new FormData(element).get('website')) return;
      const result = $('#public-form-result');
      result.textContent = 'Envoi en cours…';
      try {
        await write(
          sb.rpc('submit_event_form', { form_token: token, fields: valuesOf(element, fields) }),
          null
        );
        element.reset();
        result.textContent =
          form.kind === 'music'
            ? 'Merci ! Votre suggestion a été transmise au DJ.'
            : 'Merci ! Votre demande a bien été enregistrée.';
      } catch (error) {
        result.textContent = error.message || 'Envoi impossible. Réessayez.';
        throw error;
      }
    });
  }

  const pages = {
    calendrier: ({ params }) => calendar(params.get('month') || ''),
    taches: tasks,
    materiel: inventory,
    lieux: venues,
    demandes: inquiries,
    outils: ({ b, params }) => projectTools(b, params.get('section') || 'guests'),
  };
  function shortcuts(id) {
    return `<section class="project-tool-shortcuts no-print" aria-label="Outils de l’événement">${[
      ['guests', 'Invités'],
      ['conductor', 'Planning'],
      ['contacts', 'Prestataires'],
      ['documents', 'Documents'],
      ...(admin()
        ? [
            ['requests', 'Demandes musicales'],
            ['equipment', 'Matériel'],
            ['venue', 'Lieu'],
            ['debrief', 'Bilan'],
          ]
        : []),
    ]
      .map(
        ([section, label]) =>
          `<a href="${toolsUrl(id, section)}"><span>${label}</span><span aria-hidden="true">→</span></a>`
      )
      .join('')}</section>`;
  }
  function navLinks() {
    return [
      ['calendrier', 'Calendrier', 'calendar'],
      ['taches', 'À faire', 'tasks'],
      ...(admin()
        ? [
            ['materiel', 'Mon matériel', 'equipment'],
            ['lieux', 'Lieux', 'venue'],
            ['demandes', 'Demandes entrantes', 'inbox'],
          ]
        : []),
    ];
  }
  return { pages, publicForm, shortcuts, navLinks, getVenues: () => rows('venues', {}, 'name') };
})();
