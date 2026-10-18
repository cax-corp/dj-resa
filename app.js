// ================= CONFIG =================
const SUPABASE_URL = 'https://uxrkvmlwzkewxlrgewxa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4cmt2bWx3emtld3hscmdld3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNjQ3MTksImV4cCI6MjEwNzY0MDcxOX0.IhdT4t2m0-OVjgmOZnGH_TO6dGJa5t0jFveagJ5sYCc';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ================= HELPERS =================
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('fr-FR',
  { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtDateTime = (d) => new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const STATUS = { nouveau: 'Nouveau', preparation: 'En préparation', valide: 'Validé', termine: 'Terminé' };
const STATUS_CLS = { nouveau: 'pending', preparation: 'pending', valide: 'accepted', termine: 'done' };
const STATUS_KEYS = Object.keys(STATUS);
const go = (p) => (location.hash === '#/' + p ? route() : (location.hash = '#/' + p));
const info = (label, value) => `
  <div class="info-item"><span>${label}</span><strong>${value}</strong></div>`;

function toast(msg, ok = true) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast ' + (ok ? 'ok' : 'ko');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3500);
}
const ERR = (e) => toast(e.message || 'Une erreur est survenue', false);

// ================= THÈME =================
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('theme', t);
  $('#theme-toggle').textContent = t === 'dark' ? '☀' : '☾';
}

// ================= SESSION / ROUTEUR =================
let me = null;

async function loadMe() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { me = null; return; }
  const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  if (error) throw error;
  me = data;
}

function renderHeader() {
  const nav = $('#nav');
  $('#logout').classList.toggle('hidden', !me);
  if (!me) { nav.innerHTML = ''; return; }

  const seg = location.hash.replace(/^#\/?/, '').split('/').slice(0, 2).join('/');
  const links = me.role === 'admin'
    ? [['admin', 'Projets'], ['admin/clients', 'Clients']]
    : [['projets', 'Mes projets']];
  const isActive = (p) => seg === p
    || (p === 'admin' && (seg === 'admin/projets' || seg === 'admin/nouveau'));

  nav.innerHTML = links.map(([p, l]) =>
    `<a href="#/${p}" class="${isActive(p) ? 'active' : ''}">${l}</a>`).join('');
}


async function route() {
  try {
    await loadMe();
    renderHeader();
    if (!me) return renderLogin();

    const [a, b, c] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);

    if (me.role === 'admin') {
      if (a === 'admin' && b === 'nouveau') return await renderNewProject();
      if (a === 'admin' && b === 'projets' && c) return await renderProject(c, true);
      if (a === 'admin' && b === 'clients' && c === 'nouveau') return renderNewClient();
      if (a === 'admin' && b === 'clients' && c) return await renderClient(c);
      if (a === 'admin' && b === 'clients') return await renderClientsList();
      if (a === 'admin') return await renderAdminList();
      return go('admin');
    }

    if (a === 'projets' && b) return await renderProject(b, false);
    if (a === 'projets') return await renderClientList();
    return go('projets');
  } catch (e) {
    app.innerHTML = `<p class="empty">Erreur : ${esc(e.message)}</p>`;
  }
}


// ================= CONNEXION (pas d'inscription publique) =================
function renderLogin() {
  app.innerHTML = `
  <section class="auth card">
    <h1>Connexion</h1>
    <form id="auth-form" class="stack">
      <label>Email<input type="email" name="email" required autocomplete="email"></label>
      <label>Mot de passe<input type="password" name="password" required autocomplete="current-password"></label>
      <button class="btn primary block">Se connecter</button>
    </form>
  </section>`;

  $('#auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const { error } = await sb.auth.signInWithPassword({ email: f.email, password: f.password });
    if (error) ERR(error);
  };
}

// ================= LISTES =================
const projectRow = (p, isAdmin) => `
  <a class="row-card" href="#/${isAdmin ? 'admin/projets' : 'projets'}/${p.id}">
    <div>
      <strong>${esc(p.title)}</strong>
      <div class="muted">${p.event_date ? fmtDate(p.event_date) : 'Date à définir'}${p.location ? ' · ' + esc(p.location) : ''}</div>
      ${isAdmin && p.client ? `<div class="muted">${esc(p.client.full_name || '')} ${p.client.email ? '· ' + esc(p.client.email) : ''}</div>` : ''}
    </div>
    <span class="status ${STATUS_CLS[p.status]}">${STATUS[p.status]}</span>
  </a>`;

