/* A small native guest table, not a general spreadsheet application. */
const GuestSheet = (() => {
  const cols = [
    ['full_name', 'Nom complet', 'text'],
    ['email', 'Email', 'email'],
    ['phone', 'Téléphone', 'tel'],
    ['companions', 'Accompagnants', 'number'],
    ['response', 'Réponse', 'select'],
    ['table_name', 'Table / groupe', 'text'],
    ['dietary', 'Allergies / besoins', 'textarea'],
    ['notes', 'Notes', 'textarea'],
  ];
  const responses = { pending: 'En attente', confirmed: 'Confirmé', declined: 'Décliné' };
  function values(x = {}) {
    return {
      full_name: x.full_name || '',
      email: x.email || '',
      phone: x.phone || '',
      companions: Number(x.companions || 0),
      response: x.response || 'pending',
      table_name: x.table_name || '',
      dietary: x.dietary || '',
      notes: x.notes || '',
    };
  }
  const empty = () => ({ id: crypto.randomUUID(), original: null, data: values(), deleted: false });
  const hasData = (row) =>
    cols.some(([key]) =>
      key === 'companions'
        ? Number(row.data[key]) !== 0
        : key === 'response'
          ? row.data[key] !== 'pending'
          : String(row.data[key] || '').trim() !== ''
    );
  const changed = (row) =>
    row.original ? JSON.stringify(row.data) !== JSON.stringify(row.original) : hasData(row);

  function mount(project, items, reload, editable) {
    const viewHash = location.hash;
    const root = document.getElementById('tool-content');
    const cards = [root.querySelector('#tool-editor'), root.querySelector('.tool-list')].filter(
      Boolean
    );
    const section = document.createElement('section');
    section.className = 'guest-sheet';
    section.innerHTML = `<div class="guest-view-switch" role="group" aria-label="Présentation des invités"><button type="button" class="btn small primary" data-guest-view="table" aria-pressed="true">Vue tableau</button><button type="button" class="btn small" data-guest-view="cards" aria-pressed="false">Vue fiches</button></div><form id="guest-sheet-form"><input type="hidden" name="sheet_state"><div class="guest-sheet-toolbar"><div><h2>Tableau des invités</h2><p>${editable ? 'Écrivez dans les cellules. Tab passe à la suivante, Entrée descend à la ligne suivante.' : 'Les invités du projet, en lecture seule.'}</p></div>${editable ? '<div class="actions"><label>Lignes à ajouter<input type="number" id="sheet-add-count" min="1" max="200" value="10"></label><button type="button" class="btn" id="sheet-add">Ajouter des lignes</button><button type="submit" class="btn primary" id="sheet-save">Enregistrer le tableau</button><button type="button" class="btn small" id="sheet-discard">Annuler les modifications</button></div>' : ''}</div><p id="guest-sheet-status" role="status"></p><div class="guest-sheet-scroll"><table class="guest-sheet-table"><caption class="sr-only">Invités de ${esc(project.title)}</caption><thead><tr><th scope="col">N°</th>${cols.map(([, label]) => `<th scope="col">${label}</th>`).join('')}${editable ? '<th scope="col">Ligne</th>' : ''}</tr></thead><tbody></tbody></table></div>${editable ? '<button type="button" class="btn small sheet-add-one" id="sheet-add-one">＋ Ajouter une ligne</button>' : ''}</form>`;
    (cards[0] || root.querySelector('.guest-bulk') || root.lastElementChild).before(section);
    const form = section.querySelector('form');
    const stateInput = form.elements.sheet_state;
    const fresh = () => ({
      version: 1,
      project_id: project.id,
      rows: [
        ...items.map((x) => ({ id: x.id, original: values(x), data: values(x), deleted: false })),
        ...(editable ? Array.from({ length: 3 }, empty) : []),
      ],
    });
    let state = fresh();
    let query = '';
    let mode = 'table';
    let saving = false;
    const viewKey = 'dj-booking-guest-view:' + me.id + ':' + project.id;
    try {
      mode = sessionStorage.getItem(viewKey) === 'cards' ? 'cards' : 'table';
    } catch {}
    Drafts.restore(form);
    if (editable && stateInput.value)
      try {
        const draft = JSON.parse(stateInput.value);
        if (
          draft.project_id === project.id &&
          draft.version === 1 &&
          Array.isArray(draft.rows) &&
          draft.rows.every((r) => r.id && r.data)
        )
          state = draft;
      } catch {}
    const body = section.querySelector('tbody');
    function current() {
      return state.rows
        .filter((row) => !row.deleted && (row.original || hasData(row)))
        .map((row) => ({ id: row.id, ...values(row.data) }));
    }
    function status(text) {
      const edits = state.rows.filter(
        (r) => (r.deleted && r.original) || (!r.deleted && changed(r))
      ).length;
      section.querySelector('#guest-sheet-status').textContent =
        text ||
        `${current().length} invité(s) dans le tableau${edits ? ` · ${edits} ligne(s) modifiée(s), non enregistrée(s)` : ' · Toutes les modifications sont enregistrées'}`;
      if (editable) section.querySelector('#sheet-save').disabled = saving || !edits;
    }
    function sync(persist = true) {
      stateInput.value = JSON.stringify(state);
      status();
      if (persist && editable) stateInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function applyFilter() {
      for (const tr of body.rows) {
        const row = state.rows.find((r) => r.id === tr.dataset.row);
        tr.hidden =
          !!query &&
          !!row.original &&
          !Object.values(row.data).join(' ').toLowerCase().includes(query);
      }
    }
    function render() {
      body.innerHTML = state.rows
        .map(
          (row, index) =>
            `<tr data-row="${esc(row.id)}" class="${row.deleted ? 'sheet-row-deleted' : ''}"><th scope="row">${index + 1}</th>${cols
              .map(([key, label, type]) => {
                const attrs = `data-col="${key}" aria-label="${label} · ligne ${index + 1}" ${!editable || row.deleted ? 'disabled' : ''}`;
                const value = row.data[key] ?? '';
                const control =
                  type === 'select'
                    ? `<select ${attrs}>${Object.entries(responses)
                        .map(
                          ([value, label]) =>
                            `<option value="${value}" ${value === row.data[key] ? 'selected' : ''}>${label}</option>`
                        )
                        .join('')}</select>`
                    : type === 'textarea'
                      ? `<textarea ${attrs} rows="1">${esc(value)}</textarea>`
                      : `<input ${attrs} type="${type}" value="${esc(value)}" ${type === 'number' ? 'min="0" max="20"' : ''} ${key === 'full_name' ? 'maxlength="200"' : key === 'email' ? 'maxlength="254"' : key === 'phone' ? 'maxlength="50"' : key === 'table_name' ? 'maxlength="100"' : ''}>`;
                return `<td>${control}</td>`;
              })
              .join(
                ''
              )}${editable ? `<td><button type="button" class="sheet-row-remove" data-remove-row="${esc(row.id)}" aria-label="${row.deleted ? 'Annuler la suppression' : 'Retirer la ligne'} ${index + 1}">${row.deleted ? 'Rétablir' : row.original ? 'Supprimer' : 'Retirer'}</button></td>` : ''}</tr>`
        )
        .join('');
      applyFilter();
      sync(false);
    }
    function focusCell(id, col = 'full_name') {
      [...body.rows]
        .find((tr) => tr.dataset.row === id)
        ?.querySelector(`[data-col="${col}"]`)
        ?.focus();
    }
    function add(count) {
      if (!Number.isInteger(count) || count < 1 || count > 200) {
        status('Choisissez entre 1 et 200 lignes à ajouter.');
        return;
      }
      const added = Array.from({ length: count }, empty);
      state.rows.push(...added);
      render();
      sync();
      focusCell(added[0].id);
    }
    section.querySelectorAll('[data-guest-view]').forEach(
      (button) =>
        (button.onclick = () => {
          mode = button.dataset.guestView;
          try {
            sessionStorage.setItem(viewKey, mode);
          } catch {}
          form.hidden = mode !== 'table';
          cards.forEach((card) => (card.hidden = mode !== 'cards'));
          section.querySelectorAll('[data-guest-view]').forEach((b) => {
            b.classList.toggle('primary', b === button);
            b.setAttribute('aria-pressed', String(b === button));
          });
        })
    );
    form.hidden = mode !== 'table';
    cards.forEach((card) => (card.hidden = mode !== 'cards'));
    section.querySelectorAll('[data-guest-view]').forEach((button) => {
      button.classList.toggle('primary', button.dataset.guestView === mode);
      button.setAttribute('aria-pressed', String(button.dataset.guestView === mode));
    });
    if (editable) {
      section.querySelector('#sheet-add').onclick = () =>
        add(Number(section.querySelector('#sheet-add-count').value));
      section.querySelector('#sheet-add-one').onclick = () => add(1);
      section.querySelector('#sheet-discard').onclick = () => {
        if (
          state.rows.some((r) => r.deleted || changed(r)) &&
          !confirm('Abandonner les modifications non enregistrées du tableau ?')
        )
          return;
        Drafts.clear(form);
        state = fresh();
        render();
      };
      function edit(event) {
        const key = event.target.dataset.col;
        if (!key) return;
        const row = state.rows.find((r) => r.id === event.target.closest('tr').dataset.row);
        row.data[key] =
          key === 'companions' && event.target.value !== ''
            ? Number(event.target.value)
            : event.target.value;
        stateInput.value = JSON.stringify(state);
        status();
      }
      form.addEventListener('input', edit);
      form.addEventListener('change', edit);
      body.addEventListener('click', (event) => {
        const button = event.target.closest('[data-remove-row]');
        if (!button) return;
        const row = state.rows.find((r) => r.id === button.dataset.removeRow);
        if (row.original) row.deleted = !row.deleted;
        else state.rows = state.rows.filter((r) => r !== row);
        render();
        sync();
      });
      body.addEventListener('keydown', (event) => {
        const key = event.target.dataset.col;
        if (!key) return;
        const row = state.rows.find((r) => r.id === event.target.closest('tr').dataset.row);
        const index = state.rows.indexOf(row);
        if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
          event.preventDefault();
          let next = index + (event.shiftKey ? -1 : 1);
          while (state.rows[next]?.deleted) next += event.shiftKey ? -1 : 1;
          if (next === state.rows.length) {
            const n = empty();
            state.rows.push(n);
            render();
            sync();
          }
          if (next >= 0 && state.rows[next]) focusCell(state.rows[next].id, key);
        } else if (
          event.key === 'Tab' &&
          !event.shiftKey &&
          key === cols.at(-1)[0] &&
          index === state.rows.length - 1
        ) {
          event.preventDefault();
          add(1);
        }
      });
      body.addEventListener('paste', (event) => {
        const key = event.target.dataset.col;
        const text = event.clipboardData?.getData('text/plain') || '';
        if (
          !key ||
          (!text.includes('\t') && !text.includes('\n')) ||
          (event.target.tagName === 'TEXTAREA' && !text.includes('\t'))
        )
          return;
        event.preventDefault();
        try {
          const block = Enhancements.parseCSV(text);
          if (block.length > 1000) throw new Error('Collez au maximum 1 000 lignes à la fois.');
          const start = state.rows.findIndex(
            (r) => r.id === event.target.closest('tr').dataset.row
          );
          const column = cols.findIndex(([name]) => name === key);
          const replies = {
            oui: 'confirmed',
            non: 'declined',
            confirmed: 'confirmed',
            declined: 'declined',
            pending: 'pending',
            'en attente': 'pending',
            confirmé: 'confirmed',
            décliné: 'declined',
          };
          block.forEach((cells, i) => {
            while (!state.rows[start + i]) state.rows.push(empty());
            if (state.rows[start + i].deleted) return;
            cells.forEach((value, j) => {
              const col = cols[column + j]?.[0];
              if (col)
                state.rows[start + i].data[col] =
                  col === 'response' ? replies[value.trim().toLowerCase()] || 'pending' : value;
            });
          });
          render();
          sync();
          focusCell(state.rows[start].id, key);
        } catch (error) {
          status(error.message);
        }
      });
      form.onsubmit = async (event) => {
        event.preventDefault();
        if (saving) return;
        const removed = state.rows.filter((r) => r.deleted && r.original).map((r) => r.id);
        if (
          removed.length &&
          !confirm(`Supprimer ${removed.length} invité(s) de ce projet lors de l’enregistrement ?`)
        )
          return;
        const entries = [];
        try {
          state.rows.forEach((row, index) => {
            if (row.deleted || !changed(row)) return;
            const data = values(row.data);
            data.companions = Number(row.data.companions);
            if (
              !data.full_name.trim() ||
              data.full_name.length > 200 ||
              data.email.length > 254 ||
              (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) ||
              data.phone.length > 50 ||
              !Number.isInteger(data.companions) ||
              data.companions < 0 ||
              data.companions > 20 ||
              data.table_name.length > 100 ||
              data.dietary.length > 1000 ||
              data.notes.length > 2000
            )
              throw new Error(
                `Vérifiez les cellules de la ligne ${index + 1} (nom, email et nombre d’accompagnants).`
              );
            Object.keys(data).forEach((key) => {
              if (typeof data[key] === 'string') data[key] = data[key].trim();
            });
            entries.push({ id: row.id, ...data, original: row.original });
          });
          if (!entries.length && !removed.length) {
            status('Aucune modification à enregistrer.');
            return;
          }
          saving = true;
          form.inert = true;
          status('Enregistrement du tableau…');
          form.classList.add('sheet-saving');
          const draft = Drafts.begin(form);
          try {
            const { error } = await sb.rpc('save_guest_sheet', {
              target_project: project.id,
              entries,
              removed_ids: removed,
            });
            if (error) throw error;
            Drafts.finish(draft, true);
            toast('Tableau des invités enregistré');
            if (location.hash === viewHash) await reload();
          } catch (error) {
            Drafts.finish(draft, false);
            throw error;
          }
        } catch (error) {
          saving = false;
          form.inert = false;
          form.classList.remove('sheet-saving');
          status(error.message);
          ERR(error);
        }
      };
    }
    if (!editable) form.onsubmit = (event) => event.preventDefault();
    render();
    return {
      filter: (text) => {
        query = String(text || '')
          .trim()
          .toLowerCase();
        applyFilter();
      },
      current: () => (mode === 'table' ? current() : items),
    };
  }
  return { mount };
})();
