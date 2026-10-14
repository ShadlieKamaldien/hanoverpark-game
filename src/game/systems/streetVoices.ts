/** Optional browser-generated speech. These are fictional lines, not local recordings. */
export class StreetVoices {
  enabled = false;
  private current: SpeechSynthesisUtterance | null = null;
  constructor() {
    try {
      this.enabled = localStorage.getItem("hanover-park-voices-v1") === "on";
    } catch {
      /* Optional preference. */
    }
  }
  get available() {
    return (
      typeof window.speechSynthesis !== "undefined" &&
      typeof window.SpeechSynthesisUtterance !== "undefined"
    );
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.cancel();
    try {
      localStorage.setItem("hanover-park-voices-v1", enabled ? "on" : "off");
    } catch {
      /* Optional preference. */
    }
  }
  speak(text: string, volume: number) {
    if (!this.enabled || !this.available || volume <= 0) return;
    // Browser voice packs vary; captions remain the reliable dialogue path.
    const voices = window.speechSynthesis.getVoices();
    const voice =
      voices.find((v) => /^en-ZA$/i.test(v.lang)) ??
      voices.find((v) => /^en/i.test(v.lang));
    if (!voice) return;
    this.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.volume = Math.min(1, Math.max(0, volume));
    utterance.rate = 0.94;
    utterance.onend = () => {
      if (this.current === utterance) this.current = null;
    };
    utterance.onerror = () => {
      if (this.current === utterance) this.current = null;
    };
    this.current = utterance;
    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      this.current = null;
    }
  }
  cancel() {
    if (this.available) window.speechSynthesis.cancel();
    this.current = null;
  }
}
