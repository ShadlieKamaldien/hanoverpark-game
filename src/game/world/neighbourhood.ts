import Phaser from "phaser";
import type { Rect } from "../systems/collision";
import { WORLD } from "../config/constants";

export const BUILDINGS = [
  { x: 150, y: 180, w: 300, h: 280, name: "BLOCK A", color: 0xc5b398 },
  { x: 750, y: 180, w: 320, h: 300, name: "BLOCK B", color: 0xb9b5a3 },
  { x: 1580, y: 180, w: 400, h: 290, name: "BLOCK C", color: 0xd4bea0 },
  { x: 160, y: 570, w: 290, h: 120, name: "FATIMA’S CORNER", color: 0xc8785d },
  { x: 800, y: 850, w: 250, h: 210, name: "GATIE’S GARAGE", color: 0x799697 },
  { x: 1580, y: 870, w: 360, h: 290, name: "BLOCK D", color: 0xcbb999 },
  { x: 170, y: 1120, w: 290, h: 260, name: "BLOCK E", color: 0xb8ab96 },
  {
    x: 720,
    y: 1530,
    w: 340,
    h: 130,
    name: "THE DAILY GATSBY",
    color: 0xc97755,
  },
];

const ROADS: Rect[] = [
  { x: 0, y: 700, w: 2400, h: 140 },
  { x: 0, y: 1390, w: 2400, h: 140 },
  { x: 480, y: 0, w: 220, h: 1800 },
  { x: 1130, y: 0, w: 250, h: 1800 },
  { x: 2000, y: 0, w: 190, h: 1800 },
];

type Building = (typeof BUILDINGS)[number];
type Graphics = Phaser.GameObjects.Graphics;

function sign(
  scene: Phaser.Scene,
  x: number,
  y: number,
  name: string,
  size = 12,
) {
  return scene.add
    .text(x, y, name, {
      fontFamily: "monospace",
      fontSize: `${size}px`,
      color: "#f6ecd4",
      backgroundColor: "#345750",
      padding: { x: 9, y: 4 },
    })
    .setOrigin(0.5)
    .setDepth(1);
}

function laundry(
  g: Graphics,
  x: number,
  y: number,
  color: number,
  wide = false,
) {
  g.fillStyle(color).fillRect(x, y, wide ? 20 : 12, wide ? 15 : 13);
  if (!wide) g.fillRect(x - 3, y + 1, 3, 5).fillRect(x + 12, y + 1, 3, 5);
  g.fillStyle(0xf0dec0, 0.4).fillRect(x + 2, y + 3, wide ? 2 : 8, 2);
  g.fillStyle(0x705f47)
    .fillRect(x + 1, y - 2, 2, 3)
    .fillRect(x + (wide ? 16 : 8), y - 2, 2, 3);
}

function window(
  g: Graphics,
  x: number,
  y: number,
  warm: boolean,
  curtain: number,
) {
  g.fillStyle(0x8d8777).fillRect(x - 2, y - 2, 30, 30);
  g.fillStyle(warm ? 0xb6a373 : 0x405d62).fillRect(x, y, 26, 25);
  g.fillStyle(curtain)
    .fillRect(x + 1, y + 2, 5, 21)
    .fillRect(x + 21, y + 2, 4, 21);
  g.fillStyle(0xd8cdb4)
    .fillRect(x + 12, y, 2, 25)
    .fillRect(x, y + 11, 26, 2);
  g.fillStyle(0x829f98, 0.45).fillRect(x + 7, y + 2, 4, 8);
  g.fillStyle(0xe4d9bf).fillRect(x - 3, y + 25, 32, 3);
  g.fillStyle(0x746d60, 0.65).fillRect(x - 2, y + 28, 31, 3);
}

