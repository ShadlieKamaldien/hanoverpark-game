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

## Babylon.js 3D preview

Choose **Explore 3D Preview** on the main menu, or open `/3d.html` on the deployed site. The same static Azure deployment includes both pages; no game server or paid GPU service is required. Azure also serves the preview at `/3d`.

The 3D version explores an approximately 800-metre-wide crop around Downberg Road. It uses the existing source map to build 25 mapped building footprints, streets and fields, preserving rotated walls and open courtyard holes. Procedural three-storey flats have weathered plaster, repairs, slab edges, varied curtains, balcony laundry and plants, drainpipes, security gates, roof vents and aerials. Sourced court names remain attached to their mapped buildings.

Sparse original trees and shrubs, benches, bins, bollards, drains, tar repairs and pavement wear give the streets more detail. Placement is deterministic and bounded, with street furniture set away from mapped carriageways, buildings and playing surfaces. These props are decorative and add no gameplay collision. Static architecture is combined by material within each mapped building so off-screen flats can be culled; distant fine details use level of detail, and shadow passes exclude geometry outside the light's view. Hidden window faces and paint volumes are omitted. Architecture, vegetation, furniture and lamp placements are artistic approximations; the map's building coverage remains incomplete.

Ten original single-storey houses fill selected clear spaces near the flats. They have peeling plaster, exposed brick, boarded window recesses, uneven gutters, patched rusty corrugated roofs, torn roof edges and rafters, low jagged boundary walls and sparse rubble at the yard edges. Their closed building shells and boundary walls have matching polygon collision; the 1.9-metre gate openings lead into front yards. Pedestrians and conversation sightlines use those same solids. Placement preserves mapped road and footpath widths, playing fields, existing buildings and courtyard holes; nearby furniture stays outside the added lots. These houses are fictional architectural infill, recorded separately from the unchanged OpenStreetMap footprints, rather than a surveyed inventory of damaged properties.

Original aerosol lettering, paint runs, faded earlier marks, plaster chips, exposed brick, cracks and damp stains appear on selected flat façades, house walls and boundary walls. Words include “AWE”, “HOU MOED”, “HP” and “MA SE KIND”. The lettering and artwork are generated locally and do not reproduce real crew signatures or external game artwork. Artwork uses one shared 1024-pixel atlas and one batch per property/building; the houses share one 512-pixel surface atlas, with distance culling and detail LOD.

Six mapped businesses now appear in the 3D area: **Shoprite Lansdowne Corner, Clicks Lansdowne, Astron Energy Lansdowne Corner, Caltex, KFC WETTON and McDonald's**. Shoprite and Clicks share their mapped mall footprint; signs, glazing and awnings attach to its existing walls. Source-matched fuel canopies gain original name panels and pump details. McDonald's has a mapped POI but no matching footprint in this snapshot, so it receives a place plaque at that coordinate. Storefront architecture and entrances are artistic approximations; interiors, shopping and fuel purchases are not implemented. The shops share one original 1024-pixel atlas and two materials, with distance culling and no new collision or lights.

Press **M** or choose **Map** to open a north-up neighbourhood map with all eight source businesses, numbered names, road labels, your position and the active delivery objective. **Engen Hanover Park Service Station** and **Jumbo Wholesale** retain their original positions beyond the outlined playable crop and are labelled outside the current 3D area. The minimap also shows the six nearby businesses. Opening the map freezes walking, driving, traffic, NPC goals and pursuit timers, cancels pending conversation replies and clears held controls. M, Escape or Back to the street closes it; loss of focus still pauses the game. There is one verified Shoprite branch in the source map; additional branches are not invented.

