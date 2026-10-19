# Fleuriaye en direct

Appli web (PWA) qui estime la fréquentation du site IUT de la Fleuriaye (Carquefou) à partir des emplois du temps CELCAT de l'IUT de Nantes. Les EDT sont retéléchargés chaque nuit par GitHub, et l'appli installée sur le téléphone se met à jour toute seule.

## Mise en ligne (une seule fois, ~5 minutes)

1. **Créer le dépôt.** Sur github.com, clique sur **New repository**, nomme-le par exemple `fleuriaye`, laisse-le **Public** (GitHub Pages gratuit l'exige), puis **Create repository**.
2. **Envoyer les fichiers.** Sur la page du dépôt vide : **uploading an existing file**, puis glisse *le contenu* du dossier décompressé (`site/`, `scripts/`, `.github/`, `README.md`, `.gitignore`) et clique **Commit changes**.
   - Le dossier `.github` est caché sur Mac/Windows. Sur Mac : `Cmd + Maj + .` dans le Finder pour l'afficher. Si l'upload web l'ignore, utilise plutôt Git :
     ```
     cd fleuriaye
     git init && git add . && git commit -m "Première version"
     git branch -M main
     git remote add origin https://github.com/TON-PSEUDO/fleuriaye.git
     git push -u origin main
     ```
3. **Activer Pages.** Dans le dépôt : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
4. **Lancer la première publication.** Onglet **Actions → Mise à jour des EDT et publication → Run workflow**. Compte 4 à 5 minutes (705 EDT à télécharger).
5. L'adresse s'affiche à la fin du workflow : `https://TON-PSEUDO.github.io/fleuriaye/`.

## Installer l'appli sur le téléphone

- **Android (Chrome)** : ouvre l'adresse, puis menu ⋮ → **Installer l'application** (ou la bannière qui apparaît).
- **iPhone (Safari)** : ouvre l'adresse, puis **Partager → Sur l'écran d'accueil**.

## Ce qui se passe ensuite

- **Chaque nuit** (vers 4h), GitHub retélécharge les EDT, recalcule `data.json` et republie le site.
- **Quand tu modifies un fichier** et que tu le pousses sur `main`, le site est republié dans la minute.
- **L'appli sur le téléphone** charge toujours la dernière version quand il y a du réseau, et garde une copie pour fonctionner hors ligne. Sur iPhone, ferme complètement l'appli (balayer vers le haut) pour forcer le rechargement.
- Si le serveur des EDT est en panne une nuit, le workflow échoue et **l'ancienne version reste en ligne** : rien ne casse.

## Modifier les effectifs

Les effectifs estimés par promo sont dans `scripts/effectifs.json`. Change un chiffre (par exemple si tu connais l'effectif réel de SGM2), pousse le fichier : la page est recalculée à la publication suivante.

## Lancer en local

```
python scripts/build_data.py --cache ics/        # télécharge les EDT dans ics/ et écrit site/data.json
python scripts/build_data.py --cache ics/ --offline   # recalcule sans retélécharger
cd site && python -m http.server 8000             # puis ouvre http://localhost:8000
```

Aucune dépendance : Python 3.9+ suffit.

## Fichiers

| Fichier | Rôle |
|---|---|
| `site/index.html` | La page (structure et styles) |
| `site/app.js` | Les calculs et l'affichage, dans le navigateur |
| `site/data.json` | Les séances de l'année, générées par le script |
| `site/sw.js` | Service worker : hors ligne et mises à jour |
| `site/manifest.webmanifest`, `site/icons/` | Nom, icône et affichage plein écran de l'appli |
| `scripts/build_data.py` | Télécharge les EDT CELCAT et produit `data.json` |
| `scripts/effectifs.json` | Effectifs estimés par promo |
| `.github/workflows/mise-a-jour.yml` | Mise à jour nocturne et publication sur GitHub Pages |

## Méthode d'estimation

- Emplois du temps des groupes GMP, GEII, SGM, MT2E, QLIO et Master ITI ; seules les séances en salles `F-` (Fleuriaye) sont comptées. Périodes en entreprise, jours fériés et distanciel exclus.
- Effectifs : 1re année = places Parcoursup ; 2e et 3e année = 86 % de la 1re année (calé sur GMP3 = 89) ; Master ITI = 33 en M1 et M2.
- Chaque groupe reçoit une part de sa promo selon sa place dans l'arborescence des groupes (formation initiale et alternance supposées à parts égales), plafonnée à l'effectif de la promo.
- Note du jour : la fréquentation moyenne 8h–18h est classée parmi tous les jours de cours de l'année (1/10 = 10 % des jours les plus calmes, 10/10 = 10 % les plus chargés).
