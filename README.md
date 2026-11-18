# DJ Booking

Application statique HTML/CSS/JavaScript avec Supabase.

## Partage des projets

Depuis la fiche projet administrateur, cocher les rubriques à rendre visibles, puis
cliquer sur **Créer le lien**. Chaque lien possède un jeton aléatoire et conserve
sa sélection. Le titre est toujours visible. Les données des rubriques choisies
restent à jour ; ce n'est pas une copie figée du projet.

Les visiteurs peuvent consulter le lien sans compte. La vue partagée ne propose
aucune modification. Les utilisateurs connectés conservent leurs droits existants
sur les projets. Seuls les administrateurs peuvent créer, lister ou révoquer les
liens. La révocation bloque les prochaines lectures ; les données déjà consultées
ne peuvent pas être retirées du navigateur d'un destinataire.

Les coordonnées du client, les paiements, le suivi, le planning, la checklist et
les résumés des factures sont masqués par défaut. Les factures partagées présentent
uniquement leur numéro, leur date et leur total.

## Base de données et publication

Le schéma `db/project-sharing.sql` correspond à la migration Supabase
`token_scoped_project_sharing`, appliquée au projet configuré dans `app.js`.
Pour une autre base, appliquer ce script une seule fois avant de publier les
fichiers statiques. Les lectures anonymes directes de `projects` et
`project_tracks` sont supprimées : seule la fonction `get_shared_project` renvoie
les champs autorisés pour un jeton actif.

**Les anciens liens fondés sur l'identifiant du projet ne fonctionnent plus.**
Créer de nouveaux liens depuis la nouvelle interface, puis les transmettre aux
destinataires. GitHub Pages publie automatiquement les fichiers à la racine
depuis la branche `main` du dépôt `cax-corp/dj-resa`.

## Vérification

