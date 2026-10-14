# Hanover Park map data

© OpenStreetMap contributors. This source snapshot and the derived geographic database are licensed under the **Open Database License (ODbL) 1.0**:

- Attribution and source: https://www.openstreetmap.org/copyright
- License: https://opendatacommons.org/licenses/odbl/1-0/
- Source suburb: https://www.openstreetmap.org/relation/2046907

`hanover-park.osm.json` is a filtered snapshot acquired from the official OSM API. Its source metadata includes request URLs, acquisition time and raw-response SHA-256 hashes. Geographic records keep OSM IDs, coordinates, node references and relevant geographic tags. Contributor identities and phone/contact tags are excluded. It contains complete ways intersecting the request crop; some vertices extend outside the playable world.

`hanover-park.game.json` is the projected database used by the game, also under ODbL 1.0. This is offered in its entirety for reuse under that license. It includes the boundary, road centrelines, building and field polygons, named places, a north-up local projection and gameplay anchors. It is identical to `src/game/world/mapData.json`.

The game visibly attributes OSM on its minimap and links to the source snapshot and license in the Area Guide. Both JSON files and this notice are copied to the production site's `/map-data/` directory by Vite.

This community-mapped boundary is not a surveyed legal boundary. Buildings, names and current business status may be incomplete or outdated. Road widths are enlarged for gameplay. Character locations, entrances and mission anchors are fictional story data. The game code, dialogue and original pixel art are separate from this geographic database; no OSM raster tiles or business logos are used.

Run `npm run map:fetch` from the repository root for an intentional source refresh; run `python3 scripts/import-osm.py` to regenerate derived geometry from the committed snapshot. Normal startup/build requires neither a live map service nor credentials.
