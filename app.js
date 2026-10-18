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
const fmtEur = (n) => Number(n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const hm = (t) => (t ? String(t).slice(0, 5) : '');
const today = () => new Date().toLocaleDateString('en-CA');
const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');
};
const phoneHref = (p) => String(p || '').replace(/[^\d+]/g, '');
const go = (p) => (location.hash === '#/' + p ? route() : (location.hash = '#/' + p));
const info = (label, value) => `
  <div class="info-item"><span>${label}</span><strong>${value}</strong></div>`;
const ERR = (e) => toast(e?.message || 'Une erreur est survenue', false);

// Exécute une requête Supabase et affiche l'erreur éventuelle
async function run(promise, okMsg) {
  const { error } = await promise;
  if (error) { ERR(error); return false; }
  if (okMsg) toast(okMsg);
  return true;
}

function toast(msg, ok = true) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast ' + (ok ? 'ok' : 'ko');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3500);
}

const STATUS = { nouveau: 'Nouveau', preparation: 'En préparation', valide: 'Validé', termine: 'Terminé' };
const STATUS_CLS = { nouveau: 'pending', preparation: 'pending', valide: 'accepted', termine: 'done' };
const STATUS_KEYS = Object.keys(STATUS);
const SCHEDULE_KIND = {
  arrivee: 'Arrivée', installation: 'Installation', set: 'Set', pause: 'Pause',
  repas: 'Repas', ceremonie: 'Cérémonie', autre: 'Autre'
};

// ================= THÈME =================
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('theme', t);
  $('#theme-toggle').textContent = t === 'dark' ? '☀' : '☾';
}

// ================= SESSION =================
let me = null;

async function loadMe() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { me = null; return; }
  const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  if (error) throw error;
  me = data;
}

// ================= NAVIGATION =================
const parseHash = () => {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [a, b, c] = path.split('/').filter(Boolean);
  return { a, b, c, params: new URLSearchParams(query) };
};

function renderHeader() {
  const nav = $('#nav');
  $('#logout').classList.toggle('hidden', !me);
  if (!me) { nav.innerHTML = ''; return; }

  const { a, b } = parseHash();
  const current = a === 'admin' ? (b === 'clients' ? 'admin/clients' : 'admin') : a;
  const links = me.role === 'admin'
    ? [['admin', 'Projets'], ['admin/clients', 'Clients'], ['compte', 'Mon compte']]
    : [['projets', 'Mes projets'], ['compte', 'Mon compte']];

  nav.innerHTML = links.map(([p, l]) =>
    `<a href="#/${p}" class="${current === p ? 'active' : ''}">${l}</a>`).join('');
}

async function route() {
  try {
    await loadMe();
    renderHeader();
    if (!me) return renderLogin();
    await dispatch(parseHash());
  } catch (e) {
    app.innerHTML = `<p class="empty">Erreur : ${esc(e.message)}</p>`;
  }
}

async function dispatch({ a, b, c, params }) {
  if (a === 'compte') return renderAccount();

  if (me.role === 'admin') {
    if (a !== 'admin') return go('admin');
    if (b === 'nouveau') return renderNewProject(params.get('client') || '');
    if (b === 'projets' && c) return renderProject(c, true);
    if (b === 'clients' && c === 'nouveau') return renderNewClient();
    if (b === 'clients' && c) return renderClient(c);
    if (b === 'clients') return renderClientsList();
    return renderAdminList();
  }

  if (a !== 'projets') return go('projets');
  if (b) return renderProject(b, false);
  return renderClientList();
}

// ================= CONNEXION =================
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

// ================= MON COMPTE =================
function renderAccount() {
  app.innerHTML = `
    <div class="page-head"><div>
      <h1>Mon compte</h1>
      <p>${esc(me.email || '')}</p>
    </div></div>
    <div class="grid two">
      <section class="card">
        <h2>Coordonnées</h2>
        <form id="acc-form" class="stack">
          <label>Nom complet<input name="full_name" value="${esc(me.full_name || '')}" required></label>
          <label>Téléphone<input type="tel" name="phone" value="${esc(me.phone || '')}"></label>
          <button class="btn primary">Enregistrer</button>
        </form>
      </section>
      <section class="card">
        <h2>Mot de passe</h2>
        <form id="pwd-form" class="stack">
          <label>Nouveau mot de passe (8 caractères min.)
            <input type="password" name="password" minlength="8" required autocomplete="new-password"></label>
          <label>Confirmer
            <input type="password" name="confirm" minlength="8" required autocomplete="new-password"></label>
          <button class="btn primary">Changer le mot de passe</button>
        </form>
      </section>
    </div>`;

  $('#acc-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const ok = await run(sb.from('profiles')
      .update({ full_name: f.full_name.trim(), phone: f.phone.trim() || null })
      .eq('id', me.id), 'Coordonnées enregistrées');
    if (ok) { me.full_name = f.full_name.trim(); me.phone = f.phone.trim() || null; }
  };

  $('#pwd-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (f.password !== f.confirm) return ERR(new Error('Les deux mots de passe ne correspondent pas'));
    const { error } = await sb.auth.updateUser({ password: f.password });
    if (error) return ERR(error);
    e.target.reset();
    toast('Mot de passe modifié');
  };
}