async function renderAdminList() {
  const { data, error } = await sb.from('projects')
    .select('*, client:profiles!client_id(full_name, email)')
    .order('event_date', { ascending: true, nullsFirst: false });
  if (error) throw error;

  app.innerHTML = `
    <div class="page-head">
      <div><h1>Tous les projets</h1><p>${data.length} projet(s)</p></div>
      <a class="btn primary" href="#/admin/nouveau">Nouveau projet</a>
    </div>
    <div class="list">${data.map(p => projectRow(p, true)).join('') || '<p class="empty">Aucun projet pour le moment.</p>'}</div>`;
}

async function renderClientList() {
  const { data, error } = await sb.from('projects').select('*')
    .order('event_date', { ascending: true, nullsFirst: false });
  if (error) throw error;

  app.innerHTML = `
    <div class="page-head"><div>
      <h1>Mes projets</h1>
      <p>Suivez l'avancement de vos événements</p>
    </div></div>
    <div class="list">${data.map(p => projectRow(p, false)).join('') || '<p class="empty">Aucun projet pour le moment.</p>'}</div>`;
}

// ================= ADMIN : NOUVEAU PROJET =================
async function renderNewProject() {
  app.innerHTML = `
    <a href="#/admin" class="back">← Tous les projets</a>
    <div class="page-head" style="margin-top:16px">
      <div><h1>Nouveau projet</h1><p>Le client doit déjà avoir un compte.</p></div>
    </div>
    <section class="card narrow">
      <form id="new-project" class="stack">
        <label>Email du client<input type="email" name="client_email" required></label>
        <label>Nom du projet / événement<input name="title" required></label>
        <div class="row-2">
          <label>Date<input type="date" name="event_date"></label>
          <label>Lieu<input name="location"></label>
        </div>
        <label>Description<textarea name="description" rows="4"></textarea></label>
        <button class="btn primary">Créer le projet</button>
      </form>
    </section>`;

  $('#new-project').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));

    const { data: client, error: e1 } = await sb.from('profiles')
      .select('id').ilike('email', f.client_email.trim()).maybeSingle();
    if (e1) return ERR(e1);
    if (!client) return ERR(new Error('Aucun compte client avec cet email'));

    const { data, error } = await sb.from('projects').insert({
      client_id: client.id,
      title: f.title,
      event_date: f.event_date || null,
      location: f.location || null,
      description: f.description || null
    }).select().single();
    if (error) return ERR(error);

    toast('Projet créé');
    go('admin/projets/' + data.id);
  };
}

// ================= DÉTAIL PROJET (admin et client) =================
function trackPanel(kind, title, items, canEdit) {
  const must = kind === 'must_play';
  return `
  <section class="card track-panel ${kind}">
    <h2>${title}</h2>
    <ul class="tracks">
      ${items.map(t => `
        <li>
          <div><strong>${esc(t.title)}</strong> <span class="muted">— ${esc(t.artist)}</span>
          ${t.note ? `<div class="note">${esc(t.note)}</div>` : ''}</div>
          ${canEdit ? `<button class="icon-btn small" data-del="${t.id}" aria-label="Supprimer">✕</button>` : ''}
        </li>`).join('') || '<li class="empty">Aucun titre.</li>'}
    </ul>
    ${canEdit ? `
    <form class="track-form stack" data-kind="${kind}">
      <div class="row-2">
        <input name="title" placeholder="Titre" required>
        <input name="artist" placeholder="Artiste" required>
      </div>
      <input name="note" placeholder="Note (optionnel)">
      <button class="btn ${must ? 'primary' : 'danger'}">${must ? 'Ajouter à passer absolument' : 'Ajouter à ne pas passer'}</button>
    </form>` : ''}
  </section>`;
}

