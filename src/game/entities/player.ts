import Phaser from "phaser";
import { Collision } from "../systems/collision";
export class Player {
  sprite: Phaser.GameObjects.Sprite;
  stamina = 100;
  health = 100;
  facing = "down";
  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.add.sprite(x, y, "person-down-0").setDepth(30);
  }
  get x() {
    return this.sprite.x;
  }
  set x(v: number) {
    this.sprite.x = v;
  }
  get y() {
    return this.sprite.y;
  }
  set y(v: number) {
    this.sprite.y = v;
  }
  update(
    dx: number,
    dy: number,
    sprint: boolean,
    dt: number,
    time: number,
    collision: Collision,
  ) {
    const moving = dx !== 0 || dy !== 0;
    const fast = sprint && moving && this.stamina > 2;
    this.stamina = Phaser.Math.Clamp(
      this.stamina + (fast ? -28 : 19) * dt,
      0,
      100,
    );
    const length = Math.hypot(dx, dy) || 1;
    collision.move(
      this,
      (dx / length) * (fast ? 225 : 130) * dt,
      (dy / length) * (fast ? 225 : 130) * dt,
      10,
    );
    if (moving)
      this.facing =
        Math.abs(dx) > Math.abs(dy)
          ? dx > 0
            ? "right"
            : "left"
          : dy > 0
            ? "down"
            : "up";
    this.sprite.setTexture(
      `person-${this.facing}-${moving ? Math.floor(time / 140) % 2 : 0}`,
    );
    this.sprite.setDepth(30 + this.y / 10000);
  }
}
