import { loadSave } from "../systems/save";
export class Interface {
  root = document.querySelector<HTMLDivElement>("#ui")!;
  menu: HTMLDivElement;
  hud: HTMLDivElement;
  modal: HTMLDivElement;
  toast: HTMLDivElement;
  onStart: (continuing: boolean) => void = () => {};
  onResume: () => void = () => {};
  onCloseDialogue: () => void = () => {};
  onSoundToggle: () => void = () => {};
  onVolumeChanged: (volume: number) => void = () => {};
  onVoiceToggle: (enabled: boolean) => void = () => {};
  private captionTimer?: number;
  constructor() {
    this.root.innerHTML = `<div class="masthead"><span class="brand">HP<span class="brand-dot">◆</span></span><span>STREETS OF THE FLATS</span><span class="edition">A NEIGHBOURHOOD ADVENTURE · 02</span><div class="sound-controls"><button id="sound-toggle" class="sound-switch" aria-label="Mute neighbourhood sound" aria-pressed="false">SOUND ON</button><label class="volume-label">VOL <input id="volume" aria-label="Neighbourhood volume" type="range" min="0" max="100" value="40"></label><label class="voices-label" title="Optional synthetic browser voices, not local recordings"><input id="voices-toggle" type="checkbox" aria-label="Use synthetic browser voices"> SYNTH VOICES</label></div></div>
 <div id="hud" hidden><div class="vitals"><div class="avatar">R</div><div><b>RIYAAD</b><div class="meter"><span id="health"></span></div><div class="meter stamina"><span id="stamina"></span></div></div><strong id="money">R0</strong></div><div class="objective"><span class="eyebrow">ON YOUR BLOCK</span><p id="objective"></p></div><div class="map-card"><div class="map-heading">HANOVER PARK <span id="time">16:30</span></div><canvas id="minimap" width="240" height="180"></canvas><div class="map-caption">● YOU <span>◆ OBJECTIVE</span></div></div><div id="street-caption" role="status" aria-live="polite" hidden></div><div id="prompt"></div><div class="controls"><kbd>W A S D</kbd> MOVE <i>·</i> <kbd>SHIFT</kbd> SPRINT <i>·</i> <kbd>E</kbd> INTERACT <i>·</i> <kbd>M</kbd> MAP <i>·</i> <kbd>ESC</kbd> PAUSE</div></div>
 <div id="menu" class="veil"><section class="menu-panel"><div class="eyebrow">CAPE FLATS, CAPE TOWN · A FICTIONALISED NEIGHBOURHOOD</div><h1>HANOVER<br><span>PARK</span><small>STREETS OF THE FLATS</small></h1><p class="intro">Awe, welcome to the neighbourhood.<br>A small delivery. A borrowed ride. A whole block to explore.</p><button id="start">START GAME <span>↗</span></button><button id="continue" class="secondary" ${loadSave() ? "" : "hidden"}>CONTINUE GAME <span>→</span></button><div class="menu-footer">ORIGINAL CHARACTERS. LOCAL STORIES.<br><span>WASD to move · E to greet · sound and captions available</span></div></section><div class="postcard"><span>A FICTIONAL NEIGHBOURHOOD</span><b>Life happens<br>on the block.</b><small>THE FLATS / WESTERN CAPE</small></div></div>
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
  close() {
    this.modal.hidden = true;
    this.onCloseDialogue();
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
  get blocked() {
    return !this.modal.hidden;
  }
}
