# Hanover Park: Streets of the Flats

A playable top-down neighbourhood adventure built with Phaser 3, TypeScript and Vite. Explore Hanover Park's mapped streets as Riyaad, borrow a mint hatchback, and deliver Aunty Fatima's groceries from near Shoprite Lansdowne Corner to Blinkwater Hof for R150.

The north-up world uses OpenStreetMap road centrelines, the community-mapped Hanover Park boundary, 59 building footprints and nine named places. Downberg Road, Hanover Park Avenue and Surran Road keep their mapped positions. Mapped courts include Galway Court, Hangklip Hof, Galilee Court, Pelikaan Hof, Agulhas Court, Algoa Hof, Blinkwater Hof and Donegal Court. The Area Guide also lists 28 court names published by the City of Cape Town in 2015. Historical names without matched coordinates are not placed on guessed buildings.

Building coverage is incomplete. Road widths, architecture and scenery are simplified for play; characters, entrances and the story taxi stop are fictional. Mapped shop names do not guarantee current trading status. All pixel art and dialogue are original, with no GTA artwork, logos, music or external game assets. The included map works offline after download: no map API keys, paid services, account or backend is required to play.

## Run

Requires Node.js 22.12+ (Node 24 recommended) and npm.

```sh
npm ci
npm run dev
```

Open Vite's URL in a local development browser. The cloud onboarding UI does not provide a localhost preview.

```sh
npm run typecheck
npm run build
npm run preview
```

`dist/` is the static production output.

## Play

| Control | Action |
| --- | --- |
| WASD / arrows | Walk; accelerate/brake and steer while driving |
| Shift | Sprint (uses regenerating stamina) |
| E | Speak, deliver groceries, enter or exit the hatchback |
| M | Expand/collapse the neighbourhood map |
| Escape | Pause/resume or dismiss dialogue |

Choose **Start Game** for a fresh run, or **Continue Game** for saved progress. Starting a fresh game replaces the existing save in this browser.

Aunty Fatima stands just east of your spawn near Shoprite Lansdowne Corner. Press E nearby, then **Accept Delivery**. Follow the gold map marker north to Blinkwater Hof. The connected walking route follows actual mapped street segments; the destination is approximately 472 metres away along that route. Press E at the marker to receive R150 exactly once. The minimap includes the source boundary, real road shapes, north indication and your latitude/longitude.

The hatchback starts east of Fatima. W/up accelerates; S/down brakes then reverses; A/D steers. Coast or brake until nearly stopped before exiting. Mapped building polygons are solid, including rotated walls and open courtyards. Movement uses small collision substeps to prevent passing through obstacles at speed.

Mission state, money, health, player and car position/heading save to localStorage every two seconds and at mission transitions, vehicle exits, pause and page exit. Continuing from a car restores Riyaad safely outside it. Saves from the earlier fictional layout retain money, health and mission progress while moving characters and the car to the new map's spawn. Saves belong to a browser profile and origin; clearing site data removes them. Storage errors are reported in the game.

## Map sources and refresh

[Research and limitations](docs/real-map-research.md) records dated municipal and OpenStreetMap sources. Data is attributed to **© OpenStreetMap contributors** and licensed under **ODbL 1.0**; see [the map-data notice](public/map-data/README.md). Both the filtered source snapshot and derived geometry are included as downloadable files in the production build. No contributor usernames, contact numbers or credentials are stored.

The committed map is sufficient for normal development and deployment. An intentional data refresh needs Python 3, curl and HTTPS access to `api.openstreetmap.org`:

```sh
npm run map:fetch
npm test
```

The refresh reads suburb relation **2046907** and its finite bounding-box crop from the official OSM API. It validates complete way-node references, Downberg Road, named mission anchors and a connected delivery route before replacing the snapshot. It keeps TLS verification enabled. Reproject the existing snapshot without network access with:

```sh
python3 scripts/import-osm.py
```

Road widths are enlarged for gameplay. The boundary is community map data, not a surveyed legal boundary. Refreshing source geometry changes the save-world identifier so obsolete positions migrate safely. Do not relabel arbitrary buildings to fill coverage gaps.

## Neighbourhood atmosphere

Original council-flat artwork adds roof/façade depth, windows, balconies, laundry, surface wear and trees along the real source geometry. Original English/Afrikaans dialogue uses Cape Flats expressions such as “awe”, “hosh”, “my bru” and “sharp sharp”. It is fictional writing, not quoted residents' speech or a resident-approved performance.

Sound starts after Start/Continue and is generated locally with Web Audio: breeze, footsteps, an engine responding to the hatchback's speed, and distance-sensitive shop, story taxi-stop and Downberg pitch ambience. Mute and volume persist independently of game saves; audio stops on pause or loss of focus.

