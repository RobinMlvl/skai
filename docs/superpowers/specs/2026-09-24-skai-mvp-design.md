# SkAI — Design du MVP

Date : 2026-09-24 · Statut : en revue

## 1. Objectif

Un outil **local** (sur le Mac de Robin) qui cherche des vols **aller simple** depuis
plusieurs aéroports de départ vers plusieurs aéroports d'arrivée, sur une plage de dates,
en pilotant Google Flights avec Jev. Il détecte les **vols pièges** (trajets de 30 h,
escales interminables, changements d'aéroport, billets séparés), affiche les **meilleurs
compromis prix / durée** et fait juger une **préférence en texte libre** par Jev.

Le problème résolu : sur Skyscanner / Google Flights, le « moins cher » est souvent un
piège, et comparer plusieurs aéroports × plusieurs dates oblige à jongler entre les onglets.

Toute l'interface est **en anglais**.

## 2. Hors périmètre du MVP

- Aller-retour, plusieurs passagers, autre classe que Economy, autre devise que EUR.
- Réservation automatique : SkAI ne sélectionne un vol **que sur clic explicite de l'utilisateur** sur sa carte
  (ajouté le 2026-09-25) pour ouvrir le site de la compagnie avec ce vol ; il ne remplit rien et ne paie jamais.
  L'agent Jev, lui, ne peut toujours jamais cliquer sur un vol.
- Hébergement, comptes utilisateurs, accès depuis le téléphone, alertes de prix.
- Autres sources de données que Google Flights.
- **Tout contournement anti-bot** (CAPTCHA, proxies, rotation d'empreinte) : exclu par principe.

## 3. Décisions

| Sujet | Choix | Raison |
|---|---|---|
| Langage | TypeScript partout | Un seul langage serveur / web / mobile futur ; `core` partagé. Le goulot est le réseau (Google, Jev), pas le CPU. |
| Serveur | Node 22 + **Hono** | Léger, tourne partout (Mac, Docker, Fly, VPS) ; client typé réutilisable par le web et un futur Expo. |
| Web | **Vite + React**, mobile-first | Le serveur existe déjà (Hono) ; l'app est un client de l'API, comme le futur mobile. |
| Navigateur | **Playwright** + Chrome installé, **profil dédié** `~/.skai/chrome-profile`, fenêtre visible | Isolé du Chrome perso ; Chrome ≥ 136 refuse le pilotage du profil par défaut. |
| Navigation | **URL construite par le code** (paramètre `tfs` encodé nous-mêmes : date + tous les aéroports) | Validé le 2026-09-24 : notre encodeur reproduit l'URL de Google à l'octet près, et une recherche multi-aéroports construite à la main renvoie de vrais résultats. Rapide, zéro appel Jev, peu de points de casse. |
| Agent | **Jev en secours** : notre propre petite boucle, inspirée de `browser-use/jev-ultrafast` (MIT), **sans dépendance** à ce repo | Reprend la main seulement quand la page n'est pas celle attendue (pop-up imprévue, etc.). Jev juge aussi la phrase libre. |
| IA | `@typesafe-ai/sdk` 0.6 (Jev) | Choix typés + probabilités ; seule clé API requise : `TYPESAFE_API_KEY`. |
| Stockage | **SQLite** (better-sqlite3) derrière l'interface `SearchStore` | 100 % local ; l'interface est la frontière de portabilité vers Postgres. |
| File de travail | En mémoire, **1 recherche à la fois** | Suffisant en local ; derrière une interface `JobQueue`. |
| Temps réel | **SSE** depuis Hono | Natif navigateur ; utilisable par Expo plus tard. |
| Style | Thème sombre « Skynet », globe à points **cobe**, **thinking-orbs** pour l'état de l'agent | Références visuelles de Robin (libraries.dev/orbs + globe à points). |

## 4. Architecture

```
SkAI/                      (npm workspaces)
  packages/core/           TS pur, zéro dépendance Node/navigateur
    schemas.ts             SearchRequest, Itinerary, Settings, ProgressEvent (zod)
    parse-label.ts         libellé aria Google -> Itinerary
    traps.ts               règles anti-pièges
    frontier.ts            compromis prix/durée (front de Pareto)
    tfs.ts                 encodage du paramètre tfs (date + aéroports) et de l'URL de recherche
  apps/server/
    api/                   routes Hono + garde locale (Host, Origin, en-tête X-SkAI)
    jobs/                  JobQueue en mémoire, ProgressBus (SSE)
    store/                 SearchStore (better-sqlite3)
    browser/               session Playwright, consentement, détection de blocage, lecture des libellés
    agent/                 boucle Jev de secours : snapshot DOM -> décision -> clic -> vérif
    sources/               FlightSource + GoogleFlightsSource
    judge/                 jugement de la préférence libre (Jev)
  apps/web/                Vite + React (anglais, mobile-first)
  docs/
```

### Interfaces qui préparent l'hébergement

```ts
interface FlightSource {
  run(req: SearchRequest, progress: ProgressSink, signal: AbortSignal): Promise<SourceResult>
}
// SourceResult = { dates: { date: string; status: 'ok' | 'missing'; itineraries: Itinerary[]; unparsed: string[] }[] }

interface SearchStore { create; updateProgress; saveItineraries; saveJudgments; finish; get; list }
interface JobQueue   { enqueue(searchId: string): void }          // concurrence 1
interface ProgressBus { publish(searchId, event); subscribe(searchId): AsyncIterable<ProgressEvent> }
```

Hébergement futur : SQLite → Postgres, file en mémoire → pg-boss, ajout d'une auth ;
`GoogleFlightsSource` peut être remplacée par `DuffelSource` sans toucher aux clients.

### API (préfixe `/api`, JSON validé par zod)

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/searches` | crée une recherche (`SearchRequest`) → `{ id }`, la met en file |
| GET | `/searches` | historique (les plus récentes) |
| GET | `/searches/:id` | recherche + itinéraires + jugements |
| GET | `/searches/:id/events` | flux SSE de progression |
| POST | `/searches/:id/cancel` | annule (AbortSignal) |
| POST | `/itineraries/:id/book` | ouvre la réservation de ce vol dans la fenêtre Chrome de SkAI (§12) → `BookingResult` |

**Sécurité locale** (un serveur qui pilote Chrome ne doit pas être appelable par une page web
quelconque) : écoute sur `127.0.0.1` uniquement ; en-tête `Host` limité aux origines
locales connues (anti DNS-rebinding) ; `Origin`, s'il est présent, limité aux mêmes origines ;
en-tête personnalisé `X-SkAI: 1` exigé sur toute requête qui modifie (une page d'un autre site
ne peut pas l'envoyer sans pré-requête CORS, que le serveur n'autorise jamais). En dev, Vite
passe par un proxy vers le serveur.

## 5. Modèle de données

```ts
SearchRequest {
  origins: IATA[]          // 1..7 codes aéroport (pas de codes ville type NYC dans le MVP)
  destinations: IATA[]     // 1..7, aucun code commun avec origins
  dateFrom: 'YYYY-MM-DD'   // pas dans le passé
  dateTo: 'YYYY-MM-DD'     // plage ≤ 31 jours
  settings: {
    maxDurationRatio: 2        // > 2× le plus rapide du même jour = piège
    maxLayoverMin: 360         // escale > 6 h = piège
    minLayoverMin: 45          // escale < 45 min = risque
    excludeSelfTransfer: true
    excludeAirportChange: true
  }
  preference?: string      // ≤ 300 caractères, ex. "no arrival after 10pm, avoid Istanbul"
}

Itinerary {
  date: 'YYYY-MM-DD'
  priceEur: number
  airlines: string[]; operatedBy?: string
  departure: { airport: string; time: 'HH:MM' }
  arrival:   { airport: string; time: 'HH:MM'; dayOffset: number }
  durationMin: number
  stops: number
  layovers: { durationMin: number; airport: string; city: string; overnight?: boolean }[]
  flags: { bagNotIncluded: boolean; selfTransfer: boolean; airportChange: boolean }
  rawLabel: string
}
```

Tables SQLite :
- `searches` (id, created_at, request json, status, phase, progress json, stats json, error)
- `itineraries` (id, search_id, date, data json — le libellé brut est dans `data.rawLabel`)
- `judgments` (itinerary_id, preference, probability, created_at)

Les **pièges et le front de compromis sont recalculés à la lecture** par `core` (pur, rapide) :
changer un réglage dans l'interface refiltre instantanément, sans relancer la recherche.
Seuls les jugements Jev (coûteux) sont stockés ; un vol non jugé s'affiche « — ».

États d'une recherche : `queued → running → done | partial | failed | blocked | cancelled`.

## 6. Le moteur, étape par étape

1. **Session navigateur** : `chromium.launchPersistentContext('~/.skai/chrome-profile',
   { channel: 'chrome', headless: false, locale: 'en-US' })`, réutilisée entre les recherches.
2. **Consentement** : si la page est `consent.google.com`, clic déterministe sur « Reject all »
   (option la plus respectueuse de la vie privée) ; à défaut, l'agent s'en charge.
3. **URL construite par le code** : pour chaque date de la plage, `buildTfs({ date, origins,
   destinations })` encode le message protobuf de Google (structure relevée le 2026-09-24 :
   champ 3 = trajet { 2 : date, 13 : départ { 1 : 1, 2 : code }, 14 : arrivée { 1 : 1, 2 : code } },
   un champ 13/14 répété par aéroport ; 19 = 2 pour aller simple ; 8 = 1 adulte ; 9 = 1 Economy),
   puis ouvre `https://www.google.com/travel/flights/search?tfs=…&hl=en&curr=EUR`.
4. **Lecture d'une date** : consentement si besoin, détection de blocage, attente des
   résultats (≤ 20 s), **vérification par le code** que la date affichée dans le champ
   « Departure » correspond, dépliage de « more flights » si le bouton existe, lecture des
   libellés. Pause de 2 s entre deux pages ; une nouvelle tentative par date, sinon date
   « missing ».
5. **Jev en secours** : si les résultats n'apparaissent pas (et que la page n'est pas un
   blocage), une petite boucle Jev tente de revenir à la liste des vols. À chaque tour :
   - *snapshot* : script injecté listant les éléments interactifs visibles (id, rôle, nom
     accessible, valeur) + extrait du texte visible ;
   - *une requête Jev*, deux questions indépendantes : `operation` (CLICK / WAIT / DONE /
     BLOCKED) et `target` (choix parmi les id) ;
   - *clic* Playwright seulement si la page n'a pas changé depuis le snapshot (empreinte) ;
   - éléments **retirés des choix** : nom correspondant à
     `/select flight|book|continue|purchase|pay|sign in|accept|agree|allow all/i`, testé dans la page sur le nom complet avant troncature ;
   - budget : 8 actions. Le code revérifie ensuite lui-même la présence des résultats :
     le DONE de Jev ne vaut jamais preuve.
6. **Détection de blocage** après chaque navigation : URL contenant `/sorry/`, texte
   « unusual traffic » ou iframe reCAPTCHA → `BlockedError` → recherche `blocked`,
   **aucune nouvelle tentative**, l'utilisateur est prévenu.
7. **Extraction** (`core/parse-label.ts`) : libellés `^From … Select flight$`, dédoublonnés
   (Google les affiche dans les onglets Best et Cheapest). Un libellé illisible est gardé
   brut dans `unparsed` ; si moins de 80 % sont lus → avertissement « Google a peut-être
   changé son format ».
8. **Analyse** (`core`) : pièges puis front de compromis (voir §7).
9. **Jugement de la préférence** (si texte fourni) : les ~20 meilleurs vols (front d'abord,
   puis les moins chers non exclus) → une question Jev *Noul* par vol : « Does this
   itinerary satisfy all of the traveler's stated preferences? », avec le vol structuré en
   état. Requêtes en parallèle (5 max). Affichage : ≥ 0,7 « fits », ≤ 0,3 « doesn't fit »,
   sinon « unsure » (seuils à calibrer sur de vraies recherches).
10. **Progression** (SSE) : `{ phase, message, dateIndex?, dateCount?, jevCalls }`.
    Phases → états de l'orbe : `connecting`→connecting, `sweeping`→working,
    `rescuing` (Jev en secours)→searching, `analyzing`→solving, `judging`→composing,
    repos→breathing.

### Libellés réels observés (2026-09-24, base des tests d'extraction)

```
From 515 euros. 1 stop flight with Etihad. Leaves Geneva Airport at 9:35 AM on Tuesday, November 10 and arrives at Suvarnabhumi Airport at 6:35 AM on Wednesday, November 11. Total duration 15 hr.  Layover (1 of 1) is a 2 hr 15 min layover at Zayed International Airport in Abu Dhabi. Select flight
From 452 euros. 2 stops flight with Turkish Airlines and Oman Air. Leaves Geneva Airport at 10:50 AM on Tuesday, November 10 and arrives at Suvarnabhumi Airport at 5:15 PM on Wednesday, November 11. Total duration 24 hr 25 min.  Layover (1 of 2) is a 2 hr 25 min layover at Istanbul Airport in Istanbul. Layover (2 of 2) is a 8 hr 10 min layover at Muscat International Airport in Muscat. Select flight
From 834 euros. 2 stops flight with Air France and Delta. Operated by Republic Airways-DL Connection-DL Shuttle. Leaves … and arrives at LaGuardia Airport at 6:29 PM on Tuesday, November 10. Total duration 18 hr 29 min. …
From 216 US dollars.This price does not include overhead bin access. Nonstop flight with easyJet. Leaves Zurich Airport at 4:45 PM on Sunday, September 20 and arrives at London Gatwick Airport at 5:35 PM on Sunday, September 20. Total duration 1 hr 50 min. Select flight
```

Non encore observés (à collecter pendant l'implémentation) : changement d'aéroport, billets
séparés, escale de nuit. Si Google ne les mentionne jamais dans les libellés, les indicateurs
restent `false` dans le MVP (limite documentée ; piste : déplier le détail du vol).

## 7. Règles anti-pièges et compromis

| Piège | Règle (réglable) | Effet |
|---|---|---|
| Trajet interminable | `durationMin > maxDurationRatio × plus rapide de la même date` (même aéroport de départ, même date — changé le 2026-09-25 : sur un scan réel MPL/ORY/BCN/CDG → KEF, comparer Montpellier aux vols directs de Paris marquait injustement tous les vols au départ de Montpellier) | badge rouge « ×2.3 » |
| Escale longue | une escale `> maxLayoverMin` | badge rouge |
| Escale courte | une escale `< minLayoverMin` | badge « tight connection » |
| Billets séparés | `flags.selfTransfer` | exclu si `excludeSelfTransfer` |
| Changement d'aéroport | `flags.airportChange` | exclu si `excludeAirportChange` |
| Bagage cabine non inclus | `flags.bagNotIncluded` | badge |

**Front de compromis** : parmi les vols non exclus, ceux qu'aucun autre ne bat à la fois sur
le prix et la durée. Entre deux voisins, l'écart est affiché : « +€40 to save 29 h ».

## 8. Interface (anglais, mobile-first, une page)

- En-tête « SkAI » + orbe (thinking-orbs) reflétant la phase.
- Formulaire : départs et arrivées en puces avec autocomplétion (liste OurAirports, domaine
  public, filtrée aux aéroports avec code IATA ; fournit aussi les coordonnées du globe),
  plage de dates, réglages anti-pièges, champ « preferences ».
- Globe cobe : points bleu-gris lumineux, départs et arrivées marqués, pulsation pendant le
  balayage.
- Panneau live : orbe + journal (« Jev → click "Where from?" », « Date 3/14 »).
- Résultats : nuage de points prix × durée avec le front mis en évidence ; cartes de vols
  (prix, horaires, durée, escales, badges pièges en rouge, verdict de préférence) ;
  interrupteur « show trapped flights » ; réglages qui refiltrent instantanément.
- Historique des recherches.
- Thème : fond quasi noir, accent rouge réservé aux pièges et alertes, police à chasse fixe
  pour les données.

## 9. Erreurs

| Cas | Comportement |
|---|---|
| Date en échec (timeout) | 1 nouvelle tentative, sinon `missing` → recherche `partial` avec la liste des dates manquantes |
| Blocage Google | `blocked`, arrêt immédiat, pas de nouvelle tentative |
| Résultats absents et secours Jev en échec | date `missing` + capture d'écran sauvegardée dans `~/.skai/debug/<date>-<horodatage>.png` ; si toutes les dates échouent → `failed` |
| Extraction < 80 % | recherche terminée + avertissement |
| Redémarrage du serveur | recherches `running` passées en `failed` au démarrage |
| Jev indisponible pendant le jugement | vols affichés sans verdict, avertissement |

Aucune relance automatique d'une recherche entière.

## 10. Tests (Vitest)

- **`core` en TDD** : extraction sur les libellés réels (§6) et ceux collectés ensuite ;
  pièges ; front ; `tfsForDate` ; dédoublonnage ; schémas.
- **Script de collecte** : sauvegarde les libellés de pages réelles dans
  `packages/core/fixtures/` pour enrichir le corpus et repérer les changements de format.
- **Agent** : sur une page HTML locale imitant le formulaire Google, avec des réponses Jev
  enregistrées (pas d'appel réseau).
- **Serveur** : routes Hono (file et source simulées), garde locale (Host/Origin/en-tête X-SkAI).
- **Pas de test automatique contre Google** : un smoke manuel consolidé sur l'état final.

## 11. Inconnues

Levées le 2026-09-24 :
- ✅ La date et les aéroports sont en clair dans `tfs` ; notre encodeur reproduit l'URL de
  Google à l'octet près (`CBwQAhoeEgoyMDI2LTExLTExagcIARIDR1ZBcgcIARIDQktLQAFIAXABggELCP___________wGYAQI`
  = GVA → BKK, 2026-11-11, aller simple).
- ✅ Une URL multi-aéroports construite à la main fonctionne (GVA + ZRH → BKK + HKT).
- ✅ API du SDK : `client.systemOne({ state, questions })`, `choice(instructions, criteria)`,
  `noul(instructions, criteria?)` → `answers.x.choice / .probabilities / .noul`.

Levées pendant l'intégration (captures réelles du 2026-09-24, 562 libellés) :
- ✅ Changement d'aéroport : « … layover in London. Transfer here from Heathrow Airport to London
  Gatwick Airport. » (pas de « at <aéroport> ») → escale `airport = "A → B"` + `flags.airportChange`.
- ✅ Chaque libellé finit désormais par « Carbon emissions estimate: N kilograms. » (ignoré).
- ✅ Le bouton « View more flights » existe (devient « View fewer flights » une fois déplié).
- ✅ Consentement sur un profil neuf : Google enchaîne des redirections dont une est avortée
  (`net::ERR_ABORTED`) → on attend la sortie de consent.google.com par sondage, pas `waitForURL`.
- ✅ Google remplit la liste progressivement (80 vols puis 9 sur deux essais) → on lit quand la
  liste est stable (1,5 s sans changement, 12 s max).

Restantes :
- Libellés exacts pour billets séparés et escale de nuit (jamais vus sur 562 libellés).
- Limite réelle du nombre d'aéroports par champ côté Google (7 supposé).

## 12. Évolutions du 2026-09-25

- **Dates conservées** : si Google bloque, si l'utilisateur annule ou si une erreur interrompt le scan,
  les dates déjà lues sont enregistrées et affichées (statut `blocked` / `cancelled` / `failed`). Après
  un blocage, Jev juge quand même la préférence (il ne touche pas Google) ; après une annulation, non.
- **Réservation au clic** : `POST /api/itineraries/:id/book` ouvre, dans un nouvel onglet de la fenêtre
  Chrome de SkAI, la recherche du jour, clique la ligne visible du même vol (identité = libellé sans le
  prix, car Google re-tarife ; onglet « Cheapest » si le vol n'est listé que là) puis le vendeur
  compagnie : reconnu au mot « airline » (« Continue to book with Etihad airline for … ») ou au nom d'une
  compagnie du vol (« Continue to book with Icelandair, Economy Light for … »). Sans vendeur compagnie : la
  page « Booking options » reste ouverte. Vol disparu : les résultats restent ouverts. Une réservation
  à la fois (409 sinon) ; page de blocage → 409.