async function renderProject(id, isAdmin) {
  const [pr, up, tr] = await Promise.all([
    sb.from('projects').select('*, client:profiles!client_id(full_name, email, phone)').eq('id', id).single(),
    sb.from('project_updates').select('*').eq('project_id', id).order('created_at', { ascending: false }),
    sb.from('project_tracks').select('*').eq('project_id', id).order('created_at')
  ]);
  for (const r of [pr, up, tr]) if (r.error) throw r.error;
  await renderExtras(id, isAdmin);


  const p = pr.data;
  const updates = up.data;
  const tracks = tr.data;
  const client = p.client || {};
  const canEdit = isAdmin || p.status !== 'termine';
  const must = tracks.filter(t => t.kind === 'must_play');
  const avoid = tracks.filter(t => t.kind === 'do_not_play');
  const statusOptions = STATUS_KEYS.map(k =>
    `<option value="${k}" ${k === p.status ? 'selected' : ''}>${STATUS[k]}</option>`).join('');

  const infoBlock = isAdmin ? `
    <section class="card">
      <h2>Modifier le projet</h2>
      <form id="edit-form" class="stack">
        <label>Nom<input name="title" value="${esc(p.title)}" required></label>
        <div class="row-2">
          <label>Date<input type="date" name="event_date" value="${p.event_date || ''}"></label>
          <label>Lieu<input name="location" value="${esc(p.location || '')}"></label>
        </div>
        <label>Statut<select name="status">${statusOptions}</select></label>
        <label>Description<textarea name="description" rows="4">${esc(p.description || '')}</textarea></label>
        <div class="actions" style="margin-top:4px">
          <button class="btn primary">Enregistrer</button>
          <button type="button" id="delete-project" class="btn danger">Supprimer le projet</button>
        </div>
      </form>
      <div class="info-list" style="margin-top:28px">
        ${info('Client', esc(client.full_name || '—'))}
        ${info('Email', client.email ? `<a href="mailto:${esc(client.email)}">${esc(client.email)}</a>` : '—')}
        ${info('Téléphone', client.phone ? `<a href="tel:${esc(client.phone.replace(/\s+/g, ''))}">${esc(client.phone)}</a>` : '—')}
      </div>
    </section>` : `
    <section class="card">
      <h2>Mon projet</h2>
      <div class="info-list">
        ${info('Date', p.event_date ? fmtDate(p.event_date) : 'À définir')}
        ${info('Lieu', esc(p.location || '—'))}
        ${info('Statut', `<span class="status ${STATUS_CLS[p.status]}">${STATUS[p.status]}</span>`)}
      </div>
      ${p.description ? `<div class="notes"><span>Description</span><p>${esc(p.description)}</p></div>` : ''}
    </section>`;

  const updatesBlock = `
    <section class="card">
      <h2>Suivi</h2>
      <form id="update-form" class="stack update-form">
        <textarea name="body" rows="3" placeholder="Ajouter une information ou une mise à jour…" required></textarea>
        <button class="btn primary" style="align-self:flex-end">Publier</button>
      </form>
      <div class="updates">
        ${updates.map(u => `
          <div class="update-item">
            <div class="update-meta">${u.author_id === me.id ? 'Vous' : (isAdmin ? 'Client' : 'Votre DJ')} · ${fmtDateTime(u.created_at)}</div>
            <p>${esc(u.body)}</p>
          </div>`).join('') || '<p class="empty">Aucune mise à jour pour le moment.</p>'}
      </div>
    </section>`;

  app.innerHTML = `
    <a href="${isAdmin ? '#/admin' : '#/projets'}" class="back">← ${isAdmin ? 'Tous les projets' : 'Mes projets'}</a>
    <div class="page-head" style="margin-top:16px">
      <div>
        <h1>${esc(p.title)}</h1>
        <p>${p.event_date ? fmtDate(p.event_date) : 'Date à définir'}${p.location ? ' · ' + esc(p.location) : ''}</p>
      </div>
      <span class="status ${STATUS_CLS[p.status]}">${STATUS[p.status]}</span>
    </div>

    <div class="grid two">${infoBlock}${updatesBlock}</div>
    ${mapCard(p.location)}

    <div class="grid two" style="margin-top:25px">
      ${trackPanel('must_play', 'À passer absolument', must, canEdit)}
      ${trackPanel('do_not_play', 'À ne pas passer', avoid, canEdit)}
    </div>`;

  // Modifier le projet (admin)
  const editForm = $('#edit-form');
  if (editForm) {
    editForm.onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const { error } = await sb.from('projects').update({
        title: f.title,
        event_date: f.event_date || null,
        location: f.location || null,
        description: f.description || null,
        status: f.status
      }).eq('id', id);
      if (error) return ERR(error);
      toast('Projet enregistré');
      renderProject(id, isAdmin);
    };

    $('#delete-project').onclick = async () => {
      if (!confirm('Supprimer ce projet et tout son contenu ? Cette action est définitive.')) return;
      const { error } = await sb.from('projects').delete().eq('id', id);
      if (error) return ERR(error);
      toast('Projet supprimé');
      go('admin');
    };
  }

  // Publier une mise à jour
  $('#update-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = new FormData(e.target).get('body').trim();
    if (!body) return;
    const { error } = await sb.from('project_updates').insert({ project_id: id, author_id: me.id, body });
    if (error) return ERR(error);
    renderProject(id, isAdmin);
  };

  // Ajouter un titre
  $$('.track-form').forEach(form => form.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const { error } = await sb.from('project_tracks').insert({
      project_id: id, kind: form.dataset.kind,
      title: f.title, artist: f.artist, note: f.note || null
    });
    if (error) return ERR(error);
    renderProject(id, isAdmin);
  });

  // Supprimer un titre
  $$('[data-del]').forEach(btn => btn.onclick = async () => {
    const { error } = await sb.from('project_tracks').delete().eq('id', btn.dataset.del);
    if (error) return ERR(error);
    renderProject(id, isAdmin);
  });
}

