# Hanover Park names and map research

Research date: **2026-10-14**. **Real geographic data is now imported.** Live OpenStreetMap API requests succeeded in this run after earlier network failures. The game uses the OSM Hanover Park suburb polygon, real road centrelines, mapped building polygons and located business/facility labels. It no longer derives playable road geometry from a fictional grid or the earlier 2015 schematic.

The reusable locality evidence is in `src/game/world/locality.ts`; actual projected geography is in `src/game/world/mapData.json`. Mapped entries preserve their exact source names, OSM entity types/IDs and reconstructed WGS84 coordinates. Historical names without an unambiguous mapped counterpart remain `coordinates: null` / `placement: "unlocated"`. Registry order has no spatial meaning.

## Imported map and licence

The snapshot was retrieved on **2026-10-14** from:

- Full map API: https://api.openstreetmap.org/api/0.6/map?bbox=18.5195,-34.0021,18.5399,-33.988
- Full suburb relation: https://api.openstreetmap.org/api/0.6/relation/2046907/full
- Relation identity: https://www.openstreetmap.org/relation/2046907

Source: **© OpenStreetMap contributors**, **Open Database License (ODbL) 1.0**. Attribution: https://www.openstreetmap.org/copyright . Licence: https://opendatacommons.org/licenses/odbl/1-0/ .

The raw licensed database export is served at **`/map-data/hanover-park.osm.json`**, and the projected game database at **`/map-data/hanover-park.game.json`**, with a reuse notice at **`/map-data/README.md`**. The in-game **Area Guide** provides source and ODbL links. Snapshot metadata includes retrieval time, API URLs and original XML SHA-256 hashes. The published export excludes contributor usernames and user IDs; geographic feature IDs are retained for source reconciliation. Original pixel artwork is separate from the geographic database.

The requested bounding box is **[18.5195, -34.0021, 18.5399, -33.9880]**, in west/south/east/north order. The source contains **7,539 nodes, 1,253 ways and 54 relations**, with no missing way-node references. The stitched Hanover Park suburb relation is one closed **122-node** polygon. This is a **community-mapped suburb boundary**, not a surveyed municipal/legal boundary, census boundary or the wider Safe Node planning area.

The game data includes **962 road/path segments**, including fringe features returned by the API, and mapped building polygons selected inside the suburb boundary. Complete OSM ways may extend beyond the requested box; rendering must clip them rather than pretend the rectangular download is the suburb boundary. Building coverage is incomplete. Missing buildings and courts must not receive guessed names or invented exact geographic placement.

Projection uses a local north-up approximation from WGS84: origin **latitude -33.9880, longitude 18.5195**, latitude cosine **0.8290858802597905**, **8 pixels per metre** uniformly in both axes, and **96 pixels** of padding. The conversion uses 111,320 metres per latitude degree. `gameCoordinates(x, y)` in `mapData.ts` reverses that projection. Local projected coordinates preserve observed road relationships and distances approximately; they are not a cadastral survey.

Road widths are enlarged for gameplay. Building façades, storey decoration, sound, character positions, mission entrances, taxi activity and delivery stories are original simulation choices. The mapped geography does not establish present-day traffic restrictions, legal entrances, completed 2015 public works, real staff identities or current business opening status.

## Mapped courts and historical reconciliation

Eight distinct court labels appear on **nine** imported building footprints:

| Exact OSM label | OSM way ID(s)          | Historical name reconciled only by exact basename after removing Court/Hof |
| --------------- | ---------------------- | -------------------------------------------------------------------------- |
| Galway Court    | 577594394              | Galway Court                                                               |
| Hangklip Hof    | 577594396              | Hangklip Court                                                             |
| Galilee Court   | 577594400              | Galilee Court                                                              |
| Pelikaan Hof    | 577594402              | No automatic match to differently spelled Pelikan Court                    |
| Agulhas Court   | 577594405              | Agulhas Court                                                              |
| Algoa Hof       | 577594407              | Algoa Court                                                                |
| Blinkwater Hof  | 577594408              | Blinkwater Court                                                           |
| Donegal Court   | 1111656286, 1111656287 | Donegal Court; both named footprints retained                              |

`MAPPED_COURTS` preserves all eight exact mapped labels. Seven names in the historical court registry receive an unambiguous mapped counterpart; the other **21 historical names stay unlocated**. In particular, **Pelikaan Hof** is independently mapped, but the differently spelled **Pelikan Court** is not silently asserted to be its alias. The historical and mapped names remain separately inspectable.

Coordinates on court registry entries represent a footprint's bounding-box centre, not a surveyed entrance or legal court boundary. For multi-footprint Donegal Court, all source way IDs and representatives are retained, while the entry's single coordinate is the first footprint's representative. The game uses the actual polygons for geometry rather than drawing a generic rectangle at that coordinate.

