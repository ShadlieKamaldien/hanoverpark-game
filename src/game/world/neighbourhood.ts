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
export function drawWorld(scene: Phaser.Scene): Rect[] {
  const g = scene.add.graphics().setDepth(0);
  const solids: Rect[] = BUILDINGS.map((b) => ({ ...b }));
  g.fillStyle(0xb7ac83).fillRect(0, 0, WORLD.width, WORLD.height);
  // Pavements and the three connecting streets.
  for (const r of [
    { x: 0, y: 700, w: 2400, h: 140 },
    { x: 0, y: 1390, w: 2400, h: 140 },
    { x: 480, y: 0, w: 220, h: 1800 },
    { x: 1130, y: 0, w: 250, h: 1800 },
    { x: 2000, y: 0, w: 190, h: 1800 },
  ]) {
    g.fillStyle(0xd8caae).fillRect(r.x - 24, r.y - 24, r.w + 48, r.h + 48);
    g.fillStyle(0x535c58).fillRect(r.x, r.y, r.w, r.h);
    g.lineStyle(2, 0xe2cc8d, 0.65);
    if (r.w > r.h)
      for (let x = 0; x < r.w; x += 75)
        g.lineBetween(x, r.y + r.h / 2, x + 33, r.y + r.h / 2);
    else
      for (let y = 0; y < r.h; y += 75)
        g.lineBetween(r.x + r.w / 2, y, r.x + r.w / 2, y + 33);
  }
  // Soil and sparse original ground detail, seeded for repeatable scenery.
  const random = new Phaser.Math.RandomDataGenerator(["flats"]);
  for (let i = 0; i < 700; i++) {
    g.fillStyle(random.pick([0xa99d76, 0xc5b994]), 0.5).fillRect(
      random.between(0, 2400),
      random.between(0, 1800),
      3,
      3,
    );
  }
  for (const b of BUILDINGS) {
    g.fillStyle(0x33463c, 0.24).fillRect(b.x + 12, b.y + 16, b.w, b.h);
    g.fillStyle(0x776f5f).fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
    g.fillStyle(b.color).fillRect(b.x, b.y, b.w, b.h);
    g.fillStyle(0xe0d2b5).fillRect(b.x + 8, b.y + 8, b.w - 16, 12);
    for (let y = b.y + 40; y < b.y + b.h - 35; y += 64) {
      for (let x = b.x + 20; x < b.x + b.w - 25; x += 55) {
        g.fillStyle(0x526b68).fillRect(x, y, 25, 28);
        g.fillStyle(0xd4c9af).fillRect(x + 11, y, 3, 28);
        g.fillStyle(0x827c6b).fillRect(x - 5, y + 30, 35, 7);
        g.lineStyle(2, 0x595b50).strokeRect(x - 5, y + 21, 35, 16);
      }
      g.fillStyle(0x9c947d).fillRect(b.x + 8, y + 42, b.w - 16, 8);
    }
    g.fillStyle(0x746d5e).fillRect(b.x + b.w / 2 - 18, b.y + b.h - 26, 36, 26);
    for (let i = 0; i < 4; i++)
      g.fillStyle(i % 2 ? 0xaaa38b : 0xddd0af).fillRect(
        b.x + b.w / 2 - 23,
        b.y + b.h + i * 5,
        46,
        4,
      );
    scene.add
      .text(b.x + b.w / 2, b.y + 22, b.name, {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#faf0d5",
        backgroundColor: "#345d54",
        padding: { x: 9, y: 5 },
      })
      .setOrigin(0.5)
      .setDepth(1);
    // Washing line, vivid laundry and building-side stair detailing.
    g.lineStyle(1, 0x655c4b).lineBetween(
      b.x + 12,
      b.y + b.h - 40,
      b.x + b.w - 12,
      b.y + b.h - 40,
    );
    for (let i = 0; i < 6; i++)
      g.fillStyle([0xcd7966, 0xe1c45d, 0x709a9b][i % 3]).fillRect(
        b.x + 22 + i * 37,
        b.y + b.h - 39,
        16,
        14,
      );
  }
  // Soccer field.
  g.fillStyle(0x6f9473).fillRect(1450, 1230, 470, 480);
  g.lineStyle(3, 0xdadbc0)
    .strokeRect(1475, 1260, 420, 420)
    .strokeCircle(1685, 1470, 65)
    .lineBetween(1475, 1470, 1895, 1470)
    .strokeRect(1580, 1260, 210, 65)
    .strokeRect(1580, 1615, 210, 65);
  g.fillStyle(0xece2c7).fillRect(1645, 1248, 80, 8).fillRect(1645, 1684, 80, 8);
  scene.add
    .text(1685, 1720, "THE COMMUNITY PITCH", {
      fontFamily: "monospace",
      fontSize: "13px",
      color: "#334f41",
    })
    .setOrigin(0.5);
  // Fence segments leave gates open.
  for (const r of [
    { x: 1440, y: 1220, w: 160, h: 6 },
    { x: 1770, y: 1220, w: 160, h: 6 },
    { x: 1930, y: 1220, w: 6, h: 490 },
  ]) {
    g.fillStyle(0x566b59).fillRect(r.x, r.y, r.w, r.h);
    solids.push(r);
  }
  // Taxi rank and parking bays.
  g.fillStyle(0x7a8172).fillRect(730, 1190, 320, 175);
  g.lineStyle(2, 0xddcfa7);
  for (let i = 0; i < 4; i++) g.strokeRect(750 + i * 70, 1210, 52, 130);
  scene.add.text(745, 1170, "TAXI RANK  /  CAPE TOWN", {
    fontFamily: "monospace",
    fontSize: "14px",
    color: "#3c594e",
  });
  for (const pos of [
    { x: 800, y: 1270 },
    { x: 930, y: 1270 },
    { x: 2110, y: 1050 },
    { x: 610, y: 350 },
  ]) {
    scene.add.sprite(pos.x, pos.y, "car").setTint(0xe6d2aa).setDepth(20);
    solids.push({ x: pos.x - 19, y: pos.y - 32, w: 38, h: 64 });
  }
  for (const pos of [
    { x: 90, y: 520 },
    { x: 1100, y: 510 },
    { x: 1480, y: 600 },
    { x: 2240, y: 440 },
    { x: 400, y: 1510 },
    { x: 2250, y: 1630 },
    { x: 1410, y: 1050 },
  ]) {
    g.fillStyle(0x334839, 0.2).fillEllipse(pos.x + 7, pos.y + 9, 75, 50);
    g.fillStyle(0x7a6148).fillRect(pos.x - 5, pos.y, 10, 25);
    g.fillStyle(0x52735b).fillCircle(pos.x, pos.y - 10, 30);
    g.fillStyle(0x76916b).fillCircle(pos.x - 9, pos.y - 20, 21);
    solids.push({ x: pos.x - 10, y: pos.y - 9, w: 20, h: 32 });
  }
  for (let x = 470; x < 2300; x += 350) {
    g.fillStyle(0x5b665c).fillRect(x, 655, 5, 31);
    g.fillStyle(0xe9cf82).fillRect(x - 6, 651, 18, 7);
  }
  scene.add.text(90, 865, "HANOVER PARK", {
    fontFamily: "monospace",
    fontSize: "25px",
    color: "#67775d",
  });
  scene.add.text(93, 900, "STREETS OF THE FLATS", {
    fontFamily: "monospace",
    fontSize: "12px",
    color: "#67775d",
  });
  return solids;
}