// ================= ADMIN : CLIENTS =================
async function renderClientsList() {
  const [cl, pj] = await Promise.all([
    sb.from('profiles').select('*').eq('role', 'client').order('full_name'),
    sb.from('projects').select('id, client_id, status')
  ]);
  if (cl.error) throw cl.error;
  if (pj.error) throw pj.error;

  const total = (id) => pj.data.filter(p => p.client_id === id).length;
  const enCours = (id) => pj.data.filter(p => p.client_id === id && p.status !== 'termine').length;

  app.innerHTML = `
    <div class="page-head">
      <div><h1>Clients</h1><p>${cl.data.length} client(s)</p></div>
      <a class="btn primary" href="#/admin/clients/nouveau">Nouveau client</a>
    </div>
    <div class="list">${cl.data.map(c => `
      <a class="row-card" href="#/admin/clients/${c.id}">
        <div>
          <strong>${esc(c.full_name || 'Sans nom')}</strong>
          <div class="muted">${esc(c.email || '')}${c.phone ? ' · ' + esc(c.phone) : ''}</div>
        </div>
        <span class="status">${enCours(c.id)} en cours · ${total(c.id)} au total</span>
      </a>`).join('') || '<p class="empty">Aucun client pour le moment.</p>'}
    </div>`;
}

function renderNewClient() {
  app.innerHTML = `
    <a href="#/admin/clients" class="back">← Clients</a>
    <div class="page-head" style="margin-top:16px">
      <div><h1>Nouveau client</h1><p>Le compte est créé immédiatement, sans email de confirmation.</p></div>
    </div>
    <section class="card narrow">
      <form id="new-client" class="stack">
        <label>Nom complet<input name="full_name" required></label>
        <label>Téléphone<input type="tel" name="phone" autocomplete="off" required></label>
        <label>Email (identifiant)<input type="email" name="email" required autocomplete="off"></label>
        <label>Mot de passe provisoire (8 caractères min.)
          <input type="text" name="password" minlength="8" required autocomplete="off"></label>
        <button class="btn primary">Créer le compte</button>
      </form>
    </section>`;

  $('#new-client').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const btn = e.target.querySelector('button');
    btn.disabled = true;

    const { data, error } = await sb.functions.invoke('create-client', { body: f });
    btn.disabled = false;

    if (error) {
      const body = await error.context?.json?.().catch(() => null);
      return ERR(new Error(body?.error || error.message));
    }
    toast('Client créé');
    go('admin/clients/' + data.id);
  };
}

