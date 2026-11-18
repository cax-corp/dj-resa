/* Fixed monochrome vectors. Only an allowlisted key is stored on a project. */
const ProjectIcons = (() => {
  const items = [
    ['grid','Par défaut','Général','<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'],
    ['rings','Alliances','Mariage union','<circle cx="8" cy="13" r="5"/><circle cx="16" cy="13" r="5"/><path d="m12 4 2-2 2 2-2 3z"/>'],
    ['heart','Cœur','Mariage fête amour','<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>'],
    ['cake','Gâteau','Anniversaire fête','<path d="M4 12h16v9H4zM4 16c2 3 4-3 6 0s4-3 6 0 4 0 4 0M8 12V8m8 4V8m-4 4V6M8 5V3m4 0V1m4 4V3"/>'],
    ['gift','Cadeau','Anniversaire fête','<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8H8a3 3 0 1 1 3-3Zm0 0h4a3 3 0 1 0-3-3Z"/>'],
    ['party','Confettis','Fête anniversaire célébration','<path d="m3 21 5-14 9 9ZM6 13l5 5M14 3v3m4 0 3-2m-2 7h3M4 4l2 2m4-4 1 2"/>'],
    ['music','Note de musique','DJ musique soirée','<path d="M9 18V5l12-3v13M9 9l12-3"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="18" cy="15" rx="3" ry="2"/>'],
    ['headphones','Casque','DJ musique écoute','<path d="M3 13v-1a9 9 0 0 1 18 0v1"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/>'],
    ['turntable','Platine','DJ musique vinyle','<rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="10" cy="12" r="5"/><circle cx="10" cy="12" r="1"/><path d="M19 7v6l-3 3M5 18h2"/>'],
    ['microphone','Micro','Discours concert conférence','<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>'],
    ['speaker','Enceinte','Sonorisation concert musique','<rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="15" r="4"/><circle cx="12" cy="6" r="1"/>'],
    ['mixer','Console','Technique DJ sonorisation','<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 6v12m5-12v12m5-12v12M5 9h4m1 6h4m1-5h4"/>'],
    ['utensils','Couverts','Repas traiteur dîner banquet','<path d="M5 2v6m3-6v6M2 2v6a3 3 0 0 0 6 0M5 11v11M18 2c-3 3-3 8-3 11h5V2Zm2 11v9"/>'],
    ['chef','Toque','Cuisine traiteur restauration','<path d="M6 15a5 5 0 0 1-1-10 5 5 0 0 1 9-2 5 5 0 0 1 4 9v3M6 15h12v6H6zM9 17v2m3-2v2m3-2v2"/>'],
    ['glass','Verre','Cocktail réception vin gala','<path d="M7 2h10l1 7a6 6 0 0 1-12 0ZM6 8h12M12 15v7m-5 0h10"/>'],
    ['coffee','Café','Brunch réunion accueil','<path d="M3 8h14v7a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5ZM17 9h2a3 3 0 1 1-2 5M2 22h17M6 2v3m4-3v3m4-3v3"/>'],
    ['briefcase','Mallette','Entreprise professionnel séminaire','<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M8 7V3h8v4M2 12l10 4 10-4M10 14h4"/>'],
    ['presentation','Présentation','Conférence entreprise séminaire','<path d="M3 3h18v13H3zM12 16v6m-4 0 4-4 4 4M7 12l3-3 3 2 4-5"/>'],
    ['people','Invités','Association équipe groupe','<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5v2"/>'],
    ['handshake','Poignée de main','Partenariat association entreprise','<path d="m2 9 4-4 5 1 3-1 8 5-5 10-7 1-6-6ZM7 8l4-2 4 3-4 3-3-2m3 7 3 3m0-6 3 3M2 9l4 5m16-4-4 5"/>'],
    ['graduation','Diplôme','École remise diplôme cérémonie','<path d="m2 8 10-5 10 5-10 5ZM6 10v7q6 5 12 0v-7M22 8v9"/>'],
    ['pin','Lieu','Adresse lieu déplacement','<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'],
    ['building','Bâtiment','Salle entreprise lieu','<path d="M5 22V2h14v20M2 22h20M9 22v-5h6v5M9 6h1m4 0h1M9 10h1m4 0h1M9 14h1m4 0h1"/>'],
    ['home','Maison','Privé domicile famille','<path d="m2 10 10-8 10 8M5 8v14h14V8M9 22v-8h6v8"/>'],
    ['tent','Chapiteau','Extérieur festival réception','<path d="M12 2v3m0-3h7l-3 3h-4M2 12 12 5l10 7M4 12v10h16V12M12 12v10m-4 0 4-10 4 10M2 22h20"/>'],
    ['sun','Soleil','Journée extérieur été','<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>'],
    ['moon','Lune','Nuit soirée','<path d="M21 14A9 9 0 0 1 10 3a9 9 0 1 0 11 11Z"/>'],
    ['flower','Fleur','Décoration printemps cérémonie','<path d="M12 13v9m0-3 5-3M12 7c-5-8-10 0-5 3-7 2-2 10 2 6 1 7 9 4 6-1 6 3 10-5 3-7 4-5-4-9-6-1Z"/><circle cx="12" cy="11" r="2"/>'],
    ['trophy','Trophée','Remise prix compétition','<path d="M7 2h10v7a5 5 0 0 1-10 0ZM7 4H3v3a5 5 0 0 0 5 5m9-8h4v3a5 5 0 0 1-5 5M12 14v6m-4 2h8m-7-2h6"/>'],
    ['ball','Ballon','Sport compétition tournoi','<circle cx="12" cy="12" r="10"/><path d="m12 7 5 4-2 6H9l-2-6ZM12 2v5m10 5-5-1m1 9-3-3M6 20l3-3M2 12l5-1"/>'],
    ['camera','Appareil photo','Photo tournage reportage','<path d="M3 6h4l2-3h6l2 3h4v15H3Z"/><circle cx="12" cy="13" r="4"/>'],
    ['film','Clap','Vidéo cinéma projection','<path d="M3 8h18v13H3ZM3 8 2 3l18-2 1 5-18 2M7 2l4 5m3-6 4 5"/>'],
  ];
  const known = key => items.some(i=>i[0]===key)?key:'grid';
  const label = key => items.find(i=>i[0]===known(key))[1];
  function svg(key,size=20){const id=known(key);return `<svg data-project-icon-key="${id}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${items.find(i=>i[0]===id)[3]}</svg>`;}
  function field(key){const id=known(key);return `<div class="project-icon-field"><span>Icône du projet</span><input type="hidden" name="icon" value="${id}"><button type="button" class="btn project-icon-choice" data-choose-project-icon aria-haspopup="dialog">${svg(id,26)}<span>${label(id)}</span><span class="muted">Changer l’icône</span></button></div>`;}
  function bind(form){
    if(!form)return;
    Drafts.restore(form);
    const input=form.elements.icon,button=form.querySelector('[data-choose-project-icon]');if(!input||!button)return;
    const draw=()=>{const id=known(input.value);button.innerHTML=svg(id,26)+'<span>'+label(id)+'</span><span class="muted">Changer l’icône</span>';};
    draw();button.onclick=()=>choose(input.value,id=>{input.value=id;draw();input.dispatchEvent(new Event('change',{bubbles:true}));});
  }
  function choose(current,onChoose){
    document.getElementById('project-icon-dialog')?.remove();const dialog=document.createElement('dialog');dialog.id='project-icon-dialog';dialog.className='project-icon-dialog';dialog.setAttribute('aria-labelledby','project-icon-title');
    dialog.innerHTML='<div class="tool-toolbar"><div><h2 id="project-icon-title">Choisir une icône de projet</h2><p class="muted">Un repère visuel pour retrouver vos événements.</p></div><button type="button" class="btn" data-close-icons>Fermer</button></div><label>Rechercher une icône<input type="search" placeholder="Mariage, repas, musique…" autocomplete="off"></label><div class="project-icon-grid"></div>';
    app.append(dialog);const input=dialog.querySelector('input'),grid=dialog.querySelector('.project-icon-grid'),normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    function draw(){const q=normalize(input.value.trim()),found=items.filter(i=>normalize(i.slice(1,3).join(' ')).includes(q));grid.innerHTML=found.map(([id,name])=>`<button type="button" class="project-icon-option" data-icon-option="${id}" aria-pressed="${id===known(current)}">${svg(id,30)}<span>${name}</span></button>`).join('')||'<p class="empty">Aucune icône trouvée.</p>';grid.querySelectorAll('[data-icon-option]').forEach(b=>b.onclick=()=>{onChoose(b.dataset.iconOption);dialog.close();});}
    input.oninput=draw;dialog.querySelector('[data-close-icons]').onclick=()=>dialog.close();dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dialog.close();}});dialog.addEventListener('close',()=>dialog.remove(),{once:true});draw();dialog.showModal();input.focus();
  }
  return {items,known,label,svg,field,bind};
})();
