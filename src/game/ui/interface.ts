import { loadSave } from "../systems/save";
import { MAP } from "../world/mapData";
import { COURTS, FACILITIES, LOCALITY_SOURCES } from "../world/locality";

export type DialogueChoice = {
  id: string;
  label: string;
  disabled?: boolean;
  onChoose: () => void;
};

export class Interface {
  root = document.querySelector<HTMLDivElement>("#ui")!;
  menu: HTMLDivElement;
  hud: HTMLDivElement;
  modal: HTMLDivElement;
  toast: HTMLDivElement;
  onStart: (continuing: boolean) => void = () => {};
  onResume: () => void = () => {};
  onCloseDialogue: (reason: "choice" | "dismiss") => void = () => {};
  onSoundToggle: () => void = () => {};
  onVolumeChanged: (volume: number) => void = () => {};
  onVoiceToggle: (enabled: boolean) => void = () => {};
  private captionTimer?: number;
  constructor() {
    this.root.innerHTML = `<div class="masthead"><span class="brand">HP<span class="brand-dot">◆</span></span><span>STREETS OF THE FLATS</span><span class="edition">A NEIGHBOURHOOD ADVENTURE · 02</span><div class="sound-controls"><button id="sound-toggle" class="sound-switch" aria-label="Mute neighbourhood sound" aria-pressed="false">SOUND ON</button><label class="volume-label">VOL <input id="volume" aria-label="Neighbourhood volume" type="range" min="0" max="100" value="40"></label><label class="voices-label" title="Optional synthetic browser voices, not local recordings"><input id="voices-toggle" type="checkbox" aria-label="Use synthetic browser voices"> SYNTH VOICES</label></div></div>
 <div id="hud" hidden><div class="vitals"><div class="avatar">R</div><div><b>RIYAAD</b><div class="meter"><span id="health"></span></div><div class="meter stamina"><span id="stamina"></span></div></div><strong id="money">R0</strong></div><div class="objective"><span class="eyebrow">ON YOUR BLOCK</span><p id="objective"></p></div><div class="map-card"><div class="map-heading">HANOVER PARK <span id="time">16:30</span></div><canvas id="minimap" width="240" height="180"></canvas><div class="map-caption">● YOU <span>◆ OBJECTIVE</span></div><div class="map-caption encounter-map-key"><span>○ R2 REQUEST</span><span>● STRANGER</span></div><div id="map-position" class="map-position"></div><a class="map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a><button id="area-guide" class="area-guide">AREA GUIDE</button></div><div id="street-caption" role="status" aria-live="polite" hidden></div><div id="encounter-status" role="status" aria-live="polite" hidden></div><div id="prompt"></div><div class="controls"><kbd>W A S D</kbd> MOVE <i>·</i> <kbd>SHIFT</kbd> SPRINT <i>·</i> <kbd>E</kbd> INTERACT <i>·</i> <kbd>M</kbd> MAP <i>·</i> <kbd>ESC</kbd> PAUSE</div></div>
 <div id="menu" class="veil"><section class="menu-panel"><div class="eyebrow">CAPE FLATS, CAPE TOWN · REAL STREETS / FICTIONAL STORY</div><h1>HANOVER<br><span>PARK</span><small>STREETS OF THE FLATS</small></h1><p class="intro">Awe, welcome to the neighbourhood.<br>A small delivery. A borrowed ride. A whole block to explore.</p><button id="start">START GAME <span>↗</span></button><button id="continue" class="secondary" ${loadSave() ? "" : "hidden"}>CONTINUE GAME <span>→</span></button><div class="menu-footer">ORIGINAL CHARACTERS. LOCAL STORIES.<br><span>WASD to move · E to greet · sound and captions available</span><a class="map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a></div></section><div class="postcard"><span>HANOVER PARK · NORTH UP</span><b>Life happens<br>on the block.</b><small>THE FLATS / WESTERN CAPE</small></div></div>
 <div id="modal" class="veil" hidden></div><div id="toast" hidden></div>`;
    this.root
      .querySelector("#sound-toggle")!
      .addEventListener("click", () => this.onSoundToggle());
    this.root
      .querySelector<HTMLInputElement>("#volume")!
      .addEventListener("input", (e) =>
        this.onVolumeChanged(
          Number((e.target as HTMLInputElement).value) / 100,
        ),
      );
    this.root
      .querySelector<HTMLInputElement>("#voices-toggle")!
      .addEventListener("change", (e) =>
        this.onVoiceToggle((e.target as HTMLInputElement).checked),
      );
    this.root
      .querySelector("#area-guide")!
      .addEventListener("click", () => this.areaGuide());
    this.menu = this.root.querySelector("#menu")!;
    this.hud = this.root.querySelector("#hud")!;
    this.modal = this.root.querySelector("#modal")!;
    this.toast = this.root.querySelector("#toast")!;
    this.root
      .querySelector("#start")!
      .addEventListener("click", () => this.onStart(false));
    this.root
      .querySelector("#continue")!
      .addEventListener("click", () => this.onStart(true));
  }
  start() {
    this.menu.hidden = true;
    this.hud.hidden = false;
  }
  text(id: string, text: string) {
    this.root.querySelector("#" + id)!.textContent = text;
  }
  bars(health: number, stamina: number) {
    (this.root.querySelector("#health") as HTMLElement).style.width =
      health + "%";
    (this.root.querySelector("#stamina") as HTMLElement).style.width =
      stamina + "%";
  }
  dialogue(name: string, text: string, accept?: () => void, help?: string) {
    this.modal.hidden = false;
    this.modal.innerHTML = `<section class="dialogue"><div class="eyebrow">A WORD ON THE STREET</div><h2></h2><p></p><p class="dialogue-help"></p><div class="actions"><button id="close">SHARP SHARP</button>${accept ? '<button id="accept">ACCEPT DELIVERY →</button>' : ""}</div></section>`;
    this.modal.querySelector("h2")!.textContent = name;
    this.modal.querySelector("p")!.textContent = text;
    const hint = this.modal.querySelector<HTMLElement>(".dialogue-help")!;
    hint.textContent = help ?? "";
    hint.hidden = !help;
    this.modal
      .querySelector("#close")!
      .addEventListener("click", () => this.close());
    this.modal.querySelector("#accept")?.addEventListener("click", () => {
      accept?.();
      this.close();
    });
  }
  choiceDialogue(
    name: string,
    text: string,
    choices: DialogueChoice[],
    help?: string,
    tone: "normal" | "warning" = "normal",
  ) {
    this.modal.hidden = false;
    this.modal.innerHTML = '<section class="dialogue encounter-dialogue" role="dialog" aria-modal="true" aria-labelledby="encounter-heading" aria-describedby="encounter-text"><div class="eyebrow"></div><h2 id="encounter-heading"></h2><p id="encounter-text"></p><p class="dialogue-help"></p><div class="actions"></div></section>';
    const panel = this.modal.querySelector<HTMLElement>(".dialogue")!;
    panel.classList.toggle("dialogue-warning", tone === "warning");
    panel.querySelector(".eyebrow")!.textContent = tone === "warning"
      ? "STAY ALERT"
      : "A WORD ON THE STREET";
    panel.querySelector("h2")!.textContent = name;
    panel.querySelector("#encounter-text")!.textContent = text;
    const hint = panel.querySelector<HTMLElement>(".dialogue-help")!;
    hint.textContent = help ?? "";
    hint.hidden = !help;
    const actions = panel.querySelector<HTMLElement>(".actions")!;
    let chosen = false;
    for (const choice of choices) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.choice = choice.id;
      button.textContent = choice.label;
      button.disabled = Boolean(choice.disabled);
      button.addEventListener("click", () => {
        if (chosen || button.disabled || this.modal.hidden || !this.modal.contains(button)) return;
        chosen = true;
        actions.querySelectorAll("button").forEach((action) => {
          action.disabled = true;
        });
        this.close("choice");
        choice.onChoose();
      });
      actions.append(button);
    }
    actions.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }
  close(reason: "choice" | "dismiss" = "dismiss") {
    if (this.modal.hidden) return;
    this.modal.hidden = true;
    this.modal.replaceChildren();
    this.onCloseDialogue(reason);
  }
  pause(save: () => void) {
    this.modal.hidden = false;
    this.modal.innerHTML =
      '<section class="dialogue"><div class="eyebrow">TAKE A BREATHER</div><h2>On pause.</h2><p>Your block will still be here. Progress saves automatically.</p><button id="resume">BACK TO THE STREETS →</button><button class="secondary" id="save">SAVE PROGRESS</button></section>';
    this.modal.querySelector("#resume")!.addEventListener("click", () => {
      this.close();
      this.onResume();
    });
    this.modal.querySelector("#save")!.addEventListener("click", save);
  }
  notify(text: string) {
    this.toast.textContent = text;
    this.toast.hidden = false;
    window.setTimeout(() => (this.toast.hidden = true), 5000);
  }
  areaGuide() {
    if (!this.modal.hidden) this.close();
    this.modal.hidden = false;
    this.modal.innerHTML =
      '<section class="dialogue locality-guide"><div class="eyebrow">HANOVER PARK · PUBLIC CITY RECORDS</div><h2>Know your area.</h2><p class="guide-status">Roads, suburb boundary and mapped locations use OpenStreetMap. Building coverage is incomplete; character stories and entrances are fictional.</p><h3>Mapped courts</h3><ul class="mapped-court-list court-list"></ul><h3>Court names in City records (2015)</h3><ul class="court-list"></ul><h3>Mapped shops and services</h3><ul class="shop-list"></ul><h3>Community landmarks</h3><ul class="facility-list"></ul><p class="guide-source"></p><p class="guide-status snapshot-status"></p><button id="guide-close">BACK TO THE STREETS →</button></section>';
    const date = new Date(String(MAP.source.retrievedAt)).toLocaleDateString("en-ZA", {
      day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
    });
    this.modal.querySelector(".snapshot-status")!.textContent = `Map snapshot: ${date}. Mapped names do not guarantee that every shop is currently trading. Road widths and scenery are simplified for play.`;
    const mapped = this.modal.querySelector(".mapped-court-list")!;
    for (const name of new Set(
      MAP.buildings
        .filter((b) => b.name && b.kind === "apartments")
        .map((b) => b.name!),
    )) {
      const item = document.createElement("li");
      item.textContent = name;
      mapped.append(item);
    }
    const shops = this.modal.querySelector(".shop-list")!;
    for (const poi of MAP.pois.filter((p) => p.kind !== "pitch")) {
      const item = document.createElement("li");
      item.textContent = poi.name;
      shops.append(item);
    }
    const courts = this.modal.querySelectorAll(".court-list")[1]!;
    for (const court of COURTS) {
      const item = document.createElement("li");
      item.textContent = court.name;
      courts.append(item);
    }
    const facilities = this.modal.querySelector(".facility-list")!;
    for (const facility of FACILITIES) {
      const item = document.createElement("li");
      item.textContent = `${facility.name} · ${facility.address}`;
      facilities.append(item);
    }
    const source = this.modal.querySelector(".guide-source")!;
    source.append("Court names: City of Cape Town, 2015 framework, page 62. ");
    const link = document.createElement("a");
    link.href = LOCALITY_SOURCES.investmentFramework.url;
    link.textContent = "Read the municipal source";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    source.append(link);
    source.append(" · ");
    const data = document.createElement("a");
    data.href = "/map-data/hanover-park.osm.json";
    data.textContent = "Download source map data";
    data.download = "hanover-park.osm.json";
    source.append(data);
    source.append(" · ");
    const license = document.createElement("a");
    license.href = "https://opendatacommons.org/licenses/odbl/1-0/";
    license.textContent = "ODbL 1.0";
    license.target = "_blank";
    license.rel = "noopener noreferrer";
    source.append(license);
    this.modal
      .querySelector("#guide-close")!
      .addEventListener("click", () => this.close());
  }
  soundSettings(
    muted: boolean,
    volume: number,
    voices: boolean,
    available: boolean,
  ) {
    const toggle = this.root.querySelector<HTMLButtonElement>("#sound-toggle")!;
    toggle.textContent = available
      ? muted
        ? "SOUND OFF"
        : "SOUND ON"
      : "SOUND UNAVAILABLE";
    toggle.setAttribute(
      "aria-label",
      muted ? "Enable neighbourhood sound" : "Mute neighbourhood sound",
    );
    toggle.setAttribute("aria-pressed", String(muted));
    (this.root.querySelector("#volume") as HTMLInputElement).value = String(
      Math.round(volume * 100),
    );
    (this.root.querySelector("#voices-toggle") as HTMLInputElement).checked =
      voices;
  }
  caption(speaker: string, line: string) {
    const element = this.root.querySelector<HTMLElement>("#street-caption")!;
    element.textContent = `${speaker}: “${line}”`;
    element.hidden = false;
    if (this.captionTimer !== undefined) window.clearTimeout(this.captionTimer);
    this.captionTimer = window.setTimeout(() => (element.hidden = true), 5200);
  }
  encounterStatus(text: string | null, warning = false) {
    const element = this.root.querySelector<HTMLElement>("#encounter-status")!;
    element.textContent = text ?? "";
    element.classList.toggle("encounter-warning", warning);
    element.hidden = !text;
  }
  get blocked() {
    return !this.modal.hidden;
  }
}
