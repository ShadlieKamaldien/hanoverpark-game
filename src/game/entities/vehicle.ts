import Phaser from "phaser";
import { Collision } from "../systems/collision";
export class Vehicle {
  sprite: Phaser.GameObjects.Sprite;
  speed = 0;
  angle = 0;
  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.add.sprite(x, y, "car").setDepth(29);
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
  update(throttle: number, steer: number, dt: number, collision: Collision) {
    if (throttle)
      this.speed = Phaser.Math.Clamp(
        this.speed + throttle * 220 * dt,
        -115,
        340,
      );
    else this.speed *= Math.pow(0.14, dt);
    this.angle +=
      steer *
      Math.min(Math.abs(this.speed) / 100, 1) *
      2.15 *
      dt *
      Math.sign(this.speed);
    if (
      collision.move(
        this,
        Math.sin(this.angle) * this.speed * dt,
        -Math.cos(this.angle) * this.speed * dt,
        32,
      )
    )
      this.speed *= -0.18;
    this.sprite.rotation = this.angle;
  }
  exitPosition(collision: Collision) {
    for (const offset of [Math.PI / 2, -Math.PI / 2, Math.PI, 0]) {
      const x = this.x + Math.sin(this.angle + offset) * 52,
        y = this.y - Math.cos(this.angle + offset) * 52;
      if (!collision.blocked(x, y, 12)) return { x, y };
    }
    return null;
  }
}
