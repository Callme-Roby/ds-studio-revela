# Revela — inventaire du Design System et tokens proposés

Date : 27/10/2026. Lecture seule : aucun fichier de Revela n'a été modifié.

Source analysée : `Revela/apps/desktop/src/renderer/index.css` (≈ 1 750 lignes)
et les composants `.tsx` / `.ts` du renderer. Contrastes calculés avec la même
formule WCAG que `contrast()` de DS-Studio (`app/shared/model.ts`).

Statut : **PROPOSITION**. Rien n'est importé dans DS-Studio ni appliqué à Revela.

---

## 1. Constat

| Mesure                                  | Valeur                                                          |
| --------------------------------------- | --------------------------------------------------------------- |
| Variables déclarées dans `:root`        | 6 (`--ink`, `--ink-mute`, `--rule`, `--mat`, `--accent`, `--space`) |
| Usages de ces variables                 | 183 (`--ink-mute` 54, `--ink` 52, `--space` 42, `--rule` 29)     |
| Couleurs distinctes écrites en dur      | 51 (dont 23 en `rgba`/`rgb`)                                    |
| Tailles de texte distinctes             | 9 : 9, 10, 11, 11.5, 12, 13, 14, 15, 17 px                      |
| Rayons distincts                        | 8 : 0, 2, 3, 4, 6, 20 px, 50 %, 999 px                          |
| Valeurs de `gap`                        | 13 distinctes ; `padding` : 41 combinaisons                      |
| Couleurs définies en TypeScript         | `COULEURS_CANAL` (teintes.ts), histogramme (HistogrammeVue.tsx) |
| Media queries                           | aucune (application desktop)                                    |

Points forts déjà présents :

- Tous les gris de l'interface sont **strictement neutres** (R = V = B), y compris
  `--mat`, le passe-partout autour de la visée. C'est un vrai choix métier : une
  interface teintée fausse la perception des couleurs de la photo.
- Les pistes colorées des curseurs (`--piste`) sont calculées en Oklab dans
  `teintes.ts` : ce sont des **données**, pas des tokens. À laisser hors du DS.

## 2. Inventaire des couleurs

### Neutres

| Valeur     | Usages | Rôle observé                                         | Remarque                         |
| ---------- | -----: | ---------------------------------------------------- | -------------------------------- |
| `#ffffff` / `#fff` | 20 | fond de page, texte sur fond sombre, poignées    | deux écritures pour une valeur   |
| `#fafafa`  | 1      | fond de l'éditeur de courbe                          | proche de `#f5f5f5`              |
| `#f5f5f5`  | 8      | boutons secondaires, panneaux                        |                                  |
| `#f2f2f2`  | 3      | survol des boutons, texte de la bulle, onglets       | deux rôles différents            |
| `#ececec` (`--rule`) | 6 + 29 | filets, fonds de vignettes, grille de courbe |                                  |
| `#ebebeb`  | 4      | survol des boutons secondaires                       | quasi doublon de `#ececec`       |
| `#d8d8d8`  | 3      | déclencheur désactivé, traits de la courbe           |                                  |
| `#8a8a8a` (`--ink-mute`) | 54 | texte secondaire, libellés, désactivé       | **contraste insuffisant** (§5)   |
| `#2e2e2e` (`--mat`) | 2 | passe-partout autour de la visée                  | rôle métier                      |
| `#2a2a2a`  | 1      | fond de la bulle d'aide                              | quasi doublon de `#2e2e2e`       |
| `#111111` (`--ink`, `--accent`) | 52 + 2 | texte, action principale, onglet actif, focus | accent = texte |
| `#000`     | 1      | survol du déclencheur                                |                                  |
| `rgba(17,17,17, .55 / .75 / .82)` | 4 | voiles sur vignettes et badges        | trois opacités                   |
| `rgba(0,0,0, .06 / .15 / .18 / .28 / .35 / .4 / .55 / .6)` | 12 | ombres, contours, voile du rognage | huit opacités |

### Couleurs d'état et de sens

| Valeur     | Usages | Rôle observé                                      |
| ---------- | -----: | ------------------------------------------------- |
| `#f5a623`  | 5      | photo **choisie** (« pick ») : anneau, étoile      |
| `#4caf50`  | 2      | badge prêt, mention JPEG                          |
| `#b26a00`  | 4      | texte d'alerte (profil, réglage, connexion, écrêtage) |
| `#fdf0dd`  | 2      | fond d'alerte                                     |
| `#e0a760`  | 1      | souligné d'un réglage en alerte                   |
| `#b00020`  | 3      | erreur de connexion, action destructrice          |
| `#a33` / `#fdf3f3` | 1 + 1 | erreur d'index (texte / fond)              |
| `#fbf7f2`  | 1      | bandeau d'index — **seul fond non neutre** (écart R/B de 9) |

