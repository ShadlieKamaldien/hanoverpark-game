export type LightingPreset = "day" | "sunset" | "night";
export type ViewPreset = "street" | "overview";

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

  private readonly startOverlay = element<HTMLElement>("preview-start");
  private readonly pauseOverlay = element<HTMLElement>("preview-pause");
  private readonly errorOverlay = element<HTMLElement>("preview-error");
  private readonly hud = element<HTMLElement>("preview-hud");
  private readonly street = element<HTMLElement>("preview-street");
  private readonly position = element<HTMLElement>("preview-position");
  private readonly resumeButton = element<HTMLButtonElement>("preview-resume-button");
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

  error(message?: string): void {
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