Nearby conversation snippets appear as captions. Optional **Synth Voices** uses an installed English browser speech-synthesis voice when available. It is off by default and has no guaranteed local accent. Recorded performances from consenting local speakers would be needed for authentic spoken voices. Captions and gameplay work without Web Audio or a voice pack.

## Street encounters

Shaun and Rico are fictional adult neighbours who ask for R2. Speak with E, choose **Give R2**, **No, sorry** or **Maybe later**. Giving needs enough cash; refusal costs nothing. Paying or refusing resolves that person's request for the save. Shaun's original dialogue mentions struggling with tik; these characters do not represent actual residents.

After the first delivery, two separate fictional strangers can demand cash when you approach them on foot. Respond by handing over up to R20 or backing away and running. Hold Shift with movement keys to sprint, or enter the car to escape. A collision-aware chase ends when you get enough distance, reach the car, or evade the stranger for ten simulation seconds. Getting caught takes at most R20 and never makes the balance negative. Each robbery resolves once, with a cooldown before another can begin. Escape closes a demand into a chase; it does not silently cancel it.

Blue minimap dots show unresolved R2 requests; red dots show unresolved strangers. The encounters use clear mapped road positions while their characters, dialogue and behaviour are fictional. Their position is not evidence about crime or residents at a mapped shop/court. Requests and thieves are separate characters. Payments, refusals, escapes and catches save immediately. Active demands/chases resume on Continue; pause and dialogue freeze chase time. Old saves start with these new encounters unresolved while retaining earned money and delivery progress.

## Browser tests

```sh
PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright npx playwright install --with-deps chromium
npm test
```

Tests use `/usr/bin/chromium` when present; `CHROMIUM_PATH` can specify another compatible executable. Otherwise they use the downloaded Playwright browser. Cloud setup uses preinstalled Chromium.

Eleven browser tests cover movement/sprint, rotated building collision, NPC conversations, mission/reward, save migration and refresh, pause/map, car handling, spatial audio output, mute/volume persistence, gameplay without Web Audio, optional R2 giving/refusal, robbery payment caps, keyboard escape, catches, and encounter pause/refresh persistence. Isolated interaction tests use a development-only positioning hook. A separate test walks the actual street route with keyboard input and no teleporting. Production-preview checks verify startup, keyboard movement, mission persistence, attribution and downloadable map data; the positioning hook is absent from production.

## Structure and scope

- `src/game/world/`: source geometry, locality registry, scenery and original sprites
- `src/game/scenes/`: scene lifecycle and gameplay orchestration
- `src/game/entities/`: walking, vehicle handling and fictional NPCs
- `src/game/systems/`: polygon collision, spatial sound and validated saves
- `src/game/missions/`: delivery states and reward
- `src/game/ui/`: menus, dialogue, source guide and HUD
- `scripts/`: map acquisition and projection using the Python standard library

The approximately 15254×12749 pixel world includes a minimap, three main NPCs, four fictional street encounters, wandering pedestrians, one driveable car, one mission and a gradual lighting cycle. Desktop keyboard play is intended. Interiors, combat, ambient moving traffic, additional missions/vehicles, touch controls and multiplayer are not implemented. Health is tracked and saved; robbery encounters affect money and have no combat/damage system. Phaser produces a bundle-size advisory; the production build succeeds.

## Azure Static Web Apps

Vite builds to `dist/`; `public/staticwebapp.config.json` is copied into that output. Use app location `/`, no API location, output location `dist`, and build command `npm run build`.

The build-validation workflow installs locked dependencies and runs TypeScript, build and browser checks. The separate **Deploy game to Azure** workflow uploads static output to production when manually triggered. Source pushes do not redeploy automatically.

For a new Free Static Web App:

1. Create an Azure **Static Web App**, select **Free**, and use **Other** as the deployment source to avoid a competing generated workflow. Suggested name: `hanoverpark-streets`; resource group: `hanoverpark-game-rg`. A subscription is required even for the Free plan.
2. Copy its **Manage deployment token** value directly into GitHub **Settings → Secrets and variables → Actions**, with secret name `AZURE_STATIC_WEB_APPS_API_TOKEN`. Never commit the token or paste it into chat.
3. Run GitHub **Actions → Deploy game to Azure → Run workflow** on `feat/playable-neighbourhood`. The job summary reports the Azure URL.
4. Open that URL, complete a delivery and refresh to verify persistence. Local development saves do not transfer to a different origin.

The workflow does not create Azure resources. It configures no paid SKU, database or Functions API.
