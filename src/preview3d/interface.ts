export type LightingPreset = "day" | "sunset" | "night";
export type ViewPreset = "street" | "overview";
export interface Conversation {
  speaker: string;
  text: string;
  choices: { id: string; label: string }[];
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

  private readonly startOverlay = element<HTMLElement>("preview-start");
  private readonly pauseOverlay = element<HTMLElement>("preview-pause");
  private readonly errorOverlay = element<HTMLElement>("preview-error");
  private readonly hud = element<HTMLElement>("preview-hud");
  private readonly street = element<HTMLElement>("preview-street");
  private readonly position = element<HTMLElement>("preview-position");
  private readonly resumeButton = element<HTMLButtonElement>("preview-resume-button");
  private readonly interactPrompt = element<HTMLElement>("preview-interact-prompt");
  private readonly interactButton = element<HTMLButtonElement>("preview-interact");
  private readonly dialogueOverlay = element<HTMLElement>("preview-dialogue");
  private readonly dialogueSpeaker = element<HTMLElement>("preview-dialogue-speaker");
  private readonly dialogueText = element<HTMLElement>("preview-dialogue-text");
  private readonly dialogueChoices = element<HTMLElement>("preview-dialogue-choices");
  private readonly dialogueCloseButton = element<HTMLButtonElement>("preview-dialogue-close");
  private readonly lightingButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-lighting]"),
  );
  private readonly viewButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-view]"));
  private started = false;
  private paused = false;

  constructor() {
    this.canvas.inert = true;
    this.startButton.addEventListener("click", () => this.onStart?.());
    element<HTMLButtonElement>("preview-pause-button").addEventListener("click", () => this.onPause?.());
    this.resumeButton.addEventListener("click", () => this.onResume?.());
    this.interactButton.addEventListener("click", () => {
      if (!this.interactButton.disabled) this.onInteract?.();
    });
    this.dialogueCloseButton.addEventListener("click", () => {
      this.onDialogueClose?.();
      this.closeDialogue();
    });
    this.dialogueOverlay.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const buttons = Array.from(this.dialogueOverlay.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
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
    if (!this.started || this.paused || !this.errorOverlay.hidden) return;
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

  error(message?: string): void {
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