WASD/arrows walk relative to the camera, Shift sprints, dragging orbits and the wheel zooms. **Street** gives a closer view of the character and façades; **Overview** pulls back to explore the layout. **Recenter** restores the selected view and stops any remaining mouse/wheel drift. **Day**, **Sunset** and **Night** change sunlight, shadows and an original painted coastal sky. Night uses mixed lit/dark window groups, lamps concentrated near Downberg Road and a modest character fill light for visibility. Escape pauses; leaving the window clears held keys and pauses movement. The minimap shows the source streets, neighbours, moving cars, current position and OpenStreetMap attribution.

Riyaad now uses an original contoured low-poly character mesh with a 15-joint skeleton, two-weight skinning, shaped face, cropped hair, a collared shirt, jeans and trainers. Elbows and knees bend, the torso counter-rotates, and walk/sprint poses blend back to idle. Stride phase follows actual movement after collision checks, so pressing into a wall does not keep the walk cycle running. Conversations use a small head/hand gesture; driving uses a bent-knee, forward-arm seated pose and exiting resets the rig. Crew colours change the shirt while preserving skin and trousers. The model uses one material, one mesh and about 1,400 triangles, with no external asset downloads. This is an initial original character pass toward a PS2-era look, not a claim of San Andreas visual parity; textured clothing, authored animation clips, foot planting, vehicle entry/exit animations and upgraded NPC artwork remain future work.

The **Street** camera now starts 6.5 metres from the player with a lower angle. It uses the same wall/tree obstruction checks as driving and restores the requested zoom as the view clears. **Overview** remains available for navigation. Walking and driving speed, collision shapes, mission rewards and save formats are unchanged.

Eighteen original adult NPCs have varied clothes, heights, caps/headscarves and greeting/walking animation. Meet Aunty Soraya near the starting position, Boeta Moosa, Aunty Patricia, Zeem, Ash, Wes, Lu and Carmen, alongside Shaunie and Rico's R2 requests, two separate intimidating strangers, Daz and Bren, and six members of two fictional crews. Neighbours follow collision-aware daily routines; the crew members gather in small groups on clear outer pavements. Press **E** or click the nearby prompt to talk, choose a reply, and use **Escape** or **Back to the street** to leave. Conversations require proximity and a clear line of sight, so you cannot greet through a flat's wall. Dialogue freezes movement; pause and loss of focus also stop pedestrians, traffic and pursuit timers and clear held keys.

R2 requests and the two strangers remain conversation encounters: you can listen, decline or leave. [NPC naming and language research](docs/npc-language-research.md) documents public sources for familiar forms of address, shortened given-name nicknames and some Kaaps expressions, alongside the original fictional roster and writing. The characters are independent of actual residents and mapped business owners. They use five meshes each with a shared material, distance culling and one body shadow per person.

Eight original hatchbacks, sedans and minibuses circulate in both directions along two connected mapped street circuits through Downberg Road, Lansry Walk, Coniston Place and Ryburg Road. Traffic keeps left, turns smoothly through junctions, reserves shared crossings, follows stopped cars and yields to people. Moving vehicle polygons also stop the player and pursuing NPCs from walking through the cars. Vehicles have right-hand drivers, rotating wheels, varied paint, transparent glazing and night head/tail lights; no extra point-light pool is allocated. Each uses five meshes and shared materials. The routes are continuous loops, with no visible reversing or teleporting at an endpoint.

A separate gold hatchback is parked on a clear verge beside Downberg Road, about nine metres from the starting position. Approach either door and press **E** or click its prompt to borrow it. **W/up** accelerates, **S/down** brakes then reverses, **A/D** or left/right steer, and **Space** brakes harder. Front wheels steer and all wheels roll. A chase camera follows the car and pulls in around flats, house walls and trees; dragging still lets you look around, and your zoom returns when the view clears. The vehicle HUD shows speed and gear. Slow almost to a stop before pressing **E** to exit. The game checks both doors and keeps you seated if walls, cars or people block a safe exit. Its full turning body stops against mapped buildings, added house walls, fields, other cars and pedestrians; collisions cause no NPC damage. Pause, dialogue and loss of focus freeze driving and clear held keys. The car is independent of the 2D save and resets when this page reloads.

