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
