# Syntra Android

Application Android installable, sans barre de navigation native ni conversion des contrôles du site : l'interface est celle de Syntra dans une WebView. Les dialogues de confirmation de l'application utilisent un thème monochrome.

- Android 8.0 et versions suivantes ; application universelle, sans dépendance à une architecture CPU.
- Connexion au site en ligne `https://cax-corp.github.io/dj-resa/`. Les mises à jour du site apparaissent sans reconstruire l'APK.
- Connexion utilisateur et préférences conservées dans le stockage privé de la WebView. Elles sont distinctes de celles de Chrome.
- Liens de projet ouverts dans l'application ; liens externes ouverts dans les applications Android.
- Import de CSV et de documents par le sélecteur Android ; exports, QR codes et fichiers enregistrés à l'endroit choisi.
- PDF et autres documents ouverts dans une application compatible, avec un accès temporaire au seul fichier concerné. En l'absence de lecteur, le fichier peut être enregistré.
- Impression via Android ; boutons de copie reliés au presse-papiers ; écran de veille immersif et bouton Retour.
- La seule permission déclarée est Internet. Aucun accès général au stockage, au microphone ou à la caméra.
- Les exports natifs sont limités à 64 Mo par fichier. Les fichiers provisoires sont conservés dans le cache privé pour permettre leur ouverture, puis nettoyés.

## Construction standard

Ouvrir ce dossier dans Android Studio, avec JDK 17, Gradle 8.11.1, SDK Android 35 et Build Tools 35.0.0. Lancer `gradle :app:assembleRelease` depuis ce dossier. La sortie standard est non signée : utiliser sa propre clé de publication pour l'installation.

Aucune clé privée de signature ni aucun mot de passe ne fait partie du dépôt. Pour les mises à jour installées par-dessus une version existante, garder la même clé et augmenter `versionCode`.

## Construction sans Android Studio

`build-apk.py` utilise les outils officiels du SDK et le compilateur Java Eclipse ECJ 3.38.0. Il compile les ressources, les classes et le DEX, aligne l'APK, le signe avec une clé externe puis vérifie sa signature.

```sh
python3 build-apk.py --sdk /chemin/sdk --ecj /chemin/ecj.jar \
  --keystore /chemin/prive/syntra-release.p12 \
  --password-file /chemin/prive/password.txt \
  --output /chemin/Syntra-1.0.1.apk
```

La clé doit avoir l'alias `syntra`. Le fichier de mot de passe reste hors du dépôt. Le script appelle `java`, `aapt2`, D8, `zipalign` et `apksigner` ; aucun secret n'est placé dans les arguments en clair.

## Vérifications

- Compilation contre le SDK Android 35 et génération DEX pour Android 8.0 minimum.
- Vérification des signatures APK v2/v3 et des métadonnées du manifeste.
- `tests/verify-apk.py` : table `resources.arsc` non compressée et alignée sur 4 octets, exigée à l’installation sur Android 11 et suivants.
- `tests/UrlPolicyTest.java` : frontières d'origine, liens de projet et noms de fichiers.
- `../tests/android-webview.cjs` : transferts binaires avec accusés de réception, téléchargements, documents, impression, thèmes et veille, avec le canal natif simulé.
- `../tests/document-viewer.cjs` : ouverture des PDF dans le navigateur ordinaire inchangée.

L'APK a été compilé et sa signature vérifiée ; aucun téléphone Android ni émulateur matériel n'était disponible dans l'environnement de construction. Les interactions Android (clavier, sélecteur de fichiers, lecteur PDF, impression et retour) doivent également être vérifiées sur un appareil.
