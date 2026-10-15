const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Compile only this dependency-free state machine; no browser or Babylon scene is required.
const source = fs.readFileSync(path.resolve(__dirname, "../../src/preview3d/delivery.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const stateModule = { exports: {} };
vm.runInThisContext(`(function (exports, module) { ${compiled}\n})`, { filename: "delivery.js" })(
  stateModule.exports, stateModule,
);
const { DeliveryJob, DELIVERY_SAVE_KEY, DELIVERY_VENDOR_MEMORY } = stateModule.exports;

const MAP_ID = "hanover-park-test-map";
const vendor = { x: 100, y: 200 };
const pickup = { x: 500, y: 600 };
const context = (player = vendor, changes = {}) => ({ player: { ...player }, onFoot: true, clearSight: true, active: true, ...changes });
const options = (storage, changes = {}) => ({ mapId: MAP_ID, pixelsPerMetre: 8,
  collectionPoint: pickup, vendorPosition: () => vendor, storage, ...changes });
function storage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  const reads = [], writes = [];
  return { entries, reads, writes,
    getItem(key) { reads.push(key); return entries.get(key) ?? null; },
    setItem(key, value) { writes.push({ key, value }); entries.set(key, value); },
  };
}
function finish(job) {
  assert.equal(job.accept(context()), true);
  assert.equal(job.collect(context(pickup)), true);
  assert.equal(job.complete(context()), true);
}

test("first visit reads only the 3D slot and does not write or change 2D progress", () => {
  const saved2d = JSON.stringify({ mission: "complete", money: 800, x: 20 });
  const store = storage({ "hanover-park-v1": saved2d });
  const job = new DeliveryJob(options(store));
  assert.equal(job.state.phase, "available");
  assert.equal(job.state.money, 0);
  assert.equal(job.state.rep, 0);
  assert.equal(job.state.vendorMemory, null);
  assert.deepEqual(store.reads, [DELIVERY_SAVE_KEY]);
  assert.equal(store.writes.length, 0);
  assert.equal(store.entries.get("hanover-park-v1"), saved2d);
});

test("only the complete on-foot delivery grants R150 and one reputation", () => {
  const store = storage();
  const job = new DeliveryJob(options(store));
  assert.equal(job.collect(context(pickup)), false);
  assert.equal(job.complete(context()), false);
  assert.equal(job.accept(context()), true);
  assert.equal(job.state.phase, "collect");
  assert.equal(job.state.money, 0);
  assert.equal(job.accept(context()), false);
  assert.equal(job.collect(context(pickup)), true);
  assert.equal(job.state.carryingStock, true);
  assert.equal(job.state.money, 0);
  assert.equal(job.collect(context(pickup)), false);
  assert.equal(job.complete(context()), true);
  assert.equal(job.state.phase, "complete");
  assert.equal(job.state.money, 150);
  assert.equal(job.state.rep, 1);
  assert.equal(job.state.vendorMemory, DELIVERY_VENDOR_MEMORY);
  assert.equal(job.state.carryingStock, false);
  assert.equal(job.complete(context()), false);
  assert.equal(job.accept(context()), false);
  assert.equal(store.writes.length, 3);
});

test("walls, vehicles, pause, distance and invalid coordinates block every transaction", () => {
  for (const changes of [{ onFoot: false }, { clearSight: false }, { active: false },
    { player: { x: 99999, y: 99999 } }, { player: { x: NaN, y: 200 } },
    { player: { x: 100, y: Infinity } }]) {
    const store = storage();
    const job = new DeliveryJob(options(store));
    assert.equal(job.accept(context(vendor, changes)), false);
    assert.equal(job.state.phase, "available");
    job.accept(context());
    assert.equal(job.collect(context(pickup, changes)), false);
    assert.equal(job.state.phase, "collect");
    job.collect(context(pickup));
    assert.equal(job.complete(context(vendor, changes)), false);
    assert.equal(job.state.phase, "return");
    assert.equal(job.state.money, 0);
    assert.equal(store.writes.length, 2);
  }
});

test("vendor checks follow their current position and reject missing actor", () => {
  let actor = { ...vendor };
  const job = new DeliveryJob(options(storage(), { vendorPosition: () => actor }));
  actor = { x: vendor.x + 80, y: vendor.y };
  assert.equal(job.accept(context()), false);
  assert.equal(job.accept(context(actor)), true);
  assert.equal(job.collect(context(pickup)), true);
  actor = null;
  assert.equal(job.complete(context()), false);
  actor = { x: vendor.x - 80, y: vendor.y };
  assert.equal(job.complete(context()), false);
  assert.equal(job.complete(context(actor)), true);
});

test("proximity uses world metres at the supplied map scale", () => {
  const job = new DeliveryJob(options(storage()));
  assert.equal(job.accept(context({ x: vendor.x + 22.01, y: vendor.y })), false);
  assert.equal(job.accept(context({ x: vendor.x + 22, y: vendor.y })), true);
  assert.equal(job.collect(context({ x: pickup.x + 28.01, y: pickup.y })), false);
  assert.equal(job.collect(context({ x: pickup.x + 28, y: pickup.y })), true);
});

test("collection and carried stock resume after reload without a premature reward", () => {
  const store = storage();
  let job = new DeliveryJob(options(store));
  job.accept(context());
  job = new DeliveryJob(options(store));
  assert.equal(job.state.phase, "collect");
  assert.equal(job.state.carryingStock, false);
  assert.equal(job.state.money, 0);
  job.collect(context(pickup));
  job = new DeliveryJob(options(store));
  assert.equal(job.state.phase, "return");
  assert.equal(job.state.carryingStock, true);
  assert.equal(job.state.money, 0);
  assert.equal(job.complete(context()), true);
});

test("completed reward, reputation and vendor memory survive reload without paying again", () => {
  const store = storage();
  finish(new DeliveryJob(options(store)));
  const job = new DeliveryJob(options(store));
  assert.equal(job.state.phase, "complete");
  assert.equal(job.state.money, 150);
  assert.equal(job.state.rep, 1);
  assert.equal(job.state.vendorMemory, DELIVERY_VENDOR_MEMORY);
  assert.equal(job.accept(context()), false);
  assert.equal(job.collect(context(pickup)), false);
  assert.equal(job.complete(context()), false);
  assert.equal(store.writes.length, 3);
});

test("malformed, outdated, foreign and inconsistent saves reset with a visible warning", () => {
  const valid = { version: 1, mapId: MAP_ID, jobId: "zeem-stock-v1", phase: "complete",
    money: 150, rep: 1, vendorMemory: DELIVERY_VENDOR_MEMORY };
  const invalid = ["{", "null", "[]", "x".repeat(4097),
    ...[{ version: 2 }, { mapId: "another-map" }, { jobId: "other-job" }, { phase: "invented" },
      { money: -1 }, { money: 999999 }, { rep: 100 }, { vendorMemory: "invented favour" },
      { phase: "return" }, { extra: "field" }].map((change) => JSON.stringify({ ...valid, ...change }))];
  for (const text of invalid) {
    const store = storage({ [DELIVERY_SAVE_KEY]: text });
    const job = new DeliveryJob(options(store));
    assert.equal(job.state.phase, "available");
    assert.equal(job.state.money, 0);
    assert.equal(job.state.rep, 0);
    assert.equal(job.state.vendorMemory, null);
    assert.match(job.state.saveWarning, /started fresh/);
    assert.equal(store.writes.length, 0);
    assert.equal(job.complete(context()), false);
  }
});

test("denied storage reads and writes leave a playable session with a save warning", () => {
  const denied = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("QuotaExceededError"); } };
  const job = new DeliveryJob(options(denied));
  assert.equal(job.state.persistent, false);
  assert.match(job.state.saveWarning, /cannot be saved/);
  finish(job);
  assert.equal(job.state.money, 150);
  assert.equal(job.state.persistent, false);
  assert.match(job.state.saveWarning, /Keep this tab open/);
  assert.equal(job.complete(context()), false);
});