function drawFlat(
  scene: Phaser.Scene,
  g: Graphics,
  b: Building,
  index: number,
) {
  const random = new Phaser.Math.RandomDataGenerator([`block-${index}`]);
  const roofH = 56;
  const centre = b.x + b.w / 2;
  const floors = 3;
  const storeyH = Math.floor((b.h - roofH - 24) / floors);
  g.fillStyle(0x405047, 0.22).fillRect(b.x + 13, b.y + 17, b.w, b.h);
  g.fillStyle(0x776f61).fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
  g.fillStyle(b.color).fillRect(b.x, b.y, b.w, b.h);
  g.fillStyle(0xa0937c, 0.55).fillRect(
    b.x + b.w - 12,
    b.y + roofH,
    12,
    b.h - roofH,
  );
  g.fillStyle(0xe0d0b1, 0.6).fillRect(b.x + 4, b.y + roofH, 7, b.h - roofH);
  // Shallow roof planes, a ridge and narrow corrugations distinguish the roof
  // from the warm plaster façade without altering the collision footprint.
  g.fillStyle(index % 2 ? 0x929081 : 0x897c6a).fillRect(b.x, b.y, b.w, roofH);
  g.fillStyle(index % 2 ? 0xa3a291 : 0x9d8c76).fillRect(
    b.x + 3,
    b.y + 3,
    b.w - 6,
    20,
  );
  g.fillStyle(0x736e61).fillRect(b.x + 2, b.y + 24, b.w - 4, 2);
  g.lineStyle(1, 0xc1b397, 0.27);
  for (let x = b.x + 9; x < b.x + b.w - 4; x += 9)
    g.lineBetween(x, b.y + 4, x, b.y + roofH - 3);
  g.fillStyle(0x655f55).fillRect(b.x - 3, b.y + roofH - 5, b.w + 6, 7);
  g.fillStyle(0xd8cbb0).fillRect(b.x - 3, b.y + roofH + 2, b.w + 6, 3);
  // Roof vents and simple antennae, drawn as original small pixel shapes.
  g.fillStyle(0x6d6b5e).fillRect(b.x + 37, b.y + 12, 18, 11);
  g.fillStyle(0xb1ad96).fillRect(b.x + 35, b.y + 10, 18, 9);
  g.lineStyle(2, 0x514f49).lineBetween(
    b.x + b.w - 46,
    b.y + 33,
    b.x + b.w - 46,
    b.y + 8,
  );
  g.lineStyle(1, 0x625e52).lineBetween(
    b.x + b.w - 59,
    b.y + 13,
    b.x + b.w - 33,
    b.y + 13,
  );
  for (let i = 0; i < 4; i++)
    g.lineBetween(
      b.x + b.w - 57 + i * 7,
      b.y + 9,
      b.x + b.w - 57 + i * 7,
      b.y + 17,
    );
  // Faded plaster is subtle; these homes are inhabited and looked after.
  for (let i = 0; i < 45; i++) {
    const x = random.between(b.x + 13, b.x + b.w - 18);
    const y = random.between(b.y + roofH + 8, b.y + b.h - 10);
    g.fillStyle(random.pick([0x8b8069, 0xeee0bf]), 0.17).fillRect(
      x,
      y,
      random.between(3, 12),
      random.between(2, 5),
    );
  }
  for (let floor = 0; floor < floors; floor++) {
    const y = b.y + roofH + 13 + floor * storeyH;
    g.fillStyle(0xb2a58b).fillRect(b.x + 10, y + 34, b.w - 21, 15);
    g.fillStyle(0x817c69, 0.65).fillRect(b.x + 10, y + 46, b.w - 21, 4);
    for (let x = b.x + 23; x < b.x + b.w - 34; x += 55) {
      if (Math.abs(x + 13 - centre) < 33) continue;
      window(
        g,
        x,
        y,
        random.frac() > 0.82,
        random.pick([0xb6bdad, 0xd5c799, 0xb9927c]),
      );
    }
    // The central open stairwell joins each gallery, with readable treads.
    g.fillStyle(0x6e7166).fillRect(centre - 20, y - 1, 40, storeyH - 3);
    g.fillStyle(0x8c8b76).fillRect(centre - 17, y + 2, 34, storeyH - 10);
    for (let i = 0; i < 6; i++) {
      const stepX = floor % 2 ? centre - 16 + i * 3 : centre + 1 - i * 3;
      g.fillStyle(i % 2 ? 0xc4b99d : 0xaaa38b).fillRect(
        stepX,
        y + 5 + i * 6,
        15,
        4,
      );
    }
    g.lineStyle(2, 0x4c5b52).lineBetween(
      centre - 16,
      y + 36,
      centre + 15,
      y + 5,
    );
    g.lineStyle(2, 0x566257);
    for (const gallery of [
      { x: b.x + 11, w: centre - b.x - 34 },
      { x: centre + 23, w: b.x + b.w - centre - 36 },
    ]) {
      g.lineBetween(gallery.x, y + 30, gallery.x + gallery.w, y + 30);
      g.lineBetween(gallery.x, y + 44, gallery.x + gallery.w, y + 44);
      for (let x = gallery.x; x <= gallery.x + gallery.w; x += 12)
        g.lineBetween(x, y + 30, x, y + 44);
    }
    if (floor !== 1 || index % 2 === 0) {
      const clothesX = floor % 2 ? centre + 38 : b.x + 28;
      g.lineStyle(1, 0x605c4d).lineBetween(
        clothesX - 5,
        y + 30,
        clothesX + 73,
        y + 30,
      );
      laundry(
        g,
        clothesX,
        y + 31,
        [0xb96158, 0xdeb957, 0x719696][(index + floor) % 3],
      );
      laundry(g, clothesX + 24, y + 31, 0xe3d8bc, true);
      laundry(g, clothesX + 52, y + 31, 0x789690);
    }
  }
  // Downpipes, entrance recess and concrete front steps.
  g.fillStyle(0x7f8270)
    .fillRect(b.x + 13, b.y + roofH + 7, 3, b.h - roofH - 10)
    .fillRect(b.x + b.w - 19, b.y + roofH + 7, 3, b.h - roofH - 10);
  g.fillStyle(0x4c5c52).fillRect(centre - 18, b.y + b.h - 25, 36, 25);
  g.fillStyle(0x8b9180).fillRect(centre - 15, b.y + b.h - 23, 29, 23);
  g.fillStyle(0x3e514b).fillRect(centre - 11, b.y + b.h - 19, 10, 19);
  g.fillStyle(0xdad0b5).fillRect(centre + 4, b.y + b.h - 17, 5, 3);
  for (let i = 0; i < 4; i++)
    g.fillStyle(i % 2 ? 0xa89f87 : 0xd8ceb1).fillRect(
      centre - 24,
      b.y + b.h + i * 4,
      48,
      4,
    );
  sign(scene, centre, b.y + roofH - 9, b.name, 11);
  // A small cared-for planter beside each entrance sits against the building.
  g.fillStyle(0x9c7758).fillRect(b.x + 25, b.y + b.h - 16, 29, 13);
  g.fillStyle(0x587758).fillRect(b.x + 23, b.y + b.h - 21, 33, 7);
  g.fillStyle(0x86a071)
    .fillRect(b.x + 28, b.y + b.h - 25, 8, 6)
    .fillRect(b.x + 42, b.y + b.h - 24, 9, 6);
}