### Recherche sémantique (IA)

| Valeur     | Rôle                                                   |
| ---------- | ------------------------------------------------------ |
| `#e08a3c`  | début du dégradé, pastille, bordure du mode copie      |
| `#a95bb0`  | fin du dégradé du mode actif                           |
| `#4a5a9e`  | dégradé du champ de recherche                          |

### Couleurs techniques (canaux et masques)

| Valeur                       | Où                    | Remarque                               |
| ---------------------------- | --------------------- | -------------------------------------- |
| `#d02a2a` `#1f9e3f` `#2b62d9` | courbes (CSS + `COULEURS_CANAL`) | rouge, vert, bleu         |
| `rgba(232,64,64)` `rgba(64,208,80)` `rgba(72,120,255)` | histogramme (TS) | **autres valeurs** pour les mêmes canaux |
| `#6cf`, `rgba(140,190,255,.1)` | poignées et zones des masques |                                  |

## 3. Inventaire typographique, espaces et formes

- **Police** : `-apple-system, 'Segoe UI', system-ui, sans-serif`, 14 px / 1.5 sur `body`.
- **Tailles** (nombre d'usages) : 12 px ×28 · 11 px ×23 · 10 px ×9 · 13 px ×7 ·
  15 px ×5 · 9 px ×3 · 17 px, 14 px, 11.5 px ×1. Le texte réel de l'interface est
  donc en 11–12 px, pas en 14 px.
- **Graisses** : 600 ×6, 400 ×1.
- **Interlettrage** : 0.01, 0.03, 0.04, 0.06, 0.08, 0.12 em (capitales et libellés).
- **Espaces** : `--space` (16 px) et ses multiples ×1.5, ×2, ×3 ; à côté, des valeurs
  en dur 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 18, 28 px.
- **Rayons** : 3 px ×13, 4 px ×12, 50 % ×9, 6 px ×2, 999 px ×2, 2 px et 20 px ×1.
- **Ombres** : anneau fin `0 0 0 1px rgba(0,0,0,.06)` ×4 ; anneau de focus
  `0 0 0 2px var(--ink)` ; élévation unique `0 4px 14px rgb(0 0 0 / 28%)` (bulle).
- **Mouvement** : deux transitions d'opacité, 100 et 120 ms.

## 4. Tokens sémantiques proposés

Nommage : `catégorie.rôle.variante`, au format plat de DS-Studio. Les colonnes
« Fusionne » indiquent les valeurs actuelles absorbées. Une fusion change
légèrement le rendu : **à vérifier visuellement** avant de l'adopter.

### Couleurs — surfaces et texte

| Token                     | Valeur proposée | Fusionne                    | Rôle                                 |
| ------------------------- | --------------- | --------------------------- | ------------------------------------ |
| `color.surface.default`   | `#ffffff`       | `#fff`, `#ffffff`           | fond de page et des panneaux         |
| `color.surface.subtle`    | `#f5f5f5`       | `#fafafa`                   | boutons secondaires, zones de saisie |
| `color.surface.hover`     | `#ebebeb`       | `#f2f2f2` (survol)          | survol des contrôles                 |
| `color.surface.inverse`   | `#111111`       | `--accent`                  | onglet actif, déclencheur            |
| `color.surface.mat`       | `#2e2e2e`       | `#2a2a2a`                   | passe-partout de la visée, bulle     |
| `color.text.default`      | `#111111`       | `--ink`                     | texte principal                      |
| `color.text.muted`        | **`#6b6b6b`**   | `--ink-mute` (`#8a8a8a`)    | texte secondaire (voir §5)           |
| `color.text.disabled`     | `#8a8a8a`       | —                           | contrôles désactivés uniquement      |
| `color.text.onInverse`    | `#ffffff`       | `#f2f2f2` (bulle)           | texte sur fond sombre                |
| `color.border.default`    | `#ececec`       | `--rule`, `#ebebeb` (filets) | séparateurs                         |
| `color.border.strong`     | `#d8d8d8`       | —                           | traits, contrôles désactivés         |

### Couleurs — action et focus

| Token                        | Valeur    | Rôle                                        |
| ---------------------------- | --------- | ------------------------------------------- |
| `color.action.primary`       | `#111111` | action principale (déclencheur, validation) |
| `color.action.primaryHover`  | `#000000` | survol                                      |
| `color.focus.ring`           | `#111111` | anneau de focus clavier                     |

L'« accent » de Revela est le noir. C'est cohérent avec une interface qui doit
rester neutre, mais il faut alors **nommer ce choix** plutôt que de garder un
`--accent` identique à `--ink`.

### Couleurs — états

| Token                         | Valeur proposée | Fusionne               | Rôle                         |
| ----------------------------- | --------------- | ---------------------- | ---------------------------- |
| `color.status.danger`         | `#b00020`       | `#a33`                 | erreur, action destructrice  |
| `color.status.dangerSurface`  | `#fdf3f3`       | —                      | fond d'erreur                |
| `color.status.warning`        | **`#8f5600`**   | `#b26a00`              | texte d'alerte (voir §5)     |
| `color.status.warningSurface` | `#fdf0dd`       | —                      | fond d'alerte                |
| `color.status.warningBorder`  | `#e0a760`       | —                      | souligné d'un réglage        |
| `color.status.success`        | **`#2e7d32`**   | `#4caf50` (texte)      | prêt, succès (voir §5)       |
| `color.status.info`           | `#f5f5f5`       | `#fbf7f2`              | bandeau d'information neutre |

### Couleurs — métier photo

| Token                       | Valeur               | Rôle                                        |
| --------------------------- | -------------------- | ------------------------------------------- |
| `color.photo.pick`          | `#f5a623`            | photo choisie (anneau, étoile)              |
| `color.photo.overlay`       | `#111111` à 82 %     | badges et voiles sur vignette               |
| `color.photo.scrim`         | `#000000` à 55 %     | voile hors cadre du rognage                 |
| `color.channel.r`           | `#d02a2a`            | canal rouge (courbe **et** histogramme)     |
| `color.channel.g`           | `#1f9e3f`            | canal vert                                  |
| `color.channel.b`           | `#2b62d9`            | canal bleu                                  |
| `color.mask.handle`         | `#66ccff`            | poignées des masques                        |
| `color.ai.start`            | `#e08a3c`            | début du dégradé IA                         |
| `color.ai.mid`              | `#4a5a9e`            | champ de recherche                          |
| `color.ai.end`              | `#a95bb0`            | fin du dégradé IA                           |

### Typographie

| Token              | Valeur      | Fusionne          |
| ------------------ | ----------- | ----------------- |
| `font.family`      | `system-ui` | pile système actuelle |
| `font.size.xs`     | 10 px       | 9 px, 10 px       |
| `font.size.sm`     | 11 px       | 11 px, 11.5 px    |
| `font.size.md`     | 12 px       | texte d'interface |
| `font.size.lg`     | 13 px       | 13 px, 14 px      |
| `font.size.xl`     | 15 px       | titres de section |
| `font.size.2xl`    | 17 px       | titre d'écran     |
| `font.weight.regular` / `.strong` | 400 / 600 |      |
| `font.tracking.caps` | 0.08 em   | 0.06 à 0.12 em    |

### Espaces, formes, ombres, mouvement

| Token                  | Valeur                         | Fusionne                  |
| ---------------------- | ------------------------------ | ------------------------- |
| `space.2xs`            | 2 px                           | 1, 2, 3 px                |
| `space.xs`             | 4 px                           | 4, 5 px                   |
| `space.sm`             | 8 px                           | 6, 7, 8, 9, 10 px         |
| `space.md`             | 12 px                          | 12, 14 px                 |
| `space.lg`             | 16 px                          | `--space`                 |
| `space.xl`             | 24 px                          | `--space × 1.5`, 18 px    |
| `space.2xl`            | 32 px                          | `--space × 2`, 28 px      |
| `radius.sm`            | 4 px                           | 2, 3, 4 px                |
| `radius.md`            | 6 px                           |                           |
| `radius.lg`            | 20 px                          |                           |
| `radius.pill`          | 999 px                         |                           |
| `shadow.hairline`      | `0 0 0 1px rgba(0,0,0,.06)`    |                           |
| `shadow.focus`         | `0 0 0 2px color.focus.ring`   |                           |
| `shadow.popover`       | `0 4px 14px rgba(0,0,0,.28)`   |                           |
| `motion.fast`          | 120 ms                         | 100, 120 ms               |

## 5. Points d'accessibilité relevés

Seuils de `DESIGN_RULES.md` : 4,5:1 pour le texte courant, 3:1 pour le grand texte.
Les paires « sur fond » ont été déduites du CSS ; un composant peut s'afficher sur
un autre fond que celui indiqué.

| Paire                                     | Actuel  | Proposé                    | Après            |
| ----------------------------------------- | ------- | -------------------------- | ---------------- |
| Texte secondaire `#8a8a8a` / blanc        | 3,45:1  | `#6b6b6b`                  | 5,33:1           |
| Texte secondaire / `#f5f5f5`              | 3,17:1  | `#6b6b6b`                  | 4,89:1           |
| Texte secondaire / survol `#ebebeb`       | —       | `#6b6b6b`                  | 4,47:1 (limite)  |
| Alerte `#b26a00` / `#fdf0dd`              | 3,77:1  | `#8f5600`                  | 5,34:1           |
| Blanc / pastille IA `#e08a3c`             | 2,67:1  | assombrir en `#b85f17`     | 4,48:1 (limite)  |
| Texte « prêt » `#4caf50` / blanc          | 2,78:1  | `#2e7d32`                  | 5,13:1           |
| Erreur `#b00020` / blanc                  | 7,33:1  | inchangé                   | ✔                |
| Texte / blanc, bulle claire sur sombre    | 18,9 et 12,8:1 | inchangé            | ✔                |

Autres remarques :

- `--ink-mute` est utilisé **54 fois**, souvent en 10–11 px : c'est le changement
  au plus fort impact sur la lisibilité. Il sert aussi aux contrôles désactivés,
  d'où la séparation proposée entre `text.muted` et `text.disabled`.
- Textes en 9 px : à éviter, d'où la fusion dans `font.size.xs` (10 px).
- `#ececec` sur blanc (1,18:1) convient aux filets décoratifs, pas à la bordure
  d'un champ de saisie qui doit être repérable (3:1 attendu pour un composant).
- Le choix d'assombrir l'orange IA change l'identité visuelle de la recherche :
  c'est une **décision de design**, pas une correction automatique.

## 6. Correspondance avec DS-Studio

Le schéma actuel de DS-Studio est **fermé** : 18 clés fixes
(`app/shared/model.ts`). Deux étapes possibles :

**Étape A — sans changer DS-Studio.** Importer un JSON aux 18 clés existantes,
via **Importer un JSON** (diff puis validation) :

| Clé DS-Studio      | Valeur Revela | Clé DS-Studio     | Valeur Revela |
| ------------------ | ------------- | ----------------- | ------------- |
| `color.brand`      | `#111111`     | `color.border`    | `#ECECEC`     |
| `color.brandHover` | `#000000`     | `color.danger`    | `#B00020`     |
| `color.onBrand`    | `#FFFFFF`     | `color.success`   | `#2E7D32`     |
| `color.surface`    | `#FFFFFF`     | `color.focus`     | `#111111`     |
| `color.canvas`     | `#F5F5F5`     | `font.family`     | `system-ui`   |
| `color.text`       | `#111111`     | `font.body`       | 14            |
| `color.muted`      | `#6B6B6B`     | `font.heading`    | 17            |
| `space.sm` / `md` / `lg` | 8 / 12 / 16 | `radius.control` | 4         |

`font.body` vaut 14 et non 12 : DS-Studio dérive les libellés et la navigation
(× 0,8) et le texte des cartes (× 0,875) de cette taille. Avec 12, les libellés
tombaient à 9,6 px ; avec 14, ils font 11,2 px et 12,25 px, comme dans Revela.

Limite : pas de place pour l'alerte, le passe-partout, la sélection, l'IA ni les
canaux. Les composants affichés restent ceux de l'exemple Lisière.

**Étape B — étendre DS-Studio.** Ajouter les clés de la section 4 au schéma.
D'après `START_HERE.md`, de nouvelles clés exigent **une vraie migration** de
l'état (schéma version 1), sans suppression du journal. Deux limites du schéma
actuel à lever au passage : couleurs `#RRGGBB` uniquement (pas d'opacité) et
polices limitées à quatre valeurs.

## 7. Décisions à prendre par l'étudiant

1. Garder le noir comme couleur d'action, ou introduire un vrai accent ?
2. Assombrir `--ink-mute` (fort impact, 54 usages) : valider `#6b6b6b` à l'écran.
3. Recherche IA : garder l'orange actuel ou l'assombrir pour le contraste.
4. Accepter la fusion de l'échelle d'espaces (risque de petits décalages visuels).
5. Aligner les couleurs de l'histogramme sur celles des courbes.
6. Étape A seule, ou étape B (migration du schéma DS-Studio) ?

Consigner chaque choix dans `workspace/DECISIONS.md`.
