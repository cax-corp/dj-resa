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
    {id:'line-wave', name:'Ondulation', description:'Une vague légère traverse les traits du logo.'}
  ];
  const valid = value => modes.some(mode => mode.id === value);
  const key = scope => `syntra.motion.${scope}`;
  const selected = {favicon:'sheen', screensaver:'sheen'};
  for (const scope of Object.keys(selected)) {
    try { const value=localStorage.getItem(key(scope)); if (valid(value)) selected[scope]=value; } catch {}
  }
  const get = scope => selected[scope] || 'sheen';
  const asset = (mode,kind) => `assets/motion/${valid(mode)?mode:'sheen'}-${kind}.svg?v=1`;
  function refresh() {
    document.querySelectorAll('[data-brand-motion]').forEach(input => {
      input.checked=get(input.dataset.brandMotion)===input.value;
      input.closest('.motion-choice').classList.toggle('selected',input.checked);
    });
  }
  function set(scope,value) {
    if (!(scope in selected) || !valid(value)) return;
    selected[scope]=value;
    let saved=true;
    try { localStorage.setItem(key(scope),value); } catch { saved=false; }
    refresh();
    document.dispatchEvent(new CustomEvent('syntra:motion-change',{detail:{scope,value}}));
    const status=document.getElementById('brand-motion-status');
    if(status) status.textContent=saved?'Préférence enregistrée sur cet appareil.':'Préférence appliquée pour cette session.';
  }
  function settings() {
    return `<section class="card motion-settings" aria-labelledby="motion-settings-title"><h2 id="motion-settings-title">Animations et écran de veille</h2><p class="muted">Des styles assortis, avec un choix indépendant pour chaque usage. Les choix sont enregistrés automatiquement sur cet appareil.</p>${['favicon','screensaver'].map(scope=>`<fieldset class="motion-fieldset"><legend>${scope==='favicon'?'Favicon des onglets':'Écran de veille'}</legend><p class="muted motion-help">${scope==='favicon'?'Le symbole s’anime lorsque Syntra est dans un autre onglet.':'Le logo animé reste au centre d’un fond noir. Cliquez sur l’écran pour revenir.'}</p><div class="motion-choices">${modes.map(mode=>`${mode.id==='sheen'?'<h4 class="motion-group-title">Classiques</h4>':mode.id==='line-draw'?'<h4 class="motion-group-title">Motion en traits <span>Blanc pur · sans brillance</span></h4>':''}<label class="motion-choice ${get(scope)===mode.id?'selected':''}"><input type="radio" name="motion-${scope}" data-brand-motion="${scope}" value="${mode.id}" ${get(scope)===mode.id?'checked':''}><span class="motion-choice-name">${mode.name}</span><span class="motion-choice-preview ${scope==='favicon'?'motion-favicon-preview':''}" aria-hidden="true"><img src="${asset(mode.id,scope==='favicon'?'mark':'logo')}" alt="" loading="lazy" draggable="false">${scope==='favicon'?`<span class="motion-real-tab"><img src="${asset(mode.id,'mark')}" alt="" loading="lazy">Syntra</span>`:''}</span><span class="motion-choice-description">${mode.description}</span></label>`).join('')}</div></fieldset>`).join('')}<div class="motion-settings-footer"><button type="button" class="btn" data-test-screensaver>Tester l’écran de veille</button><span id="brand-motion-status" role="status" aria-live="polite"></span></div><p class="muted motion-help">Les animations respectent le réglage « réduire les animations » de votre appareil.</p></section>`;
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
      selected[target]=scope&&valid(event.newValue)?event.newValue:'sheen';
      document.dispatchEvent(new CustomEvent('syntra:motion-change',{detail:{scope:target,value:selected[target]}}));
    }
    refresh();
  });
  return {modes,get,set,asset,settings};
})();
