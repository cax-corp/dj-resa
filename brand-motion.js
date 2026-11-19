/* Visual preferences are local to this browser; no project or account data is changed. */
const BrandMotion = (() => {
  const modes = [
    {id:'sheen', name:'Reflet diagonal', description:'Le reflet actuel, doux et oblique.'},
    {id:'contour', name:'Contour mobile', description:'Une lumière parcourt les bordures.'},
    {id:'breathe', name:'Respiration', description:'Le logo gagne puis perd doucement en intensité.'},
    {id:'scan', name:'Balayage vertical', description:'Un bandeau lumineux remonte le logo.'},
    {id:'duet', name:'Double impulsion', description:'Les deux parties du logo se répondent.'},
    {id:'reveal', name:'Révélation', description:'Le plein devient contour, puis se recompose.'},
    {id:'line-draw', name:'Tracé progressif', description:'Les traits dessinent le logo, puis se retirent.'},
    {id:'line-flow', name:'Lignes défilantes', description:'Des segments blancs parcourent les tracés.'},
    {id:'line-build', name:'Assemblage', description:'Les lignes se séparent, puis retrouvent leur place.'},
    {id:'line-wave', name:'Ondulation', description:'Une vague légère traverse les traits du logo.'},
    {id:'immersive', name:'Chromatique', scope:'screensaver', scene:true, description:'Des rubans colorés occupent tout l’écran, avec le logo au centre.'},
    {id:'polychrome', name:'Pride', scope:'screensaver', scene:true, description:'Une édition multicolore pour la Pride : courbes, mosaïque et diagonales.'},
    {id:'kinetic', name:'Cinétique', scope:'screensaver', scene:true, description:'24 secondes rythmées : lignes qui se courbent, motifs animés et transitions circulaires.'}
  ];
  const valid = (value,scope) => modes.some(mode => mode.id === value && (!scope || !mode.scope || mode.scope === scope));
  const key = scope => `syntra.motion.${scope}`;
  const selected = {favicon:'sheen', screensaver:'sheen'};
  for (const scope of Object.keys(selected)) {
    try { const value=localStorage.getItem(key(scope)); if (valid(value,scope)) selected[scope]=value; } catch {}
  }
  const get = scope => selected[scope] || 'sheen';
  const asset = (mode,kind) => `assets/motion/${valid(mode,kind==='mark'?'favicon':'screensaver')?mode:'sheen'}-${kind}.svg?v=${mode==='kinetic'?2:1}`;
  function refresh() {
    document.querySelectorAll('[data-brand-motion]').forEach(input => {
      input.checked=get(input.dataset.brandMotion)===input.value;
      input.closest('.motion-choice').classList.toggle('selected',input.checked);
    });
  }
  function set(scope,value) {
    if (!Object.hasOwn(selected,scope) || !valid(value,scope)) return;
    selected[scope]=value;
    let saved=true;
    try { localStorage.setItem(key(scope),value); } catch { saved=false; }
    refresh();
    document.dispatchEvent(new CustomEvent('syntra:motion-change',{detail:{scope,value}}));
    const status=document.getElementById('brand-motion-status');
    if(status) status.textContent=saved?'Préférence enregistrée sur cet appareil.':'Préférence appliquée pour cette session.';
  }
  function settings() {
    return `<section class="card motion-settings" aria-labelledby="motion-settings-title"><h2 id="motion-settings-title">Animations et écran de veille</h2><p class="muted">Des styles assortis, avec un choix indépendant pour chaque usage. Les choix sont enregistrés automatiquement sur cet appareil.</p>${['favicon','screensaver'].map(scope=>`<fieldset class="motion-fieldset"><legend>${scope==='favicon'?'Favicon des onglets':'Écran de veille'}</legend><p class="muted motion-help">${scope==='favicon'?'Le symbole s’anime lorsque Syntra est dans un autre onglet.':'Choisissez un logo sur fond noir ou un design immersif en couleur. Cliquez sur l’écran pour revenir.'}</p><div class="motion-choices">${modes.filter(mode=>!mode.scope||mode.scope===scope).map(mode=>`${mode.id==='sheen'?'<h4 class="motion-group-title">Classiques</h4>':mode.id==='line-draw'?'<h4 class="motion-group-title">Motion en traits <span>Blanc pur · sans brillance</span></h4>':mode.id==='immersive'?'<h4 class="motion-group-title">Plein écran <span>Design immersif · couleur</span></h4>':''}<label class="motion-choice ${get(scope)===mode.id?'selected':''}"><input type="radio" name="motion-${scope}" data-brand-motion="${scope}" value="${mode.id}" ${get(scope)===mode.id?'checked':''}><span class="motion-choice-name">${mode.name}</span><span class="motion-choice-preview ${scope==='favicon'?'motion-favicon-preview':''} ${mode.scene?'motion-scene-preview':''}" aria-hidden="true"><img src="${asset(mode.id,scope==='favicon'?'mark':'logo')}" alt="" loading="lazy" draggable="false">${scope==='favicon'?`<span class="motion-real-tab"><img src="${asset(mode.id,'mark')}" alt="" loading="lazy">Syntra</span>`:''}</span><span class="motion-choice-description">${mode.description}</span></label>`).join('')}</div></fieldset>`).join('')}<div class="motion-settings-footer"><button type="button" class="btn" data-test-screensaver>Tester l’écran de veille</button><span id="brand-motion-status" role="status" aria-live="polite"></span></div><p class="muted motion-help">Les animations respectent le réglage « réduire les animations » de votre appareil.</p></section>`;
  }
  document.addEventListener('change',event=>{
    const input=event.target.closest('[data-brand-motion]');
    if(input?.checked) set(input.dataset.brandMotion,input.value);
  });
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-test-screensaver]')) document.dispatchEvent(new Event('syntra:open-screensaver'));
  });
  addEventListener('storage',event=>{
    const scope=Object.keys(selected).find(scope=>event.key===key(scope));
    if(!scope && event.key!==null) return;
    for(const target of scope?[scope]:Object.keys(selected)){
      selected[target]=scope&&valid(event.newValue,target)?event.newValue:'sheen';
      document.dispatchEvent(new CustomEvent('syntra:motion-change',{detail:{scope:target,value:selected[target]}}));
    }
    refresh();
  });
  const isScene = mode => modes.some(item => item.id === mode && item.scene);
  return {modes,get,set,asset,settings,isScene};
})();