function drawShop(
  scene: Phaser.Scene,
  g: Graphics,
  b: Building,
  takeaway: boolean,
) {
  g.fillStyle(0x3b4d44, 0.24).fillRect(b.x + 10, b.y + 12, b.w, b.h);
  g.fillStyle(0x877361).fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
  g.fillStyle(b.color).fillRect(b.x, b.y, b.w, b.h);
  g.fillStyle(0x958674).fillRect(b.x, b.y, b.w, 41);
  g.fillStyle(0xb0a08a).fillRect(b.x + 3, b.y + 3, b.w - 6, 12);
  g.lineStyle(1, 0x6f7165, 0.5);
  for (let x = b.x + 5; x < b.x + b.w; x += 8)
    g.lineBetween(x, b.y + 17, x, b.y + 38);
  g.fillStyle(0x6a6959).fillRect(b.x - 3, b.y + 38, b.w + 6, 6);
  const shopY = b.y + 65;
  const doorX = b.x + b.w / 2 - 13;
  g.fillStyle(0x385358)
    .fillRect(b.x + 21, shopY, 82, b.h - 76)
    .fillRect(b.x + b.w - 109, shopY, 84, b.h - 76);
  g.fillStyle(0x7e9a94)
    .fillRect(b.x + 24, shopY + 3, 76, 6)
    .fillRect(b.x + b.w - 106, shopY + 3, 78, 6);
  g.fillStyle(0xe4ce9c)
    .fillRect(b.x + 45, shopY + 14, 34, 15)
    .fillRect(b.x + b.w - 88, shopY + 14, 34, 15);
  g.fillStyle(0x57725f).fillRect(doorX - 4, shopY - 1, 35, b.h - 64);
  g.fillStyle(0x293f3e).fillRect(doorX, shopY + 3, 27, b.h - 68);
  g.fillStyle(0xb3c4b3).fillRect(doorX + 3, shopY + 7, 20, 22);
  g.fillStyle(0xebd6a9).fillRect(doorX + 21, shopY + 32, 2, 5);
  g.fillStyle(0xddd2b6)
    .fillRect(b.x + 17, b.y + b.h - 9, 88, 5)
    .fillRect(b.x + b.w - 112, b.y + b.h - 9, 91, 5);
  // Fabric awning gives the corner shop a different silhouette from a flat.
  for (let i = 0; i < b.w - 16; i += 18) {
    const stripeW = Math.min(18, b.w - 16 - i);
    g.fillStyle(
      Math.floor(i / 18) % 2 ? 0xe7d9b5 : takeaway ? 0x49776b : 0xac5850,
    ).fillRect(b.x + 8 + i, b.y + 50, stripeW, 16);
    g.fillStyle(
      Math.floor(i / 18) % 2 ? 0xc7b896 : takeaway ? 0x355e55 : 0x864b45,
    ).fillRect(b.x + 8 + i, b.y + 65, stripeW, 6);
  }
  g.fillStyle(0x2a443b, 0.17).fillRect(b.x + 10, b.y + 71, b.w - 20, 9);
  // Crates and bread on the sill use no branded packaging or external art.
  for (let i = 0; i < 3; i++) {
    g.fillStyle(0x916a45).fillRect(b.x + 29 + i * 23, b.y + b.h - 24, 20, 13);
    g.fillStyle(takeaway ? 0xd6ba6e : i % 2 ? 0xbc7950 : 0x94a35a)
      .fillRect(b.x + 32 + i * 23, b.y + b.h - 27, 5, 5)
      .fillRect(b.x + 39 + i * 23, b.y + b.h - 26, 6, 5);
    g.fillStyle(0xbe9261).fillRect(b.x + 30 + i * 23, b.y + b.h - 20, 18, 2);
  }
  sign(scene, b.x + b.w / 2, b.y + 28, b.name, 11);
  g.fillStyle(0xd2c4a1).fillRect(doorX - 6, b.y + b.h, 38, 5);
  g.fillStyle(0xa99a80).fillRect(doorX - 6, b.y + b.h + 5, 38, 4);
}

