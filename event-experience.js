/* Event-specific preparation. No template is applied without an explicit action. */
const EventExperience = (() => {
  const profiles = {
    mariage: {
      title: 'Préparer le mariage',
      intro: 'Coordonnez les mariés, la cérémonie et les temps forts de la réception.',
      fields: [
        ['couple_names', 'Prénoms des mariés'],
        ['coordination_contact', 'Référent du jour J'],
        ['ceremony_time', 'Horaire envisagé de la cérémonie', 'time'],
        ['ceremony_notes', 'Cérémonie : sonorisation et déroulement', 'textarea'],
        ['cocktail_time', 'Horaire envisagé du cocktail', 'time'],
        ['entrance', 'Entrée des mariés et présentation', 'textarea'],
        ['first_dance', 'Ouverture de bal : morceau et consignes', 'textarea'],
        ['speeches', 'Discours et interventions à coordonner', 'textarea'],
      ],
      tasks: [
        'Valider les temps forts avec les mariés',
        'Confirmer la sonorisation de la cérémonie',
        'Valider le morceau de l’ouverture de bal',
        'Coordonner les interventions avec les prestataires',
        'Confirmer les horaires de fin et de rangement',
      ],
      actions: [
        ['conductor', 'Temps forts et horaires'],
        ['contacts', 'Coordination des prestataires'],
        ['guests', 'Invités et tables'],
      ],
      order: [
        'preparation',
        'conductor',
        'guests',
        'contacts',
        'requests',
        'documents',
        'venue',
        'equipment',
        'debrief',
      ],
    },
    anniversaire: {
      title: 'Préparer l’anniversaire',
      intro: 'Organisez les animations autour de la personne fêtée et de ses invités.',
      fields: [
        ['celebrant', 'Personne fêtée'],
        ['milestone', 'Âge ou occasion célébrée'],
        ['coordinator', 'Référent pour les animations'],
        ['guests_profile', 'Profil des invités et générations présentes', 'textarea'],
        ['cake_time', 'Horaire envisagé du gâteau', 'time'],
        ['cake_song', 'Morceau pour l’arrivée du gâteau'],
        ['activities', 'Jeux, diaporama et interventions prévus', 'textarea'],
        ['music_preferences', 'Ambiances et époques musicales souhaitées', 'textarea'],
      ],
      tasks: [
        'Confirmer le déroulement des animations',
        'Préparer le morceau pour le gâteau',
        'Vérifier le matériel pour le diaporama',
        'Adapter la sélection aux générations présentes',
        'Confirmer l’accès pour installation et rangement',
      ],
      actions: [
        ['requests', 'Suggestions musicales'],
        ['conductor', 'Gâteau et animations'],
        ['guests', 'Invités et confirmations'],
      ],
      order: [
        'preparation',
        'guests',
        'requests',
        'conductor',
        'documents',
        'contacts',
        'equipment',
        'venue',
        'debrief',
      ],
    },
    entreprise: {
      title: 'Préparer l’événement d’entreprise',
      intro: 'Cadrez les objectifs, les prises de parole et les contraintes techniques.',
      fields: [
        ['company', 'Entreprise et service organisateur'],
        ['coordinator', 'Responsable de validation'],
        ['objectives', 'Objectifs et public attendu', 'textarea'],
        ['speakers', 'Intervenants et prises de parole', 'textarea'],
        ['av_needs', 'Micros, projection et diffusion nécessaires', 'textarea'],
        ['brand_style', 'Identité, ton et ambiance de marque', 'textarea'],
        ['timing_constraints', 'Horaires impératifs et déroulement', 'textarea'],
        ['protocol', 'Consignes d’accueil ou protocole', 'textarea'],
      ],
      tasks: [
        'Faire valider le programme par l’organisateur',
        'Recueillir les supports des intervenants',
        'Tester les micros et la projection',
        'Valider les ambiances et jingles de marque',
        'Confirmer les horaires impératifs',
      ],
      actions: [
        ['conductor', 'Programme et prises de parole'],
        ['contacts', 'Intervenants et référents'],
        ['documents', 'Supports et brief client'],
      ],
      order: [
        'preparation',
        'conductor',
        'contacts',
        'documents',
        'equipment',
        'venue',
        'guests',
        'debrief',
        'requests',
      ],
    },
    association: {
      title: 'Préparer l’événement associatif',
      intro: 'Coordonnez le programme, les bénévoles et les besoins d’accueil.',
      fields: [
        ['association_name', 'Association organisatrice'],
        ['coordinator', 'Coordinateur principal'],
        ['purpose', 'Objectif de l’événement', 'textarea'],
        ['volunteers', 'Équipe et répartition des bénévoles', 'textarea'],
        ['activities', 'Animations et interventions au programme', 'textarea'],
        ['access_needs', 'Accueil, accès et besoins d’accessibilité', 'textarea'],
        ['sound_constraints', 'Contraintes sonores et horaires', 'textarea'],
      ],
      tasks: [
        'Confirmer les référents de l’association',
        'Répartir les interventions et animations',
        'Valider les accès et besoins d’accueil',
        'Vérifier les contraintes sonores du lieu',
        'Confirmer le montage et le démontage',
      ],
      actions: [
        ['contacts', 'Référents et bénévoles'],
        ['conductor', 'Programme des animations'],
        ['equipment', 'Moyens techniques'],
      ],
      order: [
        'preparation',
        'contacts',
        'conductor',
        'equipment',
        'venue',
        'documents',
        'guests',
        'debrief',
        'requests',
      ],
    },
    soiree_privee: {
      title: 'Préparer la soirée privée',
      intro: 'Définissez l’ambiance, les moments importants et les règles du lieu.',
      fields: [
        ['occasion', 'Occasion de la soirée'],
        ['host', 'Hôte et référent sur place'],
        ['mood', 'Ambiance recherchée', 'textarea'],
        ['guests_profile', 'Profil et habitudes des invités', 'textarea'],
        ['key_moments', 'Moments importants à prévoir', 'textarea'],
        ['venue_rules', 'Règles du lieu et limites sonores', 'textarea'],
      ],
      tasks: [
        'Valider l’ambiance musicale avec l’hôte',
        'Confirmer les moments importants',
        'Vérifier les limites sonores et horaires',
        'Définir l’accès pour le matériel',
        'Confirmer la fin de soirée et le rangement',
      ],
      actions: [
        ['requests', 'Envies musicales'],
        ['venue', 'Règles et accès du lieu'],
        ['conductor', 'Déroulement de la soirée'],
      ],
      order: [
        'preparation',
        'requests',
        'conductor',
        'venue',
        'guests',
        'equipment',
        'contacts',
        'documents',
        'debrief',
      ],
    },
    autre: {
      title: 'Préparer la prestation sur mesure',
      intro: 'Construisez un brief adapté à un événement qui sort des formats habituels.',
      fields: [
        ['purpose', 'Objectif de la prestation', 'textarea'],
        ['coordinator', 'Référent du projet'],
        ['participants', 'Participants et public concerné', 'textarea'],
        ['expectations', 'Attentes et résultat souhaité', 'textarea'],
        ['constraints', 'Contraintes et besoins techniques', 'textarea'],
      ],
      tasks: [
        'Définir le périmètre de la prestation',
        'Confirmer le référent et les validations',
        'Valider le déroulement et les horaires',
        'Recenser les besoins techniques',
        'Confirmer les modalités d’installation et de rangement',
      ],
      actions: [
        ['conductor', 'Déroulement à construire'],
        ['equipment', 'Besoins techniques'],
        ['documents', 'Documents de cadrage'],
      ],
      order: [
        'preparation',
        'conductor',
        'documents',
        'contacts',
        'equipment',
        'venue',
        'guests',
        'requests',
        'debrief',
      ],
    },
  };
  const profile = (type) => profiles[type] || null;
  function summary(project, isAdmin) {
    const config = profile(project.event_type);
    if (!config) return '';
    const actions = config.actions.filter(
      ([key]) => isAdmin || !['requests', 'equipment', 'venue', 'debrief'].includes(key)
    );
    return `<section class="event-experience no-print"><div><p class="eyebrow">${esc(EventTypes.label(project.event_type))} · préparation adaptée</p><h2>${config.title}</h2><p>${config.intro}</p></div><a class="btn primary" href="#/outils/${project.id}?section=preparation">Ouvrir la fiche de préparation</a><div class="experience-actions">${actions.map(([key, label]) => `<a href="#/outils/${project.id}?section=${key}">${label}<span aria-hidden="true"> →</span></a>`).join('')}</div></section>`;
  }
  function fields(config, values, editable) {
    return config.fields
      .map(
        ([key, label, type = 'text']) =>
          `<label class="${type === 'textarea' ? 'experience-wide' : ''}">${label}${type === 'textarea' ? `<textarea name="${key}" rows="3" maxlength="1500" ${editable ? '' : 'readonly'}>${esc(values[key] || '')}</textarea>` : `<input type="${type}" name="${key}" value="${esc(values[key] || '')}" maxlength="200" ${editable ? '' : 'readonly'}>`}</label>`
      )
      .join('');
  }
  return { profiles, profile, summary, fields };
})();
