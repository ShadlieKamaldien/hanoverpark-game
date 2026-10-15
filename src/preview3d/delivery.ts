import type { MapPoint } from "../game/world/mapData";

export const DELIVERY_SAVE_KEY = "hanover-park-3d-v1";
export const DELIVERY_JOB_ID = "zeem-stock-v1";
export const DELIVERY_REWARD = 150;
export const DELIVERY_VENDOR_ID = "vendor_nazeem";
export const DELIVERY_VENDOR_MEMORY = "You helped collect my grocery stock and brought it back safely. I can count on you, my bru.";

export type DeliveryPhase = "available" | "collect" | "return" | "complete";
export interface DeliveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface DeliveryOptions {
  mapId: string;
  pixelsPerMetre: number;
  collectionPoint: MapPoint;
  /** Read the current position; the vendor's autonomous goals can move them. */
  vendorPosition: () => MapPoint | null | undefined;
  /** Omit to use browser storage. Pass null for an explicit memory-only session. */
  storage?: DeliveryStorage | null;
}
export interface DeliveryActionContext {
  player: MapPoint;
  onFoot: boolean;
  clearSight: boolean;
  /** Started and unpaused. Conversations can remain open during a transaction. */
  active: boolean;
}
export interface DeliveryState {
  readonly phase: DeliveryPhase;
  readonly money: number;
  readonly rep: number;
  readonly reward: typeof DELIVERY_REWARD;
  readonly carryingStock: boolean;
  readonly vendorMemory: string | null;
  readonly persistent: boolean;
  readonly saveWarning: string | null;
}
interface SavedDelivery {
  version: 1;
  mapId: string;
  jobId: typeof DELIVERY_JOB_ID;
  phase: DeliveryPhase;
  money: number;
  rep: number;
  vendorMemory: string | null;
}

const PHASES: readonly DeliveryPhase[] = ["available", "collect", "return", "complete"];
const SAVE_FIELDS = ["version", "mapId", "jobId", "phase", "money", "rep", "vendorMemory"];
const STORAGE_WARNING = "Delivery progress cannot be saved in this browser. Keep this tab open to continue.";
const RESET_WARNING = "Saved delivery progress was unreadable or from another map. This delivery has started fresh.";
const finitePoint = (point: unknown): point is MapPoint => !!point && typeof point === "object" &&
  Number.isFinite((point as MapPoint).x) && Number.isFinite((point as MapPoint).y);

function browserStorage(): DeliveryStorage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; }
  catch { return null; }
}

/** A single fixed-reward job. Neither NPC dialogue nor model output can mint money. */
export class DeliveryJob {
  private readonly options: DeliveryOptions;
  private readonly storage: DeliveryStorage | null;
  private phase: DeliveryPhase = "available";
  private persistent = true;
  private warning: string | null = null;

  constructor(options: DeliveryOptions) {
    if (typeof options.mapId !== "string" || !options.mapId || options.mapId.length > 200 || !Number.isFinite(options.pixelsPerMetre) ||
      options.pixelsPerMetre <= 0 || !finitePoint(options.collectionPoint) ||
      typeof options.vendorPosition !== "function") throw new Error("Invalid delivery world configuration.");
    this.options = { ...options, collectionPoint: { ...options.collectionPoint } };
    this.storage = options.storage === undefined ? browserStorage() : options.storage;
    if (!this.storage) {
      this.persistent = false;
      this.warning = STORAGE_WARNING;
      return;
    }
    let text: string | null;
    try { text = this.storage.getItem(DELIVERY_SAVE_KEY); }
    catch {
      this.persistent = false;
      this.warning = STORAGE_WARNING;
      return;
    }
    if (text === null) return;
    if (text.length > 4096) {
      this.warning = RESET_WARNING;
      return;
    }
    try {
      const saved: unknown = JSON.parse(text);
      if (!this.validSave(saved)) {
        this.warning = RESET_WARNING;
        return;
      }
      this.phase = saved.phase;
    } catch {
      this.warning = RESET_WARNING;
    }
  }

  get state(): DeliveryState {
    const complete = this.phase === "complete";
    return Object.freeze({
      phase: this.phase,
      money: complete ? DELIVERY_REWARD : 0,
      rep: complete ? 1 : 0,
      reward: DELIVERY_REWARD,
      carryingStock: this.phase === "return",
      vendorMemory: complete ? DELIVERY_VENDOR_MEMORY : null,
      persistent: this.persistent,
      saveWarning: this.warning,
    });
  }

  canAccept(context: DeliveryActionContext): boolean {
    return this.phase === "available" && this.atVendor(context);
  }

  accept(context: DeliveryActionContext): boolean {
    if (!this.canAccept(context)) return false;
    return this.transition("collect");
  }

  canCollect(context: DeliveryActionContext): boolean {
    return this.phase === "collect" && this.canReach(context, this.options.collectionPoint, 3.5);
  }

  collect(context: DeliveryActionContext): boolean {
    if (!this.canCollect(context)) return false;
    return this.transition("return");
  }

  canComplete(context: DeliveryActionContext): boolean {
    return this.phase === "return" && this.atVendor(context);
  }

  complete(context: DeliveryActionContext): boolean {
    if (!this.canComplete(context)) return false;
    return this.transition("complete");
  }

  private atVendor(context: DeliveryActionContext): boolean {
    try { return this.canReach(context, this.options.vendorPosition(), 2.75); }
    catch { return false; }
  }

  private canReach(context: DeliveryActionContext, target: MapPoint | null | undefined, metres: number): boolean {
    return context?.active === true && context.onFoot === true && context.clearSight === true &&
      finitePoint(context.player) && finitePoint(target) &&
      Math.hypot(context.player.x - target.x, context.player.y - target.y) <= metres * this.options.pixelsPerMetre;
  }

  private transition(phase: DeliveryPhase): true {
    this.phase = phase;
    if (!this.storage) return true;
    const state = this.state;
    const save: SavedDelivery = { version: 1, mapId: this.options.mapId, jobId: DELIVERY_JOB_ID,
      phase, money: state.money, rep: state.rep, vendorMemory: state.vendorMemory };
    try {
      this.storage.setItem(DELIVERY_SAVE_KEY, JSON.stringify(save));
      this.persistent = true;
      this.warning = null;
    } catch {
      this.persistent = false;
      this.warning = STORAGE_WARNING;
    }
    return true;
  }

  private validSave(value: unknown): value is SavedDelivery {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const data = value as Record<string, unknown>;
    if (Object.keys(data).length !== SAVE_FIELDS.length || !SAVE_FIELDS.every((key) => Object.hasOwn(data, key)) ||
      data.version !== 1 || data.mapId !== this.options.mapId || data.jobId !== DELIVERY_JOB_ID ||
      !PHASES.includes(data.phase as DeliveryPhase)) return false;
    const complete = data.phase === "complete";
    return data.money === (complete ? DELIVERY_REWARD : 0) && data.rep === (complete ? 1 : 0) &&
      data.vendorMemory === (complete ? DELIVERY_VENDOR_MEMORY : null);
  }
}
