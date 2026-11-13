/* Drafts stay in this browser tab and are scoped to the signed-in account. */
const Drafts = (() => {
  const prefix = 'dj-booking-draft:';
  const pending = new Set();
  const allowed = (form) =>
    form?.id &&
    !['auth-form', 'public-event-form', 'public-feedback-form'].includes(form.id) &&
    typeof me !== 'undefined' &&
    me?.id;
  const key = (form) => {
    const account = prefix + me.id + ':';
    if (!form.dataset.draftKey?.startsWith(account))
      form.dataset.draftKey = account + location.hash + ':' + form.id;
    return form.dataset.draftKey;
  };
  function save(form) {
    if (!allowed(form)) return;
    const values = {};
    for (const el of form.elements) {
      if (
        !el.name ||
        /password/i.test(el.name) ||
        ['password', 'file', 'submit', 'button'].includes(el.type) ||
        el.readOnly
      )
        continue;
      values[el.name] =
        el.type === 'checkbox'
          ? el.checked
          : el.type === 'radio'
            ? el.checked
              ? el.value
              : values[el.name]
            : el.value;
    }
    try {
      sessionStorage.setItem(
        key(form),
        JSON.stringify({ values, open: form.closest('details')?.open })
      );
    } catch {}
  }
  function restore(forceForm) {
    for (const form of document.querySelectorAll('#app form[id]')) {
      if (!allowed(form) || (form.dataset.draftRestored && forceForm !== form)) continue;
      form.dataset.draftRestored = 'true';
      if (pending.has(key(form))) continue;
      try {
        const draft = JSON.parse(sessionStorage.getItem(key(form)) || 'null');
        if (!draft) continue;
        for (const el of form.elements) {
          if (
            !el.name ||
            /password/i.test(el.name) ||
            !(el.name in draft.values) ||
            ['password', 'file'].includes(el.type) ||
            el.readOnly
          )
            continue;
          if (el.type === 'checkbox') el.checked = !!draft.values[el.name];
          else if (el.type === 'radio') el.checked = el.value === draft.values[el.name];
          else el.value = draft.values[el.name];
        }
        if (draft.open && form.closest('details')) form.closest('details').open = true;
      } catch {}
    }
  }
  function begin(form) {
    if (!allowed(form)) return null;
    const k = key(form);
    pending.add(k);
    return k;
  }
  function finish(k, success) {
    if (!k) return;
    pending.delete(k);
    if (success)
      try {
        sessionStorage.removeItem(k);
      } catch {}
  }
  function clear(form) {
    if (allowed(form))
      try {
        sessionStorage.removeItem(key(form));
      } catch {}
  }
  function clearUser(id) {
    try {
      for (const k of Object.keys(sessionStorage))
        if (k.startsWith(prefix + id + ':')) sessionStorage.removeItem(k);
    } catch {}
  }
  document.addEventListener('input', (e) => save(e.target.closest('form')));
  document.addEventListener('change', (e) => save(e.target.closest('form')));
  new MutationObserver(restore).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  return { begin, finish, clear, clearUser, restore };
})();