function drawGarage(scene: Phaser.Scene, g: Graphics, b: Building) {
  g.fillStyle(0x364d47, 0.22).fillRect(b.x + 12, b.y + 14, b.w, b.h);
  g.fillStyle(0x536d68).fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
  g.fillStyle(0x86a098).fillRect(b.x, b.y, b.w, b.h);
  g.fillStyle(0x5f7976).fillRect(b.x, b.y, b.w, 89);
  g.fillStyle(0x87a29a).fillRect(b.x + 3, b.y + 3, b.w - 6, 28);
  g.lineStyle(2, 0xa9b9a6, 0.35);
  for (let x = b.x + 8; x < b.x + b.w; x += 10)
    g.lineBetween(x, b.y + 3, x, b.y + 85);
  g.fillStyle(0x3b5753).fillRect(b.x - 3, b.y + 85, b.w + 6, 8);
  g.fillStyle(0x35504a).fillRect(b.x + 25, b.y + 106, b.w - 50, b.h - 106);
  g.fillStyle(0x39453f).fillRect(b.x + 31, b.y + 117, b.w - 62, b.h - 117);
  g.fillStyle(0xa8b3a2).fillRect(b.x + 28, b.y + 108, b.w - 56, 16);
  g.lineStyle(1, 0x6c8279);
  for (let y = b.y + 109; y < b.y + 124; y += 4)
    g.lineBetween(b.x + 28, y, b.x + b.w - 28, y);
  g.fillStyle(0x6c7d6e).fillRect(b.x + 44, b.y + 165, 93, 29);
  g.fillStyle(0x92ad8f).fillRect(b.x + 50, b.y + 157, 81, 32);
  g.fillStyle(0x34515b).fillRect(b.x + 60, b.y + 161, 61, 9);
  g.fillStyle(0xd4d3b0)
    .fillRect(b.x + 52, b.y + 186, 15, 3)
    .fillRect(b.x + 115, b.y + 186, 13, 3);
  for (const p of [
    { x: b.x + b.w - 43, y: b.y + 168 },
    { x: b.x + b.w - 43, y: b.y + 187 },
  ]) {
    g.fillStyle(0x253c39).fillRect(p.x - 10, p.y - 8, 21, 15);
    g.fillStyle(0x7f8d78).fillRect(p.x - 5, p.y - 4, 11, 7);
    g.fillStyle(0x344b44).fillRect(p.x - 3, p.y - 2, 7, 3);
  }
  g.fillStyle(0xcbbd9c).fillRect(b.x + 27, b.y + b.h - 3, b.w - 54, 6);
  sign(scene, b.x + b.w / 2, b.y + 74, b.name, 11);
}

