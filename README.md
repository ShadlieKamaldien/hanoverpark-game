# Hanover Park: Streets of the Flats

A playable, original top-down neighbourhood adventure built with Phaser 3, TypeScript and Vite. Explore a fictionalised Cape Flats neighbourhood as Riyaad, borrow a mint hatchback, and deliver Aunty Fatima's groceries to Block C for R150.

The layout, characters, artwork and dialogue are fictional. This is not a geographic recreation, and it uses no GTA artwork, logos, music or other external game assets. All sprites and scenery are generated locally. No API keys, accounts or backend services are required.

## Run

Requires Node.js 22.12+ (Node 24 recommended) and npm.

```sh
npm install
npm run dev
```

Open the URL printed by Vite in your local development browser. The cloud onboarding UI does not provide a localhost preview.

```sh
npm run typecheck
npm run build
npm run preview
```

`npm ci` reproduces the committed dependency lockfile. `dist/` is the static production output.

## Play

| Control | Action |
| --- | --- |
| WASD / arrows | Walk; accelerate/brake and steer while driving |
| Shift | Sprint (uses stamina, which regenerates) |
| E | Speak, deliver groceries, enter or exit the hatchback |
| M | Expand/collapse the neighbourhood map |
| Escape | Pause/resume or dismiss dialogue |

Choose **Start Game** for a fresh run, or **Continue Game** when saved progress is available. Starting a fresh game replaces the existing save in this browser.

Aunty Fatima stands just east of your spawn, in front of the corner shop. Press E nearby, then **Accept Delivery**. Follow the gold map marker to Block C's front door, in the northeast. Press E nearby to deliver and receive R150 exactly once. A connected walking route follows the central horizontal road east, then north past the taxi-rank road, then east along the pavement below Block C.

The hatchback is south of the corner shop, on the north–south road beside Gatie's garage. W/up accelerates; S/down brakes then reverses; A/D steers. Coast or brake until nearly stopped to exit. The camera follows your current character or vehicle. Cars, buildings, trees and fences are solid. Movement uses small collision substeps to prevent passing through obstacles at speed.

Mission state, money, health, player position and car position/heading save to browser localStorage every two seconds and at mission transitions, vehicle exits, pause and page exit. Continuing from a car restores Riyaad safely outside it. Saves are tied to browser profile and origin; clearing site data removes them. Storage errors are reported in the game.

## Browser tests

```sh
PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright npx playwright install --with-deps chromium
npm test
```

Tests automatically use `/usr/bin/chromium` when present; `CHROMIUM_PATH` can specify another compatible executable. Otherwise they use the downloaded Playwright browser. Cloud setup uses the preinstalled Chromium and requires no browser download.

The five browser tests exercise keyboard movement and sprinting, building collision, all three NPC conversations, mission acceptance/completion, single reward, refresh persistence, pause, map toggle, corrupted-save rejection, and entering/driving/steering/braking/colliding/exiting the car. Isolated interaction tests use a development-only positioning hook to shorten travel; a separate end-to-end test walks from the actual spawn to the mission destination using keyboard input without teleporting. The development hook is absent from production builds. A production-preview smoke test checks startup, real keyboard movement, mission acceptance and refresh persistence without that hook.

## Structure

- `src/game/scenes/`: scene lifecycle and gameplay orchestration
- `src/game/entities/`: walking, vehicle handling and NPC definitions
- `src/game/systems/`: solid collision and validated save storage
- `src/game/missions/`: delivery states and reward
- `src/game/world/`: seeded procedural scenery and original pixel sprites
- `src/game/ui/`: responsive menus, dialogue and HUD
- `src/game/config/`: world bounds and save types

## Static hosting / Azure

Vite builds to `dist/`; `public/staticwebapp.config.json` is copied into that output. For Azure Static Web Apps use app location `/`, no API location, output location `dist`, and build command `npm run build`. The build-validation workflow installs locked dependencies, checks TypeScript, builds and runs browser tests. A separate manually triggered deployment workflow uploads the static output to Azure; it does not create Azure resources. Deployment requires the Azure resource and secure repository secret described below.

## Prototype scope

Includes a 2400×1800 scrolling neighbourhood, flats with balconies/washing lines/stairs, corner shop and takeaway, taxi rank, parked vehicles, pitch, trees, streetlights, fences, wandering pedestrians, three named NPCs, one driveable car, one complete mission, menus, HUD, minimap and a gradual lighting cycle.

Not included: interiors, combat, ambient moving traffic, recorded music/audio, additional missions or vehicles, touch/mobile controls, exact street geography, multiplayer or paid AI dialogue. Health is tracked and saved; this peaceful prototype has no combat/damage system. Desktop keyboard play is the intended workflow. Phaser is a substantial dependency and Vite reports a bundle-size advisory; the production build succeeds.

## Deploy a new Azure Free Static Web App

1. Sign in to the Azure portal and create a **Static Web App**. Suggested name: `hanoverpark-streets`; pricing plan: **Free**; resource group: `hanoverpark-game-rg`; choose an available region such as **West Europe**. Select **Other** as the deployment source so Azure does not create a competing workflow. An Azure subscription is required, even for the Free plan.
2. Open the new resource's **Manage deployment token** action and copy its token directly into the GitHub repository's **Settings → Secrets and variables → Actions → New repository secret**, named `AZURE_STATIC_WEB_APPS_API_TOKEN`. Never commit this token or paste it into chat.
3. In GitHub **Actions → Deploy game to Azure → Run workflow**, select `feat/playable-neighbourhood` and run the workflow. It installs the lockfile, typechecks/builds with Node 24, and uploads `dist/` as the production static site. The GitHub job summary reports the Azure game URL.
4. Open the Azure URL, start the game, complete the delivery and refresh to verify persistence on that origin. Local development saves do not transfer to the Azure URL.

The workflow is manual: ordinary source pushes run build validation and do not redeploy production. Selecting a branch in this deployment workflow publishes that selected branch to production. No database, Functions API, paid SKU or other service is configured.