const Enhancements = (() => {
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function downloadQR(url, name = 'qr-code.png') {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const source = URL.createObjectURL(
      new Blob([qr.createSvgTag({ cellSize: 8, margin: 32, scalable: true })], {
        type: 'image/svg+xml;charset=utf-8',
      })
    );
    try {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 1024, 1024);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, 0, 0, 1024, 1024);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Impossible de créer l’image du QR code.');
      download(blob, name);
    } finally {
      URL.revokeObjectURL(source);
    }
  }
  function printList(project, title, headers, rows) {
    document.getElementById('print-sheet')?.remove();
    const sheet = document.createElement('section');
    sheet.id = 'print-sheet';
    sheet.className = 'print-sheet';
    sheet.innerHTML = `<header><p>DJ Booking · ${esc(title)}</p><h1>${esc(project.title)}</h1><p>${project.event_date ? esc(fmtDate(project.event_date)) : ''}${project.location ? ' · ' + esc(project.location) : ''}</p></header><table><thead><tr><th class="paper-check-col">✓</th>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr><td><span class="paper-checkbox"></span></td>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table><footer>${rows.length} élément(s) · ${esc(title)}</footer>`;
    document.body.append(sheet);
    document.body.dataset.print = 'sheet';
    window.addEventListener(
      'afterprint',
      () => {
        delete document.body.dataset.print;
        sheet.remove();
      },
      { once: true }
    );
    window.print();
  }
  const printGuests = (p, items) =>
    printList(
      p,
      'Liste des invités',
      ['Nom', 'Table / groupe', 'Accompagnants', 'Réponse'],
      items.map((x) => [
        x.full_name,
        x.table_name,
        x.companions,
        { confirmed: 'Confirmé', pending: 'En attente', declined: 'Décliné' }[x.response],
      ])
    );
  const printMusic = (p, items) =>
    printList(
      p,
      'À passer absolument',
      ['Titre', 'Artiste', 'Note'],
      items.map((x) => [x.title, x.artist, x.note || ''])
    );
  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, '');
    let inQuote = false,
      first = '';
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (inQuote && text[i + 1] === '"') {
          i++;
          continue;
        }
        inQuote = !inQuote;
      }
      if (!inQuote && /[\r\n]/.test(c)) break;
      if (!inQuote) first += c;
    }
    const delimiter = ['\t', ';', ','].sort(
      (a, b) => first.split(b).length - first.split(a).length
    )[0];
    const result = [];
    let row = [],
      value = '',
      quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') {
          value += '"';
          i++;
        } else if (quoted || value === '') quoted = !quoted;
        else value += c;
      } else if (c === delimiter && !quoted) {
        row.push(value);
        value = '';
      } else if ((c === '\n' || c === '\r') && !quoted) {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(value);
        if (row.some((x) => x.trim())) result.push(row);
        row = [];
        value = '';
      } else value += c;
    }
    if (quoted) throw new Error('Une cellule CSV contient des guillemets non fermés.');
    row.push(value);
    if (row.some((x) => x.trim())) result.push(row);
    return result;
  }
  const norm = (x) =>
    String(x || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  function guestRows(text) {
    const csv = parseCSV(text);
    if (!csv.length) throw new Error('Collez des invités ou choisissez un fichier CSV.');
    const names = {
      full_name: ['nomcomplet', 'fullname', 'name', 'invite'],
      first: ['prenom', 'firstname'],
      last: ['nom', 'lastname'],
      email: ['email', 'mail', 'courriel'],
      phone: ['telephone', 'tel', 'phone'],
      companions: ['accompagnants', 'accompagnant', 'companions'],
      response: ['reponse', 'response', 'rsvp', 'presence'],
      table_name: ['table', 'groupe', 'tablegroupe', 'tablename'],
      dietary: ['allergies', 'besoins', 'dietary'],
      notes: ['notes', 'note'],
    };
    const headers = csv[0].map(norm);
    const hasHeader = headers.some((h) => Object.values(names).flat().includes(h));
    const fallback = [
      'full_name',
      'email',
      'phone',
      'companions',
      'response',
      'table_name',
      'dietary',
      'notes',
    ];
    const mapped = hasHeader
      ? headers.map((h) => Object.keys(names).find((k) => names[k].includes(h)) || '')
      : fallback;
    const data = hasHeader ? csv.slice(1) : csv;
    if (data.length > 1000) throw new Error('Importez au maximum 1 000 invités à la fois.');
    return data.map((cells) => {
      const x = {};
      mapped.forEach((key, i) => {
        if (key) x[key] = String(cells[i] || '').trim();
      });
      x.full_name = x.full_name || [x.first, x.last].filter(Boolean).join(' ');
      delete x.first;
      delete x.last;
      const replies = {
        oui: 'confirmed',
        confirme: 'confirmed',
        confirmee: 'confirmed',
        confirmed: 'confirmed',
        present: 'confirmed',
        non: 'declined',
        decline: 'declined',
        declined: 'declined',
        absent: 'declined',
        enattente: 'pending',
        pending: 'pending',
        '': 'pending',
      };
      return {
        full_name: x.full_name || '',
        email: x.email || '',
        phone: x.phone || '',
        companions: x.companions || '0',
        response: replies[norm(x.response)] || x.response,
        table_name: x.table_name || '',
        dietary: x.dietary || '',
        notes: x.notes || '',
      };
    });
  }
  function mountGuestBulk(project, existing, reload, editable) {
    if (!editable) return;
    const root = document.getElementById('tool-content');
    const details = document.createElement('details');
    details.className = 'card tool-editor guest-bulk';
    details.innerHTML = `<summary>Ajouter beaucoup d’invités · CSV / Excel</summary><form id="guest-bulk-form" class="stack"><p>Collez un tableau depuis Excel ou Google Sheets, ou importez un CSV. Une prévisualisation permet de corriger les lignes avant l’ajout.</p><div class="actions"><button type="button" id="guest-template" class="btn">Télécharger le modèle CSV</button><label>Fichier CSV<input type="file" id="guest-csv" accept=".csv,.txt,text/csv"></label></div><label>Tableau à importer<textarea name="source" id="guest-source" rows="6" placeholder="Nom complet;Email;Téléphone;Accompagnants;Réponse;Table;Allergies;Notes"></textarea></label><button type="button" class="btn" id="guest-preview">Prévisualiser</button><p id="guest-import-status" role="status"></p><div id="guest-import-preview" class="guest-grid-scroll"></div><button type="submit" id="guest-import-save" class="btn primary" disabled>Importer les invités sélectionnés</button></form>`;
    root.querySelector('.tool-list').before(details);
    const columns = {
      full_name: 'Nom complet',
      email: 'Email',
      phone: 'Téléphone',
      companions: 'Accompagnants',
      response: 'Réponse',
      table_name: 'Table / groupe',
      dietary: 'Allergies',
      notes: 'Notes',
    };
    let parsed = [];
    document.getElementById('guest-template').onclick = () =>
      download(
        new Blob(
          ['\uFEFFNom complet;Email;Téléphone;Accompagnants;Réponse;Table;Allergies;Notes\r\n'],
          { type: 'text/csv;charset=utf-8' }
        ),
        'modele-invites.csv'
      );
    function preview() {
      try {
        parsed = guestRows(document.getElementById('guest-source').value);
        const seen = new Set(existing.map((x) => norm(x.full_name) + '|' + x.email.toLowerCase()));
        document.getElementById('guest-import-preview').innerHTML =
          `<table class="guest-import-table"><thead><tr><th>Importer</th>${Object.values(columns)
            .map((x) => `<th>${x}</th>`)
            .join('')}</tr></thead><tbody>${parsed
            .map((x, i) => {
              const key = norm(x.full_name) + '|' + x.email.toLowerCase();
              const duplicate = seen.has(key);
              seen.add(key);
              return `<tr><td><input type="checkbox" name="include_${i}" data-import-include="${i}" ${duplicate ? '' : 'checked'} aria-label="Importer la ligne ${i + 1}">${duplicate ? '<small>Doublon possible</small>' : ''}</td>${Object.keys(
                columns
              )
                .map(
                  (k) =>
                    `<td>${
                      k === 'response'
                        ? `<select name="bulk_${k}_${i}" data-col="${k}">${Object.entries({
                            pending: 'En attente',
                            confirmed: 'Confirmé',
                            declined: 'Décliné',
                          })
                            .map(
                              ([value, label]) =>
                                `<option value="${value}" ${value === x[k] ? 'selected' : ''}>${label}</option>`
                            )
                            .join('')}</select>`
                        : ['notes', 'dietary'].includes(k)
                          ? `<textarea name="bulk_${k}_${i}" data-col="${k}" rows="2" aria-label="${columns[k]} · ligne ${i + 1}">${esc(x[k])}</textarea>`
                          : `<input name="bulk_${k}_${i}" data-col="${k}" value="${esc(x[k])}" ${k === 'companions' ? 'type="number" min="0" max="20"' : 'type="text"'} aria-label="${columns[k]} · ligne ${i + 1}">`
                    }</td>`
                )
                .join('')}</tr>`;
            })
            .join('')}</tbody></table>`;
        document.getElementById('guest-import-status').textContent =
          `${parsed.length} ligne(s). Les doublons possibles sont décochés : vérifiez avant d’importer.`;
        document.getElementById('guest-import-save').disabled = !parsed.length;
      } catch (e) {
        parsed = [];
        document.getElementById('guest-import-preview').innerHTML = '';
        document.getElementById('guest-import-save').disabled = true;
        document.getElementById('guest-import-status').textContent = e.message;
      }
    }
    document.getElementById('guest-preview').onclick = () => {
      preview();
      Drafts.restore(document.getElementById('guest-bulk-form'));
    };
    document.getElementById('guest-source').oninput = () => {
      parsed = [];
      document.getElementById('guest-import-preview').innerHTML = '';
      document.getElementById('guest-import-save').disabled = true;
    };
    document.getElementById('guest-csv').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        ERR(new Error('Fichier trop volumineux (5 Mo maximum).'));
        return;
      }
      document.getElementById('guest-source').value = await file.text();
      document.getElementById('guest-source').dispatchEvent(new Event('input', { bubbles: true }));
      preview();
    };
    const form = document.getElementById('guest-bulk-form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const button = document.getElementById('guest-import-save');
      button.disabled = true;
      let draft;
      try {
        const selected = [];
        for (const [i, row] of [
          ...document.querySelectorAll('#guest-import-preview tbody tr'),
        ].entries()) {
          if (!row.querySelector('[data-import-include]').checked) continue;
          const x = {};
          row.querySelectorAll('[data-col]').forEach((el) => (x[el.dataset.col] = el.value.trim()));
          x.companions = Number(x.companions);
          if (
            !x.full_name ||
            x.full_name.length > 200 ||
            x.email.length > 254 ||
            (x.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email)) ||
            x.phone.length > 50 ||
            !Number.isInteger(x.companions) ||
            x.companions < 0 ||
            x.companions > 20 ||
            x.table_name.length > 100 ||
            x.dietary.length > 1000 ||
            x.notes.length > 2000
          )
            throw new Error(`Vérifiez les valeurs de la ligne ${i + 1}.`);
          selected.push({ ...x, project_id: project.id });
        }
        if (!selected.length) throw new Error('Sélectionnez au moins un invité à importer.');
        draft = Drafts.begin(form);
        const { data, error } = await sb.from('project_guests').insert(selected).select('id');
        if (error) throw error;
        if (data.length !== selected.length)
          throw new Error(
            'Le nombre de lignes importées est inattendu. Actualisez avant de réessayer.'
          );
        Drafts.finish(draft, true);
        toast(`${selected.length} invités ajoutés`);
        await reload();
      } catch (error) {
        Drafts.finish(draft, false);
        ERR(error);
        document.getElementById('guest-import-status').textContent = error.message;
        button.disabled = false;
      }
    };
  }
  async function feedbackForm(token, form) {
    app.innerHTML = `<section class="card public-form"><p class="eyebrow">Après l’événement</p><h1>${esc(form.title)}</h1><p>Votre avis nous aide à améliorer les prochaines prestations.</p><form id="public-feedback-form" class="stack"><fieldset class="rating-field"><legend>Votre note sur 5 étoiles</legend><div class="rating-stars">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="rating" value="${n}" required aria-label="${n} étoile${n > 1 ? 's' : ''}"><span aria-hidden="true">★</span></label>`).join('')}</div></fieldset><label>Vous étiez<select name="audience"><option value="guest">Invité</option><option value="client">Client / organisateur</option></select></label><label>Prénom / nom (facultatif)<input name="respondent" maxlength="150"></label><label>Votre avis<textarea name="comment" maxlength="3000" rows="5"></textarea></label><button class="btn primary">Envoyer mon avis</button><p id="feedback-result" role="status"></p></form></section>`;
    document
      .querySelectorAll('.rating-stars input')
      .forEach(
        (input) =>
          (input.onchange = () =>
            document
              .querySelectorAll('.rating-stars label')
              .forEach((label, i) => label.classList.toggle('selected', i < Number(input.value))))
      );
    document.getElementById('public-feedback-form').onsubmit = async (e) => {
      e.preventDefault();
      const button = e.target.querySelector('button');
      button.disabled = true;
      try {
        const fields = Object.fromEntries(new FormData(e.target));
        fields.rating = Number(fields.rating);
        const { error } = await sb.rpc('submit_event_form', { form_token: token, fields });
        if (error) throw error;
        e.target.innerHTML = '<p role="status">Merci ! Votre avis a bien été enregistré.</p>';
      } catch (error) {
        document.getElementById('feedback-result').textContent = error.message;
        button.disabled = false;
      }
    };
  }
  return {
    downloadQR,
    printList,
    printGuests,
    printMusic,
    mountGuestBulk,
    parseCSV,
    guestRows,
    feedbackForm,
  };
})();