**Downberg Side** wears burnt orange; **Lansry Crew** wears teal. Their six fictional adults have local-style shortened nicknames and original place-specific dialogue. Stay neutral to walk past either group freely, or speak to a contact with **E** and choose to join. Joining changes your shirt colour and the crew HUD. Rivals within thirteen metres and a clear sightline warn you for five simulation seconds before pursuing; leaving their corner during the warning cancels escalation. Pursuers run at 4.8 m/s against your 4 m/s walk and 7 m/s sprint, navigate around static walls and wait for traffic. You escape beyond 25 metres, after six seconds out of sight at sufficient distance, or after eighteen seconds of pursuit. If they get within 1.2 metres while you are on foot they catch up, then stop; a six-second result message and fifteen-second cooldown give time to move on. Warnings and pursuits continue while you drive, but crew members cannot catch a seated driver or walk through the car. Stop and step out to speak to a crew contact and leave your affiliation. This activity changes no money or health, and crew choice lasts only for the current page session. [Traffic and crew research](docs/traffic-and-crews-research.md) distinguishes public Hanover Park context from the original factions, characters and simulated hangouts.

WebGL and a desktop keyboard/mouse are required. If graphics cannot start, the preview provides a link to the 2D game. The 3D game now has its own stock delivery, wallet, vendor reputation and saved mission progress. The original 2D delivery, R2 payments, robbery chases and neighbourhood audio remain in the 2D game. The preview never reads or writes the 2D save; the borrowed 3D car and crew affiliation reset when the page reloads.

### A 3D stock run

Follow the gold objective marker to **Nazeem “Zeem”**, the fictional neighbourhood vendor. Speak with E and choose **Take the stock collection · R150**. Walk or drive to the marked pickup point outside the Shoprite façade, step out of the car and press E to collect. Return to Zeem on foot and choose **Hand over the stock · collect R150**. The full completed job grants R150 once and one point of vendor reputation. Wrong-phase, distant, paused, seated and obstructed interactions cannot collect or pay out. Markers show the destination and straight-line distance; they do not provide turn-by-turn routing.

The job, money and reputation save on each transition in the separate browser key `hanover-park-3d-v1`. Reloading retains accepted work, carried stock or the completed reward, and Zeem remembers a completed delivery in both his conversation and model context. Other NPC conversation memories remain session-only. The fixed reward and mission transitions are controlled by the game; model responses cannot accept a job, grant money or invent reputation. The vendor, collection point and job are fictional and do not represent real shop staff, surveyed entrances or a commercial partnership.

Unreadable or incompatible 3D saves restart this job with a visible message. If browser storage is blocked or full, the delivery remains playable in the current tab and displays a save warning. The 2D save is left untouched.

### NPC goals and conversations

All eighteen 3D NPCs have original personalities, energy/social/purpose needs and small catalogues of executable goals. Neighbours fetch supplies, meet friends, fix a gate, bring in washing or take a break. They travel to reachable destinations, spend time doing the task, satisfy a need and return home. The vendor works at his stand, while crew routines yield to warnings and pursuits. Goals, task progress and movement freeze during conversations, pause and loss of focus.

The conversation panel shows the current task and accepts a short typed message alongside the existing reply choices. NPCs keep at most six context memories. These routines and local replies work without credentials; needs and ordinary conversation memories reset on page reload and never change the 2D save. Zeem's delivery status and completed-job memory are restored from the separate validated 3D mission save.

With Azure OpenAI configured, the same-origin `/api/npc-brain` server asks the model for dialogue and a goal from that NPC's catalogue. The game controls destinations, pathfinding, traffic checks and task effects. Nearby NPC planning is spaced out, and closing a conversation cancels its pending reply. Invalid output, unavailable service and rate limits fall back to local decisions.