function roadContains(x: number, y: number) {
  return ROADS.some(
    (r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h,
  );
}

function drawGround(g: Graphics) {
  const random = new Phaser.Math.RandomDataGenerator(["hanover-ground"]);
  g.fillStyle(0xbcb18c).fillRect(0, 0, WORLD.width, WORLD.height);
  // Soft-edged dry lawns and sandy shared courtyards. Clear footpaths connect
  // their gates; decorative marks never add invisible collision obstacles.
  for (const yard of [
    { x: 86, y: 86, w: 374, h: 435 },
    { x: 728, y: 83, w: 369, h: 512 },
    { x: 1475, y: 101, w: 508, h: 563 },
    { x: 99, y: 965, w: 362, h: 421 },
    { x: 1450, y: 894, w: 521, h: 292 },
    { x: 77, y: 1549, w: 359, h: 176 },
    { x: 2230, y: 840, w: 140, h: 530 },
  ]) {
    g.fillStyle(0x98a178, 0.55).fillRect(yard.x, yard.y, yard.w, yard.h);
    g.fillStyle(0xa7ac81, 0.7).fillRect(
      yard.x + 8,
      yard.y + 8,
      yard.w - 16,
      yard.h - 16,
    );
    for (let i = 0; i < 28; i++)
      g.fillStyle(random.pick([0xb9b18b, 0x909c74, 0xc8bc94]), 0.5).fillRect(
        random.between(yard.x, yard.x + yard.w - 24),
        random.between(yard.y, yard.y + yard.h - 12),
        random.between(8, 30),
        random.between(4, 13),
      );
  }
  for (let i = 0; i < 1600; i++) {
    const x = random.between(0, WORLD.width - 3),
      y = random.between(0, WORLD.height - 3);
    g.fillStyle(random.pick([0x8f956f, 0xd4c89f, 0xa39776]), 0.34).fillRect(
      x,
      y,
      random.between(1, 4),
      2,
    );
  }
  // Pavement slabs are drawn before all road surfaces, keeping intersections
  // joined instead of placing kerbs through the middle of a crossing.
  for (const r of ROADS) {
    g.fillStyle(0xd1c6a9).fillRect(r.x - 24, r.y - 24, r.w + 48, r.h + 48);
    g.lineStyle(1, 0x9c9984, 0.44);
    if (r.w > r.h)
      for (let x = r.x; x < r.x + r.w; x += 38) {
        g.lineBetween(x, r.y - 24, x, r.y);
        g.lineBetween(x, r.y + r.h, x, r.y + r.h + 24);
      }
    else
      for (let y = r.y; y < r.y + r.h; y += 38) {
        g.lineBetween(r.x - 24, y, r.x, y);
        g.lineBetween(r.x + r.w, y, r.x + r.w + 24, y);
      }
  }
  for (const r of ROADS) g.fillStyle(0x58625e).fillRect(r.x, r.y, r.w, r.h);
  // Aggregate grain, repaired patches and drainage, rather than a flat road.
  for (let i = 0; i < 1150; i++) {
    const x = random.between(0, WORLD.width - 3),
      y = random.between(0, WORLD.height - 3);
    if (roadContains(x, y))
      g.fillStyle(random.pick([0x859087, 0x3f4c49]), 0.26).fillRect(
        x,
        y,
        random.between(1, 4),
        1,
      );
  }
  for (const patch of [
    { x: 221, y: 759, w: 55, h: 24 },
    { x: 1170, y: 990, w: 51, h: 18 },
    { x: 535, y: 1130, w: 34, h: 58 },
    { x: 1660, y: 1440, w: 72, h: 25 },
    { x: 2040, y: 310, w: 32, h: 56 },
  ]) {
    g.fillStyle(0x4e5854).fillRect(patch.x, patch.y, patch.w, patch.h);
    g.lineStyle(1, 0x707c72, 0.4).strokeRect(
      patch.x,
      patch.y,
      patch.w,
      patch.h,
    );
  }
  // Centre dashes stop before the junctions; South African kerb markings are
  // understated and the open street route remains easy to read.
  for (const r of ROADS) {
    g.lineStyle(2, 0xe6d6a5, 0.75);
    if (r.w > r.h) {
      for (let x = 20; x < r.w - 25; x += 75)
        if (
          !ROADS.some(
            (s) => s.w < s.h && x + 34 > s.x - 17 && x < s.x + s.w + 17,
          )
        )
          g.lineBetween(x, r.y + r.h / 2, x + 33, r.y + r.h / 2);
      for (let x = 0; x < r.w; x += 12) {
        if (roadContains(x, r.y - 4) || roadContains(x, r.y + r.h + 4))
          continue;
        g.fillStyle(0xaba68e)
          .fillRect(x, r.y - 3, 12, 3)
          .fillRect(x, r.y + r.h, 12, 3);
        g.fillStyle(0x4b5751)
          .fillRect(x, r.y, 12, 2)
          .fillRect(x, r.y + r.h - 2, 12, 2);
      }
    } else {
      for (let y = 20; y < r.h - 25; y += 75)
        if (
          !ROADS.some(
            (s) => s.w > s.h && y + 34 > s.y - 17 && y < s.y + s.h + 17,
          )
        )
          g.lineBetween(r.x + r.w / 2, y, r.x + r.w / 2, y + 33);
      for (let y = 0; y < r.h; y += 12) {
        if (roadContains(r.x - 4, y) || roadContains(r.x + r.w + 4, y))
          continue;
        g.fillStyle(0xaba68e)
          .fillRect(r.x - 3, y, 3, 12)
          .fillRect(r.x + r.w, y, 3, 12);
        g.fillStyle(0x4b5751)
          .fillRect(r.x, y, 2, 12)
          .fillRect(r.x + r.w - 2, y, 2, 12);
      }
    }
  }
  // A pair of zebra crossings connect pavements near the community spaces.
  for (const crossing of [
    { x: 1040, y: 710 },
    { x: 1415, y: 1400 },
  ])
    for (let x = crossing.x; x < crossing.x + 63; x += 12)
      g.fillStyle(0xdfd9b8, 0.8).fillRect(x, crossing.y, 7, 120);
  for (const drain of [
    { x: 452, y: 542 },
    { x: 1103, y: 998 },
    { x: 1390, y: 1355 },
    { x: 1958, y: 1035 },
  ]) {
    g.fillStyle(0x667266).fillRect(drain.x, drain.y, 18, 11);
    g.lineStyle(1, 0x394b42);
    for (let x = drain.x + 3; x < drain.x + 17; x += 3)
      g.lineBetween(x, drain.y + 2, x, drain.y + 9);
  }
}

function drawPitch(scene: Phaser.Scene, g: Graphics, solids: Rect[]) {
  const random = new Phaser.Math.RandomDataGenerator(["community-football"]);
  g.fillStyle(0x7d9872).fillRect(1450, 1230, 470, 480);
  for (let i = 0; i < 8; i++)
    g.fillStyle(i % 2 ? 0x78916c : 0x839b74).fillRect(
      1460,
      1240 + i * 57,
      450,
      57,
    );
  for (let i = 0; i < 95; i++)
    g.fillStyle(random.pick([0x9ea47a, 0x709067, 0xb1ac7c]), 0.38).fillRect(
      random.between(1460, 1890),
      random.between(1240, 1688),
      random.between(4, 22),
      random.between(2, 8),
    );
  g.fillStyle(0xb8af82, 0.6)
    .fillEllipse(1685, 1286, 116, 40)
    .fillEllipse(1685, 1660, 116, 40);
  g.lineStyle(3, 0xe6e4c8, 0.9)
    .strokeRect(1475, 1260, 420, 420)
    .strokeCircle(1685, 1470, 65)
    .lineBetween(1475, 1470, 1895, 1470)
    .strokeRect(1580, 1260, 210, 65)
    .strokeRect(1580, 1615, 210, 65);
  g.fillStyle(0xe6e4c8)
    .fillCircle(1685, 1470, 3)
    .fillCircle(1685, 1306, 3)
    .fillCircle(1685, 1634, 3);
  // Actual goal frames and a small net pattern replace the white rectangles.
  for (const goal of [{ y: 1239 }, { y: 1683 }]) {
    g.fillStyle(0x556951, 0.25).fillRect(1648, goal.y + 4, 82, 18);
    g.lineStyle(1, 0xcbd2b5, 0.7).strokeRect(1645, goal.y, 80, 17);
    for (let x = 1650; x < 1725; x += 8)
      g.lineBetween(x, goal.y, x, goal.y + 17);
    for (let y = goal.y + 5; y < goal.y + 17; y += 5)
      g.lineBetween(1645, y, 1725, y);
    g.lineStyle(3, 0xf1ecd3)
      .lineBetween(1645, goal.y + 17, 1645, goal.y)
      .lineBetween(1645, goal.y, 1725, goal.y)
      .lineBetween(1725, goal.y, 1725, goal.y + 17);
  }
  // The established fence collision boxes and open gate are preserved.
  for (const r of [
    { x: 1440, y: 1220, w: 160, h: 6 },
    { x: 1770, y: 1220, w: 160, h: 6 },
    { x: 1930, y: 1220, w: 6, h: 490 },
  ]) {
    g.fillStyle(0x566b59).fillRect(r.x, r.y, r.w, r.h);
    g.lineStyle(1, 0x9aab88, 0.5);
    if (r.w > r.h) {
      for (let x = r.x; x <= r.x + r.w; x += 16) {
        g.fillStyle(0x526750).fillRect(x - 1, r.y - 9, 3, 17);
        g.lineBetween(x, r.y - 7, Math.min(x + 16, r.x + r.w), r.y + 4);
      }
    } else {
      for (let y = r.y; y <= r.y + r.h; y += 18)
        g.fillStyle(0x526750).fillRect(r.x - 2, y, 10, 3);
    }
    solids.push(r);
  }
  scene.add
    .text(1685, 1727, "THE COMMUNITY PITCH", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#3e5b45",
    })
    .setOrigin(0.5);
  // Benches and ball are small decorative objects outside the playable field.
  for (const x of [1490, 1805]) {
    g.fillStyle(0x77684d)
      .fillRect(x, 1738, 74, 5)
      .fillRect(x + 4, 1746, 66, 6);
    g.fillStyle(0x4f6251)
      .fillRect(x + 5, 1742, 3, 16)
      .fillRect(x + 62, 1742, 3, 16);
  }
  g.fillStyle(0x365748, 0.2).fillEllipse(1810, 1518, 13, 5);
  g.fillStyle(0xe6dfbc).fillCircle(1808, 1513, 5);
  g.fillStyle(0x526554).fillRect(1805, 1511, 3, 3).fillRect(1810, 1515, 2, 2);
}

