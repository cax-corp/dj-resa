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
const fmtEur = (n) => Number(n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const hm = (t) => String(t).slice(0, 5);
const today = () => new Date().toLocaleDateString('en-CA'); // AAAA-MM-JJ local
const STATUS = { pending: 'En attente', accepted: 'Confirmée', declined: 'Refusée', cancelled: 'Annulée', done: 'Terminée' };
const go = (p) => (location.hash === '#/' + p ? route() : (location.hash = '#/' + p));

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
let me = null; // profil connecté

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
  const links = me.role === 'dj'
    ? [['dj/dashboard', 'Tableau de bord'], ['dj/profile', 'Mon profil'], ['bookings', 'Réservations']]
    : [['client/djs', 'Trouver un DJ'], ['bookings', 'Mes réservations']];
  nav.innerHTML = links.map(([p, l]) =>
    `<a href="#/${p}" class="${location.hash === '#/' + p ? 'active' : ''}">${l}</a>`).join('');
}

async function route() {
  try {
    await loadMe();
    renderHeader();
    if (!me) return renderAuth('login');

    const [a, b, c] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    const isDj = me.role === 'dj';

    if (a === 'dj' && !isDj) return go('client/djs');
    if (a === 'client' && isDj) return go('dj/dashboard');
    if (a === 'dj' && b === 'dashboard') return await renderDjDashboard();
    if (a === 'dj' && b === 'profile') return await renderDjProfile();
    if (a === 'client' && b === 'djs') return await renderDjList();
    if (a === 'client' && b === 'dj' && c) return await renderDjDetail(c);
    if (a === 'bookings' && b) return await renderBookingDetail(b);
    if (a === 'bookings') return await renderBookings();
    return go(isDj ? 'dj/dashboard' : 'client/djs');
  } catch (e) {
    app.innerHTML = `<p class="empty">Erreur : ${esc(e.message)}</p>`;
  }
}

// ================= AUTH =================
function renderAuth(mode = 'login') {
  const signup = mode === 'signup';
  app.innerHTML = `
  <section class="auth card">
    <h1>${signup ? 'Créer un compte' : 'Connexion'}</h1>
    <form id="auth-form" class="stack">
      ${signup ? `
        <label>Nom complet<input name="full_name" required></label>
        <label>Vous êtes
          <select name="role">
            <option value="client">Client</option>
            <option value="dj">DJ / Prestataire</option>
          </select>
        </label>
        <label>Nom de scène (DJ uniquement)<input name="stage_name"></label>` : ''}
      <label>Email<input type="email" name="email" required autocomplete="email"></label>
      <label>Mot de passe<input type="password" name="password" minlength="8" required
        autocomplete="${signup ? 'new-password' : 'current-password'}"></label>
      <button class="btn primary block">${signup ? 'Créer mon compte' : 'Se connecter'}</button>
    </form>
    <button class="link" id="switch">${signup ? 'Déjà un compte ? Se connecter' : 'Pas de compte ? Créer un compte'}</button>
  </section>`;

  $('#switch').onclick = () => renderAuth(signup ? 'login' : 'signup');
  $('#auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (signup) {
      const { error } = await sb.auth.signUp({
        email: f.email, password: f.password,
        options: { data: { full_name: f.full_name, role: f.role, stage_name: f.stage_name || null } }
      });
      if (error) return ERR(error);
      toast('Compte créé ! Vérifiez vos emails si la confirmation est activée.');
      return;
    }
    const { error } = await sb.auth.signInWithPassword({ email: f.email, password: f.password });
    if (error) ERR(error);
  };
}

// ================= CLIENT : LISTE DES DJ =================
const djCard = (d) => `
  <a class="card dj-card" href="#/client/dj/${d.id}">
    <h3>${esc(d.stage_name)}</h3>
    <p class="muted">${esc(d.city || '—')}</p>
    <div class="tags">${(d.genres || []).map(g => `<span class="tag">${esc(g)}</span>`).join('')}</div>
    <div class="card-foot"><strong>${fmtEur(d.hourly_rate)}/h</strong><span class="btn small primary">Réserver</span></div>
  </a>`;

async function renderDjList() {
  const { data: djs, error } = await sb.from('dj_profiles').select('*')
    .eq('is_public', true).order('stage_name');
  if (error) throw error;

  app.innerHTML = `
    <div class="page-head"><div>
      <h1>Trouver un DJ</h1>
      <p class="muted">Comparez les profils et envoyez une demande</p>
    </div></div>
    <input id="q" class="search" placeholder="Rechercher un nom, une ville, un style…">
    <div class="grid three" id="grid"></div>`;

  const draw = (q) => {
    const s = q.toLowerCase();
    const list = djs.filter(d =>
      `${d.stage_name} ${d.city || ''} ${(d.genres || []).join(' ')}`.toLowerCase().includes(s));
    $('#grid').innerHTML = list.map(djCard).join('') || '<p class="empty">Aucun DJ trouvé.</p>';
  };
  $('#q').oninput = (e) => draw(e.target.value);
  draw('');
}

