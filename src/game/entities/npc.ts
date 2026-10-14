import { MAP } from "../world/mapData";
import { DESTINATION } from "../missions/delivery";
/** Original fictional dialogue; local voice performances remain a future community contribution. */
export const NPCS = [
  {
    name: "Aunty Fatima",
    x: MAP.locations.fatima.x,
    y: MAP.locations.fatima.y,
    color: 0xc8685b,
    dialogue: `Awe, Riyaad! Ek het die groceries by Shoprite gekry. Kan jy gou die brood en melk by die aunty in ${DESTINATION.name} aflaai? R150 vir jou moeite, my kind. Maak gou, maar kyk mooi waar jy loop, né.`,
    help: `Follow the gold diamond to ${DESTINATION.name}. Press E at the delivery point outside the mapped building.`,
    ambient: [
      "Howzit, my kind. Wat kan ek vir jou kry?",
      "Jou brood lê hier. Kom haal dit voor jy huis toe gaan.",
    ],
  },
  {
    name: "Uncle Gatie",
    x: MAP.locations.gatie.x,
    y: MAP.locations.gatie.y,
    color: 0x739a9b,
    dialogue:
      "Hosh, Riyaad! Daai mint hatchback is reg. Ek het hom vanoggend uitgecheck. Vat hom as jy moet ry, my bru. Bring hom heel terug, né — moenie hier by die flats jaag nie.",
    help: "E to enter or exit. W / S accelerate and brake; A / D steer. Stop before getting out.",
    ambient: [
      "Dis net 'n los belt. Ons sal hom nou regkry.",
      "Gee gou daai spanner hier, my bru. Dankie.",
    ],
  },
  {
    name: "Jerome",
    x: MAP.locations.jerome.x,
    y: MAP.locations.jerome.y,
    color: 0xe6b952,
    dialogue:
      "Awe, my bru! Town, town — ons het nog plek! Jy's mos besig vandag. Gaan doen gou daai delivery; later skop ons bal daar by Downberg. Sharp, sien jou nou-nou!",
    help: "The story taxi stop and mapped Downberg Sports Field are marked on your neighbourhood map.",
    ambient: [
      "Town, town! Nog een plek, kom!",
      "Kom jy saam? Ons kan gou vir jou wag.",
    ],
  },
];
export const STREET_LINES = [
  {
    x: MAP.locations.fatima.x,
    y: MAP.locations.fatima.y,
    radius: 310,
    speaker: "By Shoprite",
    lines: NPCS[0].ambient,
  },
  {
    x: MAP.locations.taxi.x,
    y: MAP.locations.taxi.y,
    radius: 370,
    speaker: "Story taxi stop",
    lines: NPCS[2].ambient,
  },
  {
    x: MAP.locations.pitch.x,
    y: MAP.locations.pitch.y,
    radius: 360,
    speaker: "Downberg Sports Field",
    lines: [
      "Pass hier, my bru! Ek's oop!",
      "Next goal wen. Kom, ons speel!",
      "Lekker ball! Weer, weer!",
    ],
  },
  {
    x: DESTINATION.x,
    y: DESTINATION.y,
    radius: 280,
    speaker: "On the balcony",
    lines: [
      "Bring gou die wasgoed in voor die wind optel.",
      "Die tee is reg. Kom op as jy klaar is.",
    ],
  },
];