function drawTree(g: Graphics, x: number, y: number, index: number) {
  g.fillStyle(0x3f4d3a, 0.18)
    .fillRect(x + 5, y - 8, 48, 39)
    .fillRect(x + 12, y + 31, 28, 6);
  g.fillStyle(0x735a40).fillRect(x - 5, y - 4, 10, 28);
  g.fillStyle(0xa38355).fillRect(x - 3, y - 3, 3, 26);
  const color = index % 2 ? 0x5c7b5b : 0x58785b;
  g.fillStyle(0x3f624c)
    .fillRect(x - 18, y - 26, 45, 34)
    .fillRect(x - 28, y - 15, 51, 20);
  g.fillStyle(color)
    .fillRect(x - 25, y - 32, 48, 28)
    .fillRect(x - 15, y - 42, 31, 16)
    .fillRect(x - 33, y - 23, 18, 19);
  g.fillStyle(0x7b9669)
    .fillRect(x - 20, y - 34, 20, 13)
    .fillRect(x - 25, y - 22, 13, 9)
    .fillRect(x + 3, y - 32, 13, 11);
  g.fillStyle(0x94a978)
    .fillRect(x - 16, y - 33, 6, 5)
    .fillRect(x + 5, y - 30, 4, 3);
}

export function drawWorld(scene: Phaser.Scene): Rect[] {
  const g = scene.add.graphics().setDepth(0);
  const solids: Rect[] = BUILDINGS.map((b) => ({ ...b }));
  drawGround(g);
  for (const [index, b] of BUILDINGS.entries()) {
    if (b.name.startsWith("BLOCK")) drawFlat(scene, g, b, index);
    else if (b.name.includes("GARAGE")) drawGarage(scene, g, b);
    else drawShop(scene, g, b, b.name.includes("GATSBY"));
  }
  drawPitch(scene, g, solids);
  // Parking at the rank has two minibuses, while the neighbourhood's other
  // parked cars retain their original locations and collider dimensions.
  g.fillStyle(0x848c7b).fillRect(730, 1190, 320, 175);
  g.fillStyle(0x737d70).fillRect(736, 1196, 308, 162);
  g.lineStyle(2, 0xe0d6af, 0.85);
  for (let i = 0; i < 4; i++) g.strokeRect(774 + i * 65, 1210, 52, 130);
  for (let i = 0; i < 26; i++)
    g.fillStyle(0x9a9d83, 0.45).fillRect(
      739 + ((i * 53) % 303),
      1200 + ((i * 37) % 151),
      4,
      2,
    );
  sign(scene, 888, 1173, "TAXI RANK · MINIBUS TAXIS", 11);
  // A rank shelter stays inside the lot, away from Jerome and the streets.
  g.fillStyle(0x435b50, 0.2).fillRect(758, 1192, 155, 12);
  g.fillStyle(0x54746a).fillRect(746, 1187, 169, 8);
  g.fillStyle(0x92a18b).fillRect(746, 1187, 169, 2);
  g.fillStyle(0x4b5f53).fillRect(751, 1190, 3, 17).fillRect(907, 1190, 3, 17);
  for (const pos of [
    { x: 800, y: 1270, taxi: true },
    { x: 930, y: 1270, taxi: true },
    { x: 2110, y: 1050, taxi: false },
    { x: 610, y: 350, taxi: false },
  ]) {
    const sprite = scene.add
      .sprite(pos.x, pos.y, pos.taxi ? "taxi" : "car")
      .setDepth(20);
    if (!pos.taxi) sprite.setTint(pos.x > 2000 ? 0xdec4a7 : 0xc2cfb5);
    solids.push({ x: pos.x - 19, y: pos.y - 32, w: 38, h: 64 });
  }
  for (const [index, pos] of [
    { x: 90, y: 520 },
    { x: 1100, y: 510 },
    { x: 1480, y: 600 },
    { x: 2240, y: 440 },
    { x: 400, y: 1510 },
    { x: 2250, y: 1630 },
    { x: 1410, y: 1050 },
  ].entries()) {
    drawTree(g, pos.x, pos.y, index);
    solids.push({ x: pos.x - 10, y: pos.y - 9, w: 20, h: 32 });
  }
  // Streetlights cast small afternoon shadows rather than a night-time glow.
  for (let x = 470; x < 2300; x += 350) {
    g.fillStyle(0x5b665c, 0.2).fillRect(x + 6, 666, 20, 3);
    g.fillStyle(0x5b6a60).fillRect(x, 651, 4, 34);
    g.fillStyle(0x93a08c).fillRect(x, 651, 1, 32);
    g.fillStyle(0x5c6f60).fillRect(x - 5, 649, 17, 5);
    g.fillStyle(0xe4d8a7).fillRect(x - 3, 650, 11, 2);
  }
  // Wheelie bins and paving rest beside façades, avoiding all existing routes.
  for (const p of [
    { x: 171, y: 473 },
    { x: 1018, y: 489 },
    { x: 1601, y: 1173 },
    { x: 444, y: 1380 },
  ]) {
    g.fillStyle(0x4e6757).fillRect(p.x, p.y, 13, 17);
    g.fillStyle(0x728775).fillRect(p.x - 1, p.y - 2, 15, 4);
    g.fillStyle(0x2e443a)
      .fillRect(p.x + 2, p.y + 16, 3, 3)
      .fillRect(p.x + 9, p.y + 16, 3, 3);
  }
  // A noticeboard is community scenery, with fictional notices kept readable
  // as shapes instead of invented real organisations or precise addresses.
  g.fillStyle(0x776348).fillRect(91, 973, 75, 53);
  g.fillStyle(0x425e50).fillRect(94, 976, 69, 45);
  g.fillStyle(0xddcc9d).fillRect(100, 982, 21, 26);
  g.fillStyle(0xb7c2aa).fillRect(127, 982, 29, 17);
  g.fillStyle(0xc5946a).fillRect(130, 1003, 25, 12);
  g.lineStyle(1, 0x677864)
    .lineBetween(105, 989, 115, 989)
    .lineBetween(105, 994, 115, 994)
    .lineBetween(132, 987, 151, 987);
  g.fillStyle(0x6e664d).fillRect(99, 1026, 4, 14).fillRect(153, 1026, 4, 14);
  scene.add.text(90, 865, "HANOVER PARK", {
    fontFamily: "monospace",
    fontSize: "25px",
    color: "#536f57",
  });
  scene.add.text(93, 900, "STREETS OF THE FLATS", {
    fontFamily: "monospace",
    fontSize: "12px",
    color: "#64785d",
  });
  scene.add.text(95, 953, "COMMUNITY NOTICES", {
    fontFamily: "monospace",
    fontSize: "9px",
    color: "#425b46",
  });
  return solids;
}