// ================= CLIENT : FICHE DJ + DEMANDE =================
async function renderDjDetail(id) {
  const { data: d, error } = await sb.from('dj_profiles').select('*').eq('id', id).single();
  if (error) throw error;

  app.innerHTML = `
    <a href="#/client/djs" class="back">← Retour aux DJ</a>
    <div class="grid two" style="margin-top:16px">
      <section class="card">
        <h1>${esc(d.stage_name)}</h1>
        <p class="muted">${esc(d.city || '')} · ${fmtEur(d.hourly_rate)} / heure</p>
        <div class="tags" style="margin:12px 0">${(d.genres || []).map(g => `<span class="tag">${esc(g)}</span>`).join('')}</div>
        <p class="bio">${esc(d.bio || 'Pas encore de présentation.')}</p>
      </section>
      <section class="card">
        <h2 style="margin-top:0">Demander une réservation</h2>
        <form id="book" class="stack">
          <label>Nom de l'événement<input name="event_name" required></label>
          <div class="row-2">
            <label>Date<input type="date" name="event_date" min="${today()}" required></label>
            <label>Lieu<input name="location"></label>
          </div>
          <div class="row-2">
            <label>Début<input type="time" name="start_time" required></label>
            <label>Fin<input type="time" name="end_time" required></label>
          </div>
          <label>Nombre d'invités<input type="number" name="guests" min="1"></label>
          <label>Notes<textarea name="notes" rows="3"></textarea></label>
          <button class="btn primary">Envoyer la demande</button>
        </form>
      </section>
    </div>`;

  $('#book').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const { data, error } = await sb.from('bookings').insert({
      client_id: me.id, dj_id: id,
      event_name: f.event_name, event_date: f.event_date,
      start_time: f.start_time, end_time: f.end_time,
      location: f.location || null,
      guests: f.guests ? Number(f.guests) : null,
      notes: f.notes || null
    }).select().single();
    if (error) return ERR(error);
    toast('Demande envoyée au DJ');
    go('bookings/' + data.id);
  };
}

// ================= LISTES DE RÉSERVATIONS =================
function bookingRow(b) {
  return `
  <a class="row-card" href="#/bookings/${b.id}">
    <div>
      <strong>${esc(b.event_name)}</strong>
      <div class="muted">${fmtDate(b.event_date)} · ${hm(b.start_time)}–${hm(b.end_time)}${b.location ? ' · ' + esc(b.location) : ''}</div>
    </div>
    <span class="status ${b.status}">${STATUS[b.status]}</span>
  </a>`;
}

async function renderBookings() {
  const col = me.role === 'dj' ? 'dj_id' : 'client_id';
  const { data, error } = await sb.from('bookings').select('*')
    .eq(col, me.id).order('event_date', { ascending: false });
  if (error) throw error;
  app.innerHTML = `
    <div class="page-head"><h1>Réservations</h1></div>
    <div class="list">${data.map(bookingRow).join('') || '<p class="empty">Aucune réservation pour le moment.</p>'}</div>`;
}