async function renderClient(id) {
  const [cl, pj] = await Promise.all([
    sb.from('profiles').select('*').eq('id', id).single(),
    sb.from('projects').select('*').eq('client_id', id)
      .order('event_date', { ascending: false, nullsFirst: false })
  ]);
  if (cl.error) throw cl.error;
  if (pj.error) throw pj.error;

  const c = cl.data;
  const projects = pj.data;
  const count = (k) => projects.filter(p => p.status === k).length;

  app.innerHTML = `
    <a href="#/admin/clients" class="back">← Clients</a>
    <div class="page-head" style="margin-top:16px">
      <div>
        <h1>${esc(c.full_name || 'Sans nom')}</h1>
        <p>Client depuis le ${new Date(c.created_at).toLocaleDateString('fr-FR')}</p>
      </div>
    </div>

    <div class="stats">
      <div class="card stat"><span>Projets</span><strong>${projects.length}</strong></div>
      <div class="card stat"><span>En préparation</span><strong>${count('preparation') + count('nouveau')}</strong></div>
      <div class="card stat"><span>Validés</span><strong>${count('valide')}</strong></div>
      <div class="card stat"><span>Terminés</span><strong>${count('termine')}</strong></div>
    </div>

    <div class="grid two" style="margin-top:25px">
      <section class="card">
        <h2>Coordonnées</h2>
        <div class="info-list" style="margin-bottom:24px">
          ${info('Email', c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '—')}
          ${info('Téléphone', c.phone ? `<a href="tel:${esc(c.phone.replace(/\s+/g, ''))}">${esc(c.phone)}</a>` : '—')}
        </div>
        <form id="client-form" class="stack">
          <label>Nom complet<input name="full_name" value="${esc(c.full_name || '')}" required></label>
          <label>Téléphone<input type="tel" name="phone" value="${esc(c.phone || '')}"></label>
          <button class="btn primary">Enregistrer</button>
        </form>
      </section>

      <section class="card">
        <h2>Historique des projets</h2>
        <div class="list">${projects.map(p => projectRow(p, true)).join('')
          || '<p class="empty">Aucun projet pour ce client.</p>'}</div>
      </section>
    </div>`;

  $('#client-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const { error } = await sb.from('profiles')
      .update({ full_name: f.full_name, phone: f.phone || null })
      .eq('id', id);
    if (error) return ERR(error);
    toast('Coordonnées enregistrées');
    renderClient(id);
  };
}

// ================= CARTE (GOOGLE MAPS) =================
const mapCard = (place) => place ? `
  <section class="card map-card" style="margin-top:25px">
    <div class="map-head">
      <h2>Lieu</h2>
      <a class="btn small" target="_blank" rel="noopener"
         href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}">Ouvrir dans Maps</a>
    </div>
    <iframe class="map-frame" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
      title="Carte du lieu"
      src="https://www.google.com/maps?q=${encodeURIComponent(place)}&output=embed"></iframe>
  </section>` : '';

// ================= PLANNING, CHECKLIST, PAIEMENTS =================
const SCHEDULE_KIND = {
  arrivee: 'Arrivée', installation: 'Installation', set: 'Set', pause: 'Pause',
  repas: 'Repas', ceremonie: 'Cérémonie', autre: 'Autre'
};
const hmTime = (t) => (t ? String(t).slice(0, 5) : '');

