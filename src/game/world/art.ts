import Phaser from "phaser";
export function createArt(scene: Phaser.Scene) {
  const g = scene.make.graphics({ x: 0, y: 0 });
  for (const [prefix, shirt] of [
    ["person", 0xf6c65b],
    ["fatima", 0xc8685b],
    ["gatie", 0x739a9b],
    ["jerome", 0xe6b952],
    ["walker0", 0xa67262],
    ["walker1", 0x89aeb0],
    ["walker2", 0xd1bd91],
  ] as const)
    for (const direction of ["up", "down", "left", "right"])
      for (let frame = 0; frame < 2; frame++) {
        g.clear();
        g.fillStyle(0x162c2d, 0.25).fillEllipse(16, 29, 24, 7);
        g.fillStyle(0x24363c)
          .fillRect(10 + frame * 2, 23, 5, 7)
          .fillRect(18 - frame * 2, 23, 5, 7);
        g.fillStyle(shirt).fillRect(9, 12, 15, 13);
        g.fillStyle(0xa97450)
          .fillRect(6, 14, 3, 10)
          .fillRect(24, 14, 3, 10)
          .fillRect(11, 4, 11, 10);
        g.fillStyle(0x283132).fillRect(10, 2, 13, 5);
        if (direction !== "up") {
          g.fillStyle(0x172d2c).fillRect(
            direction === "left" ? 11 : direction === "right" ? 20 : 12,
            8,
            2,
            2,
          );
          if (direction === "down") g.fillRect(19, 8, 2, 2);
        }
        g.generateTexture(`${prefix}-${direction}-${frame}`, 32, 34);
      }
  g.clear();
  g.fillStyle(0x183e3a).fillRoundedRect(3, 2, 30, 58, 5);
  g.fillStyle(0x86bda1).fillRect(6, 6, 24, 47);
  g.fillStyle(0x274b53).fillRect(8, 14, 20, 12).fillRect(8, 40, 20, 7);
  g.fillStyle(0xb9d4bd).fillRect(8, 28, 20, 10);
  g.fillStyle(0x102a2b)
    .fillRect(0, 10, 4, 12)
    .fillRect(32, 10, 4, 12)
    .fillRect(0, 40, 4, 12)
    .fillRect(32, 40, 4, 12);
  g.fillStyle(0xffe8a0).fillRect(5, 3, 7, 3).fillRect(24, 3, 7, 3);
  g.fillStyle(0xc46045).fillRect(5, 55, 7, 3).fillRect(24, 55, 7, 3);
  g.generateTexture("car", 36, 62);
  g.destroy();
}
