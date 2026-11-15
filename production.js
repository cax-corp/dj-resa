/* Project production tools. Existing prices, guests and stock are never replaced wholesale. */
const Production = (() => {
  const isAdmin = () => me?.role === 'admin';
  const isTeam = () => me?.role === 'dj';
  const options = (items, value = '') =>
    Object.entries(items)
      .map(
        ([key, text]) =>
          `<option value="${esc(key)}" ${String(value) === String(key) ? 'selected' : ''}>${esc(text)}</option>`
      )
      .join('');
  async function list(table, filters = {}, order = 'created_at') {
    const all = [];
    for (let offset = 0; ; offset += 500) {
      let query = sb.from(table).select('*');
      for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
      if (order) query = query.order(order);
      const { data, error } = await query.range(offset, offset + 499);
      if (error) throw error;
      all.push(...data);
      if (data.length < 500) return all;
    }
  }
  async function write(query) {
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }
  function submit(form, fn) {
    form.onsubmit = async (event) => {
      event.preventDefault();
      const buttons = [...form.querySelectorAll('button')];
      buttons.forEach((b) => (b.disabled = true));
      try {
        await fn(form);
      } catch (error) {
        ERR(error);
      } finally {
        buttons.forEach((b) => (b.disabled = false));
      }
    };
  }
  function buttons(selector, fn, root = document) {
    root.querySelectorAll(selector).forEach(
      (button) =>
        (button.onclick = async () => {
          button.disabled = true;
          try {
            await fn(button);
          } catch (error) {
            ERR(error);
          } finally {
            button.disabled = false;
          }
        })
    );
  }
  async function access(p) {
    p._team = isTeam();
    if (isAdmin()) {
      p._canEdit = true;
      return p;
    }
    if (!isTeam()) {
      p._canEdit = p.client_id === me.id && p.status !== 'termine';
      return p;
    }
    const members = await list('project_members', { project_id: p.id, user_id: me.id });
    p._canEdit = members[0]?.access_role === 'editor' && p.status !== 'termine';
    return p;
  }
  function sections() {
    return {
      ...(!isTeam() ? { rsvp: 'Réponses invités' } : {}),
      seating: 'Plan de tables',
      ...(isAdmin() ? { profit: 'Rentabilité', team: 'Équipe' } : {}),
      ...(isAdmin() || isTeam() ? { setup: 'Setup et câbles' } : {}),
      music_import: 'Import musical',
    };
  }
  function shortcuts(id) {
    return Object.entries(sections()).map(([key, label]) => [key, label]);
  }
  async function project(section, p, reload) {
    if (section === 'rsvp') return rsvp(p, reload);
    if (section === 'seating') return SeatPlanner.open(p, reload);
    if (section === 'profit') return profit(p, reload);
    if (section === 'team') return team(p, reload);
    if (section === 'setup') return AudioSetup.open(p, reload);
    if (section === 'music_import') return music(p, reload);
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function csv(name, headers, rows) {
    const cell = (v) => {
      const text = String(v ?? '');
      return (
        '"' + (/^[=+@\t\r-]/.test(text.trimStart()) ? "'" + text : text).replace(/"/g, '""') + '"'
      );
    };
    download(
      new Blob(['\ufeff' + [headers, ...rows].map((row) => row.map(cell).join(';')).join('\r\n')], {
        type: 'text/csv;charset=utf-8',
      }),
      name
    );
  }
  async function qr(url) {
    document.getElementById('production-qr')?.remove();
    const dialog = document.createElement('dialog');
    dialog.id = 'production-qr';
    dialog.className = 'production-qr';
    const code = qrcode(0, 'M');
    code.addData(url);
    code.make();
    dialog.innerHTML = `<h2>Invitation</h2>${code.createSvgTag({ cellSize: 5, margin: 20, scalable: true })}<button class="btn" id="download-rsvp-qr">Télécharger le PNG</button><button class="btn" id="close-rsvp-qr">Fermer</button>`;
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector('#close-rsvp-qr').onclick = () => dialog.close();
    dialog.querySelector('#download-rsvp-qr').onclick = () =>
      Enhancements.downloadQR(url, 'invitation.png');
  }
  const rsvpURL = (token) => `${location.origin}${location.pathname}#/rsvp/${token}`;
  async function rsvp(p, reload) {
    const [guests, links] = await Promise.all([
      list('project_guests', { project_id: p.id }, 'full_name'),
      list('guest_rsvp_links', { project_id: p.id }),
    ]);
    const editable = p._canEdit && !p._team;
    $('#tool-content').innerHTML =
      `<div class="tool-toolbar"><h2>Réponses des invités</h2>${editable ? '<button class="btn primary" id="create-rsvp-links">Créer les liens manquants</button>' : ''}<button class="btn" id="export-rsvp-links">Exporter les invitations CSV</button></div><p class="tool-note">Un lien personnel par invité ou foyer, sans connexion. Les réponses mettent à jour la liste existante. Aucun email n’est envoyé automatiquement. Le nombre d’accompagnants autorisés est initialisé d’après la fiche de chaque invité.</p><div class="tool-list">${
        guests
          .map((g) => {
            const link = links.find((l) => l.guest_id === g.id);
            return `<article class="card"><h3>${esc(g.full_name)}</h3><p class="muted">${{ confirmed: 'Présence confirmée', declined: 'Absent', pending: 'En attente' }[g.response]}</p>${link ? `<div class="share-actions"><input readonly aria-label="Invitation ${esc(g.full_name)}" value="${rsvpURL(link.token)}"><a class="btn small" target="_blank" rel="noopener" href="${rsvpURL(link.token)}">Ouvrir</a><button class="btn small" data-rsvp-copy="${link.id}">Copier</button><button class="btn small" data-rsvp-qr="${link.id}">QR code</button></div><p class="muted">${link.is_open ? 'Réponses ouvertes' : 'Lien fermé'}</p>${editable ? `<form class="production-inline" data-rsvp-limit="${link.id}"><label>Accompagnants autorisés<input name="max" type="number" min="0" max="20" value="${link.max_companions}" required></label><button class="btn small">Enregistrer la limite</button><button type="button" class="btn small" data-rsvp-toggle="${link.id}">${link.is_open ? 'Fermer' : 'Rouvrir'}</button></form>` : ''}` : '<p class="muted">Lien non créé.</p>'}</article>`;
          })
          .join('') ||
        '<p class="empty">Ajoutez d’abord vos invités dans la liste ou le tableau.</p>'
      }</div>`;
    if (editable)
      buttons('#create-rsvp-links', async () => {
        await write(sb.rpc('create_guest_rsvp_links', { pid: p.id }));
        toast('Liens disponibles');
        await reload();
      });
    $('#export-rsvp-links').onclick = () =>
      csv(
        'invitations.csv',
        ['Nom', 'Email', 'Lien personnel', 'Ouvert'],
        guests.map((g) => {
          const l = links.find((x) => x.guest_id === g.id);
          return [g.full_name, g.email, l ? rsvpURL(l.token) : '', l?.is_open ? 'Oui' : 'Non'];
        })
      );
    buttons('[data-rsvp-copy]', async (b) => {
      const link = links.find((l) => l.id === b.dataset.rsvpCopy);
      await navigator.clipboard.writeText(rsvpURL(link.token));
      toast('Lien copié');
    });
    buttons('[data-rsvp-qr]', (b) =>
      qr(rsvpURL(links.find((l) => l.id === b.dataset.rsvpQr).token))
    );
    document.querySelectorAll('[data-rsvp-limit]').forEach((form) =>
      submit(form, async () => {
        await write(
          sb
            .from('guest_rsvp_links')
            .update({ max_companions: Number(form.elements.max.value) })
            .eq('id', form.dataset.rsvpLimit)
            .eq('project_id', p.id)
        );
        toast('Limite enregistrée');
        await reload();
      })
    );
    buttons('[data-rsvp-toggle]', async (b) => {
      const link = links.find((l) => l.id === b.dataset.rsvpToggle);
      await write(
        sb
          .from('guest_rsvp_links')
          .update({ is_open: !link.is_open })
          .eq('id', link.id)
          .eq('project_id', p.id)
      );
      await reload();
    });
  }
  async function publicRsvp(token) {
    app.innerHTML = '<p class="empty">Chargement de l’invitation…</p>';
    try {
      const data = await write(sb.rpc('get_guest_rsvp', { link_token: token }));
      if (!data) throw new Error('Cette invitation est fermée ou indisponible.');
      app.innerHTML = `<section class="card public-form"><p class="eyebrow">Votre invitation</p><h1>${esc(data.title)}</h1><p>${data.event_date ? esc(fmtDate(data.event_date)) : ''}</p><h2>Bonjour ${esc(data.guest_name)}</h2><form id="public-rsvp-form" class="stack"><label>Serez-vous présent(e) ?<select name="response" required><option value="">Choisir une réponse</option>${options({ confirmed: 'Oui, je serai présent(e)', declined: 'Non, je ne pourrai pas venir' }, data.response)}</select></label><label>Nombre d’accompagnants<select name="companions">${options(Object.fromEntries(Array.from({ length: data.max_companions + 1 }, (_, i) => [i, String(i)])), Math.min(data.companions, data.max_companions))}</select></label><label>Allergies ou besoins alimentaires (facultatif)<textarea name="dietary" maxlength="1000" rows="3">${esc(data.dietary)}</textarea></label><button class="btn primary">Envoyer ma réponse</button><p id="rsvp-result" role="status"></p></form></section>`;
      const form = $('#public-rsvp-form');
      form.onsubmit = async (event) => {
        event.preventDefault();
        const button = form.querySelector('button');
        button.disabled = true;
        try {
          await write(
            sb.rpc('submit_guest_rsvp', {
              link_token: token,
              fields: {
                response: form.elements.response.value,
                companions: Number(form.elements.companions.value),
                dietary: form.elements.dietary.value,
              },
            })
          );
          form.innerHTML =
            '<p role="status">Merci ! Votre réponse a bien été enregistrée.</p><button type="button" class="btn" id="edit-rsvp">Modifier ma réponse</button>';
          $('#edit-rsvp').onclick = () => publicRsvp(token);
        } catch (error) {
          $('#rsvp-result').textContent = error.message;
          button.disabled = false;
        }
      };
    } catch (error) {
      app.innerHTML = `<section class="card public-form"><h1>Invitation indisponible</h1><p>${esc(error.message)}</p></section>`;
    }
  }
  async function profit(p, reload) {
    const [costs, payments, settings, schedule] = await Promise.all([
      list('project_costs', { project_id: p.id }),
      list('project_payments', { project_id: p.id }),
      list('project_profit_settings', { project_id: p.id }),
      list('schedule_items', { project_id: p.id }),
    ]);
    const revenue = payments.reduce((n, x) => n + Number(x.amount), 0),
      received = payments.filter((x) => x.paid).reduce((n, x) => n + Number(x.amount), 0),
      expenses = costs.reduce((n, x) => n + Number(x.amount), 0),
      hours = WorkHours.summary(schedule),
      hourly = Number(settings[0]?.hourly_cost || 0),
      labor = (hours.minutes / 60) * hourly,
      margin = revenue - expenses - labor;
    $('#tool-content').innerHTML =
      `<div class="tool-toolbar"><h2>Rentabilité estimée</h2></div><p class="tool-note">Privé administrateur. Les recettes reprennent les lignes tarif/paiement du projet. Saisissez vos frais sur une base cohérente (HT ou TTC). La valorisation de votre temps est un coût interne, pas le tarif vendu au client.</p><div class="production-metrics">${[
        ['Recettes prévues', fmtEur(revenue)],
        ['Encaissé', fmtEur(received)],
        ['Frais saisis', fmtEur(expenses)],
        ['Coût interne du temps', fmtEur(labor)],
        ['Marge prévisionnelle', fmtEur(margin)],
        ['Taux de marge', revenue ? ((margin / revenue) * 100).toFixed(1) + ' %' : '—'],
      ]
        .map(
          ([label, value]) =>
            `<div class="card"><span>${label}</span><strong>${value}</strong></div>`
        )
        .join(
          ''
        )}</div>${WorkHours.render(schedule)}<section class="card"><h3>Valoriser mon temps</h3><form id="profit-hours" class="production-inline"><label>Coût interne d’une heure (€)<input type="number" name="hourly" min="0" step="0.01" value="${hourly}" required></label><button class="btn">Enregistrer</button></form></section><section class="card production-section"><h3>Ajouter des frais</h3><form id="cost-form" class="stack"><div class="row-2"><label>Libellé<input name="label" maxlength="200" required></label><label>Catégorie<select name="category">${options({ travel: 'Déplacements', staff: 'Équipe / prestataires', equipment: 'Matériel', purchase: 'Achats / consommables', other: 'Autres frais' })}</select></label><label>Montant (€)<input name="amount" type="number" min="0" step="0.01" required></label><label>Notes (facultatif)<input name="notes" maxlength="2000"></label></div><button class="btn primary">Ajouter les frais</button></form></section><div class="tool-list">${costs.map((c) => `<article class="card tool-row"><div><strong>${esc(c.label)} · ${fmtEur(c.amount)}</strong><p class="muted">${esc(c.notes)}</p></div><button class="btn small danger" data-remove-cost="${c.id}">Retirer</button></article>`).join('') || '<p class="empty">Aucun frais saisi.</p>'}</div><p class="muted">Encaissé moins frais saisis : ${fmtEur(received - expenses)}. Rémunération disponible par heure, avant valorisation interne : ${hours.minutes ? fmtEur((revenue - expenses) / (hours.minutes / 60)) : '—'}.</p>`;
    submit($('#profit-hours'), async (f) => {
      await write(
        sb
          .from('project_profit_settings')
          .upsert(
            { project_id: p.id, hourly_cost: Number(f.elements.hourly.value) },
            { onConflict: 'project_id' }
          )
      );
      toast('Coût horaire enregistré');
      await reload();
    });
    submit($('#cost-form'), async (f) => {
      const values = Object.fromEntries(new FormData(f));
      await write(
        sb
          .from('project_costs')
          .insert({ ...values, amount: Number(values.amount), project_id: p.id })
      );
      Drafts.clear(f);
      await reload();
    });
    buttons('[data-remove-cost]', async (b) => {
      if (!confirm('Retirer ces frais du calcul ?')) return;
      await write(
        sb.from('project_costs').delete().eq('id', b.dataset.removeCost).eq('project_id', p.id)
      );
      await reload();
    });
  }
  async function team(p, reload) {
    const [members, users] = await Promise.all([
      list('project_members', { project_id: p.id }),
      list('profiles', { role: 'dj' }, 'full_name'),
    ]);
    $('#tool-content').innerHTML =
      `<div class="tool-toolbar"><h2>Équipe du projet</h2><a class="btn" href="#/equipe?project=${p.id}">Créer un compte équipe</a></div><p class="tool-note">Lecture seule : invités, planning, contacts, playlists et setup. Collaborateur : peut aussi modifier ces données. Les documents sont accessibles seulement si vous cochez « Visible par l’équipe ». Aucun accès aux tarifs, factures, coûts ou marges.</p><section class="card"><form id="member-form" class="production-inline"><label>Compte équipe<select name="user_id" required><option value="">Choisir</option>${options(Object.fromEntries(users.filter((u) => !members.some((m) => m.user_id === u.id)).map((u) => [u.id, u.full_name || u.email])))}</select></label><label>Droits<select name="access_role">${options({ viewer: 'Lecture seule', editor: 'Collaborateur' })}</select></label><button class="btn primary">Donner accès</button></form></section><div class="tool-list">${members.map((m) => `<article class="card tool-row"><div><strong>${esc(users.find((u) => u.id === m.user_id)?.full_name || 'Compte équipe')}</strong><label>Droits<select data-member-role="${m.id}">${options({ viewer: 'Lecture seule', editor: 'Collaborateur' }, m.access_role)}</select></label></div><button class="btn small danger" data-remove-member="${m.id}">Retirer l’accès</button></article>`).join('') || '<p class="empty">Aucun membre affecté.</p>'}</div>`;
    submit($('#member-form'), async (f) => {
      await write(
        sb
          .from('project_members')
          .insert({ project_id: p.id, ...Object.fromEntries(new FormData(f)) })
      );
      await reload();
    });
    document.querySelectorAll('[data-member-role]').forEach(
      (select) =>
        (select.onchange = async () => {
          select.disabled = true;
          try {
            await write(
              sb
                .from('project_members')
                .update({ access_role: select.value })
                .eq('id', select.dataset.memberRole)
                .eq('project_id', p.id)
            );
            await reload();
          } catch (error) {
            ERR(error);
            select.disabled = false;
          }
        })
    );
    buttons('[data-remove-member]', async (b) => {
      if (!confirm('Retirer l’accès de ce compte à ce projet ?')) return;
      await write(
        sb.from('project_members').delete().eq('id', b.dataset.removeMember).eq('project_id', p.id)
      );
      await reload();
    });
  }
  async function teamAccounts() {
    if (!isAdmin()) {
      app.innerHTML = '<p class="empty">Accès réservé à l’administrateur.</p>';
      return;
    }
    const users = await list('profiles', { role: 'dj' }, 'full_name');
    const pid = parseHash().params.get('project');
    app.innerHTML = `<div class="page-head"><div><h1>Comptes équipe</h1><p>Chaque membre reçoit ensuite des accès projet par projet.</p></div></div><section class="card narrow"><form id="new-team-user" class="stack"><label>Nom<input name="full_name" required maxlength="150"></label><label>Email<input name="email" type="email" required maxlength="254"></label><label>Mot de passe provisoire (12 caractères minimum)<input name="password" type="password" required minlength="12" maxlength="200" autocomplete="new-password"></label><p class="muted">À transmettre vous-même au membre, qui pourra le modifier dans Mon compte. Aucun email n’est envoyé ici.</p>${pid ? '<label>Droits sur le projet<select name="access_role"><option value="viewer">Lecture seule</option><option value="editor">Collaborateur</option></select></label>' : ''}<button class="btn primary">Créer le compte équipe</button></form></section><div class="tool-list">${users.map((u) => `<article class="card"><strong>${esc(u.full_name)}</strong><p>${esc(u.email)}</p></article>`).join('')}</div>`;
    submit($('#new-team-user'), async (f) => {
      const values = Object.fromEntries(new FormData(f));
      const { data, error } = await sb.functions.invoke('create-team-user', { body: values });
      if (error || data?.error) {
        let message = data?.error || error.message;
        try {
          message = (await error.context.json()).error || message;
        } catch {}
        throw new Error(message);
      }
      if (pid)
        await write(
          sb
            .from('project_members')
            .insert({ project_id: pid, user_id: data.id, access_role: values.access_role })
        );
      Drafts.clear(f);
      toast('Compte équipe créé');
      if (pid) go('outils/' + pid + '?section=team');
      else await teamAccounts();
    });
  }
  const spotifyPlaylist = (value) => {
    try {
      const url = new URL(value);
      const match = url.pathname.match(/^\/(?:intl-[a-z]+\/)?playlist\/([A-Za-z0-9]{22})\/?$/);
      return url.hostname === 'open.spotify.com' && url.protocol === 'https:' && match
        ? 'https://open.spotify.com/playlist/' + match[1]
        : null;
    } catch {
      return null;
    }
  };
  function parseMusic(text) {
    const rows = Enhancements.parseCSV(text);
    if (rows.length < 2) throw new Error('Le CSV doit contenir un en-tête et au moins un titre.');
    const normalize = (s) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
    const headers = rows[0].map(normalize);
    const find = (names) => headers.findIndex((h) => names.includes(h));
    const title = find(['trackname', 'title', 'titre', 'nom', 'name']),
      artist = find(['artistnames', 'artistname', 'artists', 'artist', 'artiste', 'artistes']),
      url = find(['trackuri', 'spotifyuri', 'uri', 'trackurl', 'url']);
    if (title < 0) throw new Error('Colonne titre introuvable. Utilisez Track Name ou Titre.');
    return rows
      .slice(1)
      .filter((row) => row[title]?.trim())
      .map((row) => {
        const raw = row[url] || '',
          id = raw.match(
            /(?:spotify:track:|https:\/\/open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/)([A-Za-z0-9]{22})/
          );
        return {
          title: row[title].trim(),
          artist: artist >= 0 ? (row[artist] || '').trim() : '',
          url: id ? 'https://open.spotify.com/track/' + id[1] : '',
        };
      });
  }
  async function music(p, reload) {
    const playlists = await list('project_playlists', { project_id: p.id });
    $('#tool-content').innerHTML =
      `<div class="tool-toolbar"><h2>Playlists et import musical</h2></div><p class="tool-note">Ajoutez un lien Spotify pour retrouver la playlist. L’import automatique par lien est prévu plus tard ; pour ajouter ses titres à la sélection du projet, importez un CSV exporté (colonnes Track Name, Artist Name(s), Track URI, ou Titre, Artiste, URL). Les doublons de titre/artiste ne sont pas ajoutés une seconde fois dans la même sélection.</p>${p._canEdit ? `<section class="card"><form id="playlist-form" class="stack"><label>Nom de la playlist<input name="name" required maxlength="200"></label><label>Lien Spotify<input name="url" type="url" required placeholder="https://open.spotify.com/playlist/…"></label><button class="btn">Ajouter le lien</button></form></section>` : ''}<div class="tool-list">${playlists.map((l) => `<article class="card tool-row"><a target="_blank" rel="noopener" href="${esc(l.url)}">${esc(l.name)} ↗</a>${p._canEdit ? `<button class="btn small" data-playlist-remove="${l.id}">Retirer le lien</button>` : ''}</article>`).join('')}</div>${p._canEdit ? `<section class="card"><h3>Importer des titres</h3><form id="music-csv-form" class="stack"><label>Fichier CSV (5 Mo maximum, 2 000 titres)<input name="file" type="file" accept=".csv,text/csv" required></label><label>Ajouter à<select name="kind"><option value="must_play">À passer absolument</option><option value="do_not_play">À ne pas passer</option></select></label><button class="btn">Prévisualiser le CSV</button></form><div id="music-preview"></div></section>` : ''}`;
    if (p._canEdit) {
      submit($('#playlist-form'), async (f) => {
        const values = Object.fromEntries(new FormData(f)),
          url = spotifyPlaylist(values.url);
        if (!url) throw new Error('Collez le lien complet d’une playlist Spotify.');
        await write(
          sb.from('project_playlists').insert({ project_id: p.id, name: values.name.trim(), url })
        );
        Drafts.clear(f);
        await reload();
      });
      buttons('[data-playlist-remove]', async (b) => {
        await write(
          sb
            .from('project_playlists')
            .delete()
            .eq('id', b.dataset.playlistRemove)
            .eq('project_id', p.id)
        );
        await reload();
      });
      submit($('#music-csv-form'), async (f) => {
        const file = f.elements.file.files[0];
        if (!file || file.size > 5 * 1024 * 1024)
          throw new Error('Choisissez un fichier de 5 Mo maximum.');
        const entries = parseMusic(await file.text());
        if (
          !entries.length ||
          entries.length > 2000 ||
          entries.some((e) => e.title.length > 300 || e.artist.length > 300)
        )
          throw new Error('Import limité à 2 000 titres et 300 caractères par titre/artiste.');
        const target = $('#music-preview');
        target.innerHTML = `<p>${entries.length} titre(s) à importer.</p><div class="production-preview">${entries
          .slice(0, 100)
          .map((e) => `<p><strong>${esc(e.title)}</strong> · ${esc(e.artist)}</p>`)
          .join(
            ''
          )}</div><button class="btn primary" id="confirm-music-import">Importer ces titres</button>`;
        buttons('#confirm-music-import', async () => {
          const count = await write(
            sb.rpc('import_project_music', {
              pid: p.id,
              entries,
              track_kind: f.elements.kind.value,
            })
          );
          toast(`${count} titre(s) ajouté(s)`);
          await reload();
        });
      });
    }
  }
  return {
    list,
    write,
    submit,
    buttons,
    access,
    sections,
    shortcuts,
    project,
    publicRsvp,
    teamAccounts,
    download,
    csv,
    options,
    parseMusic,
    spotifyPlaylist,
  };
})();
