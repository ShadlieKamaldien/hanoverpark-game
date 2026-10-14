/**
 * Public locality evidence, reconciled with the licensed OSM snapshot.
 * A historical name or postal address alone does not establish a position.
 * Mapped features retain source names/IDs; unmatched historic courts stay null.
 */
import {
  MAP,
  gameCoordinates,
  type MapFootprint,
  type MapPoint,
  type MapPOI,
} from "./mapData";

export interface LocalitySource {
  publisher: string;
  title: string;
  url: string;
  published: string | null;
  retrieved: string;
  kind:
    | "draft-planning-document"
    | "municipal-directory"
    | "municipal-notice"
    | "journalism"
    | "verified-community-map";
  attribution?: string;
  license?: string;
  licenseUrl?: string;
  urls?: readonly string[];
}

const mapSourceUrls = Array.isArray(MAP.source.urls)
  ? MAP.source.urls.filter((url): url is string => typeof url === "string")
  : [];

export const LOCALITY_SOURCES = {
  openStreetMap: {
    publisher: "OpenStreetMap contributors",
    title: "Hanover Park live OSM API snapshot and suburb relation 2046907",
    url: mapSourceUrls[0] ?? "https://api.openstreetmap.org/api/0.6/map",
    urls: mapSourceUrls,
    published: null,
    retrieved: String(MAP.source.retrievedAt).slice(0, 10),
    kind: "verified-community-map",
    attribution: MAP.source.attribution,
    license: MAP.source.license,
    licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
  },
  investmentFramework: {
    publisher: "City of Cape Town",
    title: "Hanover Park Public Investment Framework — draft",
    url: "https://www.capetown.gov.za/media/fd3puiln/hanover-park-public-investment-framework_22-october-2015.pdf",
    published: "2015-10-22",
    retrieved: "2026-10-14",
    kind: "draft-planning-document",
  },
  electricityApril2024: {
    publisher: "City of Cape Town",
    title:
      "City advises of planned electricity supply maintenance in Hanover Park",
    url: "https://www.capetown.gov.za/media-and-news/city-advises-of-planned-electricity-supply-maintenance-in-hanover-park/",
    published: "2024-04-11",
    retrieved: "2026-10-14",
    kind: "municipal-notice",
  },
  electricityMay2024: {
    publisher: "City of Cape Town",
    title:
      "City advises of planned electricity work in Hanover Park, Manenberg",
    url: "https://www.capetown.gov.za/media-and-news/city-advises-of-planned-electricity-work-in-hanover-park-manenberg/",
    published: "2024-05-09",
    retrieved: "2026-10-14",
    kind: "municipal-notice",
  },
  downbergSportsGround: {
    publisher: "City of Cape Town",
    title: "Downberg Sports Ground",
    url: "https://www.capetown.gov.za/see-all-city-facilities/our-recreational-facilities/sports-fields/downberg-sports-ground/",
    published: null,
    retrieved: "2026-10-14",
    kind: "municipal-directory",
  },
  hanoverParkLibrary: {
    publisher: "City of Cape Town",
    title: "Hanover Park Public Library",
    url: "https://www.capetown.gov.za/see-all-city-facilities/our-service-facilities/libraries/hanover-park-public-library/",
    published: null,
    retrieved: "2026-10-14",
    kind: "municipal-directory",
  },
  jewelleryByRene: {
    publisher: "GroundUp",
    title: "Challenges of running a business in a poor community",
    url: "https://groundup.org.za/article/challenges-running-business-poor-community_958/",
    published: "2013-05-15",
    retrieved: "2026-10-14",
    kind: "journalism",
  },
  joggers: {
    publisher: "GroundUp",
    title: "Hanover Park’s joggers",
    url: "https://groundup.org.za/article/hanover-parks-joggers/",
    published: "2020-08-06",
    retrieved: "2026-10-14",
    kind: "journalism",
  },
} as const satisfies Record<string, LocalitySource>;

export type LocalitySourceId = keyof typeof LOCALITY_SOURCES;

export interface LocalityReference {
  source: LocalitySourceId;
  /** Printed page number in the document, not a PDF viewer's page index. */
  printedPage: number | null;
  /** Preserve spellings and combined rows instead of inventing aliases. */
  sourceLabel: string;
  osmType?: "node" | "way" | "relation";
  osmId?: number;
}