function scheduleBlock(items, canEdit) {
  const kindOpts = Object.entries(SCHEDULE_KIND)
    .map(([k, l]) => `<option value="${k}">${l}</option>`).join('');

  return `
  <section class="card extras-full">
    <div class="map-head">
      <h2>Planning de la soirée</h2>
      <button type="button" class="btn small no-print" data-print>Imprimer</button>
    </div>
    <ol class="timeline">
      ${items.map(s => `
        <li class="tl-item">
          <div class="tl-time">${hmTime(s.start_time)}${s.end_time ? `<small>${hmTime(s.end_time)}</small>` : ''}</div>
          <div class="tl-body">
            <span class="tl-kind">${SCHEDULE_KIND[s.kind] || 'Autre'}</span>
            <strong>${esc(s.title)}</strong>
            ${s.details ? `<p>${esc(s.details)}</p>` : ''}
          </div>
          ${canEdit ? `<button class="icon-btn small no-print" data-sdel="${s.id}" aria-label="Supprimer">✕</button>` : ''}
        </li>`).join('') || '<li class="empty">Aucun créneau planifié.</li>'}
    </ol>
    ${canEdit ? `
    <form id="schedule-form" class="track-form stack no-print">
      <div class="row-2">
        <label>Début<input type="time" name="start_time" required></label>
        <label>Fin<input type="time" name="end_time"></label>
      </div>
      <div class="row-2">
        <label>Type<select name="kind">${kindOpts}</select></label>
        <label>Titre<input name="title" required placeholder="Ex. Arrivée du DJ"></label>
      </div>
      <label>Détails (optionnel)<input name="details" placeholder="Ex. Accès par le parking Nord"></label>
      <button class="btn primary">Ajouter au planning</button>
    </form>` : ''}
  </section>`;
}

function tasksBlock(tasks, canEdit) {
  const done = tasks.filter(t => t.done).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return `
  <section class="card">
    <h2>Checklist</h2>
    <div class="progress"><div style="width:${pct}%"></div></div>
    <p class="muted progress-label">${done} / ${tasks.length} terminée(s)</p>
    <ul class="check-list">
      ${tasks.map(t => `
        <li class="${t.done ? 'is-done' : ''}">
          <label class="check">
            <input type="checkbox" data-ttog="${t.id}" ${t.done ? 'checked' : ''} ${canEdit ? '' : 'disabled'}>
            <span>${esc(t.label)}</span>
          </label>
          ${canEdit ? `<button class="icon-btn small no-print" data-tdel="${t.id}" aria-label="Supprimer">✕</button>` : ''}
        </li>`).join('') || '<li class="empty">Aucune tâche.</li>'}
    </ul>
    ${canEdit ? `
    <form id="task-form" class="task-add no-print">
      <input name="label" placeholder="Nouvelle tâche (ex. Envoyer le plan de scène)" required>
      <button class="btn small">Ajouter</button>
    </form>` : ''}
  </section>`;
}

function paymentsBlock(pays, isAdmin) {
  const total = pays.reduce((s, p) => s + Number(p.amount), 0);
  const paid = pays.filter(p => p.paid).reduce((s, p) => s + Number(p.amount), 0);

  return `
  <section class="card">
    <h2>Devis et paiements</h2>
    <div class="stats-mini">
      <div><span>Total</span><strong>${fmtEur(total)}</strong></div>
      <div><span>Réglé</span><strong>${fmtEur(paid)}</strong></div>
      <div><span>Reste</span><strong>${fmtEur(total - paid)}</strong></div>
    </div>
    <ul class="pay-list">
      ${pays.map(p => `
        <li>
          <strong>${esc(p.label)}</strong>
          <div class="pay-right">
            <span class="status ${p.paid ? 'accepted' : 'pending'}">${p.paid ? 'Payé' : 'À régler'}</span>
            <strong>${fmtEur(p.amount)}</strong>
            ${isAdmin ? `
              <button class="btn small no-print" data-ppaid="${p.id}" data-val="${p.paid ? '0' : '1'}">
                ${p.paid ? 'Annuler' : 'Marquer payé'}</button>
              <button class="icon-btn small no-print" data-pdel="${p.id}" aria-label="Supprimer">✕</button>` : ''}
          </div>
        </li>`).join('') || '<li class="empty">Aucune ligne de devis.</li>'}
    </ul>
    ${isAdmin ? `
    <form id="pay-form" class="task-add no-print">
      <input name="label" placeholder="Libellé (ex. Acompte 30 %)" required>
      <input class="amount" name="amount" type="number" step="0.01" min="0" placeholder="€" required>
      <button class="btn small primary">Ajouter</button>
    </form>` : ''}
  </section>`;
}