## Primary municipal source: court names

City of Cape Town, **Hanover Park Public Investment Framework**, draft dated **22 October 2015**:

https://www.capetown.gov.za/media/fd3puiln/hanover-park-public-investment-framework_22-october-2015.pdf

Printed **page 62**, the **3-STOREY CRU** budget table, lists:

- Algoa Court and Agulhas Court — printed together as **“Algoa & Agulhas Court”**.
- Blinkwater Court, Etosha Court, Erie Court and Donegal Court.
- Cascade Court, Como Court, Derwent Court, Solent Court, Soetwater Court and Pelikan Court.
- Galilee Court, Galway Court, Hangklip Court, Kariba Court, Lugano Court and Mentz Court.
- Moray Court, Oribi Court, Ontario Court, Princess Court, Recife Court and St. Lucia Court.
- Tiberias Court, Walvis Court, Lomond Court and Howick Court.

These are **28 names in 27 budget rows**, referring to existing council rental housing in the historical document. Its proposed landscaping, stair replacement, fencing, play areas, lighting and other budgeted works are **not evidence those changes were built**. Historical public names are verified; current condition and legal boundaries are not surveyed. Page numbers here are printed document numbers, not PDF viewer indices.

Later municipal notices provide limited corroboration of locality labels:

- **11 April 2024**: https://www.capetown.gov.za/media-and-news/city-advises-of-planned-electricity-supply-maintenance-in-hanover-park/ . Labels include Blinkwater, Derwent, Mentz, Luganohof, Lomond Court, Moray and Recifehof. They do not establish surveyed footprints or authorize assuming similarly named places are identical.
- **9 May 2024**, covering **Hanover Park and Manenberg**: https://www.capetown.gov.za/media-and-news/city-advises-of-planned-electricity-work-in-hanover-park-manenberg/ . Labels include St Lucia Court, Tiberius and Galilee Court. Lansdowne Cleaners is not placed as a current Hanover Park storefront because its precise locality and trading status remain unresolved.

## Downberg and current directory addresses

The imported OSM data explicitly maps **Downberg Road** and its named A/B/C/D/E roads. The 2015 framework's printed **page 58** also names **Downberg Road** in proposed bridge/intersection works; that historic text does not prove those works were completed.

Current City directory pages were successfully read:

| Facility                    | Address printed in the City directory                           | Source                                                                                                                |
| --------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Downberg Sports Ground      | **Downberg Street, Hanover Park**                               | https://www.capetown.gov.za/see-all-city-facilities/our-recreational-facilities/sports-fields/downberg-sports-ground/ |
| Hanover Park Public Library | **Cnr Hanover Park Avenue and Surran Road, Hanover Park, 7780** | https://www.capetown.gov.za/see-all-city-facilities/our-service-facilities/libraries/hanover-park-public-library/     |

The Sports Ground directory lists summer and winter fields, floodlights, ablution amenities, change rooms and disability access. These are published directory amenities, not a new on-site survey. OSM maps **Downberg Sports Field**, way **707186784**, as a pitch; that mapped field is represented in the game. The municipal directory's **Sports Ground / Downberg Street** wording is preserved separately and is not treated as proof of identical facility boundaries or an exact entrance.

The library's intersection address is verified, but this imported snapshot does not establish an unambiguous named library footprint or entrance. Its official directory registry entry remains unlocated.

## Road names: historical labels and exact mapped tags

Printed **page 39** of the framework provides historical comparison; the current game registry uses these exact names from the retrieved OSM tags:

| Historical printed label            | Exact mapped tag used now |
| ----------------------------------- | ------------------------- |
| Turf Hall Road                      | Turf Hall Road            |
| Jan Smuts Road                      | Jan Smuts Drive           |
| Vanguard Drive                      | Jakes Gerwel Drive        |
| Govan Mbeki Drive (Landsdowne Road) | Govan Mbeki Road          |
| Athwood Road                        | Athwood Road              |
| Surran Road                         | Surran Road               |
| Hanover Park Av.                    | Hanover Park Avenue       |
| Lonedown Road                       | Lonedown Road             |

The registry keeps historical labels as references alongside current-snapshot named way IDs. In particular, **Govan Mbeki Road** and **Turf Hall Road** are preserved as tagged; the earlier unverified display candidates “Govan Mbeki Drive” and “Turfhall Road” are not silently promoted into snapshot facts. Community map tags are current snapshot evidence, not an independent survey of current road signage.

The earlier original 2015 schematic was preparatory work only and has no WGS84 transform. **It is not the source of the implemented geography.** Printed **page 5**, Figure 1, labels a **356 ha Safe Node study area** including Hanover Park and Newfields and excluding Mountain View. The implemented boundary is instead OSM suburb relation **2046907**; the two scopes must not be conflated.

