import { SOURCE, PREVIEW } from "./map";
import type { MapPoint, MapFootprint } from "../game/world/mapData";
import { PLACES } from "./places";

interface MapView {
  canvas: HTMLCanvasElement;
  base: HTMLCanvasElement;
  scale: number;
  x: number;
  y: number;
  minX: number;
  minY: number;
}
interface MapActors {
  player: MapPoint;
  people: readonly MapPoint[];
  traffic: readonly MapPoint[];
  car: MapPoint;
  objective: MapPoint | null;
}
const STORE_COLOUR = "#8ed6ce";
const GOLD = "#edbd59";

/** Bounded, cached canvases use the same north-up source coordinates as the world. */
export class NeighbourhoodMaps {
  private readonly small: MapView;
  private readonly large: MapView;

  constructor(minimap: HTMLCanvasElement, areaMap: HTMLCanvasElement, properties: readonly MapPoint[][]) {
    this.small = this.create(minimap, false, properties);
    this.large = this.create(areaMap, true, properties);
  }

  draw(actors: MapActors, expanded: boolean) {
    this.update(this.small, actors, false);
    if (expanded) this.update(this.large, actors, true);
  }

  private create(canvas: HTMLCanvasElement, full: boolean, properties: readonly MapPoint[][]): MapView {
    const minX = full ? 0 : PREVIEW.bounds.minX, minY = full ? 0 : PREVIEW.bounds.minY;
    const width = full ? SOURCE.width : PREVIEW.bounds.w, height = full ? SOURCE.height : PREVIEW.bounds.h;
    const margin = full ? 28 : 8;
    const scale = Math.min((canvas.width - margin * 2) / width, (canvas.height - margin * 2) / height);
    const view: MapView = { canvas, base: document.createElement("canvas"), scale,
      x: (canvas.width - width * scale) / 2, y: (canvas.height - height * scale) / 2, minX, minY };
    view.base.width = canvas.width; view.base.height = canvas.height;
    const context = view.base.getContext("2d")!;
    const point = (p: MapPoint) => this.point(view, p);
    const ring = (points: readonly MapPoint[], close = false) => {
      points.forEach((p, i) => { const q = point(p); context[i ? "lineTo" : "moveTo"](q.x, q.y); });
      if (close) context.closePath();
    };
    const polygon = (shape: Pick<MapFootprint, "points" | "holes">) => {
      context.beginPath(); ring(shape.points, true);
      for (const hole of shape.holes ?? []) ring(hole, true);
      context.fill("evenodd");
    };
    context.fillStyle = "#273d31"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#4b6342";
    for (const field of SOURCE.fields) polygon(field);
    context.strokeStyle = "#85917b"; context.lineJoin = "round"; context.lineCap = "round";
    for (const road of SOURCE.roads) {
      context.lineWidth = Math.max(full ? 1 : 0.7, road.width * scale);
      context.beginPath(); ring(road.points); context.stroke();
    }
    context.fillStyle = "#b0a78c";
    for (const building of SOURCE.buildings) polygon(building);
    context.fillStyle = "#887b64";
    for (const footprint of properties) polygon({ points: footprint });
    if (full) {
      const corner = point({ x: PREVIEW.bounds.minX, y: PREVIEW.bounds.minY });
      context.fillStyle = "#10291a66";
      context.beginPath(); context.rect(0, 0, canvas.width, canvas.height);
      context.rect(corner.x, corner.y, PREVIEW.bounds.w * scale, PREVIEW.bounds.h * scale);
      context.fill("evenodd");
      context.strokeStyle = GOLD; context.lineWidth = 2; context.setLineDash([7, 5]);
      context.strokeRect(corner.x, corner.y, PREVIEW.bounds.w * scale, PREVIEW.bounds.h * scale);
      context.setLineDash([]);
      context.strokeStyle = "#c7d0bd60"; context.lineWidth = 1;
      context.beginPath(); ring(SOURCE.boundary, true); context.stroke();
      context.font = "12px sans-serif"; context.textAlign = "center";
      for (const name of ["Downberg Road", "Hanover Park Avenue", "Surran Road", "Govan Mbeki Road"]) {
        const points = SOURCE.roads.filter((r) => r.name === name)
          .map((road) => road.points.filter((p) => p.x >= 0 && p.x <= SOURCE.width && p.y >= 0 && p.y <= SOURCE.height))
          .sort((a, b) => b.length - a.length)[0];
        if (!points?.length) continue;
        const at = point(points[Math.floor(points.length / 2)]);
        const measured = context.measureText(name).width;
        context.fillStyle = "#142820df"; context.fillRect(at.x - measured / 2 - 4, at.y - 16, measured + 8, 17);
        context.fillStyle = "#e2e8d9"; context.fillText(name, at.x, at.y - 4);
      }
    }
    PLACES.forEach((place, index) => {
      if (!full && !place.inPreview) return;
      const p = point(place.point);
      context.fillStyle = STORE_COLOUR; context.strokeStyle = "#142820"; context.lineWidth = full ? 2 : 1;
      context.beginPath(); context.arc(p.x, p.y, full ? 11 : 3, 0, Math.PI * 2); context.fill(); context.stroke();
      if (full) {
        context.fillStyle = "#142820"; context.font = "bold 12px sans-serif";
        context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(String(index + 1), p.x, p.y);
      }
    });
    return view;
  }

  private update(view: MapView, actors: MapActors, full: boolean) {
    const context = view.canvas.getContext("2d")!;
    context.drawImage(view.base, 0, 0);
    const square = (position: MapPoint, size: number, colour: string) => {
      const p = this.point(view, position); context.fillStyle = colour;
      context.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    };
    for (const vehicle of actors.traffic) square(vehicle, full ? 3 : 2.6, "#d1d4c7");
    square(actors.car, full ? 5 : 4, GOLD);
    if (!full) for (const person of actors.people) square(person, 2.6, "#89c7bc");
    if (actors.objective) {
      const p = this.point(view, actors.objective), radius = full ? 9 : 6;
      context.fillStyle = GOLD; context.strokeStyle = "#142820"; context.lineWidth = 2;
      context.beginPath(); context.moveTo(p.x, p.y - radius); context.lineTo(p.x + radius, p.y);
      context.lineTo(p.x, p.y + radius); context.lineTo(p.x - radius, p.y); context.closePath(); context.fill(); context.stroke();
    }
    const player = this.point(view, actors.player);
    context.fillStyle = "#f3ecd8"; context.strokeStyle = "#172e26"; context.lineWidth = 2;
    context.beginPath(); context.arc(player.x, player.y, full ? 5 : 4, 0, Math.PI * 2); context.fill(); context.stroke();
  }

  private point(view: MapView, point: MapPoint) {
    return { x: view.x + (point.x - view.minX) * view.scale, y: view.y + (point.y - view.minY) * view.scale };
  }
}
