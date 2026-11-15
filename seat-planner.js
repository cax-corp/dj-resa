const SeatPlanner = (() => {
  async function open(p, reload) {
    const [saved, guests] = await Promise.all([
      Production.list('project_seating', { project_id: p.id }),
      Production.list('project_guests', { project_id: p.id }, 'full_name'),
    ]);
    const revision = saved[0]?.revision || 0,
      base = saved[0]?.layout || { tables: [], assignments: {} };
    let state = p._canEdit ? StageLayout.draft(p.id, 'seating', revision, base) : StageLayout.clone(base),
      selected = state.tables[0]?.id || null;
    const editable = p._canEdit;
    state.guest_tables ||= Object.fromEntries(guests.map((g) => [g.id, g.table_name || '']));
    for (const id of Object.keys(state.assignments))
      if (!guests.some((g) => g.id === id)) delete state.assignments[id];
    $('#tool-content').innerHTML =
      `<div class="tool-toolbar"><h2>Plan de tables</h2><div class="actions">${editable ? '<button class="btn primary" id="save-seating">Enregistrer le plan</button><button class="btn" id="discard-seating">Reprendre le plan enregistré</button>' : ''}<button class="btn" id="export-seating-svg">Télécharger le plan SVG</button><button class="btn" id="print-seating">Imprimer les placements</button></div></div><p class="tool-note">Déplacez les tables dans le plan, puis glissez un invité sur sa table ou utilisez les listes. Les placements ne modifient pas les coordonnées, allergies ou réponses des invités. Enregistrez pour synchroniser les groupes/tables de la liste des invités. Sur mobile, le plan défile horizontalement et les coordonnées restent modifiables sous le plan.</p><p id="seating-status" role="status"></p><div class="production-stage"><svg id="seating-stage" viewBox="0 0 1000 600" role="group" aria-label="Plan de tables déplaçables" xmlns="http://www.w3.org/2000/svg"></svg></div>${editable ? `<div class="board-controls"><section class="card"><h3>Tables</h3><form id="seating-add" class="production-inline"><label>Nom<input name="name" maxlength="100" required placeholder="Table 1"></label><label>Places<input name="seats" type="number" min="1" max="50" value="8" required></label><label>Forme<select name="shape"><option value="round">Ronde</option><option value="rectangle">Rectangulaire</option></select></label><button class="btn">Ajouter une table</button></form><button class="btn small" id="tables-from-groups">Créer les tables depuis les groupes existants</button><form id="seating-editor" class="stack"><label>Table à modifier<select name="table"></select></label><div class="row-2"><label>Nom<input name="name" maxlength="100"></label><label>Places<input name="seats" type="number" min="1" max="50"></label><label>X (%)<input name="x" type="number" min="5" max="95" step="0.1"></label><label>Y (%)<input name="y" type="number" min="7" max="93" step="0.1"></label></div><button type="button" class="btn danger" id="remove-table">Retirer cette table</button></form></section><section class="card"><h3>Affecter un invité</h3><form id="seat-assignment" class="stack"><label>Invité / foyer<select name="guest">${guests.map((g) => `<option value="${g.id}">${esc(g.full_name)}${g.companions ? ' (+' + g.companions + ')' : ''}</option>`).join('')}</select></label><label>Table<select name="table"></select></label><button class="btn">Appliquer au brouillon</button></form><p class="muted">Vous pouvez aussi déplacer les noms ci-dessous sur une table.</p><div class="guest-drag-list">${guests.map((g) => `<button type="button" class="btn small" draggable="true" data-guest-drag="${g.id}">${esc(g.full_name)}</button>`).join('')}</div></section></div>` : ''}<div id="seating-occupants" class="tool-list"></div>`;
    const svg = $('#seating-stage'),
      editor = $('#seating-editor'),
      assignment = $('#seat-assignment');
    const members = (id) => guests.filter((g) => state.assignments[g.id] === id);
    const count = (id) =>
      members(id)
        .filter((g) => g.response !== 'declined')
        .reduce((n, g) => n + 1 + Number(g.companions || 0), 0);
    function status() {
      const current = { ...state };
      delete current.guest_tables;
      const original = { ...base };
      delete original.guest_tables;
      const dirty = JSON.stringify(current) !== JSON.stringify(original);
      $('#seating-status').textContent = dirty
        ? 'Modifications dans le brouillon · à enregistrer'
        : 'Plan enregistré';
    }
    function remember() {
      StageLayout.remember(p.id, 'seating', revision, state);
      status();
    }
    function draw() {
      svg.innerHTML = `<rect width="1000" height="600" fill="#fff"/><text x="20" y="30" fill="#666" font-family="sans-serif" font-size="16">${esc(p.title)} · Plan de tables</text>${state.tables
        .map((t) => {
          const over = count(t.id) > t.seats,
            active = t.id === selected,
            fill = active ? '#202020' : over ? '#fff0f0' : '#f2f2f2',
            color = active ? '#fff' : '#202020';
          return `<g data-stage-id="${t.id}" tabindex="0" role="button" aria-label="${esc(t.name)} : ${count(t.id)} personnes pour ${t.seats} places" transform="translate(${t.x * 10},${t.y * 6})" style="cursor:move"><title>${esc(t.name)}</title>${t.shape === 'round' ? `<circle r="48" fill="${fill}" stroke="${over ? '#c00000' : '#666'}"/>` : `<rect x="-80" y="-35" width="160" height="70" rx="5" fill="${fill}" stroke="${over ? '#c00000' : '#666'}"/>`}<text text-anchor="middle" y="-4" fill="${color}" font-family="sans-serif" font-size="15">${esc(t.name.slice(0, 22))}</text><text text-anchor="middle" y="20" fill="${color}" font-family="sans-serif" font-size="13">${count(t.id)} / ${t.seats} places</text></g>`;
        })
        .join('')}`;
      if (!state.tables.length)
        svg.innerHTML +=
          '<text x="500" y="300" text-anchor="middle" fill="#777" font-family="sans-serif" font-size="20">Ajoutez vos tables pour commencer.</text>';
      $('#seating-occupants').innerHTML = state.tables
        .map(
          (t) =>
            `<article class="card"><h3>${esc(t.name)} · ${count(t.id)}/${t.seats} places</h3>${count(t.id) > t.seats ? '<p class="warn-text">Capacité dépassée : prévoyez des places supplémentaires ou réaffectez des invités.</p>' : ''}<p>${
              members(t.id)
                .map(
                  (g) =>
                    esc(g.full_name) +
                    (g.companions ? ' (+' + g.companions + ')' : '') +
                    (g.response === 'declined' ? ' · absent' : '')
                )
                .join(' · ') || 'Aucun invité affecté'
            }</p></article>`
        )
        .join('');
      if (editor) {
        const t = state.tables.find((t) => t.id === selected);
        for (const key of ['name', 'seats', 'x', 'y']) editor.elements[key].value = t?.[key] ?? '';
      }
      status();
    }
    function refreshSelectors() {
      if (!editable) return;
      editor.elements.table.innerHTML = state.tables
        .map((t) => `<option value="${t.id}">${esc(t.name)}</option>`)
        .join('');
      editor.elements.table.value = selected || '';
      assignment.elements.table.innerHTML =
        '<option value="">Non affecté</option>' +
        state.tables.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
      assignment.elements.table.value = state.assignments[assignment.elements.guest.value] || '';
    }
    function select(id) {
      selected = id;
      if (editor) editor.elements.table.value = id;
      draw();
    }
    StageLayout.drag(svg, { editable, items: () => state.tables, select, changed: remember, draw });
    draw();
    refreshSelectors();
    $('#export-seating-svg').onclick = () =>
      StageLayout.downloadSVG(
        svg,
        'plan-tables.svg',
        state.tables.map(
          (t) =>
            t.name +
            ' : ' +
            members(t.id)
              .map((g) => g.full_name + (g.companions ? ' (+' + g.companions + ')' : ''))
              .join(', ')
        )
      );
    $('#print-seating').onclick = () =>
      Enhancements.printList(
        p,
        'Placement des invités',
        ['Invité / foyer', 'Table', 'Accompagnants'],
        guests.map((g) => [
          g.full_name,
          state.tables.find((t) => t.id === state.assignments[g.id])?.name ||
            g.table_name ||
            'Non affecté',
          g.companions,
        ])
      );
    if (!editable) return;
    Production.buttons('#save-seating', async () => {
      await Production.write(
        sb.rpc('save_project_seating', { pid: p.id, board: state, expected_revision: revision })
      );
      StageLayout.clear(p.id, 'seating');
      toast('Plan de tables enregistré');
      await reload();
    });
    $('#discard-seating').onclick = () => {
      if (!confirm('Abandonner le brouillon et reprendre le dernier plan enregistré ?')) return;
      StageLayout.clear(p.id, 'seating');
      reload();
    };
    Production.submit($('#seating-add'), async (f) => {
      const name = f.elements.name.value.trim();
      if (state.tables.some((t) => t.name.toLowerCase() === name.toLowerCase()))
        throw new Error('Ce nom de table existe déjà.');
      if (state.tables.length >= 100) throw new Error('Limite de 100 tables.');
      const i = state.tables.length;
      const table = {
        id: crypto.randomUUID(),
        name,
        seats: Number(f.elements.seats.value),
        shape: f.elements.shape.value,
        x: 15 + (i % 4) * 23,
        y: 18 + (Math.floor(i / 4) % 4) * 20,
      };
      state.tables.push(table);
      selected = table.id;
      f.reset();
      Drafts.clear(f);
      refreshSelectors();
      draw();
      remember();
    });
    $('#tables-from-groups').onclick = () => {
      for (const name of [...new Set(guests.map((g) => g.table_name?.trim()).filter(Boolean))]) {
        let table = state.tables.find((t) => t.name.toLowerCase() === name.toLowerCase());
        if (!table && state.tables.length < 100) {
          const i = state.tables.length;
          table = {
            id: crypto.randomUUID(),
            name,
            seats: Math.min(
              50,
              Math.max(
                8,
                guests
                  .filter((g) => g.table_name === name)
                  .reduce((n, g) => n + 1 + g.companions, 0)
              )
            ),
            shape: 'round',
            x: 15 + (i % 4) * 23,
            y: 18 + (Math.floor(i / 4) % 4) * 20,
          };
          state.tables.push(table);
        }
        if (table)
          for (const guest of guests.filter((g) => g.table_name === name))
            state.assignments[guest.id] = table.id;
      }
      selected = state.tables[0]?.id;
      refreshSelectors();
      draw();
      remember();
    };
    editor.onsubmit = (e) => e.preventDefault();
    editor.elements.table.onchange = () => select(editor.elements.table.value);
    for (const key of ['name', 'seats', 'x', 'y'])
      editor.elements[key].oninput = () => {
        const table = state.tables.find((t) => t.id === selected);
        if (!table) return;
        if (key === 'name') table.name = editor.elements[key].value;
        else {
          const n = Number(editor.elements[key].value);
          table[key] = Math.max(
            key === 'seats' ? 1 : key === 'x' ? 5 : 7,
            Math.min(key === 'seats' ? 50 : key === 'x' ? 95 : 93, n)
          );
        }
        draw();
        remember();
        if (key === 'name') refreshSelectors();
      };
    $('#remove-table').onclick = () => {
      if (
        !selected ||
        !confirm('Retirer cette table et remettre ses invités en non affectés dans ce brouillon ?')
      )
        return;
      for (const [id, table] of Object.entries(state.assignments))
        if (table === selected) delete state.assignments[id];
      state.tables = state.tables.filter((t) => t.id !== selected);
      selected = state.tables[0]?.id;
      refreshSelectors();
      draw();
      remember();
    };
    Production.submit(assignment, async (f) => {
      if (!f.elements.guest.value) return;
      if (f.elements.table.value)
        state.assignments[f.elements.guest.value] = f.elements.table.value;
      else delete state.assignments[f.elements.guest.value];
      draw();
      remember();
    });
    assignment.elements.guest.onchange = () =>
      (assignment.elements.table.value = state.assignments[assignment.elements.guest.value] || '');
    document.querySelectorAll('[data-guest-drag]').forEach((button) => {
      button.ondragstart = (e) =>
        e.dataTransfer.setData('text/x-dj-guest', button.dataset.guestDrag);
      button.onclick = () => {
        assignment.elements.guest.value = button.dataset.guestDrag;
        assignment.elements.table.value = state.assignments[button.dataset.guestDrag] || '';
        assignment.elements.table.focus();
      };
    });
    svg.ondragover = (e) => e.preventDefault();
    svg.ondrop = (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/x-dj-guest'),
        table = e.target.closest('[data-stage-id]')?.dataset.stageId;
      if (guests.some((g) => g.id === id) && state.tables.some((t) => t.id === table)) {
        state.assignments[id] = table;
        draw();
        remember();
      }
    };
  }
  return { open };
})();