// ================= LISTES PROJETS =================
function projectRow(p, isAdmin, unpaid = 0) {
  return `
  <a class="row-card" href="#/${isAdmin ? 'admin/projets' : 'projets'}/${p.id}">
    <div>
      <strong>${esc(p.title)}</strong>
      <div class="muted">${p.event_date ? fmtDate(p.event_date) : 'Date à définir'}${p.location ? ' · ' + esc(p.location) : ''}</div>
      ${isAdmin && p.client ? `<div class="muted">${esc(p.client.full_name || 'Sans nom')}${p.client.email ? ' · ' + esc(p.client.email) : ''}</div>` : ''}
      ${isAdmin && unpaid > 0 ? `<div class="warn-text">Reste à encaisser : ${fmtEur(unpaid)}</div>` : ''}
    </div>
    <span class="status ${STATUS_CLS[p.status]}">${STATUS[p.status]}</span>
  </a>`;
}

async function renderAdminList() {
  const [pj, pay] = await Promise.all([
    sb.from('projects').select('*, client:profiles!client_id(full_name, email)')
      .order('event_date', { ascending: true, nullsFirst: false }),
    sb.from('project_payments').select('project_id, amount, paid')
  ]);
  if (pj.error) throw pj.error;
  if (pay.error) throw pay.error;

  const unpaid = {};
  let totalUnpaid = 0;
  pay.data.forEach(p => {
    if (p.paid) return;
    const v = Number(p.amount);
    unpaid[p.project_id] = (unpaid[p.project_id] || 0) + v;
    totalUnpaid += v;
  });

  const t = today();
  const active = pj.data.filter(p => p.status !== 'termine');
  const soon = active.filter(p => p.event_date && p.event_date >= t && p.event_date <= addDays(t, 30)).length;
  const noDate = active.filter(p => !p.event_date).length;

  app.innerHTML = `
    <div class="page-head">
      <div><h1>Projets</h1><p>${pj.data.length} projet(s) au total</p></div>
      <a class="btn primary" href="#/admin/nouveau">Nouveau projet</a>
    </div>

    <div class="stats">
      <div class="card stat"><span>En cours</span><strong>${active.length}</strong></div>
      <div class="card stat"><span>Dans les 30 jours</span><strong>${soon}</strong></div>
      <div class="card stat"><span>Sans date</span><strong>${noDate}</strong></div>
      <div class="card stat"><span>Reste à encaisser</span><strong>${fmtEur(totalUnpaid)}</strong></div>
    </div>

    <div class="filters">
      <input id="f-q" placeholder="Rechercher un projet, un client, un lieu…">
      <select id="f-s">
        <option value="">Tous les statuts</option>
        ${STATUS_KEYS.map(k => `<option value="${k}">${STATUS[k]}</option>`).join('')}
      </select>
    </div>
    <div class="list" id="proj-list"></div>`;

  const draw = () => {
    const q = $('#f-q').value.trim().toLowerCase();
    const s = $('#f-s').value;
    const list = pj.data.filter(p => (!s || p.status === s) &&
      `${p.title} ${p.location || ''} ${p.client?.full_name || ''} ${p.client?.email || ''}`.toLowerCase().includes(q));
    $('#proj-list').innerHTML = list.map(p => projectRow(p, true, unpaid[p.id] || 0)).join('')
      || '<p class="empty">Aucun projet trouvé.</p>';
  };
  $('#f-q').oninput = draw;
  $('#f-s').onchange = draw;
  draw();
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
    <div class="list">${data.map(p => projectRow(p, false)).join('')
      || '<p class="empty">Aucun projet pour le moment.</p>'}</div>`;
}

// ================= ADMIN : NOUVEAU PROJET =================
async function renderNewProject(preClient = '') {
  const { data: clients, error } = await sb.from('profiles')
    .select('id, full_name, email').eq('role', 'client').order('full_name');
  if (error) throw error;

  app.innerHTML = `
    <a href="#/admin" class="back">← Projets</a>
    <div class="page-head" style="margin-top:16px">
      <div><h1>Nouveau projet</h1><p>Choisissez le client à qui le projet est rattaché.</p></div>
    </div>
    ${clients.length ? '' : '<p class="empty">Aucun client. Créez-le d\'abord dans Clients.</p>'}
    <section class="card narrow">
      <form id="new-project" class="stack">
        <label>Client
          <select name="client_id" required>
            ${clients.map(c => `<option value="${c.id}" ${c.id === preClient ? 'selected' : ''}>
              ${esc(c.full_name || 'Sans nom')} — ${esc(c.email || '')}</option>`).join('')}
          </select>
        </label>
        <label>Nom du projet / événement<input name="title" required></label>
        <div class="row-2">
          <label>Date<input type="date" name="event_date"></label>
          <label>Lieu<input name="location" placeholder="Adresse complète, avec la ville"></label>
        </div>
        <label>Description<textarea name="description" rows="4"></textarea></label>
        <button class="btn primary" ${clients.length ? '' : 'disabled'}>Créer le projet</button>
      </form>
    </section>`;

  $('#new-project').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const { data, error } = await sb.from('projects').insert({
      client_id: f.client_id,
      title: f.title.trim(),
      event_date: f.event_date || null,
      location: f.location.trim() || null,
      description: f.description.trim() || null
    }).select().single();
    if (error) return ERR(error);
    toast('Projet créé');
    go('admin/projets/' + data.id);
  };
}

// ================= BLOCS DU PROJET =================
function infoBlock(p, client, isAdmin) {
  if (!isAdmin) {
    return `
    <section class="card">
      <h2>Mon projet</h2>
      <div class="info-list">
        ${info('Date', p.event_date ? fmtDate(p.event_date) : 'À définir')}
        ${info('Lieu', esc(p.location || '—'))}
        ${info('Statut', `<span class="status ${STATUS_CLS[p.status]}">${STATUS[p.status]}</span>`)}
      </div>
      ${p.description ? `<div class="notes"><span>Description</span><p>${esc(p.description)}</p></div>` : ''}
    </section>`;
  }

  const statusOptions = STATUS_KEYS.map(k =>
    `<option value="${k}" ${k === p.status ? 'selected' : ''}>${STATUS[k]}</option>`).join('');

  return `
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
        ${info('Téléphone', client.phone ? `<a href="tel:${phoneHref(client.phone)}">${esc(client.phone)}</a>` : '—')}
      </div>
      <div class="actions"><a class="btn small" href="#/admin/clients/${p.client_id}">Fiche client</a></div>
    </section>`;
}

function updatesBlock(updates, isAdmin, myId) {
  return `
    <section class="card">
      <h2>Suivi</h2>
      <form id="update-form" class="stack update-form">
        <textarea name="body" rows="3" placeholder="Ajouter une information ou une mise à jour…" required></textarea>
        <button class="btn primary" style="align-self:flex-end">Publier</button>
      </form>
      <div class="updates">
        ${updates.map(u => `
          <div class="update-item">
            <div class="update-meta">
              ${u.author_id === myId ? 'Vous' : (isAdmin ? 'Client' : 'Votre DJ')} · ${fmtDateTime(u.created_at)}
              ${isAdmin ? `<button class="icon-btn small no-print" data-udel="${u.id}" aria-label="Supprimer">✕</button>` : ''}
            </div>
            <p>${esc(u.body)}</p>
          </div>`).join('') || '<p class="empty">Aucune mise à jour pour le moment.</p>'}
      </div>
    </section>`;
}

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
          ${canEdit ? `<button class="icon-btn small" data-trkdel="${t.id}" aria-label="Supprimer">✕</button>` : ''}
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

function mapCard(place) {
  if (!place) return '';
  const q = encodeURIComponent(place);
  return `
  <section class="card map-card" style="margin-top:25px">
    <div class="map-head">
      <h2>Lieu</h2>
      <a class="btn small no-print" target="_blank" rel="noopener"
         href="https://www.google.com/maps/search/?api=1&query=${q}">Ouvrir dans Maps</a>
    </div>
    <iframe class="map-frame" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
      title="Carte du lieu" src="https://www.google.com/maps?q=${q}&output=embed"></iframe>
  </section>`;
}

function scheduleBlock(items, canEdit) {
  const kindOpts = Object.entries(SCHEDULE_KIND)
    .map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
  return `
  <section class="card extras-full">
    <h2>Planning de la soirée</h2>
    <ol class="timeline">
      ${items.map(s => `
        <li class="tl-item">
          <div class="tl-time">${hm(s.start_time)}${s.end_time ? `<small>${hm(s.end_time)}</small>` : ''}</div>
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

// ================= EXPORT AGENDA (.ics) =================
function downloadIcs(p) {
  if (!p.event_date) return ERR(new Error('Ce projet n\'a pas encore de date'));
  const icsText = (s) => String(s || '')
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DJ Booking//FR',
    'BEGIN:VEVENT',
    `UID:${p.id}@dj-booking`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${p.event_date.replace(/-/g, '')}`,
    `DTEND;VALUE=DATE:${addDays(p.event_date, 1).replace(/-/g, '')}`,
    `SUMMARY:${icsText(p.title)}`,
    `LOCATION:${icsText(p.location)}`,
    `DESCRIPTION:${icsText(p.description)}`,
    'END:VEVENT', 'END:VCALENDAR'
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${p.title}.ics`.replace(/[^\w.-]+/g, '_');
  a.click();
  URL.revokeObjectURL(a.href);
}

// ================= DÉTAIL PROJET =================
async function renderProject(id, isAdmin) {
  const [pr, up, tr, sc, tk, pa] = await Promise.all([
    sb.from('projects').select('*, client:profiles!client_id(full_name, email, phone)').eq('id', id).single(),
    sb.from('project_updates').select('*').eq('project_id', id).order('created_at', { ascending: false }),
    sb.from('project_tracks').select('*').eq('project_id', id).order('created_at'),
    sb.from('schedule_items').select('*').eq('project_id', id).order('start_time'),
    sb.from('project_tasks').select('*').eq('project_id', id).order('created_at'),
    sb.from('project_payments').select('*').eq('project_id', id).order('created_at')
  ]);
  for (const r of [pr, up, tr, sc, tk, pa]) if (r.error) throw r.error;

  const p = pr.data;
  const client = p.client || {};
  const canEdit = isAdmin || p.status !== 'termine';
  const must = tr.data.filter(t => t.kind === 'must_play');
  const avoid = tr.data.filter(t => t.kind === 'do_not_play');
  const reload = () => renderProject(id, isAdmin);

  app.innerHTML = `
    <a href="${isAdmin ? '#/admin' : '#/projets'}" class="back no-print">← ${isAdmin ? 'Projets' : 'Mes projets'}</a>
    <div class="page-head" style="margin-top:16px">
      <div>
        <h1>${esc(p.title)}</h1>
        <p>${p.event_date ? fmtDate(p.event_date) : 'Date à définir'}${p.location ? ' · ' + esc(p.location) : ''}</p>
      </div>
      <div class="head-right">
        <span class="status ${STATUS_CLS[p.status]}">${STATUS[p.status]}</span>
        <div class="actions no-print">
          <button class="btn small" id="ics">Agenda (.ics)</button>
          <button class="btn small" id="print">Imprimer</button>
        </div>
      </div>
    </div>

    <div class="grid two">
      ${infoBlock(p, client, isAdmin)}
      ${updatesBlock(up.data, isAdmin, me.id)}
    </div>

    ${mapCard(p.location)}

    <div class="extras">
      ${scheduleBlock(sc.data, canEdit)}
      ${tasksBlock(tk.data, canEdit)}
      ${paymentsBlock(pa.data, isAdmin)}
    </div>

    <div class="grid two" style="margin-top:25px">
      ${trackPanel('must_play', 'À passer absolument', must, canEdit)}
      ${trackPanel('do_not_play', 'À ne pas passer', avoid, canEdit)}
    </div>`;

  // Boutons d'en-tête
  $('#ics').onclick = () => downloadIcs(p);
  $('#print').onclick = () => window.print();

  // Modification du projet (admin)
  const editForm = $('#edit-form');
  if (editForm) {
    editForm.onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      if (await run(sb.from('projects').update({
        title: f.title.trim(),
        event_date: f.event_date || null,
        location: f.location.trim() || null,
        description: f.description.trim() || null,
        status: f.status
      }).eq('id', id), 'Projet enregistré')) reload();
    };
    $('#delete-project').onclick = async () => {
      if (!confirm('Supprimer ce projet et tout son contenu ? Cette action est définitive.')) return;
      if (await run(sb.from('projects').delete().eq('id', id), 'Projet supprimé')) go('admin');
    };
  }

  // Suivi : publier et supprimer
  $('#update-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = new FormData(e.target).get('body').trim();
    if (!body) return;
    if (await run(sb.from('project_updates').insert({ project_id: id, author_id: me.id, body }))) reload();
  };
  $$('[data-udel]').forEach(b => b.onclick = async () => {
    if (await run(sb.from('project_updates').delete().eq('id', b.dataset.udel))) reload();
  });

  // Titres
  $$('.track-form').forEach(form => form.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    if (await run(sb.from('project_tracks').insert({
      project_id: id, kind: form.dataset.kind,
      title: f.title.trim(), artist: f.artist.trim(), note: f.note?.trim() || null
    }))) reload();
  });
  $$('[data-trkdel]').forEach(b => b.onclick = async () => {
    if (await run(sb.from('project_tracks').delete().eq('id', b.dataset.trkdel))) reload();
  });

  // Planning
  const sf = $('#schedule-form');
  if (sf) sf.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (await run(sb.from('schedule_items').insert({
      project_id: id, start_time: f.start_time, end_time: f.end_time || null,
      kind: f.kind, title: f.title.trim(), details: f.details?.trim() || null
    }))) reload();
  };
  $$('[data-sdel]').forEach(b => b.onclick = async () => {
    if (await run(sb.from('schedule_items').delete().eq('id', b.dataset.sdel))) reload();
  });

  // Checklist
  const tf = $('#task-form');
  if (tf) tf.onsubmit = async (e) => {
    e.preventDefault();
    const label = new FormData(e.target).get('label').trim();
    if (!label) return;
    if (await run(sb.from('project_tasks').insert({ project_id: id, label }))) reload();
  };
  $$('[data-ttog]').forEach(cb => cb.onchange = async () => {
    if (await run(sb.from('project_tasks').update({ done: cb.checked }).eq('id', cb.dataset.ttog))) reload();
  });
  $$('[data-tdel]').forEach(b => b.onclick = async () => {
    if (await run(sb.from('project_tasks').delete().eq('id', b.dataset.tdel))) reload();
  });

  // Paiements (admin)
  const pf = $('#pay-form');
  if (pf) pf.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (await run(sb.from('project_payments').insert({
      project_id: id, label: f.label.trim(), amount: Number(f.amount)
    }))) reload();
  };
  $$('[data-ppaid]').forEach(b => b.onclick = async () => {
    if (await run(sb.from('project_payments')
      .update({ paid: b.dataset.val === '1' }).eq('id', b.dataset.ppaid))) reload();
  });
  $$('[data-pdel]').forEach(b => b.onclick = async () => {
    if (await run(sb.from('project_payments').delete().eq('id', b.dataset.pdel))) reload();
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
        <label>Téléphone<input type="tel" name="phone" autocomplete="off"></label>
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
      let msg = error.message;
      try { msg = (await error.context.json()).error || msg; } catch { /* message par défaut */ }
      return ERR(new Error(msg));
    }
    if (data?.error) return ERR(new Error(data.error));
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
  const count = (...ks) => projects.filter(p => ks.includes(p.status)).length;

  app.innerHTML = `
    <a href="#/admin/clients" class="back">← Clients</a>
    <div class="page-head" style="margin-top:16px">
      <div>
        <h1>${esc(c.full_name || 'Sans nom')}</h1>
        <p>Client depuis le ${new Date(c.created_at).toLocaleDateString('fr-FR')}</p>
      </div>
      <a class="btn primary" href="#/admin/nouveau?client=${c.id}">Nouveau projet pour ce client</a>
    </div>

    <div class="stats">
      <div class="card stat"><span>Projets</span><strong>${projects.length}</strong></div>
      <div class="card stat"><span>En préparation</span><strong>${count('nouveau', 'preparation')}</strong></div>
      <div class="card stat"><span>Validés</span><strong>${count('valide')}</strong></div>
      <div class="card stat"><span>Terminés</span><strong>${count('termine')}</strong></div>
    </div>

    <div class="grid two" style="margin-top:25px">
      <section class="card">
        <h2>Coordonnées</h2>
        <div class="info-list" style="margin-bottom:24px">
          ${info('Email', c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '—')}
          ${info('Téléphone', c.phone ? `<a href="tel:${phoneHref(c.phone)}">${esc(c.phone)}</a>` : '—')}
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
    if (await run(sb.from('profiles')
      .update({ full_name: f.full_name.trim(), phone: f.phone.trim() || null })
      .eq('id', id), 'Coordonnées enregistrées')) renderClient(id);
  };
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
sb.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') route();
});

setTheme(document.documentElement.dataset.theme);
route();
