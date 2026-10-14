import { loadSave } from "../systems/save";
export class Interface {
  root = document.querySelector<HTMLDivElement>("#ui")!;
  menu: HTMLDivElement;
  hud: HTMLDivElement;
  modal: HTMLDivElement;
  toast: HTMLDivElement;
  onStart: (continuing: boolean) => void = () => {};
  onResume: () => void = () => {};
  constructor() {
    this.root.innerHTML = `<div class="masthead"><span class="brand">HP<span class="brand-dot">◆</span></span><span>STREETS OF THE FLATS</span><span class="edition">A NEIGHBOURHOOD ADVENTURE · 01</span></div>
 <div id="hud" hidden><div class="vitals"><div class="avatar">R</div><div><b>RIYAAD</b><div class="meter"><span id="health"></span></div><div class="meter stamina"><span id="stamina"></span></div></div><strong id="money">R0</strong></div><div class="objective"><span class="eyebrow">ON YOUR BLOCK</span><p id="objective"></p></div><div class="map-card"><div class="map-heading">HANOVER PARK <span id="time">16:30</span></div><canvas id="minimap" width="240" height="180"></canvas><div class="map-caption">● YOU <span>◆ OBJECTIVE</span></div></div><div id="prompt"></div><div class="controls"><kbd>W A S D</kbd> MOVE <i>·</i> <kbd>SHIFT</kbd> SPRINT <i>·</i> <kbd>E</kbd> INTERACT <i>·</i> <kbd>M</kbd> MAP <i>·</i> <kbd>ESC</kbd> PAUSE</div></div>
 <div id="menu" class="veil"><section class="menu-panel"><div class="eyebrow">CAPE FLATS, CAPE TOWN · A FICTIONALISED NEIGHBOURHOOD</div><h1>HANOVER<br><span>PARK</span><small>STREETS OF THE FLATS</small></h1><p class="intro">Awe, welcome to the neighbourhood.<br>A small delivery. A borrowed ride. A whole block to explore.</p><button id="start">START GAME <span>↗</span></button><button id="continue" class="secondary" ${loadSave() ? "" : "hidden"}>CONTINUE GAME <span>→</span></button><div class="menu-footer">ORIGINAL CHARACTERS. LOCAL STORIES.<br><span>WASD to move · E to say hosh · headphones optional</span></div></section><div class="postcard"><span>33°59′ S / 18°32′ E</span><b>Life happens<br>on the block.</b><small>THE FLATS / WESTERN CAPE</small></div></div>
 <div id="modal" class="veil" hidden></div><div id="toast" hidden></div>`;
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
  dialogue(name: string, text: string, accept?: () => void) {
    this.modal.hidden = false;
    this.modal.innerHTML = `<section class="dialogue"><div class="eyebrow">A WORD ON THE STREET</div><h2></h2><p></p><div class="actions"><button id="close">SHARP SHARP</button>${accept ? '<button id="accept">ACCEPT DELIVERY →</button>' : ""}</div></section>`;
    this.modal.querySelector("h2")!.textContent = name;
    this.modal.querySelector("p")!.textContent = text;
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
  get blocked() {
    return !this.modal.hidden;
  }
}