[Azure NPC setup](docs/azure-npc-brains.md) includes a Cloud Shell script to create the token-billed model resource and store its credentials privately in the Static Web App's API settings. No model credential goes in the browser bundle. Vite development and production preview serve the same API handler locally; without Azure settings they return local replies. Server limits are per instance and do not impose a monthly spending cap.

Babylon dependencies and the lockfile are committed. Run `npm ci` from this repository; installing packages from Cloud Shell's home directory does not change the game. Both HTML entries are built by Vite. `@babylonjs/loaders` is available for future original GLB models; this preview generates its artwork locally and makes no remote asset requests.

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

Original council-flat artwork now shows three storeys of recessed windows, varied curtains, balcony railings, plants, laundry, stairs, gates and weathered plaster. Roof seams, repairs, skylights and vents give other mapped buildings more surface detail. Architectural decoration is clipped to the source footprint, retaining open courtyards.

Streets gain asphalt grain, tar repairs, cracks, paving joints, drains, sand and wear on the existing lane markings. These details follow the mapped road geometry and add no new obstacles. Sunset colours transition into cooler night lighting, with decorative streetlamps and staggered warm window glows; dawn returns to daylight. Lighting follows the fictional game clock, freezes on pause and covers the camera correctly after resize. It is artistic simulation rather than surveyed lamp inventory or astronomical sun timing.

The game uses Phaser's Canvas renderer. Architectural detail is baked into small local texture tiles so it does not replay every façade stroke on every frame; no suburb-sized raster is allocated. Lighting uses one reusable small gradient texture and bounded light counts. Texture and resize listeners are cleaned up when the scene shuts down.

Original English/Afrikaans dialogue uses Cape Flats expressions such as “awe”, “hosh”, “my bru” and “sharp sharp”. It is fictional writing, not quoted residents' speech or a resident-approved performance.

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

Twelve browser tests cover movement/sprint, rotated building collision, NPC conversations, mission/reward, save migration and refresh, pause/map, car handling, spatial audio output, mute/volume persistence, gameplay without Web Audio, optional R2 giving/refusal, robbery payment caps, keyboard escape, catches, encounter pause/refresh persistence, and sunset/night/dawn lighting with pause and viewport resize. Isolated interaction tests use a development-only positioning hook. A separate test walks the actual street route with keyboard input and no teleporting. Production-preview checks verify startup, keyboard movement, mission persistence, attribution and downloadable map data; the positioning hook is absent from production.

Four additional Babylon browser tests check a real production WebGL render, keyboard movement, readable day/sunset/night changes, source attribution, untouched 2D saves and absent debug hooks; development sprinting, rotated walls, mapped courtyard holes, pause and blur; Street/Overview views, real mouse orbit, recenter, resize and mapped-flat screenshots; and a working fallback when WebGL is unavailable. Software WebGL flags are confined to the tests. The 2D game keeps its Canvas renderer.

Three further 3D NPC tests cover production E-key greeting, reply choices, accessible focus and Escape dismissal; R2/intimidating dialogue without financial effects, movement freeze, blur and held-key clearing; and greeting blocked by a mapped wall alongside real, collision-safe pedestrian movement. Two streetscape tests independently check added lots against source geometry and NPC routes, the original graffiti atlas and day/night renders, and actual keyboard movement against house shells, boundary walls and through their gates. Three traffic/crew tests check actual opposing left-lane traffic, vehicle and pedestrian separation, car-body collision, contact joining/leaving, rival warning/pursuit/catch, colour changes and pause/dialogue/blur without save changes. Four driving tests cover parked/start freeze, entry and a visible seated driver, acceleration/braking/reverse/steering, camera and HUD controls, moving-exit rejection, unchanged 2D saves, pause/blur and cleared driving keys, full-body building and thin-wall collision, pedestrian/traffic separation, blocked doors and a safe passenger-side exit.

