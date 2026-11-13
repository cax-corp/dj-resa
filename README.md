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
- **Conducteur** : planning existant enrichi avec intervenants, morceaux, consignes et états de séquence. Mode direct et impression.
- **Contacts** : prestataires et intervenants, coordonnées et consignes du projet.
- **Documents** : dépôt privé, téléchargement, visibilité client explicite et liens temporaires d'une heure. Taille maximale : 20 Mo. Les données déjà téléchargées ne peuvent pas être retirées du destinataire ; masquer au client ne révoque pas un lien signé déjà émis.
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
