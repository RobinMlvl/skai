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
- Sélection ou réservation d'un vol (l'outil ne clique jamais sur un vol).
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
| Agent | **Notre propre boucle Jev**, inspirée de `browser-use/jev-ultrafast` (MIT), **sans dépendance** à ce repo | Contrôle total ; pas de LLM texte : Jev choisit les valeurs à taper parmi les nôtres. |
| IA | `@typesafe-ai/sdk` (Jev) | Choix typés + probabilités ; seule clé API requise : `TYPESAFE_API_KEY`. |
| Stockage | **SQLite** via Drizzle + better-sqlite3 | 100 % local ; Drizzle permet de passer à Postgres à l'hébergement. |
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
    tfs.ts                 lecture / remplacement de la date dans le paramètre tfs
  apps/server/
    api/                   routes Hono + garde locale (Host, Origin, jeton)
    jobs/                  JobQueue en mémoire, ProgressBus (SSE)
    store/                 SearchStore (Drizzle + SQLite)
    browser/               session Playwright, consentement, détection de blocage
    agent/                 boucle Jev : snapshot DOM -> décision -> action -> vérif
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

**Sécurité locale** (un serveur qui pilote Chrome ne doit pas être appelable par une page web
quelconque) : écoute sur `127.0.0.1` uniquement ; en-tête `Host` limité à
`127.0.0.1:<port>` / `localhost:<port>` ; `Origin` vérifié sur les requêtes qui modifient ;
jeton aléatoire par lancement, exigé dans l'en-tête `X-SkAI-Token` (le serveur l'injecte
dans la page qu'il sert ; en dev, Vite passe par un proxy).

## 5. Modèle de données

```ts
SearchRequest {
  origins: IATA[]          // 1..7, codes aéroport ou ville (ex. NYC)
  destinations: IATA[]     // 1..7
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
- `itineraries` (id, search_id, date, data json, raw_label)
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
3. **Remplissage par Jev (une fois par recherche)** sur
   `https://www.google.com/travel/flights?hl=en&curr=EUR`. À chaque tour :
   - *snapshot* : script injecté listant les éléments interactifs visibles (index, rôle,
     nom accessible, valeur, état coché/sélectionné/déplié) + extrait du texte visible ;
   - *une requête Jev*, questions indépendantes en parallèle : `operation`
     (CLICK / TYPE / SELECT / WAIT / DONE / BLOCKED), cible par opération (choix parmi
     les index), et `typeValue` = **choix parmi nos valeurs candidates** (chaque code
     IATA demandé, la date sous plusieurs formats) ;
   - *exécution* Playwright après vérification que la page n'a pas changé (empreinte) ;
   - éléments **retirés des choix** : nom correspondant à
     `/select flight|book|continue|purchase|pay|sign in/i` ;
   - budget : 40 actions ; arrêt si 3 actions de suite ne changent rien.

   **Validation par le code, jamais par le DONE de Jev** : chemin
   `/travel/flights/search`, paramètre `tfs` présent, date et aéroports demandés retrouvés
   (dans `tfs` décodé ou dans les champs du formulaire).
4. **Balayage des dates** : pour chaque date de la plage, `tfsForDate(tfs, date)` remplace
   la date (10 octets ASCII, même longueur → structure protobuf intacte), ouvre
   `/travel/flights/search?tfs=…&hl=en&curr=EUR`, attend les résultats (≤ 20 s), vérifie la
   date affichée, déplie « more flights » si le bouton existe, lit les libellés.
   Pause de 2 s entre deux pages ; une nouvelle tentative par date, sinon date « missing ».
5. **Plans B** :
   - date non appliquée par `tfs` → Jev change la date via l'interface (flèches jour suivant) ;
   - remplissage multi-aéroports impossible → une URL par paire départ × arrivée
     (`?q=Flights from GVA to BKK on 2026-11-10 one way`, format validé le 2026-09-24),
     plus lent mais fiable.
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
    Phases → états de l'orbe : `connecting`→connecting, `filling`→searching,
    `sweeping`→working, `analyzing`→solving, `judging`→composing, repos→breathing.

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
| Trajet interminable | `durationMin > maxDurationRatio × plus rapide de la même date` (tous aéroports de la recherche confondus : ce sont des alternatives pour le même voyage) | badge rouge « ×2.3 » |
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
| Agent en échec (BLOCKED, budget, validation) | plan B « une URL par paire » ; s'il échoue aussi → `failed` + capture d'écran et snapshot sauvegardés dans `~/.skai/debug/<searchId>/` |
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
- **Serveur** : routes Hono (file et source simulées), garde locale (Host/Origin/jeton).
- **Pas de test automatique contre Google** : un smoke manuel consolidé sur l'état final.

## 11. Inconnues à lever en premier

1. Le remplacement de date dans `tfs` fonctionne-t-il ? (premier test en conditions réelles)
2. Les codes aéroports sont-ils lisibles dans `tfs` décodé, ou faut-il valider via les champs ?
3. Jev maîtrise-t-il le champ multi-aéroports (puces) de Google ? Sinon, plan B par paire.
4. Forme exacte des questions Noul/Choice dans `@typesafe-ai/sdk` 0.6 (à lire dans les types du SDK).