test("a temporary write failure clears after the next successful transition", () => {
  const store = storage();
  const write = store.setItem;
  store.setItem = () => { throw new Error("QuotaExceededError"); };
  const job = new DeliveryJob(options(store));
  assert.equal(job.accept(context()), true);
  assert.equal(job.state.persistent, false);
  store.setItem = write;
  assert.equal(job.collect(context(pickup)), true);
  assert.equal(job.state.persistent, true);
  assert.equal(job.state.saveWarning, null);
  assert.equal(new DeliveryJob(options(store)).state.phase, "return");
});

test("a throwing browser localStorage getter falls back to a safe memory-only session", () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    Object.defineProperty(globalThis, "localStorage", { configurable: true,
      get() { throw new Error("SecurityError"); } });
    const job = new DeliveryJob(options(undefined));
    assert.equal(job.state.phase, "available");
    assert.equal(job.state.persistent, false);
    assert.match(job.state.saveWarning, /cannot be saved/);
    finish(job);
    assert.equal(job.state.money, 150);
  } finally {
    if (old) Object.defineProperty(globalThis, "localStorage", old);
    else delete globalThis.localStorage;
  }
});

test("snapshots and configured collection coordinates cannot be mutated by the caller", () => {
  const configuredPickup = { ...pickup };
  const job = new DeliveryJob(options(storage(), { collectionPoint: configuredPickup }));
  const before = job.state;
  assert.equal(Object.isFrozen(before), true);
  Reflect.set(before, "money", 99999);
  configuredPickup.x = -99999;
  assert.equal(job.accept(context()), true);
  assert.equal(job.collect(context(pickup)), true);
  assert.equal(before.phase, "available");
  assert.equal(job.state.phase, "return");
  assert.equal(job.state.money, 0);
});