- Syntaxe : `node --check app.js`
- Navigateur : lancer `python -m http.server 8000`, puis
  `node tests/project-sharing.cjs` avec Playwright disponible dans Node et Chromium
  installé (`CHROMIUM_PATH` permet de changer son chemin, `TEST_URL` l'adresse).
  Ce test utilise un service simulé pour les interactions et les vues publiques.
- Base réelle : exécuter `tests/project-sharing.sql` dans l'éditeur SQL Supabase.
  Ce test exige un administrateur et un client existants. Il crée des données de
  test dans une transaction annulée à la fin et vérifie le filtrage des rubriques,
  les droits anonymes/connectés, les liens inconnus et leur révocation.

## Archivage et état « En cours »

Dans la fiche projet administrateur, **Archiver le projet** range le projet dans
la vue **Archivés**. **Restaurer le projet** le remet dans la vue **Non archivés**.
Le filtre **Tous les projets** affiche les deux. Ces vues sont aussi disponibles
pour les clients ; seul un administrateur peut archiver ou restaurer.

L'archivage ajoute uniquement une date `archived_at`. Il ne change ni le statut,
ni le contenu, ni les droits existants, ni les jetons ou rubriques des liens de
partage. Les liens restent consultables après archivage.

L'état **En cours** (`en_cours`) se choisit manuellement dans le formulaire de
modification du projet, lorsque l'événement se déroule. Aucun projet n'est changé
automatiquement de statut. Cet état apparaît dans les listes, les fiches et les
liens qui autorisent l'affichage du statut.

La migration `add_project_archiving_and_in_progress_status` correspond au script
`db/project-archiving.sql`. Pour une nouvelle base, l'appliquer après le script de
partage. Elle vérifie que les données des projets et des liens existants ainsi que
leurs réponses publiques sont identiques avant et après la modification.

`tests/project-archiving.sql` vérifie l'archivage, la restauration, les droits et la
continuité des liens dans une transaction annulée. Le test navigateur couvre aussi
le nouvel état et les filtres des vues administrateur et client.

## Interface de travail

L'espace connecté utilise une navigation latérale (menu sur mobile), un fil de
navigation et un répertoire compact des projets avec recherche et filtres. Les
fiches proposent des accès directs à la vue d'ensemble, à la préparation, à la
musique, aux finances et au partage. La carte du lieu et les actions de suppression
sont repliées par défaut. Les thèmes clair/sombre et l'impression sont conservés.
Cette refonte n'exige aucune modification de la base de données.

## Outils événementiels

Depuis le menu latéral :

- **Calendrier** : prestations du mois, dates à définir, alertes de cumul et périodes d'indisponibilité (administrateur).
- **À faire** : tableau À faire / En cours / Terminé, échéances, priorités et responsables, à partir des checklists existantes. Les projets archivés se filtrent séparément.
- **Mon matériel** : liste du matériel possédé, quantités, références et notes. Chaque projet permet de sélectionner les éléments à utiliser.
- **Lieux** : répertoire réutilisable avec accès, stationnement, électricité, contraintes sonores et contacts.
- **Demandes entrantes** : saisie manuelle ou formulaire public, suivi commercial, dates de relance et conversion en projet rattaché à un client existant. La conversion est transactionnelle et ne crée pas de doublon en cas de répétition.

Depuis les raccourcis de chaque fiche projet :

- **Invités** : confirmations, accompagnants, groupes/tables, allergies, recherche et export CSV.
- **Demandes musicales** : formulaire invité sans connexion, lien et QR code généré localement, modération et fermeture/réouverture des demandes.
- **Planning** : planning existant enrichi avec intervenants, morceaux, consignes et états de séquence. Mode direct et impression.
- **Contacts** : prestataires et intervenants, coordonnées et consignes du projet.
- **Documents** : dépôt privé, ouverture native dans le navigateur, téléchargement séparé, visibilité client explicite et liens de lecture révocables. Taille maximale : 20 Mo. Les données déjà téléchargées ne peuvent pas être retirées du destinataire ; masquer au client ne révoque pas un lien de lecture : utiliser son bouton de révocation.
- **Matériel** : choix dans son propre inventaire, quantités à emporter, checklist « Prêt à emporter » et export CSV. Aucune période de réservation ni retour à saisir. Le même matériel peut être prévu sur plusieurs projets ; une alerte informe s’ils ont lieu le même jour.
- **Lieu** : choix dans le répertoire, avec un lieu unique repris dans la fiche du projet et ses liens partagés. Les nouveaux projets utilisent exclusivement des lieux du répertoire.
- **Bilan** : note globale, retour client, incidents et améliorations, réservés à l'administrateur.

Les invités, contacts et conducteurs sont accessibles aux utilisateurs connectés autorisés sur le projet, selon les droits existants. Le client ne voit que les documents explicitement rendus visibles pour lui. L'inventaire, les lieux, les demandes commerciales, les suggestions musicales à modérer et les bilans sont administrateur uniquement. Les formulaires publics ne permettent ni de lister d'autres réponses, ni de consulter les données privées du projet.

Les liens publics du projet conservent leurs rubriques précédentes : aucun nouvel outil ou fichier n'y est exposé automatiquement. Les formulaires invités et commerciaux ont leurs propres jetons. Chaque lien accepte jusqu'à 20 suggestions musicales par minute et 500 au total, ou 10 demandes commerciales par minute et 1 000 au total. Un administrateur peut fermer un formulaire ou créer un nouveau lien.

### Installation et validation

La migration Supabase `add_event_operations_tools` est enregistrée dans `db/event-tools.sql` et appliquée au projet configuré. Pour une autre installation, l'exécuter après les scripts de partage et d'archivage. Elle ajoute des tables avec RLS, enrichit les tâches et le planning, crée le bucket privé `project-documents` et vérifie la conservation des données existantes.

Le code des outils est dans `event-tools.js`. Le générateur QR local est `qrcode-generator` 1.4.4 (licence MIT, voir `vendor/`). Aucune valeur du formulaire n'est envoyée à un service de QR code tiers.

- `node --check app.js` et `node --check event-tools.js` : syntaxe.
- `node tests/event-tools.cjs` : parcours navigateur des onze outils, avec API simulée, export, téléversement/suppression, QR, formulaires publics, conversion, pagination des invités et affichage mobile.
- `tests/event-tools.sql` : intégration sur la base réelle avec annulation de tous les jeux de test, contrôle des droits, visibilité des fichiers Storage, quantités possédées et conservation des sélections, conducteur, conversion idempotente et limites des formulaires.
- Les suites de partage et d'archivage restent applicables.

### Matériel personnel

Appliquer `db/personal-equipment.sql` après `db/event-tools.sql` pour une nouvelle installation. Cette migration supprime le blocage par période au profit d'un contrôle des quantités choisies dans chaque projet. Les projets, liens, éléments d'inventaire et sélections existants sont conservés. Les identifiants techniques historiques de table et d'état restent inchangés pour compatibilité ; l'interface ne présente plus de réservation ou de location. Une modification de l'inventaire ne réécrit jamais les listes d'anciens projets.

## Corrections des parcours et retours après événement

Appliquer `db/workflow-fixes.sql` après les migrations précédentes sur une nouvelle installation. Le projet configuré a déjà reçu la migration `improve_project_workflows_and_feedback`.

- Les formulaires gardent leurs brouillons dans l'onglet, par compte et par page. Les mots de passe et fichiers ne sont jamais stockés. Les brouillons enregistrés sont effacés après succès et à la déconnexion. Un événement de connexion répété au retour sur l'onglet ne recharge plus la vue.
- Chaque QR de formulaire se télécharge en PNG de 1 024 × 1 024 pixels, généré localement avec une marge blanche.
- Le lieu d'un projet se choisit dans **Lieux**. L'association met à jour le nom et l'adresse affichés ; une modification ultérieure de la fiche du lieu est répercutée. Les anciennes saisies libres non associées sont conservées jusqu'à leur remplacement explicite par un lieu du répertoire. Le lieu souhaité d'un prospect reste une note lors de sa conversion, en attendant un choix dans le répertoire.
- **Invités → Ajouter beaucoup d'invités** : collage depuis un tableur ou import CSV (UTF-8, séparateur virgule, point-virgule ou tabulation), modèle téléchargeable, prévisualisation éditable et signalement des doublons possibles. Jusqu'à 1 000 invités et 5 Mo par import. Les lignes sélectionnées sont ajoutées en une transaction ; aucun invité existant n'est supprimé.
- Accepter une suggestion musicale l'ajoute à **À passer absolument**, sans doublon de titre/artiste. Les suggestions déjà acceptées ont également été intégrées. Refuser ne crée jamais de titre dans **À ne pas passer**, et ne retire pas une sélection musicale déjà conservée.
- Les clients sans projet ni historique peuvent être supprimés individuellement depuis leur fiche, ou en sélection depuis la liste des clients. Les comptes avec projets (y compris archivés) sont protégés côté serveur. La suppression ferme les sessions et supprime le compte Auth ; aucune suppression de client n'est exécutée automatiquement par la migration.
- **Bilan → Créer un lien de retour** : formulaire public pour clients et invités, note de 1 à 5 étoiles et commentaire, lien/QR/PNG, fermeture possible, moyenne et avis visibles uniquement par l'administrateur. Chaque lien accepte au plus 20 avis par minute et 1 000 au total.
- Les invités, la checklist de matériel et **À passer absolument** ont des impressions dédiées, avec cases à cocher et sans la navigation ni les formulaires du site. La liste papier des invités contient les noms, groupes/tables, accompagnants et réponses, sans coordonnées ni allergies.

`enhancements.js` contient les brouillons, l'import CSV, les PNG, les feuilles d'impression et le formulaire d'avis. `tests/workflow-fixes.sql` vérifie les lieux, l'acceptation des morceaux, les protections de suppression des clients et les avis dans une transaction annulée. `node tests/workflow-fixes.cjs` couvre les parcours navigateur correspondants, dont un import réel simulé de 160 lignes et les styles d'impression.

Appliquer aussi `db/private-music-comments.sql` après `db/workflow-fixes.sql` (migration `keep_guest_music_comments_private`). Seuls le titre et l’artiste passent de la demande à la playlist ; le message de l’invité reste privé dans les demandes. Les notes déjà saisies manuellement dans les playlists sont conservées.

## Tableau natif des invités

La rubrique **Invités** s'ouvre sur **Vue tableau** : cellules directement modifiables, lignes à ajouter (une ou plusieurs), navigation avec Tab / Entrée et collage d'un bloc de cellules. Aucun fichier n'est nécessaire. **Vue fiches** reste disponible et le choix de présentation est conservé dans l'onglet.

**Enregistrer le tableau** enregistre les nouvelles lignes et les modifications en une transaction. Les lignes vierges sont ignorées. La suppression d'un invité existant est marquée dans le tableau, réversible avant enregistrement, puis confirmée explicitement. Les invités non modifiés ne sont pas réécrits. Les lignes non enregistrées sont conservées en brouillon ; le serveur refuse l'écrasement d'un invité modifié ailleurs depuis l'ouverture du brouillon.

La recherche fonctionne dans les deux vues. L'impression et l'export de la vue tableau reprennent son contenu actuel. Les imports CSV / Excel restent une option séparée. Les droits du projet sont conservés, y compris la lecture seule pour un client dont le projet est terminé.

La migration `add_native_guest_sheet_save`, décrite dans `db/guest-sheet.sql`, ajoute uniquement la fonction d'enregistrement sécurisée et ne change aucun invité existant à l'installation. Le tableau est implémenté dans `guest-sheet.js`.

Validation : `node tests/guest-sheet.cjs` pour la saisie directe, le clavier, le collage de 160 lignes, les brouillons, les suppressions explicites, l'impression et le mobile ; `tests/guest-sheet.sql` pour l'atomicité, les droits, l'absence de doublons lors d'une répétition et la protection des modifications concurrentes (jeux de test annulés).

## Ouverture des documents

**Documents → Ouvrir** ouvre un nouvel onglet et laisse le navigateur afficher directement le PDF, l'image ou le texte. Aucun lecteur intégré au site ni conversion Word/Excel. Les autres formats ont un bouton de téléchargement pour leur application habituelle. **Télécharger** reste disponible séparément dans la liste des documents.

**Partager un lien de lecture** conserve une adresse du site `#/lecture/<jeton>`, utilisable sans connexion pour ce seul fichier. Le lien ouvre également le fichier dans le navigateur. **Révoquer le lien** bloque les prochaines ouvertures. Les documents restent privés et les anciens documents et liens sont conservés. Une révocation ne retire pas une copie déjà chargée par un destinataire.

Le script `db/document-reader.sql` et la fonction `supabase/functions/read-document/index.ts` vérifient l'utilisateur avec ses droits RLS ou un jeton actif propre au document avant de transmettre le fichier. Aucun chemin Storage ni lien signé n'est exposé. Déployer la fonction `read-document` avec `verify_jwt=false` : elle assure elle-même ces vérifications.

Validation : `node tests/document-edge.cjs`, `tests/document-reader.sql` (transaction annulée), `node tests/document-viewer.cjs` (ouverture native, téléchargement et liens révoqués).

## Lisibilité et animations

La présentation conserve les thèmes sobres clair et sombre avec des textes plus grands, des contrastes renforcés, des cartes de synthèse distinctes, des champs plus confortables et des actions principales mieux visibles. Les onglets des outils restent accessibles pendant le défilement ; sur mobile, ils défilent horizontalement et montrent automatiquement la rubrique active. Le menu mobile se ferme par le fond, Échap ou un lien, et le clavier reste dans la navigation tant qu'elle est ouverte.

`interface.js` anime brièvement l'apparition des grands blocs, sans observer la saisie dans les tableaux ni modifier les formulaires. Les boutons et raccourcis ont des retours visuels, et une barre indique le chargement d'une page. La préférence système de réduction des mouvements désactive les animations, y compris lorsqu'elle change pendant l'utilisation. Les impressions restent sans navigation ni animations.

`node tests/interface.cjs` vérifie les thèmes et tailles de 360 à 1 440 pixels, le menu au clavier, la navigation fixe, les mouvements réduits, le chargement et le contraste du texte. Les suites existantes couvrent toujours projets, invités, documents, formulaires et impressions. Aucun changement de données ni migration.

## Heures de travail du planning

L'outil **Conducteur** est renommé **Planning**. Ses adresses historiques `?section=conductor` restent valides. Chaque créneau affiche sa durée et le planning affiche les heures de travail planifiées. Le même calcul est repris dans **Tarification et facturation**, dans la fiche du projet, ainsi que dans son planning de préparation.

Le total utilise les débuts et fins existants à la minute près. Les pauses entre créneaux sont exclues ; les chevauchements ne comptent qu'une fois. Une fin avant le début est interprétée le lendemain du jour choisi. Le calcul distingue les jours : deux créneaux à la même heure sur deux jours différents sont additionnés. Les créneaux sans horaires complets ou avec des heures identiques sont signalés et exclus, jusqu'à correction. Ce total représente le temps planifié, pas un chronométrage du travail effectué.

Aucune migration ni réécriture des projets : les tarifs, paiements, factures et liens existants restent inchangés. `work-hours.js` partage le calcul entre les vues ; `node tests/work-hours.cjs` contrôle les durées, minuit, chevauchements, pauses, horaires incomplets, édition/suppression, total financier et conservation des montants.

## Planning sur plusieurs jours

Dans les deux formulaires de planning, **Jour du créneau** propose le jour de l'événement (J), le lendemain (J+1) et les jours suivants, avec la date correspondante lorsque la date du projet est renseignée. Les jours précédents sont également disponibles. Le tri utilise d'abord ce jour, puis l'heure, dans le Planning, la préparation, l'impression et les liens partagés autorisant le planning. Une fin antérieure au début reste une fin après minuit.

Exemple : installation J de 11 h 50 à 13 h, puis rangement J+1 de 10 h à 12 h : le rangement apparaît après l'installation et le total est de 3 h 10. Les mêmes horaires sur des jours différents ne se recouvrent plus dans le calcul des heures. Les chevauchements réels à cheval sur minuit sont toujours fusionnés.

La migration `add_explicit_planning_days`, enregistrée dans `db/planning-days.sql`, ajoute `schedule_items.day_offset` (−7 à +30, nullable). Elle ne devine pas les jours des anciens créneaux : ils restent inchangés et affichent « jour à confirmer ». Les sélectionner dans **Modifier**, puis choisir le jour approprié. Tant que tous les créneaux sont anciens, l'ancien total sur une journée reste conservé ; dès qu'un jour est confirmé, les jours non précisés sont provisoirement placés à J et le total reste signalé à confirmer.

Les jetons et rubriques des liens, montants et factures ne changent pas. Les réponses publiques existantes restent identiques à l'installation ; seules les lignes dont le jour est confirmé reçoivent le jour dans le planning public. La migration vérifie ces conservations. Pour une autre base, appliquer ce script après les migrations existantes, avant la publication des fichiers statiques.

Validation : `node tests/planning-days.cjs` (deux formulaires, tri, modification, heures, affichage public et mobile), `tests/planning-days.sql` (droits, bornes, projection et tri publics, transaction annulée), et les suites de régression existantes.

## Formulaire de retour après événement

Le lien d'avis pose d'abord une question globale sur la prestation (1 à 5 étoiles, obligatoire), puis quatre questions facultatives : choix musicaux, ambiance, qualité sonore et organisation. La même échelle est expliquée pour tous les critères, avec « Non évalué / Non concerné » pour ceux que la personne ne souhaite pas noter. Un commentaire libre et deux champs distincts prénom / nom sont facultatifs ; le formulaire peut être envoyé anonymement. Aucune question client / invité n'est posée.

Les critères renseignés apparaissent dans les avis du Bilan, en plus de la moyenne des notes globales. Les anciennes réponses et leurs notes restent inchangées. Le champ historique `audience` reste compatible avec les anciens onglets ouverts, mais est nul lorsqu'il n'est plus fourni et n'est plus affiché. Aucun destinataire n'est classé automatiquement comme invité.

La migration `add_optional_feedback_criteria` est dans `db/feedback-criteria.sql`. Elle ajoute quatre notes facultatives bornées de 1 à 5, rend le rôle historique facultatif et conserve les limites d'envoi, la fermeture des formulaires et les droits existants. La migration contrôle la conservation des avis et liens existants. Appliquer le script avant la publication sur une autre base.

Validation : `tests/feedback-criteria.sql` contrôle en transaction annulée l'enregistrement anonyme, les critères facultatifs, les bornes, l'ancienne forme du message, les permissions et un lien fermé ; `node tests/feedback-criteria.cjs` contrôle le parcours public, les noms facultatifs, les questions, le bilan et le mobile.

## Types de prestation et tarifs associés

La création d'un projet demande un type : mariage, anniversaire, événement d'entreprise, événement associatif, soirée privée ou autre prestation. La date reste facultative pour les événements en préparation lointaine. Le type est modifiable sur la fiche et visible dans les listes et l'espace client. Les anciens projets restent « Type à définir » jusqu'à leur modification explicite. Les anciens liens publics conservent leurs rubriques : ce nouveau champ n'y est pas ajouté automatiquement.

**Mon compte → Grille tarifaire par prestation** présente chaque catégorie et ses montants. Un tarif peut être général ou associé à un type ; les projets proposent uniquement les tarifs correspondants et les tarifs généraux. La modification du type ou du catalogue ne réécrit pas un montant déjà appliqué. L'application d'un tarif reste un bouton explicite.

La grille de départ reprend les prix déjà utilisés : 25 €/h en base, 35 €/h en heures tardives. Chaque type a ses propres lignes et descriptions modifiables. Le forfait Famille & amis de 150 € reste général et inchangé. Il s'agit de bases de devis, sans prix de marché supposé ni majoration automatique pour 2027/2028. Le devis se construit selon les tâches et horaires prévus. Le bouton **Reprendre les heures du planning** remplit la quantité d'un tarif horaire ; ajuster cette quantité aux heures réellement couvertes, notamment pour les heures tardives, puis appliquer le tarif.

La migration `add_project_types_and_scoped_rates` est dans `db/project-types.sql`. Elle ajoute deux colonnes facultatives avec contrôle des types et adapte les fonctions de création/modification sans changer leurs droits. Les anciennes requêtes sans type restent compatibles. `db/project-type-starter-rates.sql` est un ajout de données idempotent : il copie les bases horaires générales Normal/Tard dans les six catégories, sans modifier les tarifs généraux, projets, paiements ou factures. Les installations sans ces bases ne reçoivent aucun montant inventé.

Validation : `tests/project-types.sql` pour les droits, types invalides, requêtes historiques et mariage sans date, dans une transaction annulée ; `node tests/project-types.cjs` pour les formulaires, propositions tarifaires, heures, édition de la grille, conservation des montants et affichage mobile.

## Préparation adaptée à chaque type d’événement

Les projets typés proposent une **Préparation dédiée**, un encart de raccourcis et des onglets ordonnés selon leur usage :

- Mariage : mariés, référent, cérémonie, cocktail, entrée, ouverture de bal et interventions.
- Anniversaire : personne fêtée, occasion, générations présentes, gâteau, animations et musique.
- Entreprise : objectifs, validation, intervenants, supports techniques, identité de marque et protocole.
- Association : référents, bénévoles, programme, accès et contraintes sonores.
- Soirée privée : hôte, ambiance, profil des invités, moments importants et règles du lieu.
- Autre : objectif, public, attentes, coordination et contraintes à définir.

Les repères horaires de cette fiche servent à la préparation ; le Planning conserve les créneaux définitifs et le calcul des heures. Les outils existants restent accessibles et les projets sans type gardent leur présentation habituelle.

Chaque fiche s'enregistre explicitement et garde un brouillon dans l'onglet, par compte, projet et type. Les champs et recommandations diffèrent par type. Les tâches choisies sont ajoutées à la checklist existante, sans réinitialiser les tâches présentes ; les doublons de libellé sont évités côté serveur. Changer le type ne supprime aucune fiche précédente et n'ajoute aucune tâche automatiquement. Le retour à un ancien type retrouve sa fiche enregistrée.

La migration `add_type_specific_event_preparation` est dans `db/event-preparation.sql`. La table `project_event_briefs` utilise les droits de lecture et modification existants du projet, un contrôle des champs autorisés et une révision pour refuser l'écrasement d'une modification concurrente. Une écriture provenant d'un ancien type après changement est refusée. Aucune fiche n'est exposée aux liens publics existants. Clients et administrateurs conservent leurs droits ; un client d'un projet terminé consulte sa fiche en lecture seule.

Appliquer ce script après les migrations de types pour une autre base. `tests/event-preparation.sql` vérifie les droits, la validation, les versions, les changements de type, les tâches répétées et l'absence de fuite publique dans une transaction annulée. `node tests/event-experience.cjs` couvre les six formulaires, la navigation, l'enregistrement, la conservation, les tâches choisies, les conflits, le mobile et la lecture seule. Le code de présentation est dans `event-experience.js`.

## Invitations, placement, équipe, rentabilité et production audio

Nouveaux onglets dans les outils du projet :

- **Réponses invités** : générer les liens personnels manquants depuis la liste existante, exporter les invitations en CSV, copier un lien ou télécharger son QR en PNG. Chaque lien concerne uniquement son invité/foyer, sans connexion. Présence, accompagnants et besoins alimentaires mettent à jour la fiche existante. La limite d'accompagnants est réglable et les liens peuvent être fermés/réouverts. Aucun email n'est envoyé automatiquement. Les autres invités, notes privées et coordonnées ne figurent pas dans la réponse publique. Limite de 20 envois par minute et par lien.
- **Plan de tables** : tables rondes/rectangulaires, capacités, déplacement sur le plan, coordonnées accessibles, affectation par listes ou glisser-déposer, alerte de dépassement et import des groupes existants. Les placements enregistrés mettent à jour `project_guests.table_name`. Les modifications ultérieures de ce champ dans la liste synchronisent le plan et invalident les brouillons concurrents ; les autres informations des invités ne sont pas remplacées. Export du plan en SVG avec légende et impression isolée des placements.
- **Rentabilité** (administrateur) : recettes prévues/encaissées issues des lignes existantes, frais de déplacement, équipe, matériel, achats et autres frais, coût interne horaire facultatif, marge prévisionnelle et revenu disponible par heure. Les montants doivent être saisis sur une base cohérente HT/TTC. Ce calcul ne réécrit pas les tarifs, paiements ou factures.
- **Équipe** (administrateur) : comptes de profil `dj`, affectations par projet en lecture seule ou collaborateur. Les membres voient les données opérationnelles des projets affectés ; les collaborateurs peuvent modifier invités, planning, contacts, tâches, playlists, placement et setup. Les tarifs, paiements, factures, coûts, marges, liens RSVP et fiches de préparation client restent privés aux rôles historiques autorisés. Les documents ne deviennent visibles que via le bouton explicite **Montrer à l’équipe**, masqué par défaut. Un projet terminé reste en lecture seule pour l’équipe. Retirer une affectation bloque les lectures suivantes.
- **Import musical** : enregistrer le lien canonique d'une playlist Spotify, ou importer un CSV exporté de Spotify (type Exportify) avec Track Name / Artist Name(s) / Track URI, ou Titre / Artiste / URL. Prévisualisation puis ajout explicite à la sélection choisie, dédoublonné par titre/artiste. Limites : 5 Mo et 2 000 titres par fichier. La connexion directe à l'API Spotify est reportée à la demande du propriétaire ; aucun Client ID n'est requis pour le lien et le CSV. Un lien seul n'importe pas automatiquement les morceaux.

### Setup et câbles de mon matériel

Dans **Mon matériel → Connectique audio**, définir les prises de chaque appareil : nom, entrée/sortie, connecteur illustré, prise mâle/femelle et niveau/protocole. Le choix se fait dans une fenêtre avec recherche et 36 formes de connectiques, dont les borniers HP à vis/pince et Euroblock/Phoenix. Le format audio est renseigné automatiquement ; les anciens ports gardent leurs paramètres. Deux prises gauche/droite restent deux ports distincts. Les signaux ligne et puissance haut-parleur sont distincts.

Sélectionner les exemplaires dans le matériel du projet, puis ouvrir **Setup et câbles**. Placer les appareils et des zones nommées (petite, moyenne ou grande, déplaçables directement), définir les dimensions physiques, puis relier les sorties aux entrées. La proposition automatique ne relie que les correspondances uniques des deux côtés ; les choix ambigus restent manuels. Les ports déjà utilisés, signaux/canaux incompatibles et boucles sont refusés par l'éditeur. Le serveur contrôle aussi les niveaux/protocoles, la quantité sélectionnée, les ports et les révisions. Une conversion optique/coaxiale ou de niveau audio demande un convertisseur avec ses propres ports.

La liste déduit les connecteurs complémentaires des câbles et leurs quantités, avec longueurs choisies ou estimées (distance entre appareils, 20 % de marge et 1 m supplémentaire, arrondie à une longueur courante). Le cheminement réel, la section des câbles HP et les limites des liaisons numériques/USB restent à vérifier lors de la préparation. Export SVG du plan avec légende, checklist imprimable des câbles et impression des liaisons. Le plan et la liste restent sans interface du site sur le document imprimé.

Les setups gardent une copie de la connectique au moment où un appareil est ajouté : modifier le catalogue ne réécrit pas les anciens plans. L'actualisation d'une copie est explicite et retire les liaisons devenues incompatibles du brouillon seulement après confirmation. Les plans sont enregistrés par révision et gardent des brouillons dans l'onglet, par compte/projet. Une sauvegarde concurrente est refusée. Les quantités possédées et les sélections de matériel existantes ne sont pas modifiées par l'éditeur de setup.

### Installation

Sur une autre base, appliquer après les migrations existantes, dans cet ordre :

1. `db/production-access.sql` : membres, droits opérationnels, visibilité équipe des documents, coûts et import musical.
2. `db/guest-rsvp-seating.sql` : liens personnels de réponse et stockage des placements.
3. `db/audio-setups.sql` : connectique et setups.
4. `db/production-validation.sql`, puis `db/production-board-fixes.sql` : validation des structures et des protocoles.
5. `db/seating-synchronization.sql` : synchronisation des groupes invités et contrôle des modifications concurrentes.

Les fonctions publiques de lecture/écriture financière existantes ne sont pas élargies aux membres. Les fonctions privilégiées de RSVP et sauvegarde des plans restent dans `production_private`, avec autorisation explicite par jeton ou utilisateur/projet et `search_path` vide. Les nouvelles tables ont des politiques RLS. Aucune invitation, compte équipe ou plan n'est créé automatiquement par l'installation.

Déployer `supabase/functions/create-team-user/index.ts` sous le nom `create-team-user`, `verify_jwt=false` : la fonction vérifie elle-même le JWT puis le profil administrateur avant de créer un compte de rôle `dj`. Les variables standard Supabase restent côté serveur. Le mot de passe provisoire doit avoir au moins 12 caractères et n'est jamais retourné, journalisé ou conservé en brouillon. Le propriétaire transmet lui-même les identifiants ; le membre peut changer son mot de passe dans Mon compte. Aucun email n'est envoyé par cette fonction.

### Validation

`tests/production.sql` vérifie sur la base réelle, en transaction annulée, les rôles lecteur/collaborateur, l'absence d'accès aux finances et aux autres projets, la révocation, les documents explicitement partagés, la synchronisation du placement, les révisions, l'import musical, les exemplaires de matériel, les connexions incompatibles et les réponses publiques limitées à leur invitation. Les numéros de facture de test sont explicites pour ne pas consommer la séquence réelle.

`node tests/production-ui.cjs` couvre la connectique, deux câbles stéréo, plans/SVG/impressions/brouillons, placement/capacité, RSVP/fermeture, marge, CSV, équipe et mobile. `node tests/audio-routing.cjs` vérifie le calcul des câbles et les incompatibilités ; `node tests/team-account-edge.cjs` vérifie l'authentification administrateur, le rôle imposé et le nettoyage d'une création incomplète, sans créer de compte réel. Les suites historiques restent applicables.

La mise à jour du catalogue illustré utilise `db/connector-catalog.sql` après les migrations précédentes. Elle étend la validation sans réécrire les ports ou snapshots existants. `node tests/connector-picker.cjs` couvre la fenêtre, les dessins, la recherche, les brouillons, le mobile et les tailles simples de zone ; `tests/connector-catalog.sql` vérifie les nouvelles familles en transaction annulée.


### Prises hybrides et groupes audio

Une prise physique peut proposer plusieurs fiches et niveaux de signal dans `alternatives` : identifiant stable, connecteur, sexe, signal et format interne. La fiche principale historique reste disponible ; une liaison sans identifiant de variante continue d’utiliser cette fiche. Les variantes d’une prise partagent son occupation, même si leur connectique ou leur signal diffèrent. Les câbles et les contrôles utilisent la variante explicitement choisie, jamais une conversion implicite de niveau.

Dans **Connectique audio**, choisir **Combo XLR / Jack 6,35** ou ajouter librement des possibilités à une prise. Chaque possibilité peut avoir son signal et son sexe propres. Un groupe / repère libre et les rôles L/Mono, L, R ou stéréo sur une seule prise distinguent une paire physique d’une prise stéréo. Le bouton **Ajouter une paire L/Mono–R** crée deux prises distinctes. Les repères mono/stéréo ne changent pas la capacité des autres prises et ne forcent pas le branchement du côté R.

Le modèle **Yamaha MG06X** ajoute volontairement 11 prises physiques (2 combos MIC/LINE, CH 3/4, CH 5/6, 4 sorties stéréo XLR/jack, casque stéréo). Il complète sans écraser les prises existantes et ignore les noms/sens déjà présents. Les réglages PAD, gain, alimentation fantôme et MONO/STEREO restent physiques et doivent être vérifiés sur la console. Le modèle est un point de départ entièrement modifiable.

Appliquer `db/audio-socket-alternatives.sql` après `db/connector-catalog.sql`. La migration ajoute trois champs et valide les variantes côté serveur sans réécrire les anciens setups. `node tests/audio-sockets.cjs`, `node tests/audio-sockets-ui.cjs` et `tests/audio-sockets.sql` couvrent les prises combo, la fiche retenue, l’occupation physique unique, les groupes L/Mono–R, les brouillons, les anciens formats et la validation serveur.


### Cordons stéréo et recherche de modèles

**Setup et câbles → Cordon stéréo L/R** crée une seule liaison et un seul cordon entre deux ensembles stéréo. Chaque côté peut être une entrée/sortie groupée (2 RCA, mini-jack ou jack stéréo) ou deux prises mono L et R. Une paire peut être choisie depuis les groupes configurés ou manuellement sur le même appareil. Le mode classique propose automatiquement cette fenêtre lors d’une tentative de branchement entre stéréo et mono. Cela conserve les anciennes entrées RCA déjà saisies.

Exemple : `DDJ-FLX6-GT Master (2 RCA)` → `MG06X CH 3 L/Mono + CH 4 R` produit un cordon **2 RCA mâles → 2 × jack 6,35 TS mâle**, avec le repère gauche/droite explicite. Les quatre prises d’un cordon L/R séparé sont occupées, le cordon se retire en une action et la liste d’emport compte une seule unité. Il ne s’agit pas d’un adaptateur de sommation mono. Les liaisons ordinaires et les anciens snapshots gardent leur format.

Appliquer `db/stereo-cable-assemblies.sql` après `db/audio-socket-alternatives.sql`. La validation côté serveur contrôle toutes les branches et toutes leurs variantes, refuse la réutilisation d’une prise occupée, et limite ce mode aux signaux analogiques de niveau ligne. Les droits existants et les révisions sont conservés. Aucun setup existant n’est réécrit.

**Mon matériel → Connectique audio → Rechercher un modèle** cherche dans quatre fiches avec source constructeur : Pioneer DDJ-FLX6 et DDJ-FLX6-GT, Yamaha MG06 et MG06X. Les noms sont normalisés (espaces, tirets et casse). La recherche propose également de copier une configuration de l’inventaire. Il s’agit d’un catalogue documenté et extensible, pas d’une recherche Internet automatique ou d’une API universelle. Un modèle absent est annoncé comme tel, avec un lien vers une recherche de notice. Aucun service externe ni clé API n’est requis. Les modèles peuvent être étendus dans `audio-models.js` après vérification des sources.

L’import affiche les prises avant ajout. Les noms/sens déjà présents sont désactivés et, si du matériel est déjà configuré, aucune prise n’est cochée automatiquement. Les prises déjà enregistrées sous un autre nom ne sont pas devinées : l’utilisateur coche explicitement les ajouts. Les anciennes prises, réservations et copies de connectique restent inchangées.

`node tests/stereo-cables.cjs` couvre les câbles groupés et séparés, leur nombre et l’occupation de chaque branche ; `node tests/stereo-cables-ui.cjs` reproduit DDJ → MG06X, la sélection manuelle, la recherche de modèles, les impressions, SVG, le mobile et la sauvegarde ; `tests/stereo-cables.sql` vérifie les sauvegardes et refus côté base dans une transaction annulée.

### Groupes stéréo sur le matériel

**Connectique audio → Groupes de prises** affiche chaque paire en un seul bloc, avec ses prises L/Mono et R côte à côte. **Grouper deux prises existantes** associe leurs identifiants sans modifier noms, connecteurs ou variantes ; **Créer une paire de prises** choisit sa propre connectique dans la fenêtre illustrée, sans reprendre le brouillon d’une prise individuelle. Le groupe peut être renommé, son comportement mono activé/désactivé ou son association dissociée sans supprimer les prises.

Les groupes deviennent des options du formulaire normal **Sortie / groupe de sorties → Entrée / groupe stéréo**. Une sortie RCA stéréo peut donc être reliée directement à **CH 3/4 — Stéréo (L + R)**. Les prises membres restent disponibles séparément : L/Mono seule affiche le mode mono, puis L et R raccordées affichent le mode stéréo. Débrancher R d’une liaison séparée rétablit l’état mono. Cette indication décrit le fonctionnement prévu de l’appareil ; le site ne mélange pas deux sources stéréo dans une prise mono. Les groupes de sortie L/R n’appliquent pas de sommation mono automatique.

Les options de groupe ont une valeur stable fondée sur les prises et variantes, pour éviter qu’un groupe occupé soit remplacé par un autre quand la liste se réorganise. Les variantes d’un groupe utilisent toujours les identifiants physiques et les vérifications de câblage précédentes. Les anciens plans gardent leur copie ; utilisez **Actualiser la connectique depuis le catalogue** sur un appareil si vous souhaitez reprendre une nouvelle association dans un brouillon, puis enregistrez.

Appliquer `db/equipment-stereo-groups.sql` après les migrations précédentes. Les RPC de gestion de groupe sont `SECURITY INVOKER`, réservés aux administrateurs, et restent soumis aux RLS. Les deux prises sont mises à jour atomiquement ; les associations entre appareils différents, la réutilisation d’une même prise, et les déplacements implicites depuis un autre groupe sont refusés. `tests/equipment-stereo-groups.sql` vérifie ces droits et la conservation des prises/plans dans une transaction annulée. `node tests/audio-groups-ui.cjs` couvre la création/association, le bloc visuel, le branchement direct, la bascule mono/stéréo selon R et la dissociation sans perte.

### Diagnostic des niveaux et copie de connectique

Les niveaux désignent la prise, pas la catégorie de l’appareil : les **entrées d’un amplificateur** reçoivent du **niveau ligne** ; ses **sorties vers les enceintes passives** sont de **puissance HP**. Les libellés du catalogue précisent ce sens. Un refus de cordon stéréo indique désormais l’appareil, la prise et le niveau qui ne convient pas. Les détails complets de chaque sélection sont affichés sous les menus et restent lisibles sur mobile.

Si la connectique du catalogue diffère de celle du plan, un encart propose **Reprendre les modifications dans ce brouillon**. Cette action relit le catalogue et remplace les copies de prises dans le brouillon ; elle ne sauvegarde pas le plan et ne supprime aucune liaison. Les liaisons devenues incompatibles restent visibles avec leur erreur, jusqu’à correction explicite. Le bouton Enregistrer reste soumis aux validations de câblage et de révision existantes. Le fonctionnement de l’actualisation individuelle historique reste inchangé.

`node tests/audio-signal-fix.cjs` reproduit le refus Yamaha ligne → Ibiza mal configuré en HP, vérifie le diagnostic nominatif, l’actualisation explicite, le branchement valide après correction, la conservation du plan enregistré et des liaisons, ainsi que la lisibilité mobile. Aucune conversion automatique HP/ligne n’est effectuée.

### Sélection stéréo cohérente dans le formulaire normal

Lorsqu’un côté de la liaison est stéréo et que l’autre sélection désigne un membre d’une paire L/R, le formulaire reprend le **groupe complet** si sa correspondance est unique et ses deux prises libres. Cela fonctionne dans les deux ordres de sélection et pour un membre L ou R ; les repères L/R restent dans leur ordre physique. Le récapitulatif affiche explicitement **Stéréo · 2 prises L + R** et les deux prises avant tout ajout au brouillon. La sélection seule ne sauvegarde et ne crée aucune liaison.

Une paire occupée n’est pas réutilisée et plusieurs variantes valides demandent un choix explicite. Une prise sans groupe ne se voit pas attribuer arbitrairement une voisine : le formulaire propose la sélection manuelle des deux prises, en préremplissant la prise gauche déjà choisie si elle convient. Les erreurs de niveaux micro/ligne/HP restent bloquantes. Le bouton **Recommencer avec des prises mono** permet de revenir à deux sélections mono ; une liaison mono → mono conserve son fonctionnement précédent.

`tests/stereo-selection-ui.cjs` reproduit la sélection Yamaha MASTER OUT JACK stéréo → Ibiza IN Jack L et vérifie la reprise de L+R, l’autre ordre de sélection, le choix R, le sens inverse, le mono, les variantes ambiguës, le flux manuel et la présentation mobile. Les tests purs de paires sont étendus dans `tests/stereo-cables.cjs`.

### Outils opérationnels du projet

Le bouton **Tous les outils** remplace la grande grille et les onglets défilants. Il regroupe les outils en six catégories avec une recherche ; Planning, Invités et Documents restent accessibles directement. Les anciennes URL `#/outils/<projet>?section=...` continuent à fonctionner.

Les 14 nouveaux espaces sont : repas et menus, hébergement, transports et navettes, éclairage, électricité, chargement, animations, photos et vidéos, décoration, accueil et accès, sécurité, autorisations et assurances, objets perdus, consommables. Chaque espace comporte des fiches modifiables, des états dédiés, une recherche, des indicateurs et une impression en checklist. Les brouillons sont conservés dans l’onglet, par compte et par projet.

- Les repas affichent les besoins alimentaires de la liste d’invités sans la modifier.
- Le chargement importe une fois chaque sélection de matériel. Réimporter ajoute seulement les nouveaux éléments et conserve les quantités, véhicules et caisses déjà personnalisés. L’inventaire et la sélection du projet restent inchangés.
- L’électricité estime la charge de chaque circuit en monophasé, signale les puissances inconnues et les dépassements. Elle ne valide pas la conformité d’une installation.
- Les hébergements et transports signalent les capacités insuffisantes ; les consommables calculent les quantités manquantes après consommation.

Déployer `db/project-operations.sql` avant les nouveaux scripts. Cette migration ajoute une table isolée avec RLS et vérifie par empreinte que toutes les tables existantes sont inchangées. Les règles d’accès des opérations existantes s’appliquent : administrateur, client propriétaire et équipe affectée selon ses droits ; aucune exposition anonyme ni ajout automatique aux liens publics. Les modifications concurrentes sont détectées par révision.

Validation : `node tests/project-operations-ui.cjs` ; exécuter `tests/project-operations.sql` dans une transaction (les fixtures sont annulées en fin de script).