// ================= DÉTAIL RÉSERVATION + TITRES =================
function trackPanel(kind, title, items, canEdit) {
  const must = kind === 'must_play';
  return `
  <section class="card track-panel ${kind}">
    <h2 style="margin-top:0">${title}</h2>
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

async function renderBookingDetail(id) {
  const [{ data: b, error }, { data: tracks, error: e2 }] = await Promise.all([
    sb.from('bookings').select('*').eq('id', id).single(),
    sb.from('track_requests').select('*').eq('booking_id', id).order('created_at')
  ]);
  if (error || e2) throw (error || e2);

  const isDj = me.role === 'dj' && b.dj_id === me.id;
  const isClient = b.client_id === me.id;
  const canEdit = isClient && ['pending', 'accepted'].includes(b.status);

  const actions = [];
  if (isDj && b.status === 'pending') actions.push(['accepted', 'Accepter', 'primary'], ['declined', 'Refuser', 'danger']);
  if (isDj && b.status === 'accepted') actions.push(['done', 'Marquer terminée', '']);
  if (isClient && b.status === 'pending') actions.push(['cancelled', 'Annuler la demande', 'danger']);

  const must = tracks.filter(t => t.kind === 'must_play');
  const avoid = tracks.filter(t => t.kind === 'do_not_play');

  app.innerHTML = `
    <a href="#/bookings" class="back">← Réservations</a>
    <div class="page-head" style="margin-top:12px">
      <div>
        <h1>${esc(b.event_name)}</h1>
        <p class="muted">${fmtDate(b.event_date)} · ${hm(b.start_time)} – ${hm(b.end_time)}${b.location ? ' · ' + esc(b.location) : ''}${b.guests ? ' · ' + b.guests + ' invités' : ''}</p>
        ${b.notes ? `<p class="muted">${esc(b.notes)}</p>` : ''}
      </div>
      <span class="status ${b.status}">${STATUS[b.status]}</span>
    </div>
    ${actions.length ? `<div class="actions">${actions.map(([s, l, c]) =>
      `<button class="btn ${c}" data-st="${s}">${l}</button>`).join('')}</div>` : ''}
    <div class="grid two" style="margin-top:16px">
      ${trackPanel('must_play', 'À passer absolument', must, canEdit)}
      ${trackPanel('do_not_play', 'À ne pas passer', avoid, canEdit)}
    </div>`;

  $$('[data-st]').forEach(btn => btn.onclick = async () => {
    const { error } = await sb.from('bookings').update({ status: btn.dataset.st }).eq('id', id);
    if (error) return ERR(error);
    toast('Statut mis à jour');
    renderBookingDetail(id);
  });

  $$('.track-form').forEach(form => form.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const { error } = await sb.from('track_requests').insert({
      booking_id: id, kind: form.dataset.kind,
      title: f.title, artist: f.artist, note: f.note || null
    });
    if (error) return ERR(error);
    renderBookingDetail(id);
  });

  $$('[data-del]').forEach(btn => btn.onclick = async () => {
    const { error } = await sb.from('track_requests').delete().eq('id', btn.dataset.del);
    if (error) return ERR(error);
    renderBookingDetail(id);
  });
}

// ================= DJ : TABLEAU DE BORD =================
async function renderDjDashboard() {
  const { data, error } = await sb.from('bookings').select('*')
    .eq('dj_id', me.id).order('event_date');
  if (error) throw error;

  const pending = data.filter(b => b.status === 'pending');
  const upcoming = data.filter(b => b.status === 'accepted' && b.event_date >= today());

  app.innerHTML = `
    <div class="page-head"><div>
      <h1>Bonjour ${esc(me.full_name || '')}</h1>
      <p class="muted">Vos demandes et prochains événements</p>
    </div></div>
    <div class="stats">
      <div class="card stat"><span>En attente</span><strong>${pending.length}</strong></div>
      <div class="card stat"><span>À venir</span><strong>${upcoming.length}</strong></div>
      <div class="card stat"><span>Total</span><strong>${data.length}</strong></div>
    </div>
    <h2>Demandes en attente</h2>
    <div class="list">${pending.map(bookingRow).join('') || '<p class="empty">Aucune demande en attente.</p>'}</div>
    <h2>Prochains événements</h2>
    <div class="list">${upcoming.map(bookingRow).join('') || '<p class="empty">Rien de prévu.</p>'}</div>`;
}

// ================= DJ : PROFIL =================
async function renderDjProfile() {
  const { data: d, error } = await sb.from('dj_profiles').select('*').eq('id', me.id).single();
  if (error) throw error;

  app.innerHTML = `
    <div class="page-head"><h1>Mon profil DJ</h1></div>
    <form id="dj-form" class="card stack narrow">
      <label>Nom de scène<input name="stage_name" value="${esc(d.stage_name)}" required></label>
      <div class="row-2">
        <label>Ville<input name="city" value="${esc(d.city || '')}"></label>
        <label>Tarif horaire (€)<input type="number" name="hourly_rate" min="0" step="1" value="${d.hourly_rate}"></label>
      </div>
      <label>Styles (séparés par des virgules)<input name="genres" value="${esc((d.genres || []).join(', '))}"></label>
      <label>Présentation<textarea name="bio" rows="5">${esc(d.bio || '')}</textarea></label>
      <label class="check"><input type="checkbox" name="is_public" ${d.is_public ? 'checked' : ''}> Profil visible par les clients</label>
      <button class="btn primary">Enregistrer</button>
    </form>`;

  $('#dj-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const { error } = await sb.from('dj_profiles').update({
      stage_name: f.get('stage_name'),
      city: f.get('city') || null,
      bio: f.get('bio') || null,
      hourly_rate: Number(f.get('hourly_rate') || 0),
      genres: String(f.get('genres')).split(',').map(s => s.trim()).filter(Boolean),
      is_public: f.get('is_public') === 'on'
    }).eq('id', me.id);
    if (error) return ERR(error);
    toast('Profil enregistré');
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
// Ferme le menu après un clic sur un lien
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
