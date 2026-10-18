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
  const links = me.role === 'admin'
    ? [['admin', 'Tous les projets']]
    : [['projets', 'Mes projets']];
  nav.innerHTML = links.map(([p, l]) =>
    `<a href="#/${p}" class="${location.hash.startsWith('#/' + p) ? 'active' : ''}">${l}</a>`).join('');
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
