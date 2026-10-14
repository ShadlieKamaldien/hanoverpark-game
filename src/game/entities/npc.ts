/** Original fictional dialogue; local voice performances remain a future community contribution. */
export const NPCS = [
  {
    name: "Aunty Fatima",
    x: 570,
    y: 740,
    color: 0xc8685b,
    dialogue:
      "Awe, Riyaad. Will you take this grocery bag to the aunty at Block C? She's waiting by the front door. Bread, milk and a few things for supper. I'll give you R150 when you're done. Thank you, my child.",
    help: "Accept the delivery, then follow the gold diamond to Block C. Press E at the front door.",
    ambient: [
      "Howzit! What can I get you?",
      "I've put your bread aside. Come fetch it when you're ready.",
    ],
  },
  {
    name: "Uncle Gatie",
    x: 730,
    y: 970,
    color: 0x739a9b,
    dialogue:
      "Howzit, Riyaad. The mint hatchback's here if you need a lift. I gave it a once-over this morning. Bring it back in one piece, hey — and take it easy through the courtyards.",
    help: "E to enter or exit. W / S accelerate and brake; A / D steer. Stop before getting out.",
    ambient: [
      "Just a loose belt. We'll have you sorted.",
      "Pass me that spanner, please, my bru.",
    ],
  },
  {
    name: "Jerome",
    x: 1200,
    y: 1440,
    color: 0xe6b952,
    dialogue:
      "Town? We've still got a seat. If you're staying on the block, there's a kickabout at the field later. Go sort out Aunty's delivery first. We'll see you there. Sharp!",
    help: "The taxi rank and community pitch are marked on your neighbourhood map.",
    ambient: [
      "Town, town! One more seat!",
      "You coming? We can wait a minute.",
    ],
  },
];
export const STREET_LINES = [
  {
    x: 570,
    y: 740,
    radius: 310,
    speaker: "Corner shop",
    lines: NPCS[0].ambient,
  },
  {
    x: 890,
    y: 1270,
    radius: 370,
    speaker: "Taxi rank",
    lines: NPCS[2].ambient,
  },
  {
    x: 1685,
    y: 1470,
    radius: 360,
    speaker: "At the pitch",
    lines: [
      "Pass here! I'm open!",
      "Next goal wins. Come, let's play!",
      "Good ball! Again, again!",
    ],
  },
  {
    x: 1780,
    y: 510,
    radius: 280,
    speaker: "On the balcony",
    lines: [
      "Bring the washing in before the wind picks up.",
      "Tea's ready. Come upstairs when you're finished.",
    ],
  },
];