## Mapped businesses and everyday life

`CURRENT_SHOPS` now contains eight located business/service labels from the retrieved map. “Current” describes the retrieved snapshot, **not independently verified current trading or opening hours**. Display labels combine mapped name/brand and branch where those tags are present.

| Display label                      | OSM entity       |
| ---------------------------------- | ---------------- |
| Shoprite Lansdowne Corner          | node 2119093639  |
| Clicks Lansdowne                   | node 2119095799  |
| Engen Hanover Park Service Station | node 12289683683 |
| Astron Energy Lansdowne Corner     | node 13912423531 |
| Jumbo Wholesale                    | way 440859686    |
| Caltex                             | way 747351793    |
| KFC WETTON                         | way 1272576243   |
| McDonald's                         | way 1272576267   |

The map establishes their sourced identity and geographic location at snapshot time. It does not certify opening hours, inventory, current trading, ownership, endorsement or staff. Locations are taken from mapped points or polygon representatives; a POI does not justify inventing a named building where OSM supplies no footprint. Fictional NPCs and errands at mapped places remain original game stories.

Historical and everyday-life reporting accessed in this run includes:

- GroundUp, **15 May 2013**, “Challenges of running a business in a poor community”: https://groundup.org.za/article/challenges-running-business-poor-community_958/ . **Jewellery by René** was described as a home/flea-market business. Its current address and trading status remain unverified, so it stays an unlocated historical research lead.
- GroundUp, **6 August 2020**, “Hanover Park’s joggers”: https://groundup.org.za/article/hanover-parks-joggers/ . It describes mixed-age morning jogging on an approximately 800 m circuit, older residents, children and a family with a pram. The proposed “Walking, Running is Life Vannie Hanover Park” club is a proposal in that article, not evidence of present registration or operation.

Character dialogue is original fiction using Cape Flats English/Afrikaans expressions. It is not sourced quotation, resident-approved speech or a claim of one uniform accent. Locally reviewed scripts and consented, licensed voice recordings would improve fidelity. Everyday shopping, family life, sport, taxi activity and wind remain part of the soundscape.

## Access history and remaining research

The City's explanatory pages and primary PDF were accessible:

- City Map and Zoning Viewer: https://www.capetown.gov.za/work-and-business/planning-portal/online-planning-and-building-resources/online-zoning-viewer/city-map-and-zoning-viewer/
- Open Data terms of use: https://www.capetown.gov.za/general/city-of-cape-town-open-data-terms-of-use/
- Open Data Policy: https://www.capetown.gov.za/media/vg2plaql/open_data_policy.pdf

Earlier requests to City GIS services at `citymaps.capetown.gov.za`, `odp-cctegis.opendata.arcgis.com` and `cctegis.maps.arcgis.com` returned HTTPS CONNECT 403. No municipal GIS layer is claimed to have been downloaded. Their linked services were:

- https://citymaps.capetown.gov.za/EGISViewer/
- https://odp-cctegis.opendata.arcgis.com/
- https://cctegis.maps.arcgis.com/sharing/rest/content/items/8181f4c86f2040eb99475f368c7d4c71/data

Earlier OSM CONNECT failures are **historical diagnostics**, superseded by successful live `api.openstreetmap.org/api/0.6/map` and `relation/2046907/full` downloads. Overpass requests subsequently returned **406/504**; Overpass is unnecessary for the completed API-based import. A saved network draft alone is never evidence of runtime access.

Remaining work is to expand and cross-check incomplete building/court coverage, resolve unmapped public facilities and ambiguous aliases, confirm business details through current official listings, and obtain locally reviewed language/voice references. Current municipal data or field-reviewed evidence would strengthen the community map, but its absence does not erase the sourced OSM geometry already imported.

Do not claim a complete, surveyed or exact present-day simulation. Keep mapped evidence, historical planning proposals and original gameplay choices distinguishable. Refreshes should preserve attribution/licence and source timestamps, validate geometry, and leave unknown entries null rather than filling them from order, approximate resemblance or guessed geocoding.

## Fictional street encounter update

Four adult characters now use clear road-node positions for optional R2 requests and separate robbery attempts. Their appearance, tik-related dialogue, names and behaviour are original fiction. The OSM geometry only supplies walkable placement; it is not evidence about drug use or crime at any mapped business, court or street. There are no real-person claims, copied voices or named real shop staff.

## Original visual scenery update

Flat balconies, curtains, stairs, gates, roof repairs, street wear, drains and lamp positions are decorative simulation details. Architecture retains exact mapped outer/inner polygons, including courtyard holes; pavement detail follows existing centrelines. The new lighting uses a fictional game-clock sunset/night/dawn cycle and decorative lamps rather than an asserted municipal streetlight inventory or astronomical model. No additional building/name coordinates, source map data, business logos or third-party photography were introduced.