async function renderExtras(id, isAdmin) {
  const [sc, tk, pa, pr] = await Promise.all([
    sb.from('schedule_items').select('*').eq('project_id', id).order('start_time'),
    sb.from('project_tasks').select('*').eq('project_id', id).order('created_at'),
    sb.from('project_payments').select('*').eq('project_id', id).order('created_at'),
    sb.from('projects').select('status').eq('id', id).single()
  ]);
  for (const r of [sc, tk, pa, pr]) if (r.error) throw r.error;

  const canEdit = isAdmin || pr.data.status !== 'termine';

  app.insertAdjacentHTML('beforeend', `
    <div id="extras" class="extras">
      ${scheduleBlock(sc.data, canEdit)}
      ${tasksBlock(tk.data, canEdit)}
      ${paymentsBlock(pa.data, isAdmin)}
    </div>`);

  const root = $('#extras');
  const reload = () => renderProject(id, isAdmin);

  // Imprimer
  root.querySelector('[data-print]')?.addEventListener('click', () => window.print());

  // Planning
  const sf = $('#schedule-form', root);
  if (sf) sf.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const { error } = await sb.from('schedule_items').insert({
      project_id: id, start_time: f.start_time, end_time: f.end_time || null,
      kind: f.kind, title: f.title, details: f.details || null
    });
    if (error) return ERR(error);
    reload();
  };
  root.querySelectorAll('[data-sdel]').forEach(b => b.onclick = async () => {
    const { error } = await sb.from('schedule_items').delete().eq('id', b.dataset.sdel);
    if (error) return ERR(error);
    reload();
  });

  // Checklist
  const tf = $('#task-form', root);
  if (tf) tf.onsubmit = async (e) => {
    e.preventDefault();
    const label = new FormData(e.target).get('label').trim();
    if (!label) return;
    const { error } = await sb.from('project_tasks').insert({ project_id: id, label });
    if (error) return ERR(error);
    reload();
  };
  root.querySelectorAll('[data-ttog]').forEach(cb => cb.onchange = async () => {
    const { error } = await sb.from('project_tasks').update({ done: cb.checked }).eq('id', cb.dataset.ttog);
    if (error) return ERR(error);
    reload();
  });
  root.querySelectorAll('[data-tdel]').forEach(b => b.onclick = async () => {
    const { error } = await sb.from('project_tasks').delete().eq('id', b.dataset.tdel);
    if (error) return ERR(error);
    reload();
  });

  // Paiements (admin)
  const pf = $('#pay-form', root);
  if (pf) pf.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const { error } = await sb.from('project_payments').insert({
      project_id: id, label: f.label, amount: Number(f.amount)
    });
    if (error) return ERR(error);
    reload();
  };
  root.querySelectorAll('[data-ppaid]').forEach(b => b.onclick = async () => {
    const { error } = await sb.from('project_payments')
      .update({ paid: b.dataset.val === '1' }).eq('id', b.dataset.ppaid);
    if (error) return ERR(error);
    reload();
  });
  root.querySelectorAll('[data-pdel]').forEach(b => b.onclick = async () => {
    const { error } = await sb.from('project_payments').delete().eq('id', b.dataset.pdel);
    if (error) return ERR(error);
    reload();
  });
}

// ================= MENU BURGER (MOBILE) =================
const menuBtn = $('#menu-toggle');
const navEl = $('#nav');

function setMenu(open) {
  navEl.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
  menuBtn.textContent = open ? '✕' : '☰';
}

menuBtn.onclick = () => setMenu(!navEl.classList.contains('open'));
navEl.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
window.addEventListener('hashchange', () => setMenu(false));
window.addEventListener('resize', () => { if (window.innerWidth > 768) setMenu(false); });

// ================= BOOT =================
$('#theme-toggle').onclick = () =>
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
$('#logout').onclick = () => sb.auth.signOut();
window.addEventListener('hashchange', route);
sb.auth.onAuthStateChange((event) => { if (event !== 'INITIAL_SESSION') route(); });

setTheme(document.documentElement.dataset.theme);
route();