Four goal/conversation tests check completed routines and safe travel, frozen needs and task progress, bounded memories and model-selected tasks, local API replies, and cancelled late responses. Four shop/delivery tests check the production map's actual plotted source positions and keyboard access; real on-foot collection and vehicle guards; saved mission/reward/reputation and vendor memory across reloads; corrupt or blocked storage, map freeze and cancelled replies. Model responses in these browser checks are mocked; run browser tests without Azure credential settings for the unconfigured API check. Together the suite contains thirty-six browser tests.

Fourteen Node API tests check validation, structured Azure requests, credential isolation, fallback, cache, rate limits and timeouts. Twelve delivery-state tests cover guarded transitions, exact rewards, save validation, reloads and unavailable storage; run them with `npm run test:state`. Five offline Azure CLI regression tests run with `python3 tests/setup_azure_npc_brains_test.py`. A separate fifteen-minute headless simulation with all eighteen goal-driven NPCs, eight traffic vehicles and the parked hatchback verified task completion, collision safety and continuing traffic.

## Structure and scope

- `src/game/world/`: source geometry, locality registry, buildings, street surfaces, lighting and original sprites
- `src/game/scenes/`: scene lifecycle and gameplay orchestration
- `src/game/entities/`: walking, vehicle handling and fictional NPCs
- `src/game/systems/`: polygon collision, spatial sound and validated saves
- `src/game/missions/`: delivery states and reward
- `src/game/ui/`: menus, dialogue, source guide and HUD
- `src/preview3d/`: Babylon scene, source-map adapter, batched architecture, goal-driven NPCs, a driveable hatchback, autonomous traffic, fictional crew state and independent preview UI
- `api/`: managed Node.js NPC endpoint, shared fictional profiles and server tests
- `scripts/`: map acquisition/projection, local API middleware and Azure NPC setup

The 2D game's approximately 15254×12749 pixel world includes a minimap, three main NPCs, four fictional street encounters, wandering pedestrians, one driveable car, one mission and a gradual lighting cycle. Desktop keyboard play is intended. Interiors, combat, ambient moving traffic, additional missions/vehicles, touch controls and multiplayer are not implemented in 2D. Health is tracked and saved; robbery encounters affect money and have no combat/damage system. Phaser produces a bundle-size advisory; the production build succeeds.

## Azure Static Web Apps

Vite builds to `dist/`; `public/staticwebapp.config.json` is copied into that output. For a source build use app location `/`, API location `api`, output location `dist`, and build command `npm run build`. The committed workflow builds first, then uploads app location `dist` with `skip_app_build: true` and API location `api`. The managed API runs Node.js 22.

The build-validation workflow installs locked dependencies and runs TypeScript, build, API and browser checks. The separate **Deploy game to Azure** workflow publishes the game and NPC API to production when manually triggered. Source pushes do not redeploy automatically.

For a new Free Static Web App:

1. Create an Azure **Static Web App**, select **Free**, and use **Other** as the deployment source to avoid a competing generated workflow. Suggested name: `hanoverpark-streets`; resource group: `hanoverpark-game-rg`. A subscription is required even for the Free plan.
2. Copy its **Manage deployment token** value directly into GitHub **Settings → Secrets and variables → Actions**, with secret name `AZURE_STATIC_WEB_APPS_API_TOKEN`. Never commit the token or paste it into chat.
3. Run GitHub **Actions → Deploy game to Azure → Run workflow** on `feat/playable-neighbourhood`. The job summary reports the Azure URL.
4. Open that URL, complete a delivery and refresh to verify persistence. Local development saves do not transfer to a different origin.

The workflow does not create Azure resources. It publishes the managed NPC Functions API, which returns local decisions until its Azure OpenAI settings are configured. The separate [NPC setup script](docs/azure-npc-brains.md) creates a token-billed Azure OpenAI resource when you run it; the existing Static Web App can remain Free.
