// ============================================================================
// FlexiByggaren - Ljud & Svensk Röstuppläsning (Web Audio API + Web Speech API)
// ============================================================================

class FlexiAudio {
  constructor() {
    this.ctx = null;
    this.soundEnabled = localStorage.getItem('flexi_sound') !== 'false';
    this.voiceEnabled = localStorage.getItem('flexi_voice') !== 'false';
    this.swedishVoice = null;
    this.initVoices();
  }

   ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  initVoices() {
    if (!('speechSynthesis' in window)) return;
    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      this.swedishVoice =
        voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('sv') && v.name.toLowerCase().includes('natural')) ||
        voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('sv')) ||
        null;
    };
    pickVoice();
    window.speechSynthesis.onvoiceschanged = pickVoice;
  }

  setSoundEnabled(val) {
    this.soundEnabled = Boolean(val);
    localStorage.setItem('flexi_sound', String(this.soundEnabled));
  }

  setVoiceEnabled(val) {
    this.voiceEnabled = Boolean(val);
    localStorage.setItem('flexi_voice', String(this.voiceEnabled));
    if (!this.voiceEnabled && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  // Plastigt "knäpp"-ljud som när man klickar ihop två Flexi-Trax-bitar
  playSnap(pitchMultiplier = 1.0) {
    if (!this.soundEnabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520 * pitchMultiplier, now);
    osc.frequency.exponentialRampToValueAtTime(1150 * pitchMultiplier, now + 0.045);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  // Scanner-ljud när bilden analyseras
  playScanSweep() {
    if (!this.soundEnabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const start = now + idx * 0.07;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.12, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.14);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + 0.15);
    });
  }

  // Ljud vid byte av byggsteg
  playStepChime(stepIndex = 0, totalSteps = 6) {
    if (!this.soundEnabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const baseFreq = 392 + (stepIndex / Math.max(1, totalSteps)) * 220;
    const freqs = [baseFreq, baseFreq * 1.25];

    freqs.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const start = now + i * 0.065;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, start);
      gain.gain.setValueAtTime(0.16, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + 0.19);
    });
  }

  // Glad bil-tuta ("Tut-tut!") + elbilssurr när testbilen startar
  playCarHorn() {
    if (!this.soundEnabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    [0, 0.14].forEach((offset) => {
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = now + offset;

      osc1.type = 'sawtooth';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(493.88, t); // B4
      osc2.frequency.setValueAtTime(622.25, t); // D#5

      gain.gain.setValueAtTime(0.11, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.10);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + 0.11);
      osc2.stop(t + 0.11);
    });
  }

  // Vinstfanfar när sista steget är färdigbyggt
  playVictoryFanfare() {
    if (!this.soundEnabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const melody = [
      { f: 523.25, t: 0.0, d: 0.12 },   // C5
      { f: 659.25, t: 0.12, d: 0.12 },  // E5
      { f: 783.99, t: 0.24, d: 0.12 },  // G5
      { f: 1046.5, t: 0.38, d: 0.35 }   // C6
    ];

    melody.forEach((n) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const start = now + n.t;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, start);

      gain.gain.setValueAtTime(0.2, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + n.d);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + n.d + 0.02);
    });
  }

  // Läs upp text på svenska (väntar in ev. ljudeffekt så det aldrig krockar)
  speak(text, force = false, delayMs = 220) {
    if (!force && !this.voiceEnabled) return;
    if (!('speechSynthesis' in window) || !text) return;

    window.speechSynthesis.cancel();
    setTimeout(() => {
      if (!force && !this.voiceEnabled) return;
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'sv-SE';
      if (this.swedishVoice) {
        utter.voice = this.swedishVoice;
      }
      utter.rate = 0.98;
      utter.pitch = 1.05;
      window.speechSynthesis.speak(utter);
    }, delayMs);
  }

  stopSpeech() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }
}

window.flexiAudio = new FlexiAudio();
