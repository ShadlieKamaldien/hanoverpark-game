export type LightingPreset = "day" | "sunset" | "night";
export type ViewPreset = "street" | "overview";
export interface Conversation {
  speaker: string;
  text: string;
  choices: { id: string; label: string }[];
}
export interface CrewStatus {
  affiliation: string | null;
  phase: string;
  crewName?: string;
  text: string;
  remaining?: number;
  chasingIds: string[];
}
export interface VehicleStatus {
  driving: boolean;
  /** Signed metres per second; the display converts this to kilometres per hour. */
  speed: number;
  gear: "forward" | "reverse" | "park";
  message?: string;
}
export interface NpcBrainStatus {
  goalLabel: string;
  stage: string;
  progress: number;
  source: "local" | "llm";
  say?: string;
}
export interface MapPlace {
  id: string;
  name: string;
  kind: string;
  insidePreview: boolean;
  distance?: number;
  detail?: string;
}
export interface DeliveryStatus {
  phase: string;
  money: number;
  reputation: number;
  objective: string;
  distance?: number;
  message?: string;
  saveProblem?: string;
}

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing preview element: ${id}`);
  return node as T;
}

/** DOM controls stay independent of the Babylon scene and its render loop. */
export class PreviewInterface {
  readonly canvas = element<HTMLCanvasElement>("preview-canvas");
  readonly minimap = element<HTMLCanvasElement>("preview-minimap");
  readonly areaMap = element<HTMLCanvasElement>("preview-area-map");
  readonly startButton = element<HTMLButtonElement>("preview-start-button");

  onStart: (() => void) | null = null;
  onPause: (() => void) | null = null;
  onResume: (() => void) | null = null;
  onRecenter: (() => void) | null = null;
  onLightingChanged: ((preset: LightingPreset) => void) | null = null;
  onViewChanged: ((preset: ViewPreset) => void) | null = null;
  onInteract: (() => void) | null = null;
  onDialogueChoice: ((id: string) => void) | null = null;
  onDialogueClose: (() => void) | null = null;
  onChatSubmit: ((text: string) => void) | null = null;
  onMapOpen: (() => void) | null = null;
  onMapClose: (() => void) | null = null;

  private readonly startOverlay = element<HTMLElement>("preview-start");
  private readonly pauseOverlay = element<HTMLElement>("preview-pause");
  private readonly errorOverlay = element<HTMLElement>("preview-error");
  private readonly hud = element<HTMLElement>("preview-hud");
  private readonly street = element<HTMLElement>("preview-street");
  private readonly position = element<HTMLElement>("preview-position");
  private readonly crewPanel = element<HTMLElement>("preview-crew-status");
  private readonly crewAffiliation = element<HTMLElement>("preview-crew-affiliation");
  private readonly crewMessage = element<HTMLElement>("preview-crew-message");
  private readonly crewTimer = element<HTMLElement>("preview-crew-timer");
  private readonly crewHint = element<HTMLElement>("preview-crew-hint");
  private readonly crewAnnouncement = element<HTMLElement>("preview-crew-announcement");
  private readonly vehiclePanel = element<HTMLElement>("preview-vehicle-status");
  private readonly vehicleSpeed = element<HTMLElement>("preview-vehicle-speed");
  private readonly vehicleGear = element<HTMLElement>("preview-vehicle-gear");
  private readonly vehicleMessage = element<HTMLElement>("preview-vehicle-message");
  private readonly controls = element<HTMLElement>("preview-controls");
  private readonly mapOverlay = element<HTMLElement>("preview-area-map-dialog");
  private readonly mapButton = element<HTMLButtonElement>("preview-map-button");
  private readonly mapCloseButton = element<HTMLButtonElement>("preview-map-close");
  private readonly mapPlaces = element<HTMLOListElement>("preview-map-places");
  private readonly deliveryPanel = element<HTMLElement>("preview-delivery-status");
  private readonly deliveryObjective = element<HTMLElement>("preview-delivery-objective");
  private readonly deliveryDistance = element<HTMLElement>("preview-delivery-distance");
  private readonly deliveryMessage = element<HTMLElement>("preview-delivery-message");
  private readonly wallet = element<HTMLElement>("preview-wallet");
  private readonly vendorReputation = element<HTMLElement>("preview-vendor-reputation");
  private readonly saveProblem = element<HTMLElement>("preview-save-problem");
  private readonly resumeButton = element<HTMLButtonElement>("preview-resume-button");
  private readonly interactPrompt = element<HTMLElement>("preview-interact-prompt");
  private readonly interactButton = element<HTMLButtonElement>("preview-interact");
  private readonly dialogueOverlay = element<HTMLElement>("preview-dialogue");
  private readonly dialogueSpeaker = element<HTMLElement>("preview-dialogue-speaker");
  private readonly dialogueText = element<HTMLElement>("preview-dialogue-text");
  private readonly dialogueChoices = element<HTMLElement>("preview-dialogue-choices");
  private readonly dialogueCloseButton = element<HTMLButtonElement>("preview-dialogue-close");
  private readonly npcGoal = element<HTMLElement>("preview-npc-goal");
  private readonly npcGoalLabel = element<HTMLElement>("preview-npc-goal-label");
  private readonly npcGoalStage = element<HTMLElement>("preview-npc-goal-stage");
  private readonly npcGoalProgress = element<HTMLProgressElement>("preview-npc-goal-progress");
  private readonly npcGoalSay = element<HTMLElement>("preview-npc-goal-say");
  private readonly chatForm = element<HTMLFormElement>("preview-chat-form");
  private readonly chatInput = element<HTMLInputElement>("preview-chat-input");
  private readonly chatSendButton = element<HTMLButtonElement>("preview-chat-send");
  private readonly chatReplyText = element<HTMLElement>("preview-chat-reply");
  private readonly chatStatusText = element<HTMLElement>("preview-chat-status");
  private readonly lightingButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-lighting]"),
  );
  private readonly viewButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-view]"));
  private started = false;
  private paused = false;
  private crewAnnouncementKey = "";
  private driving = false;
  private crewPhase = "normal";
  private chatIsPending = false;

  constructor() {
    this.canvas.inert = true;
    this.startButton.addEventListener("click", () => this.onStart?.());
    element<HTMLButtonElement>("preview-pause-button").addEventListener("click", () => this.onPause?.());
    this.resumeButton.addEventListener("click", () => this.onResume?.());
    this.mapButton.addEventListener("click", () => this.openMap());
    element<HTMLButtonElement>("preview-minimap-expand").addEventListener("click", () => this.openMap());
    this.mapCloseButton.addEventListener("click", () => this.closeMap());
    this.mapOverlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape" || (event.key.toLowerCase() === "m" && !event.altKey && !event.ctrlKey && !event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        this.closeMap();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(this.mapOverlay.querySelectorAll<HTMLElement>(
        "button:not(:disabled), a[href], [tabindex='0']",
      )).filter((node) => !node.closest("[hidden], [inert]") && node.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    });
    this.interactButton.addEventListener("click", () => {
      if (!this.interactButton.disabled) this.onInteract?.();
    });
    this.dialogueCloseButton.addEventListener("click", () => {
      this.onDialogueClose?.();
      this.closeDialogue();
    });
    this.dialogueOverlay.addEventListener("keydown", (event) => {
      // Inputs keep movement keys, but Escape always returns to the street.
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.onDialogueClose?.();
        this.closeDialogue();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(this.dialogueOverlay.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], [tabindex='0']",
      )).filter((node) => !node.closest("[hidden], [inert]") && node.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    });
    this.chatInput.addEventListener("input", () => this.updateChatAvailability());
    this.chatForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = this.chatInput.value.trim().slice(0, 280);
      if (!this.dialogueOpen || this.chatIsPending || !text || !this.onChatSubmit) return;
      this.chatInput.value = "";
      this.chatPending(true);
      this.onChatSubmit(text);
    });
    element<HTMLButtonElement>("preview-recenter").addEventListener("click", () => {
      this.onRecenter?.();
      this.canvas.focus({ preventScroll: true });
    });
    element<HTMLButtonElement>("preview-retry-button").addEventListener("click", () => window.location.reload());
    for (const button of this.lightingButtons) {
      button.addEventListener("click", () => {
        const preset = button.dataset.lighting as LightingPreset;
        this.setLighting(preset);
        this.onLightingChanged?.(preset);
        this.canvas.focus({ preventScroll: true });
      });
    }
    for (const button of this.viewButtons) {
      button.addEventListener("click", () => {
        this.onViewChanged?.(button.dataset.view as ViewPreset);
        this.canvas.focus({ preventScroll: true });
      });
    }
    document.documentElement.dataset.previewState = "loading";
  }

  ready(): void {
    this.startButton.disabled = false;
    this.canvas.setAttribute("aria-busy", "false");
    element<HTMLElement>("preview-loading").textContent = "Ready when you are.";
    document.documentElement.dataset.previewState = "ready";
  }

  start(): void {
    this.started = true;
    this.paused = false;
    this.startOverlay.hidden = true;
    this.pauseOverlay.hidden = true;
    this.errorOverlay.hidden = true;
    this.hud.hidden = false;
    this.hud.inert = false;
    this.canvas.inert = false;
    document.documentElement.dataset.previewState = "playing";
    this.canvas.focus({ preventScroll: true });
  }

  pause(paused: boolean): void {
    if (!this.started || !this.errorOverlay.hidden) return;
    if (paused && this.mapOpen) this.closeMap();
    if (paused && this.dialogueOpen) {
      this.onDialogueClose?.();
      this.closeDialogue();
    }
    this.paused = paused;
    this.pauseOverlay.hidden = !paused;
    this.hud.inert = paused;
    this.canvas.inert = paused;
    document.documentElement.dataset.previewState = paused ? "paused" : "playing";
    if (paused) this.resumeButton.focus({ preventScroll: true });
    else this.canvas.focus({ preventScroll: true });
  }

  status(street: string, position?: string): void {
    if (this.street.textContent !== street) this.street.textContent = street;
    if (position !== undefined && this.position.textContent !== position) {
      this.position.textContent = position;
    }
  }

  crewStatus(state: CrewStatus, affiliationName?: string): void {
    const affiliation = state.affiliation ? (affiliationName?.trim() || state.affiliation) : "Neutral";
    const phase = ["warning", "pursuit", "caught", "escaped"].includes(state.phase) ? state.phase : "normal";
    this.crewPanel.dataset.phase = phase;
    this.crewPanel.dataset.affiliation = state.affiliation ?? "neutral";
    if (this.crewAffiliation.textContent !== affiliation) this.crewAffiliation.textContent = affiliation;
    if (this.crewMessage.textContent !== state.text) this.crewMessage.textContent = state.text;
    this.crewPhase = state.phase;
    this.updateCrewHint();
    const hasTimer = Number.isFinite(state.remaining) && (state.remaining ?? 0) > 0 && phase !== "normal";
    this.crewTimer.hidden = !hasTimer;
    const timer = hasTimer ? `${Math.ceil(state.remaining!)}s` : "";
    if (this.crewTimer.textContent !== timer) this.crewTimer.textContent = timer;

    // Announce changed encounters once; the visible countdown stays quiet.
    const key = JSON.stringify([state.affiliation, state.phase, state.crewName, state.text]);
    if (key !== this.crewAnnouncementKey) {
      this.crewAnnouncementKey = key;
      this.crewAnnouncement.textContent = `${affiliation}. ${state.text}`;
    }
  }

  vehicleStatus(state: VehicleStatus): void {
    this.vehiclePanel.hidden = !state.driving;
    if (this.driving !== state.driving) {
      this.driving = state.driving;
      this.hud.dataset.driving = String(state.driving);
      const controls: [string, string][] = state.driving
        ? [["W / S", "Accelerate / brake + reverse"], ["A / D", "Steer"], ["SPACE", "Brake"],
          ["E", "Exit"], ["M", "Map"], ["DRAG", "Orbit"], ["WHEEL", "Zoom"], ["ESC", "Pause"]]
        : [["WASD / ARROWS", "Walk"], ["SHIFT", "Sprint"], ["E", "Greet / enter car"],
          ["M", "Map"], ["DRAG", "Orbit"], ["WHEEL", "Zoom"], ["ESC", "Pause"]];
      this.controls.replaceChildren(...controls.map(([key, action]) => {
        const label = document.createElement("span");
        const shortcut = document.createElement("b");
        shortcut.textContent = key;
        label.append(shortcut, document.createTextNode(` ${action}`));
        return label;
      }));
      this.updateCrewHint();
    }
    const speed = Number.isFinite(state.speed) ? Math.round(Math.abs(state.speed) * 3.6) : 0;
    if (this.vehicleSpeed.textContent !== String(speed)) this.vehicleSpeed.textContent = String(speed);
    const gear = state.gear === "forward" ? "FWD" : state.gear === "reverse" ? "REV" : "PARK";
    if (this.vehicleGear.textContent !== gear) this.vehicleGear.textContent = gear;
    this.vehiclePanel.dataset.gear = state.gear;
    const message = state.message?.trim() || "Stop before stepping out.";
    if (this.vehicleMessage.textContent !== message) this.vehicleMessage.textContent = message;
  }

  private updateCrewHint(): void {
    this.crewHint.hidden = this.crewPhase !== "warning" && this.crewPhase !== "pursuit";
    const key = this.driving ? "W / S · A / D" : "SHIFT";
    const action = this.driving ? " Drive away" : " Sprint away";
    if (this.crewHint.textContent === `${key}${action}`) return;
    const shortcut = document.createElement("b");
    shortcut.textContent = key;
    this.crewHint.replaceChildren(shortcut, document.createTextNode(action));
  }

  setLighting(preset: LightingPreset): void {
    for (const button of this.lightingButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.lighting === preset));
    }
  }

  setView(preset: ViewPreset): void {
    for (const button of this.viewButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.view === preset));
    }
  }

  prompt(text: string | null): void {
    const label = text?.trim() || null;
    this.interactPrompt.hidden = label === null;
    this.interactButton.disabled = label === null;
    if (label !== null && this.interactButton.textContent !== label) {
      this.interactButton.textContent = label;
    }
  }

  dialogue(conversation: Conversation): void {
    if (!this.started || this.paused || this.mapOpen || !this.errorOverlay.hidden) return;
    this.dialogueSpeaker.textContent = conversation.speaker;
    this.dialogueText.textContent = conversation.text;
    this.dialogueChoices.replaceChildren();
    for (const choice of conversation.choices) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.dialogueChoice = choice.id;
      button.textContent = choice.label;
      button.addEventListener("click", () => this.onDialogueChoice?.(choice.id));
      this.dialogueChoices.append(button);
    }
    this.dialogueOverlay.hidden = false;
    this.hud.inert = true;
    this.canvas.inert = true;
    document.documentElement.dataset.previewState = "dialogue";
    const firstChoice = this.dialogueChoices.querySelector<HTMLButtonElement>("button");
    (firstChoice ?? this.dialogueCloseButton).focus({ preventScroll: true });
  }

  closeDialogue(): void {
    this.chatPending(false);
    if (!this.dialogueOpen) return;
    this.dialogueOverlay.hidden = true;
    this.hud.inert = this.paused;
    this.canvas.inert = this.paused;
    document.documentElement.dataset.previewState = this.paused ? "paused" : "playing";
    if (this.started && !this.paused && this.errorOverlay.hidden) this.canvas.focus({ preventScroll: true });
  }

  get dialogueOpen(): boolean {
    return !this.dialogueOverlay.hidden;
  }

  openMap(): void {
    if (!this.started || this.paused || this.mapOpen || !this.errorOverlay.hidden) return;
    if (this.dialogueOpen) {
      this.onDialogueClose?.();
      this.closeDialogue();
    }
    this.onMapOpen?.();
    this.mapOverlay.hidden = false;
    this.mapButton.setAttribute("aria-expanded", "true");
    this.hud.inert = true;
    this.canvas.inert = true;
    document.documentElement.dataset.previewState = "map";
    this.mapCloseButton.focus({ preventScroll: true });
  }

  closeMap(): void {
    if (!this.mapOpen) return;
    this.mapOverlay.hidden = true;
    this.mapButton.setAttribute("aria-expanded", "false");
    this.hud.inert = this.paused || this.dialogueOpen;
    this.canvas.inert = this.paused || this.dialogueOpen;
    document.documentElement.dataset.previewState = this.paused ? "paused" : this.dialogueOpen ? "dialogue" : "playing";
    this.onMapClose?.();
    if (this.started && !this.paused && !this.dialogueOpen && this.errorOverlay.hidden) {
      this.canvas.focus({ preventScroll: true });
    }
  }

  get mapOpen(): boolean {
    return !this.mapOverlay.hidden;
  }

  setMapPlaces(places: readonly MapPlace[]): void {
    this.mapPlaces.replaceChildren(...places.map((place, index) => {
      const item = document.createElement("li");
      item.dataset.placeId = place.id;
      item.dataset.insidePreview = String(place.insidePreview);
      const number = document.createElement("span");
      number.className = "preview-map-place-number";
      number.textContent = String(index + 1);
      number.setAttribute("aria-hidden", "true");
      const body = document.createElement("div");
      const name = document.createElement("h3");
      name.textContent = place.name;
      const kind = document.createElement("p");
      kind.className = "preview-map-place-kind";
      const kinds: Record<string, string> = { supermarket: "Supermarket", pharmacy: "Pharmacy", fuel: "Fuel", fast_food: "Takeaway", pitch: "Sports field" };
      kind.textContent = kinds[place.kind] ?? place.kind.replaceAll("_", " ");
      const area = document.createElement("p");
      area.className = "preview-map-place-area";
      area.textContent = place.insidePreview ? "In current 3D area" : "Outside current 3D area";
      if (place.insidePreview && Number.isFinite(place.distance)) {
        area.textContent += ` · ${Math.round(Math.max(0, place.distance!))} m away`;
      }
      body.append(name, kind, area);
      if (place.detail?.trim()) {
        const detail = document.createElement("p");
        detail.className = "preview-map-place-detail";
        detail.textContent = place.detail;
        body.append(detail);
      }
      item.append(number, body);
      return item;
    }));
  }

  deliveryStatus(state: DeliveryStatus): void {
    this.deliveryPanel.dataset.phase = state.phase;
    const money = `R${Number.isFinite(state.money) ? Math.max(0, state.money).toFixed(0) : "0"}`;
    if (this.wallet.textContent !== money) this.wallet.textContent = money;
    const reputation = `${Number.isFinite(state.reputation) ? Math.trunc(state.reputation) : 0}`;
    if (this.vendorReputation.textContent !== reputation) this.vendorReputation.textContent = reputation;
    if (this.deliveryObjective.textContent !== state.objective) this.deliveryObjective.textContent = state.objective;
    const hasDistance = Number.isFinite(state.distance);
    this.deliveryDistance.hidden = !hasDistance;
    const distance = hasDistance ? `${Math.round(Math.max(0, state.distance!))} m to objective` : "";
    if (this.deliveryDistance.textContent !== distance) this.deliveryDistance.textContent = distance;
    const message = state.message?.trim() ?? "";
    this.deliveryMessage.hidden = !message;
    if (this.deliveryMessage.textContent !== message) this.deliveryMessage.textContent = message;
    const problem = state.saveProblem?.trim() ?? "";
    this.saveProblem.hidden = !problem;
    if (this.saveProblem.textContent !== problem) this.saveProblem.textContent = problem;
  }

  setNpcBrain(state: NpcBrainStatus | null): void {
    this.npcGoal.hidden = state === null;
    if (!state) return;
    this.npcGoal.dataset.stage = state.stage;
    this.npcGoal.dataset.goalSource = state.source;
    if (this.npcGoalLabel.textContent !== state.goalLabel) this.npcGoalLabel.textContent = state.goalLabel;
    const stage = state.stage === "travel" || state.stage === "travelling" ? "On the way"
      : state.stage === "doing" || state.stage === "work" || state.stage === "working" ? "Busy with it" : "Taking a moment";
    if (this.npcGoalStage.textContent !== stage) this.npcGoalStage.textContent = stage;
    this.npcGoalProgress.value = Number.isFinite(state.progress) ? Math.min(1, Math.max(0, state.progress)) : 0;
    const say = state.say?.trim() ?? "";
    this.npcGoalSay.hidden = !say;
    if (this.npcGoalSay.textContent !== say) this.npcGoalSay.textContent = say;
  }

  chatPending(pending: boolean): void {
    this.chatIsPending = pending;
    this.chatForm.setAttribute("aria-busy", String(pending));
    // Keep the input focused while the answer arrives; another submission waits.
    this.updateChatAvailability();
    const text = pending ? "Thinking…" : "";
    if (this.chatStatusText.textContent !== text) this.chatStatusText.textContent = text;
  }

  chatReply(text: string, source: "local" | "llm"): void {
    this.chatPending(false);
    this.chatReplyText.dataset.replySource = source;
    this.chatReplyText.textContent = text;
    this.chatReplyText.hidden = !text.trim();
  }

  clearChat(): void {
    this.chatPending(false);
    this.chatInput.value = "";
    this.chatReplyText.textContent = "";
    this.chatReplyText.hidden = true;
    delete this.chatReplyText.dataset.replySource;
    this.updateChatAvailability();
  }

  private updateChatAvailability(): void {
    this.chatSendButton.disabled = this.chatIsPending || !this.chatInput.value.trim();
  }

  error(message?: string): void {
    this.closeMap();
    this.closeDialogue();
    this.canvas.setAttribute("aria-busy", "false");
    this.startOverlay.hidden = true;
    this.pauseOverlay.hidden = true;
    this.hud.hidden = true;
    this.canvas.inert = true;
    this.errorOverlay.hidden = false;
    const friendly = message?.trim();
    if (friendly) element<HTMLElement>("preview-error-message").textContent = friendly;
    document.documentElement.dataset.previewState = "error";
    element<HTMLButtonElement>("preview-retry-button").focus({ preventScroll: true });
  }

  get isPaused(): boolean {
    return this.paused;
  }
}
