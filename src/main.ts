import Phaser from "phaser";
import "./style.css";
import { Neighbourhood } from "./game/scenes/neighbourhood";
new Phaser.Game({
  type: Phaser.CANVAS,
  parent: "game",
  backgroundColor: "#b7ac83",
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight - 56,
  },
  scene: [Neighbourhood],
  input: { keyboard: true },
  render: { antialias: false },
});
