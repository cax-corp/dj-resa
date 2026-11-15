/* Catalog labels and tariff scopes; applying a price always remains explicit. */
const EventTypes = (() => {
  const labels = {
    mariage: 'Mariage',
    anniversaire: 'Anniversaire',
    entreprise: 'Événement d’entreprise',
    association: 'Événement associatif',
    soiree_privee: 'Soirée privée',
    autre: 'Autre prestation',
  };
  const suggestions = {
    mariage: 'Forfait mariage',
    anniversaire: 'Forfait anniversaire',
    entreprise: 'Prestation entreprise',
    association: 'Prestation associative',
    soiree_privee: 'Forfait soirée privée',
    autre: 'Prestation sur mesure',
  };
  const notes = {
    mariage:
      'Prévoyez la préparation, les échanges avec les mariés, les temps forts, l’animation et les horaires de fin.',
    anniversaire:
      'Adaptez le tarif à la durée, au nombre de participants et aux animations prévues.',
    entreprise: 'Tenez compte du programme, des prises de parole et des besoins techniques.',
    association: 'Précisez la durée, le lieu, les animations et le matériel nécessaire.',
    soiree_privee: 'Définissez les horaires, l’ambiance souhaitée et les besoins en matériel.',
    autre: 'Précisez le périmètre de la prestation avant de fixer son prix.',
  };
  const label = (type) => labels[type] || 'Type à définir';
  function options(selected, empty = 'À définir') {
    return (
      `<option value="">${esc(empty)}</option>` +
      Object.entries(labels)
        .map(
          ([key, text]) =>
            `<option value="${key}" ${selected === key ? 'selected' : ''}>${text}</option>`
        )
        .join('')
    );
  }
  const rates = (plans, type) =>
    type ? plans.filter((plan) => !plan.event_type || plan.event_type === type) : plans;
  function overview(plans) {
    return `<div class="event-rate-overview">${Object.entries(labels)
      .map(([key, text]) => {
        const specific = plans.filter((plan) => plan.event_type === key);
        return `<article class="event-rate-card"><h3>${text}</h3><p>${notes[key]}</p><p class="muted">${specific.length ? `${specific.length} tarif(s) spécifique(s)` : 'Montant à définir'}</p>${specific.length ? `<ul class="event-rate-prices">${specific.map((plan) => `<li>${esc(plan.name)}<strong>${fmtEur(plan.amount)}${plan.unit === 'heure' ? ' / h' : ' (forfait)'}</strong></li>`).join('')}</ul>` : ''}<a class="btn small" href="#/compte?type=${key}">Configurer ce tarif</a></article>`;
      })
      .join('')}</div>`;
  }
  return { labels, label, options, rates, overview, notes, suggestions };
})();