export interface GeographicPoint {
  latitude: number;
  longitude: number;
}

export interface MappedLocalityFeature {
  osmType: "node" | "way" | "relation";
  osmId: number;
  mappedName: string;
  gamePosition: MapPoint;
  coordinates: GeographicPoint;
  geometry: "point" | "polygon" | "polyline";
}

export interface LocalityEntry {
  id: string;
  name: string;
  kind: "court" | "road" | "sports-ground" | "library" | "business";
  address: string | null;
  coordinates: GeographicPoint | null;
  placement: "unlocated" | "geolocated";
  verification:
    | "historical-name"
    | "directory-address"
    | "historical-business"
    | "verified-community-map";
  /** Mapped representatives are not surveyed entrances or legal boundaries. */
  mappedFeatures?: readonly MappedLocalityFeature[];
  /** A normalization/modern label to verify against a current authoritative map. */
  candidateCurrentName?: string;
  references: readonly LocalityReference[];
  notes: string;
}

const COURT_LABELS = [
  ["Algoa Court", "Algoa & Agulhas Court"],
  ["Agulhas Court", "Algoa & Agulhas Court"],
  ["Blinkwater Court", "Blinkwater Court"],
  ["Etosha Court", "Etosha Court"],
  ["Erie Court", "Erie Court"],
  ["Donegal Court", "Donegal Court"],
  ["Cascade Court", "Cascade Court"],
  ["Como Court", "Como Court"],
  ["Derwent Court", "Derwent Court"],
  ["Solent Court", "Solent Court"],
  ["Soetwater Court", "Soetwater Court"],
  ["Pelikan Court", "Pelikan Court"],
  ["Galilee Court", "Galilee Court"],
  ["Galway Court", "Galway Court"],
  ["Hangklip Court", "Hangklip Court"],
  ["Kariba Court", "Kariba Court"],
  ["Lugano Court", "Lugano Court"],
  ["Mentz Court", "Mentz Court"],
  ["Moray Court", "Moray Court"],
  ["Oribi Court", "Oribi Court"],
  ["Ontario Court", "Ontario Court"],
  ["Princess Court", "Princess Court"],
  ["Recife Court", "Recife Court"],
  ["St. Lucia Court", "St. Lucia Court"],
  ["Tiberias Court", "Tiberias Court"],
  ["Walvis Court", "Walvis Court"],
  ["Lomond Court", "Lomond Court"],
  ["Howick Court", "Howick Court"],
] as const;

function localityId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function courtBasename(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+(court|hof)$/i, "")
    .trim();
}

function footprintFeature(footprint: MapFootprint): MappedLocalityFeature {
  const gamePosition = {
    x: footprint.bounds.x + footprint.bounds.w / 2,
    y: footprint.bounds.y + footprint.bounds.h / 2,
  };
  return {
    osmType: footprint.osmType,
    osmId: footprint.id,
    mappedName: footprint.name!,
    gamePosition,
    coordinates: gameCoordinates(gamePosition.x, gamePosition.y),
    geometry: "polygon",
  };
}

function osmReference(feature: MappedLocalityFeature): LocalityReference {
  return {
    source: "openStreetMap",
    printedPage: null,
    sourceLabel: feature.mappedName,
    osmType: feature.osmType,
    osmId: feature.osmId,
  };
}

/** Existing court names in the 2015 budget table; proposed upgrades are not evidence of completed work. */
export const COURTS: readonly LocalityEntry[] = COURT_LABELS.map<LocalityEntry>(
  ([name, sourceLabel]) => {
    const matches = MAP.buildings.filter(
      (building) =>
        building.name &&
        /\s+(court|hof)$/i.test(building.name) &&
        courtBasename(building.name) === courtBasename(name),
    );
    // Multiple footprints with the exact same mapped name are retained (Donegal).
    // Different names for the same stripped basename would be ambiguous.
    const unambiguous =
      new Set(matches.map((building) => building.name)).size === 1;
    const mappedFeatures = unambiguous ? matches.map(footprintFeature) : [];
    return {
      id: localityId(name),
      name,
      kind: "court",
      address: null,
      coordinates: mappedFeatures[0]?.coordinates ?? null,
      placement: mappedFeatures.length ? "geolocated" : "unlocated",
      verification: mappedFeatures.length
        ? "verified-community-map"
        : "historical-name",
      mappedFeatures,
      references: [
        { source: "investmentFramework", printedPage: 62, sourceLabel },
        ...mappedFeatures.map(osmReference),
      ],
      notes: mappedFeatures.length
        ? "Historical name reconciled only by exact basename after stripping Court/Hof. Current OSM spelling and all matching way IDs are preserved. Coordinates represent the first mapped footprint's bounding-box centre, not an entrance or surveyed boundary; present condition is unverified."
        : "Listed under 3-STOREY CRU in the 2015 draft. No unambiguous same-basename court footprint is present in the imported OSM snapshot. Location remains unknown; do not assign guessed names to buildings.",
    };
  },
);

