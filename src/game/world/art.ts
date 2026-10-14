import Phaser from "phaser";

// Original sprites use fixed palettes so people stay legible against the scenery.
export function createArt(scene: Phaser.Scene) {
  const g = scene.make.graphics({ x: 0, y: 0 });
  const people = [
    {
      prefix: "person",
      shirt: 0xefbd55,
      shade: 0xc58a3f,
      skin: 0xb9835d,
      hair: 0x273331,
      style: "hair",
    },
    {
      prefix: "fatima",
      shirt: 0xc56d63,
      shade: 0x9c4f4e,
      skin: 0xb77a55,
      hair: 0xe8d8b9,
      style: "scarf",
    },
    {
      prefix: "gatie",
      shirt: 0x7ba5a2,
      shade: 0x537e7d,
      skin: 0x9d6748,
      hair: 0x37505c,
      style: "cap",
    },
    {
      prefix: "jerome",
      shirt: 0xe6b64a,
      shade: 0xbb8933,
      skin: 0xa6734f,
      hair: 0x242c2d,
      style: "hair",
    },
    {
      prefix: "walker0",
      shirt: 0xa97569,
      shade: 0x855b55,
      skin: 0xc18b66,
      hair: 0x303131,
      style: "hair",
    },
    {
      prefix: "walker1",
      shirt: 0x83abad,
      shade: 0x5c8489,
      skin: 0x855b43,
      hair: 0x343c34,
      style: "cap",
    },
    {
      prefix: "walker2",
      shirt: 0xcdbb96,
      shade: 0xa79473,
      skin: 0xb78059,
      hair: 0x5c4334,
      style: "hair",
    },
  ];
  for (const p of people)
    for (const direction of ["up", "down", "left", "right"])
      for (let frame = 0; frame < 2; frame++) {
        g.clear();
        const side = direction === "left" || direction === "right";
        const facingRight = direction === "right";
        const stride = frame === 0 ? 0 : 2;
        g.fillStyle(0x203b37, 0.22)
          .fillRect(7, 29, 21, 3)
          .fillRect(10, 32, 14, 1);
        g.fillStyle(0x293c45)
          .fillRect(10 + stride, 23, 5, 7)
          .fillRect(18 - stride, 23, 5, 7);
        g.fillStyle(0x1c2b31)
          .fillRect(9 + stride, 29, 7, 3)
          .fillRect(18 - stride, 29, 7, 3);
        g.fillStyle(0x78918b)
          .fillRect(10 + stride, 30, 5, 1)
          .fillRect(19 - stride, 30, 4, 1);
        g.fillStyle(p.shade).fillRect(side ? 11 : 9, 13, side ? 12 : 16, 12);
        g.fillStyle(p.shirt).fillRect(side ? 12 : 10, 12, side ? 9 : 13, 10);
        g.fillStyle(0xf8deb0, 0.35).fillRect(
          side ? 13 : 11,
          13,
          side ? 3 : 8,
          2,
        );
        g.fillStyle(p.skin)
          .fillRect(
            side ? (facingRight ? 17 : 9) : 7,
            16 + stride,
            3,
            8 - stride,
          )
          .fillRect(
            side ? (facingRight ? 21 : 13) : 24,
            16 - stride,
            3,
            7 + stride,
          )
          .fillRect(side ? 12 : 11, 5, side ? 10 : 11, 9);
        g.fillStyle(p.shade).fillRect(side ? 15 : 13, 12, 5, 2);
        g.fillStyle(p.skin).fillRect(side ? 15 : 13, 10, 5, 3);
        if (side) g.fillStyle(p.skin).fillRect(facingRight ? 22 : 10, 8, 2, 3);
        g.fillStyle(p.hair)
          .fillRect(10, 3, 13, 5)
          .fillRect(direction === "left" ? 19 : 10, 7, 3, 4);
        if (direction === "up") g.fillRect(11, 6, 11, 5);
        if (p.style === "scarf") {
          g.fillRect(9, 4, 2, 11).fillRect(22, 4, 2, 11).fillRect(9, 13, 5, 4);
          g.fillStyle(0xc8b899).fillRect(10, 3, 11, 2).fillRect(9, 13, 2, 4);
        } else if (p.style === "cap") {
          g.fillRect(facingRight ? 20 : 8, 6, 7, 2);
          g.fillStyle(0x64807c).fillRect(13, 3, 7, 1);
        } else {
          g.fillStyle(0x4b4940).fillRect(12, 3, 7, 1);
        }
        if (direction !== "up") {
          g.fillStyle(0x253231).fillRect(
            direction === "left" ? 11 : direction === "right" ? 20 : 12,
            8,
            2,
            2,
          );
          if (direction === "down") g.fillRect(19, 8, 2, 2);
          g.fillStyle(0x794e3e).fillRect(
            side ? (facingRight ? 20 : 11) : 15,
            11,
            side ? 2 : 4,
            1,
          );
        }
        g.generateTexture(`${p.prefix}-${direction}-${frame}`, 32, 34);
      }

  // The playable hatchback keeps its 36 × 62 size for vehicle calculations.
  g.clear();
  g.fillStyle(0x213a36, 0.28).fillRect(4, 6, 31, 56);
  g.fillStyle(0x172f33)
    .fillRect(0, 11, 4, 12)
    .fillRect(32, 11, 4, 12)
    .fillRect(0, 41, 4, 12)
    .fillRect(32, 41, 4, 12);
  g.fillStyle(0x365a51).fillRect(5, 2, 26, 58).fillRect(3, 6, 30, 49);
  g.fillStyle(0x8abda8).fillRect(6, 5, 24, 51);
  g.fillStyle(0xafcfb7).fillRect(7, 5, 21, 9);
  g.fillStyle(0xd3e1be).fillRect(8, 5, 19, 2);
  g.fillStyle(0x355461).fillRect(8, 15, 20, 12).fillRect(8, 43, 20, 7);
  g.fillStyle(0x6c8c93).fillRect(9, 16, 18, 3).fillRect(10, 44, 16, 1);
  g.fillStyle(0xc1d6b9).fillRect(8, 28, 20, 13);
  g.fillStyle(0x9fbea7).fillRect(8, 38, 20, 3);
  g.fillStyle(0xdce4c7).fillRect(9, 29, 18, 2);
  g.fillStyle(0x53756d).fillRect(5, 16, 2, 34).fillRect(29, 16, 2, 34);
  g.fillStyle(0x253b3a).fillRect(1, 20, 5, 3).fillRect(30, 20, 5, 3);
  g.fillStyle(0xeddb9b).fillRect(5, 4, 7, 3).fillRect(24, 4, 7, 3);
  g.fillStyle(0xba654e).fillRect(5, 55, 7, 3).fillRect(24, 55, 7, 3);
  g.fillStyle(0x304748).fillRect(7, 59, 22, 2).fillRect(13, 53, 10, 3);
  g.fillStyle(0xf0e5c9).fillRect(14, 54, 8, 2);
  g.generateTexture("car", 36, 62);

  // Original unbranded minibus, sized to the existing parked-vehicle footprint.
  g.clear();
  g.fillStyle(0x263b38, 0.28).fillRect(5, 4, 32, 60);
  g.fillStyle(0x293333)
    .fillRect(0, 10, 4, 13)
    .fillRect(34, 10, 4, 13)
    .fillRect(0, 44, 4, 12)
    .fillRect(34, 44, 4, 12);
  g.fillStyle(0x8b958d).fillRect(4, 1, 30, 61);
  g.fillStyle(0xe8e6d2).fillRect(5, 3, 28, 56);
  g.fillStyle(0xf8f1d8).fillRect(7, 4, 24, 7);
  g.fillStyle(0x35525b).fillRect(7, 12, 24, 10).fillRect(7, 51, 24, 6);
  g.fillStyle(0x718c91).fillRect(8, 13, 22, 2);
  g.fillStyle(0xf3efd9).fillRect(9, 24, 20, 25);
  g.fillStyle(0xbcc8b4).fillRect(11, 24, 2, 25).fillRect(26, 24, 2, 25);
  g.fillStyle(0x396a71).fillRect(5, 24, 3, 24).fillRect(30, 24, 3, 24);
  g.fillStyle(0xe0b34d).fillRect(5, 45, 3, 5).fillRect(30, 45, 3, 5);
  g.fillStyle(0x91afaa).fillRect(5, 24, 3, 2).fillRect(30, 24, 3, 2);
  for (let y = 30; y < 46; y += 7)
    g.fillStyle(0xf2ead0).fillRect(5, y, 3, 2).fillRect(30, y, 3, 2);
  g.fillStyle(0x293e41)
    .fillRect(0, 17, 5, 3)
    .fillRect(33, 17, 5, 3)
    .fillRect(6, 59, 26, 3);
  g.fillStyle(0xf8d98b).fillRect(6, 5, 5, 2).fillRect(27, 5, 5, 2);
  g.fillStyle(0xb85d48).fillRect(5, 58, 5, 3).fillRect(28, 58, 5, 3);
  g.fillStyle(0xf1e7ca).fillRect(15, 59, 8, 2);
  g.generateTexture("taxi", 38, 64);
  g.destroy();
}
