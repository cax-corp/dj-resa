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
const safeUrl = (value) => {
  try {
    const url = new URL(String(value || ''));
    return /^https?:$/.test(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
};
const go = (p) => (location.hash === '#/' + p ? route() : (location.hash = '#/' + p));
const publicProjectUrl = (token) => `${location.origin}${location.pathname}#/partage/${encodeURIComponent(token)}`;
const SHARE_SECTIONS = {
  event_date: 'Date', location: 'Lieu', status: 'Statut', description: 'Description',
  must_play: 'À passer absolument', do_not_play: 'À ne pas passer',
  schedule: 'Planning', tasks: 'Checklist', updates: 'Suivi',
  payments: 'Tarifs et paiements', client: 'Coordonnées du client', invoices: 'Résumé des factures'
};
const DEFAULT_SHARE_SECTIONS = ['event_date', 'location', 'status', 'description', 'must_play', 'do_not_play'];
const info = (label, value) => `
  <div class="info-item"><span>${label}</span><strong>${value}</strong></div>`;
const ERR = (e) => toast(e?.message || 'Une erreur est survenue', false);

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

const STATUS = { nouveau: 'Nouveau', preparation: 'En préparation', valide: 'Validé', en_cours: 'En cours', termine: 'Terminé' };
const STATUS_CLS = { nouveau: 'pending', preparation: 'pending', valide: 'accepted', en_cours: 'ongoing', termine: 'done' };
const STATUS_KEYS = Object.keys(STATUS);
const SCHEDULE_KIND = {
  arrivee: 'Arrivée', installation: 'Installation', set: 'Set', pause: 'Pause',
  repas: 'Repas', ceremonie: 'Cérémonie', autre: 'Autre'
};
const RATE_UNITS = { forfait: 'Forfait', heure: "À l'heure" };
const SETTINGS_FIELDS = [
  ['company_name', "Nom de l'entreprise ou nom commercial"],
  ['owner_name', 'Nom du responsable'],
  ['address', 'Adresse', 'textarea'],
  ['siret', 'SIRET'],
  ['email', 'Email'],
  ['phone', 'Téléphone'],
  ['iban', 'IBAN'],
  ['tva_mention', 'Mention TVA (ex. TVA non applicable, art. 293 B du CGI)', 'textarea'],
  ['footer', 'Pied de page (conditions, remerciements)', 'textarea']
];

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

const navIcon = (name) => {
  const paths = {
    projects: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    clients: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2m4 0h2"/>',
    tasks: '<path d="m3 6 2 2 4-4m3 2h9M3 13l2 2 4-4m3 2h9M3 20l2 2 4-4m3 2h9"/>',
    equipment: '<rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="15" r="4"/><circle cx="12" cy="6" r="1"/>',
    venue: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    inbox: '<path d="M3 4h18v16H3zM3 13h5l2 3h4l2-3h5M8 8h8"/>',
    account: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>'
  };
  return `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
};

function renderHeader() {
  const nav = $('#nav');
  const { a, b } = parseHash();
  const workspace = !!me && !['partage','invites','demande'].includes(a);
  document.body.dataset.workspace = String(workspace);
  $('#logout').classList.toggle('hidden', !me);
  if (!workspace) { nav.innerHTML = ''; return; }
  const current = a === 'outils' ? (me.role === 'admin' ? 'admin' : 'projets') : a === 'admin' ? (b === 'clients' ? 'admin/clients' : 'admin') : a;
  const links = me.role === 'admin'
    ? [['admin', 'Projets', 'projects'], ['admin/clients', 'Clients', 'clients'], ...EventTools.navLinks(), ['compte', 'Mon compte', 'account']]
    : [['projets', 'Mes projets', 'projects'], ...EventTools.navLinks(), ['compte', 'Mon compte', 'account']];
  nav.innerHTML = links.map(([path, label, icon]) =>
    `<a href="#/${path}" class="${current === path ? 'active' : ''}" ${current === path ? 'aria-current="page"' : ''}>${navIcon(icon)}<span>${label}</span></a>`).join('');
  $('#workspace-section').textContent = links.find(([path]) => path === current)?.[1] || 'Projet';
  $('#workspace-date').textContent = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const name = me.full_name || me.email || (me.role === 'admin' ? 'Administrateur' : 'Mon espace');
  $('#profile-name').textContent = name;
  $('#profile-avatar').textContent = name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  $('#profile-role').textContent = me.role === 'admin' ? 'Administrateur' : 'Espace client';
}

async function route() {
  document.body.dataset.view = '';
  try {
    const parsed = parseHash();
    if (parsed.a === 'partage' && parsed.b) {
      renderHeader();
      return await renderPublicProject(parsed.b);
    }
    if (['invites','demande'].includes(parsed.a) && parsed.b) {
      renderHeader();
      return await EventTools.publicForm(parsed.b,parsed.a==='invites'?'music':'inquiry');
    }
    await loadMe();
    renderHeader();
    if (!me) return renderLogin();
    await dispatch(parseHash());
  } catch (e) {
    app.innerHTML = `<p class="empty">Erreur : ${esc(e.message)}</p>`;
  }
}

async function dispatch({ a, b, c, params }) {
  if (EventTools.pages[a]) return EventTools.pages[a]({a,b,c,params});
  if (a === 'compte') return renderAccount();
  if (a === 'factures' && b) return renderInvoice(b);

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
const settingsBlock = (s) => `
  <section class="card" style="margin-top:25px">
    <h2>Émetteur des factures</h2>
    <form id="settings-form" class="stack">
      <div class="row-2">
        ${SETTINGS_FIELDS.map(([k, l, t]) => t === 'textarea'
          ? `<label class="span-2">${l}<textarea name="${k}" rows="3">${esc(s[k] || '')}</textarea></label>`
          : `<label>${l}<input name="${k}" value="${esc(s[k] || '')}"></label>`).join('')}
      </div>
      <button class="btn primary">Enregistrer</button>
    </form>
  </section>`;

const rateOpts = (sel) => Object.entries(RATE_UNITS)
  .map(([k, l]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${l}</option>`).join('');

const ratesBlock = (plans) => `
  <section class="card" style="margin-top:25px">
    <h2>Tarifs de base</h2>
    <p class="muted hint">Créez vos tarifs ici. Vous pourrez les appliquer à chaque projet, puis ajuster le montant pour ce projet seulement.</p>
    ${plans.map(r => `
      <form class="rate-row rate-edit" data-id="${r.id}">
        <label>Nom<input name="name" value="${esc(r.name)}" required></label>
        <label>Montant (€)<input name="amount" type="number" step="0.01" min="0" value="${r.amount}" required></label>
        <label>Unité<select name="unit">${rateOpts(r.unit)}</select></label>
        <label>Description<input name="description" value="${esc(r.description || '')}"></label>
        <div class="rate-actions">
          <button class="btn small primary">Enregistrer</button>
          <button type="button" class="icon-btn" data-rdel="${r.id}" aria-label="Supprimer">✕</button>
        </div>
      </form>`).join('') || '<p class="empty">Aucun tarif pour le moment.</p>'}
    <form id="rate-new" class="rate-row rate-new">
      <label>Nom<input name="name" required placeholder="Ex. Tarif normal"></label>
      <label>Montant (€)<input name="amount" type="number" step="0.01" min="0" required></label>
      <label>Unité<select name="unit">${rateOpts('forfait')}</select></label>
      <label>Description<input name="description" placeholder="Optionnel"></label>
      <div class="rate-actions"><button class="btn small primary">Ajouter</button></div>
    </form>
  </section>`;

async function renderAccount() {
  const isAdmin = me.role === 'admin';
  let settings = {};
  let plans = [];
  if (isAdmin) {
    const [s, r] = await Promise.all([
      sb.from('settings').select('data').eq('id', 1).single(),
      sb.from('rate_plans').select('*').order('name')
    ]);
    if (s.error) throw s.error;
    if (r.error) throw r.error;
    settings = s.data.data || {};
    plans = r.data;
  }

  app.innerHTML = `
    <div class="page-head"><div>
      <h1>Mon compte</h1>
      <p>${esc(me.email || '')} · ${isAdmin ? 'Administrateur' : 'Client'}</p>
    </div></div>
    <div class="grid two">
      <section class="card">
        <h2>Coordonnées et facturation</h2>
        <form id="acc-form" class="stack">
          <label>Nom complet<input name="full_name" value="${esc(me.full_name || '')}" required></label>
          <label>Téléphone<input type="tel" name="phone" value="${esc(me.phone || '')}"></label>
          <label>Société (optionnel)<input name="company" value="${esc(me.company || '')}"></label>
          <label>Adresse de facturation<textarea name="billing_address" rows="3">${esc(me.billing_address || '')}</textarea></label>
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
    </div>
    ${isAdmin ? settingsBlock(settings) + ratesBlock(plans) : ''}`;

  $('#acc-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const upd = {
      full_name: f.full_name.trim(),
      phone: f.phone.trim() || null,
      company: f.company.trim() || null,
      billing_address: f.billing_address.trim() || null
    };
    if (await run(sb.from('profiles').update(upd).eq('id', me.id), 'Coordonnées enregistrées')) Object.assign(me, upd);
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

  if (!isAdmin) return;

  $('#settings-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const data = Object.fromEntries(SETTINGS_FIELDS.map(([k]) => [k, String(f.get(k) || '').trim()]));
    await run(sb.from('settings').update({ data }).eq('id', 1), 'Émetteur enregistré');
  };

  const rateData = (f) => ({
    name: String(f.get('name')).trim(),
    amount: Number(f.get('amount') || 0),
    unit: f.get('unit'),
    description: String(f.get('description') || '').trim() || null
  });

  $('#rate-new').onsubmit = async (e) => {
    e.preventDefault();
    if (await run(sb.from('rate_plans').insert(rateData(new FormData(e.target))), 'Tarif ajouté'))
      renderAccount().catch(ERR);
  };
  $$('.rate-edit').forEach(form => form.onsubmit = async (e) => {
    e.preventDefault();
    if (await run(sb.from('rate_plans').update(rateData(new FormData(form))).eq('id', form.dataset.id), 'Tarif enregistré'))
      renderAccount().catch(ERR);
  });
  $$('[data-rdel]').forEach(b => b.onclick = async () => {
    if (!confirm('Supprimer ce tarif ? Les projets déjà tarifés ne sont pas modifiés.')) return;
    if (await run(sb.from('rate_plans').delete().eq('id', b.dataset.rdel), 'Tarif supprimé'))
      renderAccount().catch(ERR);
  });
}

// ================= LISTES PROJETS =================
const matchesArchive = (project, mode) => mode === 'all' || (mode === 'archived' ? !!project.archived_at : !project.archived_at);
const archiveFilter = () => `<select id="f-archive" aria-label="Afficher les projets">
  <option value="active">Non archivés</option>
  <option value="archived">Archivés</option>
  <option value="all">Tous les projets</option>
</select>`;
function projectRow(p, isAdmin, unpaid = 0) {
  const date = p.event_date ? new Date(p.event_date + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : 'À définir';
  return `
  <a class="row-card project-row" href="#/${isAdmin ? 'admin/projets' : 'projets'}/${p.id}">
    <div class="project-name-cell"><span class="project-file-icon" aria-hidden="true">${navIcon('projects')}</span><div>
      <strong>${esc(p.title)}</strong>
      <div class="muted">${isAdmin && p.client ? esc(p.client.full_name || p.client.email || 'Sans nom') : 'Événement'}</div>
      ${isAdmin && unpaid > 0 ? `<div class="warn-text">${fmtEur(unpaid)} à encaisser</div>` : ''}
    </div></div>
    <div class="project-date-cell"><span class="cell-label">Date</span>${esc(date)}</div>
    <div class="project-location-cell"><span class="cell-label">Lieu</span>${esc(p.location || 'À définir')}</div>
    <div class="project-badges"><span class="status ${STATUS_CLS[p.status]}">${STATUS[p.status]}</span>
      ${p.archived_at ? '<span class="status done">Archivé</span>' : ''}</div>
    <span class="row-arrow" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M7 17 17 7M7 7h10v10"/></svg></span>
  </a>`;
}
const projectListHead = () => `<div class="project-list-head" aria-hidden="true"><span>Projet / Client</span><span>Date de l’événement</span><span>Lieu</span><span>Statut</span><span></span></div>`;

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
  const active = pj.data.filter(p => !p.archived_at && p.status !== 'termine');
  const soon = active.filter(p => p.event_date && p.event_date >= t && p.event_date <= addDays(t, 30)).length;
  const noDate = active.filter(p => !p.event_date).length;

  app.innerHTML = `
    <div class="page-head">
      <div><p class="eyebrow">Gestion des événements</p><h1>Projets</h1><p>Organisez vos prestations, de la préparation au dernier morceau.</p></div>
      <a class="btn primary" href="#/admin/nouveau"><span aria-hidden="true">＋</span> Nouveau projet</a>
    </div>

    <div class="stats">
      <div class="card stat"><span>Projets actifs</span><strong>${active.length}</strong></div>
      <div class="card stat"><span>Dans les 30 jours</span><strong>${soon}</strong></div>
      <div class="card stat"><span>Sans date</span><strong>${noDate}</strong></div>
      <div class="card stat"><span>Reste à encaisser</span><strong>${fmtEur(totalUnpaid)}</strong></div>
    </div>

    <section class="project-register" aria-label="Liste des projets">
    <div class="register-head"><h2>Répertoire des projets</h2><span id="project-count" class="muted">${pj.data.length} projet(s)</span></div>
    <div class="filters">
      <input id="f-q" placeholder="Rechercher un projet, un client, un lieu…" aria-label="Rechercher un projet">
      <select id="f-s" aria-label="Statut du projet">
        <option value="">Tous les statuts</option>
        ${STATUS_KEYS.map(k => `<option value="${k}">${STATUS[k]}</option>`).join('')}
      </select>
      ${archiveFilter()}
    </div>
    ${projectListHead()}
    <div class="list" id="proj-list"></div></section>`;

  const draw = () => {
    const q = $('#f-q').value.trim().toLowerCase();
    const s = $('#f-s').value;
    const archive = $('#f-archive').value;
    const list = pj.data.filter(p => matchesArchive(p, archive) && (!s || p.status === s) &&
      `${p.title} ${p.location || ''} ${p.client?.full_name || ''} ${p.client?.email || ''}`.toLowerCase().includes(q));
    $('#project-count').textContent = `${list.length} projet${list.length > 1 ? 's' : ''}`;
    $('#proj-list').innerHTML = list.map(p => projectRow(p, true, unpaid[p.id] || 0)).join('')
      || '<p class="empty">Aucun projet trouvé.</p>';
  };
  $('#f-q').oninput = draw;
  $('#f-s').onchange = draw;
  $('#f-archive').onchange = draw;
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
    <section class="project-register" aria-label="Mes projets"><div class="register-head"><h2>Mes événements</h2></div>
    <div class="filters">${archiveFilter()}</div>${projectListHead()}
    <div class="list" id="client-proj-list"></div></section>`;
  const draw = () => {
    $('#client-proj-list').innerHTML = data.filter(p => matchesArchive(p, $('#f-archive').value))
      .map(p => projectRow(p, false)).join('') || '<p class="empty">Aucun projet dans cette vue.</p>';
  };
  $('#f-archive').onchange = draw;
  draw();
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

        </div>
      </form>
      <div class="info-list" style="margin-top:28px">
        ${info('Client', esc(client.full_name || '—'))}
        ${info('Société', esc(client.company || '—'))}
        ${info('Email', client.email ? `<a href="mailto:${esc(client.email)}">${esc(client.email)}</a>` : '—')}
        ${info('Téléphone', client.phone ? `<a href="tel:${phoneHref(client.phone)}">${esc(client.phone)}</a>` : '—')}
      </div>
      <div class="actions"><a class="btn small" href="#/admin/clients/${p.client_id}">Fiche client</a></div>
      <details class="project-danger no-print"><summary>Actions sur le projet</summary><p>La suppression du projet et de son contenu est définitive.</p><button type="button" id="delete-project" class="btn small danger">Supprimer le projet</button></details>

    </section>`;
}

function sharingBlock() {
  return `<section id="project-sharing" class="card project-section no-print"><p class="eyebrow">Diffusion</p>      <div class="share-box">
        <strong>Partager le projet en lecture seule</strong>
        <p class="muted">Toute personne disposant du lien pourra consulter les rubriques choisies sans connexion. Le nom du projet est toujours visible. Les rubriques restent à jour.</p>
        <form id="share-form" class="stack">
          <fieldset class="share-options">
            <legend>Rubriques visibles avec ce nouveau lien</legend>
            ${Object.entries(SHARE_SECTIONS).map(([key, label]) => `
              <label class="check"><input type="checkbox" name="sections" value="${key}" ${DEFAULT_SHARE_SECTIONS.includes(key) ? 'checked' : ''}><span>${label}</span></label>`).join('')}
          </fieldset>
          <button class="btn primary">Créer le lien</button>
        </form>
        <p class="muted hint">Chaque lien conserve ses propres choix. Pour changer les accès, révoquez le lien et créez-en un nouveau.</p>
        <div id="share-links" class="stack" aria-live="polite"></div>
      </div></section>`;
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
          ${safeUrl(t.url) ? `<a class="track-link" href="${esc(safeUrl(t.url))}" target="_blank" rel="noopener noreferrer">Ouvrir le lien ↗</a>` : ''}
          ${canEdit ? `<button class="icon-btn small" data-trkdel="${t.id}" aria-label="Supprimer">✕</button>` : ''}
        </li>`).join('') || '<li class="empty">Aucun titre.</li>'}
    </ul>
    ${canEdit ? `
    <form class="track-form stack" data-kind="${kind}">
      <div class="row-2">
        <input name="title" placeholder="Titre" required>
        <input name="artist" placeholder="Artiste" required>
      </div>
      <input name="url" type="url" placeholder="Lien (Spotify, YouTube…)" inputmode="url">
      <input name="note" placeholder="Note (optionnel)">
      <button class="btn ${must ? 'primary' : 'danger'}">${must ? 'Ajouter à passer absolument' : 'Ajouter à ne pas passer'}</button>
    </form>` : ''}
  </section>`;
}

async function renderPublicProject(token) {
  document.body.dataset.view = 'public';
  app.innerHTML = '<p class="empty">Chargement du projet partagé…</p>';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return renderUnavailableShare();
  }
  const { data: p, error } = await sb.rpc('get_shared_project', { share_token: token });
  if (error) throw error;
  if (!p) return renderUnavailableShare();
  const has = key => Object.hasOwn(p, key);
  const client = p.client || {};
  const details = [
    has('event_date') ? info('Date', p.event_date ? fmtDate(p.event_date) : 'À définir') : '',
    has('location') ? info('Lieu', esc(p.location || 'À définir')) : '',
    has('status') ? info('Statut', esc(STATUS[p.status] || p.status)) : ''
  ].join('');
  app.innerHTML = `
    <div class="public-page">
      <div class="page-head"><div><p class="eyebrow">Projet partagé · Lecture seule</p><h1>${esc(p.title)}</h1></div>
        <a class="btn small no-print" href="#/connexion">Se connecter pour modifier</a>
      </div>
      ${details || has('description') ? `<section class="card public-summary"><h2>Informations du projet</h2>
        <div class="info-list">${details}</div>
        ${p.description ? `<div class="notes"><span>Description</span><p>${esc(p.description)}</p></div>` : ''}</section>` : ''}
      <div class="grid two">
        ${has('must_play') ? trackPanel('must_play', 'À passer absolument', p.must_play, false) : ''}
        ${has('do_not_play') ? trackPanel('do_not_play', 'À ne pas passer', p.do_not_play, false) : ''}
        ${has('schedule') ? scheduleBlock(p.schedule, false) : ''}
        ${has('tasks') ? tasksBlock(p.tasks, false) : ''}
        ${has('payments') ? paymentsBlock(p.payments, false) : ''}
        ${has('updates') ? `<section class="card"><h2>Suivi</h2><div class="updates">${p.updates.map(u => `
          <div class="update-item"><div class="update-meta">${fmtDateTime(u.created_at)}</div><p>${esc(u.body)}</p></div>`).join('') || '<p class="empty">Aucune mise à jour.</p>'}</div></section>` : ''}
        ${has('client') ? `<section class="card"><h2>Coordonnées du client</h2><div class="info-list">${[
          ['Nom', client.full_name], ['Société', client.company], ['Email', client.email],
          ['Téléphone', client.phone], ['Adresse de facturation', client.billing_address]
        ].map(([label, value]) => info(label, esc(value || '—'))).join('')}</div></section>` : ''}
        ${has('invoices') ? `<section class="card"><h2>Résumé des factures</h2><ul class="pay-list">${p.invoices.map(i => `
          <li><div><strong>${esc(i.number)}</strong><div>${fmtDate(i.issue_date)}</div></div><strong>${fmtEur(i.total)}</strong></li>`).join('') || '<li class="empty">Aucune facture émise.</li>'}</ul></section>` : ''}
      </div>
      <p class="public-note">Seules les rubriques choisies par la personne qui partage ce lien sont visibles. La modification nécessite une connexion et les droits sur le projet.</p>
    </div>`;
}

function renderUnavailableShare() {
  app.innerHTML = '<section class="card"><h1>Lien indisponible</h1><p>Ce lien est invalide ou a été révoqué. Demandez un nouveau lien à la personne qui vous l’a envoyé.</p></section>';
}

async function bindProjectSharing(projectId) {
  const form = $('#share-form');
  if (!form) return;
  const list = $('#share-links');
  const refresh = async () => {
    const { data, error } = await sb.from('project_shares').select('token, sections, created_at')
      .eq('project_id', projectId).order('created_at', { ascending: false });
    if (error) { list.textContent = 'Impossible de charger les liens de partage.'; ERR(error); return; }
    list.innerHTML = data.map(link => `
      <div class="share-link">
        <p class="muted">${fmtDateTime(link.created_at)} · ${link.sections.map(k => esc(SHARE_SECTIONS[k])).join(', ') || 'Nom du projet uniquement'}</p>
        <div class="share-actions">
          <input readonly value="${esc(publicProjectUrl(link.token))}" aria-label="Lien de partage" data-link="${link.token}">
          <button type="button" class="btn small" data-copy-share="${link.token}">Copier</button>
          <a class="btn small" href="${esc(publicProjectUrl(link.token))}" target="_blank" rel="noopener noreferrer">Aperçu</a>
          <button type="button" class="btn small danger" data-revoke-share="${link.token}">Révoquer</button>
        </div>
      </div>`).join('') || '<p class="muted">Aucun lien actif.</p>';
    $$('[data-copy-share]', list).forEach(button => button.onclick = async () => {
      try {
        await navigator.clipboard.writeText(publicProjectUrl(button.dataset.copyShare));
        toast('Lien copié');
      } catch {
        $(`[data-link="${button.dataset.copyShare}"]`, list).select();
        toast('Copiez le lien sélectionné', false);
      }
    });
    $$('[data-revoke-share]', list).forEach(button => button.onclick = async () => {
      if (!confirm('Révoquer ce lien ? Il ne permettra plus de consulter le projet.')) return;
      button.disabled = true;
      if (await run(sb.from('project_shares').delete().eq('token', button.dataset.revokeShare).eq('project_id', projectId), 'Lien révoqué')) await refresh();
      else button.disabled = false;
    });
  };
  form.onsubmit = async event => {
    event.preventDefault();
    const button = $('button', form);
    button.disabled = true;
    try {
      const sections = new FormData(form).getAll('sections');
      if (await run(sb.from('project_shares').insert({ project_id: projectId, sections }), 'Lien créé')) await refresh();
    } finally { button.disabled = false; }
  };
  await refresh();
}

function mapCard(place) {
  if (!place) return '';
  const q = encodeURIComponent(place);
  return `
  <details class="card map-card" style="margin-top:20px">
    <summary><strong>Repérage du lieu</strong><span>${esc(place)}</span></summary>
    <div class="map-content"><div class="map-head">
      <h2>Lieu</h2>
      <a class="btn small no-print" target="_blank" rel="noopener"
         href="https://www.google.com/maps/search/?api=1&query=${q}">Ouvrir dans Maps</a>
    </div>
    <iframe class="map-frame" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
      title="Carte du lieu" src="https://www.google.com/maps?q=${q}&output=embed"></iframe></div>
  </details>`;
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

function tariffBlock(base, plans) {
  const opts = plans.map(r =>
    `<option value="${r.id}" data-amount="${r.amount}" data-unit="${r.unit}" data-name="${esc(r.name)}">
      ${esc(r.name)} — ${fmtEur(r.amount)}${r.unit === 'heure' ? ' / h' : ' (forfait)'}</option>`).join('');

  return `
  <section class="card">
    <h2>Tarif du projet</h2>
    ${base
      ? `<p class="rate-current">Actuel : <strong>${esc(base.label)}</strong> · ${fmtEur(base.amount)}</p>`
      : '<p class="muted hint">Aucun tarif appliqué à ce projet.</p>'}
    ${plans.length ? `
    <form id="rate-form" class="stack">
      <label>Tarif de base
        <select name="plan"><option value="">— Choisir dans mes tarifs —</option>${opts}</select>
      </label>
      <div class="row-2">
        <label>Quantité (heures ou forfaits)<input type="number" name="qty" step="0.5" min="0" value="1" required></label>
        <label>Prix unitaire (€)<input type="number" name="unit_price" step="0.01" min="0" required></label>
      </div>
      <label>Libellé sur la facture<input name="label" required></label>
      <p class="rate-total">Total de la prestation : <strong id="rate-total">—</strong></p>
      <button class="btn primary">Appliquer à ce projet</button>
    </form>` : '<p class="empty">Créez d\'abord vos tarifs dans Mon compte.</p>'}
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
          <div>
            <strong>${esc(p.label)}</strong>${p.is_base ? '<span class="tag-base">Tarif</span>' : ''}
            ${p.is_base && p.quantity ? `<div class="muted small-text">${Number(p.quantity)} × ${fmtEur(p.unit_price ?? 0)}</div>` : ''}
          </div>
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

function invoicesBlock(invs, isAdmin) {
  return `
  <section class="card">
    <h2>Factures</h2>
    <ul class="pay-list">
      ${invs.map(i => `
        <li>
          <div><strong>${esc(i.number)}</strong><div class="muted small-text">${fmtDate(i.issue_date)}</div></div>
          <div class="pay-right">
            <strong>${fmtEur(i.total)}</strong>
            <a class="btn small" href="#/factures/${i.id}">Voir / imprimer</a>
            ${isAdmin ? `<button class="icon-btn small no-print" data-invdel="${i.id}" aria-label="Supprimer">✕</button>` : ''}
          </div>
        </li>`).join('') || '<li class="empty">Aucune facture émise.</li>'}
    </ul>
    ${isAdmin ? '<button id="new-invoice" class="btn primary no-print">Générer une facture</button>' : ''}
  </section>`;
}

// ================= EXPORT AGENDA (.ics) =================
function downloadIcs(p) {
  if (!p.event_date) return ERR(new Error("Ce projet n'a pas encore de date"));
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
  if (!me) return renderLogin();
  const none = Promise.resolve({ data: [], error: null });
  const [pr, up, tr, sc, tk, pa, iv, rp] = await Promise.all([
    sb.from('projects').select('*, client:profiles!client_id(full_name, email, phone, company, billing_address)').eq('id', id).single(),
    sb.from('project_updates').select('*').eq('project_id', id).order('created_at', { ascending: false }),
    sb.from('project_tracks').select('*').eq('project_id', id).order('created_at'),
    sb.from('schedule_items').select('*').eq('project_id', id).order('start_time'),
    sb.from('project_tasks').select('*').eq('project_id', id).order('created_at'),
    sb.from('project_payments').select('*').eq('project_id', id).order('created_at'),
    sb.from('invoices').select('id, number, issue_date, total').eq('project_id', id).order('created_at', { ascending: false }),
    isAdmin ? sb.from('rate_plans').select('*').order('name') : none
  ]);
  for (const r of [pr, up, tr, sc, tk, pa, iv, rp]) if (r.error) throw r.error;

  const p = pr.data;
  const client = p.client || {};
  const canEdit = isAdmin || p.status !== 'termine';
  const must = tr.data.filter(t => t.kind === 'must_play');
  const avoid = tr.data.filter(t => t.kind === 'do_not_play');
  const base = pa.data.find(x => x.is_base);
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

    <div class="project-navigation no-print" role="navigation" aria-label="Rubriques du projet">
      <button type="button" class="active" data-project-section="project-overview">Vue d’ensemble</button>
      <button type="button" data-project-section="project-preparation">Préparation</button>
      <button type="button" data-project-section="project-music">Musique</button>
      <button type="button" data-project-section="project-finance">Finances</button>
      ${isAdmin ? '<button type="button" data-project-section="project-sharing">Partage</button>' : ''}
    </div>
    ${p.archived_at ? `<div class="archive-notice" role="status">Projet archivé le ${fmtDateTime(p.archived_at)}. Le contenu et les liens de partage restent accessibles.</div>` : ''}
    ${isAdmin ? `<div class="actions no-print archive-actions">
      <button type="button" class="btn" id="archive-project">${p.archived_at ? 'Restaurer le projet' : 'Archiver le projet'}</button>
      <span class="muted hint">L’archivage conserve le contenu, le statut et les liens de partage.</span>
    </div>` : ''}
    ${EventTools.shortcuts(id)}
    <div id="project-overview" class="grid two project-section">
      ${infoBlock(p, client, isAdmin)}
      ${updatesBlock(up.data, isAdmin, me.id)}
    </div>

    ${mapCard(p.location)}

    <div id="project-preparation" class="project-section">
      <div class="section-heading"><p class="eyebrow">Organisation</p><h2>Préparation de l’événement</h2></div>
      <div class="extras">${scheduleBlock(sc.data, canEdit)}${tasksBlock(tk.data, canEdit)}</div>
    </div>
    <div id="project-music" class="project-section">
      <div class="section-heading"><p class="eyebrow">Sélection musicale</p><h2>La bande-son du projet</h2></div>
      <div class="grid two">${trackPanel('must_play', 'À passer absolument', must, canEdit)}${trackPanel('do_not_play', 'À ne pas passer', avoid, canEdit)}</div>
    </div>
    <div id="project-finance" class="project-section">
      <div class="section-heading"><p class="eyebrow">Gestion</p><h2>Tarifs, règlements et factures</h2></div>
      <div class="extras">${isAdmin ? tariffBlock(base, rp.data) : ''}${paymentsBlock(pa.data, isAdmin)}${invoicesBlock(iv.data, isAdmin)}</div>
    </div>
    ${isAdmin ? sharingBlock() : ''}`;

  $$('[data-project-section]').forEach(button => button.onclick = () => {
    $$('.project-navigation button').forEach(item => item.classList.toggle('active', item === button));
    document.getElementById(button.dataset.projectSection).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  });

  $('#ics').onclick = () => downloadIcs(p);
  $('#print').onclick = () => window.print();
  bindProjectSharing(id).catch(ERR);
  const archiveButton = $('#archive-project');
  if (archiveButton) archiveButton.onclick = async () => {
    archiveButton.disabled = true;
    try {
      const { data, error } = await sb.from('projects').update({
        archived_at: p.archived_at ? null : new Date().toISOString()
      }).eq('id', id).select('id').single();
      if (error) { ERR(error); return; }
      if (!data) { ERR(new Error('Le projet n’a pas pu être mis à jour.')); return; }
      toast(p.archived_at ? 'Projet restauré' : 'Projet archivé');
      await reload();
    } finally { archiveButton.disabled = false; }
  };

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

  // Suivi
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
      title: f.title.trim(), artist: f.artist.trim(), url: f.url?.trim() || null,
      note: f.note?.trim() || null
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

  // Tarif du projet (admin)
  const rf = $('#rate-form');
  if (rf) {
    const sel = rf.plan, qty = rf.qty, unit = rf.unit_price, label = rf.label;
    const tot = $('#rate-total');
    const refresh = () => { tot.textContent = fmtEur((Number(qty.value) || 0) * (Number(unit.value) || 0)); };

    if (base) {
      qty.value = base.quantity ?? 1;
      unit.value = base.unit_price ?? base.amount;
      label.value = base.label;
    }
    sel.onchange = () => {
      const o = sel.selectedOptions[0];
      if (!o.value) return;
      unit.value = o.dataset.amount;
      label.value = o.dataset.name;
      if (o.dataset.unit === 'heure' && !Number(qty.value)) qty.value = 1;
      refresh();
    };
    qty.oninput = refresh;
    unit.oninput = refresh;
    refresh();

    rf.onsubmit = async (e) => {
      e.preventDefault();
      const q = Number(qty.value);
      const u = Number(unit.value);
      const row = {
        label: label.value.trim(),
        quantity: q,
        unit_price: u,
        amount: Number((q * u).toFixed(2)),
        is_base: true
      };
      const ok = base
        ? await run(sb.from('project_payments').update(row).eq('id', base.id), 'Tarif mis à jour')
        : await run(sb.from('project_payments').insert({ project_id: id, ...row }), 'Tarif appliqué');
      if (ok) reload();
    };
  }

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

  // Factures (admin)
  const ni = $('#new-invoice');
  if (ni) ni.onclick = async () => {
    if (!pa.data.length) return ERR(new Error('Ajoutez au moins une ligne de devis avant de générer la facture'));
    if (!confirm('Générer la facture ? Elle sera figée avec les montants actuels.')) return;

    const lines = pa.data.map(x => ({ label: x.label, amount: Number(x.amount), paid: x.paid }));
    const total = lines.reduce((s, l) => s + l.amount, 0);
    const paidSum = lines.filter(l => l.paid).reduce((s, l) => s + l.amount, 0);
    const { data, error } = await sb.from('invoices').insert({
      project_id: id,
      lines,
      total: Number(total.toFixed(2)),
      paid: Number(paidSum.toFixed(2)),
      client: {
        name: client.full_name, company: client.company, address: client.billing_address,
        email: client.email, phone: client.phone
      }
    }).select().single();
    if (error) return ERR(error);
    toast('Facture générée');
    go('factures/' + data.id);
  };
  $$('[data-invdel]').forEach(b => b.onclick = async () => {
    if (!confirm('Supprimer cette facture ?')) return;
    if (await run(sb.from('invoices').delete().eq('id', b.dataset.invdel))) reload();
  });
}

// ================= FACTURE (affichage et impression) =================
async function renderInvoice(id) {
  document.body.dataset.view = 'invoice';

  const [iv, st] = await Promise.all([
    sb.from('invoices').select('*, project:projects(title)').eq('id', id).single(),
    sb.from('settings').select('data').eq('id', 1).single()
  ]);
  if (iv.error) throw iv.error;
  if (st.error) throw st.error;

  const inv = iv.data;
  const s = st.data.data || {};
  const c = inv.client || {};
  const lines = inv.lines || [];
  const rest = Number(inv.total) - Number(inv.paid);
  const back = me.role === 'admin' ? `#/admin/projets/${inv.project_id}` : `#/projets/${inv.project_id}`;

  app.innerHTML = `
    <div class="page-head no-print">
      <a href="${back}" class="back">← Retour au projet</a>
      <div class="actions"><button class="btn primary" id="print-inv">Imprimer / PDF</button></div>
    </div>

    <article class="card invoice">
      <header class="inv-head">
        <div>
          <div class="inv-brand">${esc(s.company_name || 'Votre entreprise')}</div>
          ${s.owner_name ? `<p>${esc(s.owner_name)}</p>` : ''}
          ${s.address ? `<p class="pre">${esc(s.address)}</p>` : ''}
          ${s.siret ? `<p>SIRET : ${esc(s.siret)}</p>` : ''}
          ${s.email || s.phone ? `<p>${esc([s.email, s.phone].filter(Boolean).join(' · '))}</p>` : ''}
        </div>
        <div class="inv-meta">
          <h2>Facture</h2>
          <p><strong>N° ${esc(inv.number)}</strong></p>
          <p>Date : ${fmtDate(inv.issue_date)}</p>
          <p>Projet : ${esc(inv.project?.title || '')}</p>
        </div>
      </header>

      <div class="inv-parties">
        <div>
          <span>Facturé à</span>
          <strong>${esc(c.company || c.name || '—')}</strong>
          ${c.company && c.name ? `<p>${esc(c.name)}</p>` : ''}
          ${c.address ? `<p class="pre">${esc(c.address)}</p>` : ''}
          ${c.email ? `<p>${esc(c.email)}</p>` : ''}
          ${c.phone ? `<p>${esc(c.phone)}</p>` : ''}
        </div>
      </div>

      <table class="inv-table">
        <thead><tr><th>Désignation</th><th class="r">Montant</th></tr></thead>
        <tbody>
          ${lines.map(l => `<tr><td>${esc(l.label)}</td><td class="r">${fmtEur(l.amount)}</td></tr>`).join('')}
        </tbody>
      </table>

      <div class="inv-totals">
        <div><span>Total</span><strong>${fmtEur(inv.total)}</strong></div>
        <div><span>Déjà réglé</span><strong>${fmtEur(inv.paid)}</strong></div>
        <div class="grand"><span>Reste à payer</span><strong>${fmtEur(rest)}</strong></div>
      </div>

      <footer class="inv-foot">
        ${s.tva_mention ? `<p>${esc(s.tva_mention)}</p>` : ''}
        ${s.iban ? `<p>Règlement par virement : ${esc(s.iban)}</p>` : ''}
        ${s.footer ? `<p>${esc(s.footer)}</p>` : ''}
      </footer>
    </article>`;

  $('#print-inv').onclick = () => window.print();
}

// ================= ADMIN : CLIENTS =================
async function renderClientsList() {
  const [cl, pj] = await Promise.all([
    sb.from('profiles').select('*').eq('role', 'client').order('full_name'),
    sb.from('projects').select('id, client_id, status, archived_at')
  ]);
  if (cl.error) throw cl.error;
  if (pj.error) throw pj.error;

  const total = (id) => pj.data.filter(p => p.client_id === id).length;
  const enCours = (id) => pj.data.filter(p => p.client_id === id && !p.archived_at && p.status !== 'termine').length;

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
        <span class="status">${enCours(c.id)} actif(s) · ${total(c.id)} au total</span>
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
  const count = (...ks) => projects.filter(p => !p.archived_at && ks.includes(p.status)).length;

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
      <div class="card stat"><span>En cours</span><strong>${count('en_cours')}</strong></div>
      <div class="card stat"><span>Terminés</span><strong>${count('termine')}</strong></div>
      <div class="card stat"><span>Archivés</span><strong>${projects.filter(p => p.archived_at).length}</strong></div>
    </div>

    <div class="grid two" style="margin-top:25px">
      <section class="card">
        <h2>Coordonnées</h2>
        <div class="info-list" style="margin-bottom:24px">
          ${info('Email', c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '—')}
          ${info('Téléphone', c.phone ? `<a href="tel:${phoneHref(c.phone)}">${esc(c.phone)}</a>` : '—')}
          ${info('Société', esc(c.company || '—'))}
        </div>
        <form id="client-form" class="stack">
          <label>Nom complet<input name="full_name" value="${esc(c.full_name || '')}" required></label>
          <label>Téléphone<input type="tel" name="phone" value="${esc(c.phone || '')}"></label>
          <label>Société (optionnel)<input name="company" value="${esc(c.company || '')}"></label>
          <label>Adresse de facturation<textarea name="billing_address" rows="3">${esc(c.billing_address || '')}</textarea></label>
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
    if (await run(sb.from('profiles').update({
      full_name: f.full_name.trim(),
      phone: f.phone.trim() || null,
      company: f.company.trim() || null,
      billing_address: f.billing_address.trim() || null
    }).eq('id', id), 'Coordonnées enregistrées')) renderClient(id);
  };
}

// ================= MENU BURGER (MOBILE) =================
const menuBtn = $('#menu-toggle');
const navEl = $('#nav');

function setMenu(open) {
  navEl.classList.toggle('open', open);
  $('.sidebar').classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
  menuBtn.textContent = open ? '✕' : '☰';
}

$('.skip-link').onclick = event => { event.preventDefault(); app.focus(); };
menuBtn.onclick = () => setMenu(!navEl.classList.contains('open'));
navEl.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
window.addEventListener('hashchange', () => setMenu(false));
window.addEventListener('keydown', event => { if (event.key === 'Escape') setMenu(false); });
window.addEventListener('resize', () => { if (window.innerWidth > 768) setMenu(false); });

// ================= BOOT =================
$('#theme-toggle').onclick = () =>
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
$('#logout').onclick = () => sb.auth.signOut();
window.addEventListener('hashchange', route);
sb.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') me = null;
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') route();
});

setTheme(document.documentElement.dataset.theme);
route();