/** Exact OSM court labels, including Pelikaan Hof without guessing a Pelikan alias. */
export const MAPPED_COURTS: readonly LocalityEntry[] = [
  ...new Set(
    MAP.buildings
      .map((building) => building.name)
      .filter((name): name is string =>
        Boolean(name && /\s+(court|hof)$/i.test(name)),
      ),
  ),
].map<LocalityEntry>((name) => {
  const mappedFeatures = MAP.buildings
    .filter((building) => building.name === name)
    .map(footprintFeature);
  return {
    id: `osm-${localityId(name)}`,
    name,
    kind: "court",
    address: null,
    coordinates: mappedFeatures[0].coordinates,
    placement: "geolocated",
    verification: "verified-community-map",
    mappedFeatures,
    references: mappedFeatures.map(osmReference),
    notes:
      "Exact name and polygon geometry from the OSM snapshot. All same-name footprint IDs are preserved. A representative centre does not establish an entrance, current condition or legal court boundary.",
  };
});

const ROAD_LABELS = [
  ["Turf Hall Road", "Turf Hall Road", 39],
  ["Jan Smuts Drive", "Jan Smuts Road", 39],
  ["Jakes Gerwel Drive", "Vanguard Drive", 39],
  ["Govan Mbeki Road", "Govan Mbeki Drive (Landsdowne Road)", 39],
  ["Athwood Road", "Athwood Road", 39],
  ["Surran Road", "Surran Road", 39],
  ["Hanover Park Avenue", "Hanover Park Av.", 39],
  ["Lonedown Road", "Lonedown Road", 39],
  ["Downberg Road", "Downberg Road", 58],
] as const;

/** Canonical names use exact current snapshot tags wherever the named road is mapped. */
export const ROADS: readonly LocalityEntry[] = ROAD_LABELS.map<LocalityEntry>(
  ([candidateName, sourceLabel, printedPage]) => {
    const matches = MAP.roads.filter((road) => road.name === candidateName);
    const mappedFeatures: MappedLocalityFeature[] = matches.map((road) => {
      const gamePosition = road.points[Math.floor(road.points.length / 2)];
      return {
        osmType: "way",
        osmId: road.id,
        mappedName: road.name!,
        gamePosition,
        coordinates: gameCoordinates(gamePosition.x, gamePosition.y),
        geometry: "polyline",
      };
    });
    return {
      id: localityId(candidateName),
      name: matches.length ? candidateName : sourceLabel,
      ...(!matches.length && candidateName !== sourceLabel
        ? { candidateCurrentName: candidateName }
        : {}),
      kind: "road",
      address: null,
      coordinates: mappedFeatures[0]?.coordinates ?? null,
      placement: mappedFeatures.length ? "geolocated" : "unlocated",
      verification: mappedFeatures.length
        ? "verified-community-map"
        : "historical-name",
      mappedFeatures,
      references: [
        { source: "investmentFramework", printedPage, sourceLabel },
        ...mappedFeatures.map(osmReference),
      ],
      notes:
        candidateName === "Downberg Road"
          ? "OSM maps Downberg Road with geographic centreline geometry. Page 58 uses Downberg Road; the sports-ground directory separately says Downberg Street. Mapped geometry does not establish completion of the 2015 proposed bridge/intersection works."
          : "Exact mapped name and centreline way IDs are retained alongside the historical printed label. The snapshot includes fringe roads; road widths are enlarged for gameplay and current signage, traffic restrictions and built works are not independently surveyed.",
    };
  },
);

export const FACILITIES: readonly LocalityEntry[] = [
  {
    id: "downberg-sports-ground",
    name: "Downberg Sports Ground",
    kind: "sports-ground",
    address: "Downberg Street, Hanover Park",
    coordinates: null,
    placement: "unlocated",
    verification: "directory-address",
    references: [
      {
        source: "downbergSportsGround",
        printedPage: null,
        sourceLabel: "Downberg Sports Ground",
      },
    ],
    notes:
      "Municipal directory lists summer/winter playing fields, floodlights, ablution amenities, change rooms and disability access. Address verified; exact footprint and entrance remain unlocated.",
  },
  {
    id: "hanover-park-public-library",
    name: "Hanover Park Public Library",
    kind: "library",
    address: "Cnr Hanover Park Avenue and Surran Road, Hanover Park, 7780",
    coordinates: null,
    placement: "unlocated",
    verification: "directory-address",
    references: [
      {
        source: "hanoverParkLibrary",
        printedPage: null,
        sourceLabel: "Hanover Park Public Library",
      },
    ],
    notes:
      "Intersection address is verified in the municipal directory; it does not identify a surveyed building footprint or an entrance coordinate.",
  },
];

/** Historical businesses are research leads, never current storefront substitutions. */
export const HISTORICAL_BUSINESSES: readonly LocalityEntry[] = [
  {
    id: "jewellery-by-rene",
    name: "Jewellery by René",
    kind: "business",
    address: null,
    coordinates: null,
    placement: "unlocated",
    verification: "historical-business",
    references: [
      {
        source: "jewelleryByRene",
        printedPage: null,
        sourceLabel: "Jewellery by René",
      },
    ],
    notes:
      "A 2013 owner interview describes a home/flea-market jewellery business. No current store address or trading status is verified; do not use this name for a grocery shop.",
  },
];

function poiFeature(poi: MapPOI): MappedLocalityFeature {
  const gamePosition = { x: poi.x, y: poi.y };
  return {
    osmType: poi.osmType,
    osmId: poi.id,
    mappedName: poi.name,
    gamePosition,
    coordinates: gameCoordinates(poi.x, poi.y),
    geometry: poi.osmType === "node" ? "point" : "polygon",
  };
}

/** Located business labels in the current snapshot; trading/opening status is unconfirmed. */
export const CURRENT_SHOPS: readonly LocalityEntry[] = MAP.pois
  .filter((poi) =>
    ["supermarket", "pharmacy", "fuel", "fast_food"].includes(poi.kind),
  )
  .map<LocalityEntry>((poi) => {
    const feature = poiFeature(poi);
    return {
      id: `osm-${poi.osmType}-${poi.id}`,
      name: poi.name,
      kind: "business",
      address: null,
      coordinates: feature.coordinates,
      placement: "geolocated",
      verification: "verified-community-map",
      mappedFeatures: [feature],
      references: [osmReference(feature)],
      notes:
        "Identity and point/way representative are sourced from the retrieved OSM snapshot; display labels include mapped branch tags where present. Current trading, opening hours, stock, ownership and endorsement are not confirmed. A mapped POI does not justify inventing a building footprint or real staff identities.",
    };
  });

/** Keep a mapped field label separate from the differently named municipal facility entry. */
export const MAPPED_FACILITIES: readonly LocalityEntry[] = MAP.pois
  .filter((poi) => poi.kind === "pitch")
  .map<LocalityEntry>((poi) => {
    const feature = poiFeature(poi);
    return {
      id: `osm-${poi.osmType}-${poi.id}`,
      name: poi.name,
      kind: "sports-ground",
      address: null,
      coordinates: feature.coordinates,
      placement: "geolocated",
      verification: "verified-community-map",
      mappedFeatures: [feature],
      references: [osmReference(feature)],
      notes:
        "Named pitch geometry is mapped in OSM. The representative does not establish an official facility boundary, entrance or surveyed amenities; differently worded municipal addresses remain separate evidence.",
    };
  });

export const LOCALITY_REGISTRY = {
  researched: "2026-10-14",
  sources: LOCALITY_SOURCES,
  mapDataId: MAP.id,
  courts: COURTS,
  mappedCourts: MAPPED_COURTS,
  roads: ROADS,
  facilities: FACILITIES,
  mappedFacilities: MAPPED_FACILITIES,
  historicalBusinesses: HISTORICAL_BUSINESSES,
  currentShops: CURRENT_SHOPS,
} as const;
