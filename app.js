// ============================================================================
// FlexiByggaren - Huvudapplikation, Garage, Ritnings-SVG & Testbil
// ============================================================================

const STORAGE_KEY_GARAGE = 'flexibyggaren_garage_v1';

const DEFAULT_GARAGE = {
  tracks: 120, // 120 bitar ≈ 270 cm
  supports: 4,
  bridge: 1,
  ySwitch: 2,
  xCross: 1,
  tunnel: 1,
  turntableLoop: 1
};

const SPECIAL_PARTS_CONFIG = [
  {
    key: 'supports',
    title: 'Brostöd / Bropelare',
    desc: 'Lyfter rälsen till Våning 2 (över/under)',
    svg: `<svg viewBox="0 0 48 48" width="42" height="42">
      <rect x="8" y="36" width="32" height="6" rx="2" fill="#64748b"/>
      <rect x="18" y="14" width="12" height="22" rx="2" fill="#94a3b8"/>
      <rect x="10" y="8" width="28" height="7" rx="3" fill="#f97316"/>
    </svg>`
  },
  {
    key: 'bridge',
    title: 'Fast Bro / Hängbro',
    desc: 'Röd/grå brosektion med sidoräcken',
    svg: `<svg viewBox="0 0 48 48" width="42" height="42">
      <path d="M4 32 Q24 10 44 32" fill="none" stroke="#ef4444" stroke-width="4"/>
      <line x1="14" y1="23" x2="14" y2="33" stroke="#ef4444" stroke-width="2.5"/>
      <line x1="24" y1="19" x2="24" y2="33" stroke="#ef4444" stroke-width="2.5"/>
      <line x1="34" y1="23" x2="34" y2="33" stroke="#ef4444" stroke-width="2.5"/>
      <rect x="4" y="31" width="40" height="6" rx="2" fill="#cbd5e1"/>
    </svg>`
  },
  {
    key: 'ySwitch',
    title: 'Y-växlar (Spårbyte)',
    desc: '2-vägs eller 3-vägs växel för dubbla spår',
    svg: `<svg viewBox="0 0 48 48" width="42" height="42">
      <path d="M6 24 L22 24 L40 12" fill="none" stroke="#eab308" stroke-width="7" stroke-linecap="round"/>
      <path d="M20 24 L40 36" fill="none" stroke="#eab308" stroke-width="7" stroke-linecap="round"/>
      <circle cx="21" cy="24" r="4" fill="#ef4444"/>
    </svg>`
  },
  {
    key: 'xCross',
    title: 'X-korsning (4-vägs)',
    desc: 'Där banan korsar sig själv i samma plan',
    svg: `<svg viewBox="0 0 48 48" width="42" height="42">
      <line x1="8" y1="8" x2="40" y2="40" stroke="#a855f7" stroke-width="8" stroke-linecap="round"/>
      <line x1="40" y1="8" x2="8" y2="40" stroke="#a855f7" stroke-width="8" stroke-linecap="round"/>
      <rect x="19" y="19" width="10" height="10" rx="2" fill="#f8fafc"/>
    </svg>`
  },
  {
    key: 'tunnel',
    title: 'Tunnel / Grotta / Berg',
    desc: 'Tuff tunnel eller dinogrotta att köra igenom',
    svg: `<svg viewBox="0 0 48 48" width="42" height="42">
      <path d="M6 38 Q10 10 24 10 Q38 10 42 38 Z" fill="#22c55e"/>
      <path d="M15 38 Q16 22 24 22 Q32 22 33 38 Z" fill="#0f172a"/>
    </svg>`
  },
  {
    key: 'turntableLoop',
    title: 'Vändskiva / Loop / Ramp',
    desc: 'Bilvändare, hoppbacke eller stunt-loop',
    svg: `<svg viewBox="0 0 48 48" width="42" height="42">
      <circle cx="24" cy="24" r="16" fill="#334155" stroke="#ec4899" stroke-width="3.5"/>
      <rect x="10" y="20" width="28" height="8" rx="3" fill="#facc15"/>
      <circle cx="24" cy="24" r="3.5" fill="#ef4444"/>
    </svg>`
  }
];

class FlexiApp {
  constructor() {
    this.garage = this.loadGarage();
    this.lastScanResult = null;
    this.allTracks = [];
    this.customRandomTracks = [];
    this.activeFilter = 'all';
    this.activeTrack = null;
    this.activeStepIndex = 0; // 0..N-1, eller -1 för "Visa hela banan"
    this.showGhostSteps = true;
    this.carAnimFrame = null;

    this.init();
  }

  loadGarage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_GARAGE);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_GARAGE, ...parsed };
      }
    } catch {
      // Fallback till standardgarage
    }
    return { ...DEFAULT_GARAGE };
  }

  saveGarage() {
    try {
      localStorage.setItem(STORAGE_KEY_GARAGE, JSON.stringify(this.garage));
    } catch {
      // Ignorera lagringsfel i privat läge
    }
    this.updateHeaderSummary();
  }

  init() {
    this.bindHeaderAndTabs();
    this.renderSpecialPartsGarage();
    this.updateGarageUI();
    this.bindGarageControls();
    this.bindScannerControls();
    this.bindTracksControls();
    this.bindBuilderControls();

    // Generera initiala banor och välj Mega-banan som förvald i Steg-för-steg
    this.refreshTracksList();
    if (this.allTracks.length > 0) {
      this.selectTrackForBuilder(this.allTracks[0], false);
    }

    // Registrera PWA Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  bindHeaderAndTabs() {
    const voiceBtn = document.getElementById('toggleVoiceBtn');
    const soundBtn = document.getElementById('toggleSoundBtn');

    const syncAudioButtons = () => {
      voiceBtn.classList.toggle('active', window.flexiAudio.voiceEnabled);
      soundBtn.classList.toggle('active', window.flexiAudio.soundEnabled);
    };
    syncAudioButtons();

    voiceBtn.addEventListener('click', () => {
      window.flexiAudio.setVoiceEnabled(!window.flexiAudio.voiceEnabled);
      syncAudioButtons();
      if (window.flexiAudio.voiceEnabled) {
        window.flexiAudio.speak('Svensk röstuppläsning är aktiverad!', true, 50);
      }
    });

    soundBtn.addEventListener('click', () => {
      window.flexiAudio.setSoundEnabled(!window.flexiAudio.soundEnabled);
      syncAudioButtons();
      if (window.flexiAudio.soundEnabled) {
        window.flexiAudio.playSnap(1.1);
      }
    });

    document.getElementById('brandHomeBtn').addEventListener('click', () => this.switchTab('garage'));
    document.getElementById('headerGarageBtn').addEventListener('click', () => this.switchTab('garage'));

    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });
  }

  switchTab(tabName) {
    this.stopCarAnimation();
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabName);
    });
    document.querySelectorAll('.tab-panel').forEach((p) => {
      p.classList.toggle('active', p.id === `panel-${tabName}`);
    });

    if (tabName === 'tracks') {
      this.refreshTracksList();
    } else if (tabName === 'builder') {
      if (!this.activeTrack && this.allTracks.length > 0) {
        this.activeTrack = this.allTracks[0];
      }
      this.renderBuilderView();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  updateHeaderSummary() {
    const cm = Math.round(this.garage.tracks * window.FLEXI_CM_PER_BIT);
    const totalSpecial =
      (this.garage.supports || 0) +
      (this.garage.bridge || 0) +
      (this.garage.ySwitch || 0) +
      (this.garage.xCross || 0) +
      (this.garage.tunnel || 0) +
      (this.garage.turntableLoop || 0);

    document.getElementById('headerGarageText').textContent =
      `🛤️ ${this.garage.tracks} bitar (${cm} cm) • 🧩 ${totalSpecial} special`;
  }

  // ==========================================================================
  // FLIK 1: GARAGE & LOKAL KAMERA-SCANNER
  // ==========================================================================
  renderSpecialPartsGarage() {
    const grid = document.getElementById('specialPartsGrid');
    grid.innerHTML = SPECIAL_PARTS_CONFIG.map(
      (part) => `
      <div class="part-card ${this.garage[part.key] > 0 ? 'has-items' : ''}" id="part-card-${part.key}">
        <div class="part-card-top">
          <div class="part-svg-thumb">${part.svg}</div>
          <div class="part-info">
            <h4>${part.title}</h4>
            <p>${part.desc}</p>
          </div>
        </div>
        <div class="part-counter-row">
          <button class="counter-circle-btn" data-part="${part.key}" data-delta="-1" type="button" aria-label="Minska ${part.title}">−</button>
          <span class="part-count-num" id="part-val-${part.key}">${this.garage[part.key] || 0} st</span>
          <button class="counter-circle-btn" data-part="${part.key}" data-delta="1" type="button" aria-label="Öka ${part.title}">+</button>
        </div>
      </div>
    `
    ).join('');

    grid.querySelectorAll('.counter-circle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-part');
        const delta = Number(btn.getAttribute('data-delta'));
        this.garage[key] = Math.max(0, Math.min(30, (this.garage[key] || 0) + delta));
        window.flexiAudio.playSnap(delta > 0 ? 1.12 : 0.9);
        this.updateGarageUI();
        this.refreshTracksList();
      });
    });
  }

  updateGarageUI() {
    const tracks = Math.max(24, Math.min(500, Math.round(this.garage.tracks)));
    this.garage.tracks = tracks;
    const cm = Math.round(tracks * window.FLEXI_CM_PER_BIT);
    const meters = (cm / 100).toFixed(2).replace('.', ',');

    document.getElementById('garageTracksVal').textContent = String(tracks);
    document.getElementById('garageCmVal').textContent = `${cm} cm`;
    document.getElementById('garageMeterVal').textContent = `(${meters} meter räls)`;

    const slider = document.getElementById('garageTracksSlider');
    slider.value = String(Math.min(420, Math.max(32, tracks)));

    SPECIAL_PARTS_CONFIG.forEach((part) => {
      const valEl = document.getElementById(`part-val-${part.key}`);
      const cardEl = document.getElementById(`part-card-${part.key}`);
      const count = this.garage[part.key] || 0;
      if (valEl) valEl.textContent = `${count} st`;
      if (cardEl) cardEl.classList.toggle('has-items', count > 0);
    });

    this.saveGarage();
  }

  bindGarageControls() {
    const slider = document.getElementById('garageTracksSlider');
    slider.addEventListener('input', () => {
      this.garage.tracks = Number(slider.value);
      this.updateGarageUI();
    });
    slider.addEventListener('change', () => {
      window.flexiAudio.playSnap(1.0);
      this.refreshTracksList();
    });

    document.querySelectorAll('[data-track-delta]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const delta = Number(btn.getAttribute('data-track-delta'));
        this.garage.tracks = Math.max(24, Math.min(500, this.garage.tracks + delta));
        window.flexiAudio.playSnap(delta > 0 ? 1.1 : 0.92);
        this.updateGarageUI();
        this.refreshTracksList();
      });
    });

    // Snabb-presets (Litet set, Mellanset, Stora lådan)
    document.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.getAttribute('data-preset');
        if (preset === 'small') {
          this.garage = {
            tracks: 64,
            supports: 2,
            bridge: 0,
            ySwitch: 0,
            xCross: 0,
            tunnel: 1,
            turntableLoop: 0
          };
        } else if (preset === 'medium') {
          this.garage = {
            tracks: 120,
            supports: 4,
            bridge: 1,
            ySwitch: 2,
            xCross: 1,
            tunnel: 1,
            turntableLoop: 1
          };
        } else if (preset === 'mega') {
          this.garage = {
            tracks: 220,
            supports: 8,
            bridge: 2,
            ySwitch: 3,
            xCross: 2,
            tunnel: 2,
            turntableLoop: 2
          };
        }
        window.flexiAudio.playSnap(1.2);
        this.updateGarageUI();
        this.refreshTracksList();
      });
    });

    document.getElementById('goToTracksCtaBtn').addEventListener('click', () => {
      window.flexiAudio.playSnap(1.15);
      this.switchTab('tracks');
    });
  }

  bindScannerControls() {
    const handleFileSelect = (file) => {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          this.runImageAnalysis(img);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    };

    document.getElementById('cameraInput').addEventListener('change', (e) => {
      handleFileSelect(e.target.files[0]);
      e.target.value = '';
    });

    document.getElementById('galleryInput').addEventListener('change', (e) => {
      handleFileSelect(e.target.files[0]);
      e.target.value = '';
    });

    document.getElementById('demoScanBtn').addEventListener('click', () => {
      const demoCanvas = window.flexiScanner.createDemoPhotoCanvas();
      this.runImageAnalysis(demoCanvas);
    });

    document.getElementById('applyReplaceGarageBtn').addEventListener('click', () => {
      if (!this.lastScanResult) return;
      this.garage = {
        tracks: this.lastScanResult.tracks,
        supports: this.lastScanResult.supports,
        bridge: this.lastScanResult.bridge,
        ySwitch: this.lastScanResult.ySwitch,
        xCross: this.lastScanResult.xCross,
        tunnel: this.lastScanResult.tunnel,
        turntableLoop: this.lastScanResult.turntableLoop
      };
      window.flexiAudio.playVictoryFanfare();
      this.updateGarageUI();
      this.refreshTracksList();
    });

    document.getElementById('applyAddGarageBtn').addEventListener('click', () => {
      if (!this.lastScanResult) return;
      this.garage = {
        tracks: Math.min(500, this.garage.tracks + this.lastScanResult.tracks),
        supports: this.garage.supports + this.lastScanResult.supports,
        bridge: this.garage.bridge + this.lastScanResult.bridge,
        ySwitch: this.garage.ySwitch + this.lastScanResult.ySwitch,
        xCross: this.garage.xCross + this.lastScanResult.xCross,
        tunnel: this.garage.tunnel + this.lastScanResult.tunnel,
        turntableLoop: this.garage.turntableLoop + this.lastScanResult.turntableLoop
      };
      window.flexiAudio.playSnap(1.25);
      this.updateGarageUI();
      this.refreshTracksList();
    });
  }

  runImageAnalysis(source) {
    window.flexiAudio.playScanSweep();
    const targetCanvas = document.getElementById('scannerCanvas');
    const result = window.flexiScanner.analyzeImageSource(source, targetCanvas);
    this.lastScanResult = result;

    document.getElementById('scanResultBox').classList.remove('hidden');
    document.getElementById('scanOverlayBadge').textContent =
      `🔍 Hittade ${result.objectCount} del-grupper i bilden!`;

    const chips = [
      `<span class="scan-chip">🛤️ ~${result.tracks} rälsbitar (ca ${result.cm} cm)</span>`
    ];
    if (result.supports > 0) chips.push(`<span class="scan-chip">🏛️ ${result.supports} st Bropelare</span>`);
    if (result.bridge > 0) chips.push(`<span class="scan-chip">🌉 ${result.bridge} st Fast Bro</span>`);
    if (result.ySwitch > 0) chips.push(`<span class="scan-chip">🔀 ${result.ySwitch} st Y-växel</span>`);
    if (result.xCross > 0) chips.push(`<span class="scan-chip">✖️ ${result.xCross} st X-korsning</span>`);
    if (result.tunnel > 0) chips.push(`<span class="scan-chip">⛰️ ${result.tunnel} st Tunnel/Grotta</span>`);
    if (result.turntableLoop > 0) chips.push(`<span class="scan-chip">🔄 ${result.turntableLoop} st Vändskiva/Ramp</span>`);

    document.getElementById('scanDetectedChips').innerHTML = chips.join('');

    window.flexiAudio.speak(
      `Bildanalys klar! Jag hittade ungefär ${result.tracks} rälsbitar, vilket är cirka ${result.cm} centimeter.`,
      false,
      350
    );
  }

  // ==========================================================================
  // FLIK 2: BANFÖRSLAG & SLUMPGENERATOR
  // ==========================================================================
  bindTracksControls() {
    document.querySelectorAll('#categoryFilters .filter-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#categoryFilters .filter-chip').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeFilter = btn.getAttribute('data-filter');
        this.renderTracksGrid();
      });
    });

    document.getElementById('randomTrackBtn').addEventListener('click', () => {
      window.flexiAudio.playSnap(1.2);
      const customTrack = window.flexiTrackGenerator.generateRandomCustomTrack(this.garage);
      this.customRandomTracks.unshift(customTrack);
      this.refreshTracksList();
      this.selectTrackForBuilder(customTrack, true);
    });
  }

  refreshTracksList() {
    const baseTracks = window.flexiTrackGenerator.generateAllTracks(this.garage);
    this.allTracks = [...this.customRandomTracks, ...baseTracks];

    document.getElementById('trackCountBadge').textContent = String(this.allTracks.length);

    const cm = Math.round(this.garage.tracks * window.FLEXI_CM_PER_BIT);
    document.getElementById('tracksInventorySummary').textContent =
      `Anpassade efter ditt garage: ${this.garage.tracks} rälsbitar (ca ${cm} cm) och dina specialdelar.`;

    // Om en bana redan är öppen i bygg-läget, uppdatera den med nya garagemåtten
    if (this.activeTrack) {
      const updated = this.allTracks.find((t) => t.id === this.activeTrack.id);
      if (updated) {
        this.activeTrack = updated;
        this.activeStepIndex = Math.min(this.activeStepIndex, updated.steps.length - 1);
      }
    }

    this.renderTracksGrid();
  }

  renderTracksGrid() {
    const grid = document.getElementById('tracksGrid');
    const filtered = this.allTracks.filter((t) => {
      if (this.activeFilter === 'all') return true;
      return t.category === this.activeFilter;
    });

    grid.innerHTML = filtered
      .map((track) => {
        const specialPills = Object.entries(track.usedSpecialTotals)
          .filter(([, cnt]) => cnt > 0)
          .map(([type, cnt]) => {
            const meta = window.SPECIAL_PART_META[type];
            return `<span class="stat-pill">${meta.icon} ${cnt} ${meta.shortName}</span>`;
          })
          .join('');

        return `
        <article class="track-card ${track.category === 'maxi' ? 'featured-maxi' : ''}">
          <div class="track-preview-svg-wrap">
            <span class="track-card-badge" style="background: ${track.badgeColor}">${track.difficulty}</span>
            <span class="track-steps-count-badge">📋 ${track.steps.length} byggsteg</span>
            ${this.buildTrackSvgMarkup(track, -1, true)}
          </div>
          <div class="track-card-body">
            <h3>${track.name}</h3>
            <p class="track-card-desc">${track.description}</p>
            <div class="track-stats-chips">
              <span class="stat-pill">🛤️ ${track.totalPiecesUsed} bitar (ca ${track.totalCmUsed} cm)</span>
              <span class="stat-pill">📏 Yta: ca ${track.floorWidthCm} × ${track.floorHeightCm} cm</span>
              ${specialPills}
            </div>
            <button class="btn btn-primary" data-open-track="${track.id}" type="button" style="margin-top: auto;">
              📐 Bygg steg-för-steg (${track.steps.length} steg) ➔
            </button>
          </div>
        </article>
      `;
      })
      .join('');

    grid.querySelectorAll('[data-open-track]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-open-track');
        const found = this.allTracks.find((t) => t.id === id);
        if (found) {
          window.flexiAudio.playStepChime(0, found.steps.length);
          this.selectTrackForBuilder(found, true);
        }
      });
    });
  }

  selectTrackForBuilder(track, switchToBuilderTab = true) {
    this.activeTrack = track;
    this.activeStepIndex = 0;
    if (switchToBuilderTab) {
      this.switchTab('builder');
      this.speakCurrentStep();
    } else {
      this.renderBuilderView();
    }
  }

  // ==========================================================================
  // FLIK 3: INTERAKTIV STEG-FÖR-STEG-RITNING (LEGO-MANUAL)
  // ==========================================================================
  bindBuilderControls() {
    document.getElementById('backToTracksBtn').addEventListener('click', () => {
      this.switchTab('tracks');
    });

    document.getElementById('toggleGhostStepsBtn').addEventListener('click', (e) => {
      this.showGhostSteps = !this.showGhostSteps;
      e.currentTarget.classList.toggle('active', this.showGhostSteps);
      e.currentTarget.textContent = this.showGhostSteps ? '👻 Spöklinjer: På' : '👻 Spöklinjer: Av';
      this.renderBlueprintSvgOnly();
    });

    document.getElementById('overviewAllStepsBtn').addEventListener('click', () => {
      this.activeStepIndex = -1; // -1 = Visa hela färdiga banan
      window.flexiAudio.playVictoryFanfare();
      this.renderBuilderView();
    });

    document.getElementById('prevStepBtn').addEventListener('click', () => {
      if (!this.activeTrack) return;
      if (this.activeStepIndex === -1) {
        this.activeStepIndex = this.activeTrack.steps.length - 1;
      } else if (this.activeStepIndex > 0) {
        this.activeStepIndex--;
      }
      window.flexiAudio.playStepChime(this.activeStepIndex, this.activeTrack.steps.length);
      this.renderBuilderView();
      this.speakCurrentStep();
    });

    document.getElementById('nextStepBtn').addEventListener('click', () => {
      if (!this.activeTrack) return;
      const total = this.activeTrack.steps.length;
      if (this.activeStepIndex >= 0 && this.activeStepIndex < total - 1) {
        this.activeStepIndex++;
        window.flexiAudio.playStepChime(this.activeStepIndex, total);
        this.renderBuilderView();
        this.speakCurrentStep();
      } else if (this.activeStepIndex === total - 1) {
        // Sista steget är klart -> Visa hela banan och starta testbilen!
        this.activeStepIndex = -1;
        window.flexiAudio.playVictoryFanfare();
        this.renderBuilderView();
        window.flexiAudio.speak(
          `Snyggt jobbat! Hela ${this.activeTrack.name} är nu färdigbyggd! Nu testkör vi bilen på banan!`,
          false,
          350
        );
        this.startCarTestDrive();
      } else {
        // Om vi var i "Hela banan"-läget, börja om från Steg 1
        this.activeStepIndex = 0;
        this.renderBuilderView();
        this.speakCurrentStep();
      }
    });

    document.getElementById('speakStepBtn').addEventListener('click', () => {
      this.speakCurrentStep(true);
    });

    document.getElementById('testDriveBtn').addEventListener('click', () => {
      this.startCarTestDrive();
    });
  }

  speakCurrentStep(force = false) {
    if (!this.activeTrack) return;
    if (this.activeStepIndex === -1) {
      window.flexiAudio.speak(
        `Hela banan visas nu! Totalt ${this.activeTrack.totalPiecesUsed} rälsbitar, ungefär ${this.activeTrack.totalCmUsed} centimeter.`,
        force
      );
      return;
    }
    const step = this.activeTrack.steps[this.activeStepIndex];
    if (step) {
      window.flexiAudio.speak(step.voiceText, force);
    }
  }

  renderBuilderView() {
    if (!this.activeTrack) return;
    const track = this.activeTrack;
    const totalSteps = track.steps.length;

    document.getElementById('builderDifficultyBadge').textContent = track.difficulty;
    document.getElementById('builderDifficultyBadge').style.background = track.badgeColor;
    document.getElementById('builderTrackName').textContent = track.name;
    document.getElementById('builderMetaLine').textContent =
      `🛤️ ${track.totalPiecesUsed} rälsbitar (ca ${track.totalCmUsed} cm) • 📏 Golvyta: ca ${track.floorWidthCm} × ${track.floorHeightCm} cm`;

    // Steg-piller högst upp
    const pillsBar = document.getElementById('stepPillsBar');
    const stepPillsHtml = track.steps
      .map((s, idx) => {
        const isDone = this.activeStepIndex === -1 || idx < this.activeStepIndex;
        const isActive = idx === this.activeStepIndex;
        return `<button class="step-pill-btn ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}" data-step-idx="${idx}" type="button">
          ${isDone ? '✓ ' : ''}Steg ${s.stepNumber} (${s.pieces} bit / ${s.cm} cm)
        </button>`;
      })
      .join('');

    pillsBar.innerHTML =
      stepPillsHtml +
      `<button class="step-pill-btn ${this.activeStepIndex === -1 ? 'active' : ''}" data-step-idx="-1" type="button">
        🏁 Hela banan
      </button>`;

    pillsBar.querySelectorAll('.step-pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-step-idx'));
        this.activeStepIndex = idx;
        window.flexiAudio.playStepChime(Math.max(0, idx), totalSteps);
        this.renderBuilderView();
        this.speakCurrentStep();
      });
    });

    // Uppdatera SVG-ritningen
    this.renderBlueprintSvgOnly();

    // Uppdatera högerpanelen (LEGO-manual steg-kortet)
    const floorPill = document.getElementById('stepFloorPill');
    const partsList = document.getElementById('stepPartsNeededList');
    const prevBtn = document.getElementById('prevStepBtn');
    const nextBtn = document.getElementById('nextStepBtn');

    if (this.activeStepIndex === -1) {
      document.getElementById('stepNumberBadge').textContent = `🏁 HELA BANAN KLAR (${totalSteps} STEG)`;
      floorPill.textContent = '🚙 Redo för provkörning!';
      floorPill.className = 'step-floor-pill';

      document.getElementById('stepTitleHeading').textContent = 'Banan är färdigbyggd!';
      document.getElementById('stepShapeSubtitle').textContent =
        `Total längd: ${track.totalPiecesUsed} bitar (ca ${track.totalCmUsed} cm) • Yta: ${track.floorWidthCm} × ${track.floorHeightCm} cm`;

      const allSpecialRows = Object.entries(track.usedSpecialTotals)
        .filter(([, cnt]) => cnt > 0)
        .map(([type, cnt]) => {
          const meta = window.SPECIAL_PART_META[type];
          return `
          <div class="lego-part-row">
            <div class="lego-part-left">
              <span class="lego-part-icon">${meta.icon}</span>
              <div>
                <div class="lego-part-title">${meta.name}</div>
                <div class="lego-part-sub">Ingår i banan</div>
              </div>
            </div>
            <span class="lego-part-badge">${cnt} st</span>
          </div>`;
        })
        .join('');

      partsList.innerHTML = `
        <div class="lego-part-row">
          <div class="lego-part-left">
            <span class="lego-part-icon">🛤️</span>
            <div>
              <div class="lego-part-title">Alla rälsbitar i banan</div>
              <div class="lego-part-sub">Komplett sluten bana</div>
            </div>
          </div>
          <span class="lego-part-badge">${track.totalPiecesUsed} bitar (${track.totalCmUsed} cm)</span>
        </div>
        ${allSpecialRows}
      `;

      document.getElementById('stepMainInstruction').textContent =
        'Kontrollera att alla kopplingar sitter ihop ordentligt och tryck på "🚙 Testkör bilen!" för att se bilen köra runt hela ritningen!';
      document.getElementById('stepTipCallout').textContent =
        '💡 Tips: Du kan klicka på valfritt steg ovanför om du vill titta närmare på någon del av ritningen.';

      prevBtn.disabled = false;
      nextBtn.textContent = '🔄 Börja om från Steg 1';
    } else {
      const step = track.steps[this.activeStepIndex];
      document.getElementById('stepNumberBadge').textContent = `STEG ${step.stepNumber} AV ${totalSteps}`;
      floorPill.textContent = step.floorBadge;
      floorPill.className = `step-floor-pill ${step.elevation === 2 ? 'floor-2' : ''}`;

      document.getElementById('stepTitleHeading').textContent = step.title;
      document.getElementById('stepShapeSubtitle').textContent = `Form: ${step.shapeBadge}`;

      const specialRows = step.specialParts
        .map(
          (sp) => `
        <div class="lego-part-row">
          <div class="lego-part-left">
            <span class="lego-part-icon">${sp.icon}</span>
            <div>
              <div class="lego-part-title">${sp.name}</div>
              <div class="lego-part-sub">Monteras vid markeringen på ritningen</div>
            </div>
          </div>
          <span class="lego-part-badge">${sp.count} st</span>
        </div>`
        )
        .join('');

      partsList.innerHTML = `
        <div class="lego-part-row">
          <div class="lego-part-left">
            <span class="lego-part-icon">🛤️</span>
            <div>
              <div class="lego-part-title">Böjbar Räls-sektion</div>
              <div class="lego-part-sub">Förslag: ${step.colorBreakdown}</div>
            </div>
          </div>
          <span class="lego-part-badge">${step.pieces} bitar (ca ${step.cm} cm)</span>
        </div>
        ${specialRows}
      `;

      document.getElementById('stepMainInstruction').textContent = step.instruction;
      document.getElementById('stepTipCallout').textContent = `💡 Bygg-tips: ${step.tip}`;

      prevBtn.disabled = this.activeStepIndex === 0;
      nextBtn.textContent =
        this.activeStepIndex === totalSteps - 1
          ? '🎉 Banan är klar! Testkör! 🚙'
          : `Nästa steg (Steg ${step.stepNumber + 1}) ➡️`;
    }
  }

  renderBlueprintSvgOnly() {
    if (!this.activeTrack) return;
    const container = document.getElementById('blueprintSvgContainer');
    container.innerHTML = this.buildTrackSvgMarkup(this.activeTrack, this.activeStepIndex, false);
  }

  // ==========================================================================
  // SVG RITNINGS-GENERATOR (Både för Miniatyrkort & Interaktiv LEGO-Ritning)
  // ==========================================================================
  buildTrackSvgMarkup(track, currentStepIdx = -1, isMiniPreview = false) {
    const isOverview = currentStepIdx === -1;
    const colors = ['#ef4444', '#facc15', '#3b82f6', '#22c55e'];

    // 1. Bakgrunds-rutnät med centimeterskala
    let gridMarkup = '';
    for (let x = 0; x <= 800; x += 50) {
      gridMarkup += `<line x1="${x}" y1="0" x2="${x}" y2="520" stroke="rgba(56,189,248,0.09)" stroke-width="1"/>`;
    }
    for (let y = 0; y <= 520; y += 50) {
      gridMarkup += `<line x1="0" y1="${y}" x2="800" y2="${y}" stroke="rgba(56,189,248,0.09)" stroke-width="1"/>`;
    }

    if (!isMiniPreview) {
      gridMarkup += `
        <text x="400" y="22" text-anchor="middle" fill="#7dd3fc" font-size="13" font-weight="bold">
          ↔️ Bredd: ca ${track.floorWidthCm} cm
        </text>
        <text x="20" y="260" text-anchor="middle" fill="#7dd3fc" font-size="13" font-weight="bold" transform="rotate(-90 20 260)">
          ↕️ Djup: ca ${track.floorHeightCm} cm
        </text>
      `;
    }

    // Hjälpfunktion för att rita ett enskilt byggsteg
    const renderStepPath = (step, idx) => {
      const pts = step.points;
      if (!pts || pts.length < 2) return '';

      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      const isFuture = !isOverview && idx > currentStepIdx;
      const isCurrent = !isOverview && idx === currentStepIdx;

      if (isFuture) {
        if (!this.showGhostSteps) return '';
        return `
          <g class="step-group future-step" opacity="0.32">
            <path d="${d}" fill="none" stroke="#64748b" stroke-width="14" stroke-dasharray="10 8" stroke-linecap="round"/>
          </g>
        `;
      }

      let stepSvg = `<g class="step-group ${isCurrent ? 'current-step' : 'built-step'}">`;

      // Om steget ligger på Våning 2 (bro/upphöjt), rita tydlig skugga + bro-kant under spåret!
      if (step.elevation === 2) {
        stepSvg += `
          <path d="${d}" fill="none" stroke="rgba(0,0,0,0.65)" stroke-width="32" stroke-linecap="round" transform="translate(5, 9)"/>
          <path d="${d}" fill="none" stroke="#f97316" stroke-width="26" stroke-linecap="round"/>
        `;
      }

      // Om det är det AKTUELLA steget som byggs nu -> Pulserande gul glöd bakom rälsen!
      if (isCurrent && !isMiniPreview) {
        stepSvg += `
          <path d="${d}" fill="none" stroke="#facc15" stroke-width="30" stroke-linecap="round" class="svg-active-glow" opacity="0.8"/>
        `;
      }

      // Bas-skena (mörk rälsbas)
      stepSvg += `<path d="${d}" fill="none" stroke="#1e293b" stroke-width="20" stroke-linecap="round"/>`;

      // Rita de färgglada tvärslåarna (Flexi-Trax karakteristiska röda/gula/blå/gröna plastlänkar!)
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const col = colors[(idx * 4 + Math.floor(i / 2)) % 4];
        const deg = (p.angle * 180) / Math.PI;
        const opacity = isOverview || isCurrent ? 1.0 : 0.78;
        stepSvg += `
          <g transform="translate(${p.x.toFixed(1)}, ${p.y.toFixed(1)}) rotate(${deg.toFixed(1)})" opacity="${opacity}">
            <rect x="-3.2" y="-9.5" width="6.4" height="19" rx="1.8" fill="${col}"/>
            <rect x="-2" y="-5" width="4" height="10" fill="rgba(15,23,42,0.45)"/>
          </g>
        `;
      }

      // Om det är aktuellt steg, rita riktningspilar längs rälsen så man ser byggriktningen A -> B
      if (isCurrent && !isMiniPreview) {
        [0.3, 0.65].forEach((frac) => {
          const p = pts[Math.floor(frac * (pts.length - 1))];
          if (p) {
            const deg = (p.angle * 180) / Math.PI;
            stepSvg += `
              <g transform="translate(${p.x.toFixed(1)}, ${p.y.toFixed(1)}) rotate(${deg.toFixed(1)})">
                <polygon points="-6,-6 8,0 -6,6" fill="#ffffff" stroke="#0f172a" stroke-width="1.5"/>
              </g>
            `;
          }
        });
      }

      // Rita ut specialdelar (Bropelare, Fast Bro, Y-växel, X-korsning, Tunnel, Vändskiva) på sina exakta platser
      step.specialParts.forEach((sp) => {
        const badgeR = isMiniPreview ? 14 : 18;
        stepSvg += `
          <g transform="translate(${sp.x.toFixed(1)}, ${sp.y.toFixed(1)})">
            <circle cx="0" cy="0" r="${badgeR}" fill="#0f172a" stroke="${sp.color}" stroke-width="3"/>
            <text x="0" y="5" text-anchor="middle" font-size="${isMiniPreview ? 13 : 16}">${sp.icon}</text>
            ${
              !isMiniPreview
                ? `<rect x="-44" y="${badgeR + 3}" width="88" height="18" rx="5" fill="rgba(15,23,42,0.9)" stroke="${sp.color}" stroke-width="1"/>
                   <text x="0" y="${badgeR + 15}" text-anchor="middle" fill="#f8fafc" font-size="10.5" font-weight="bold">${sp.count}× ${sp.shortName}</text>`
                : ''
            }
          </g>
        `;
      });

      // Steg-nummer-bubbla mitt på sektionen
      if (!isMiniPreview) {
        const mid = pts[Math.floor(pts.length * 0.5)];
        const bubbleBg = isCurrent ? '#facc15' : '#22c55e';
        const bubbleFg = '#0f172a';
        stepSvg += `
          <g transform="translate(${mid.x.toFixed(1)}, ${(mid.y - 22).toFixed(1)})">
            <rect x="-48" y="-13" width="96" height="24" rx="12" fill="${bubbleBg}" stroke="#0f172a" stroke-width="2"/>
            <text x="0" y="3" text-anchor="middle" fill="${bubbleFg}" font-size="11.5" font-weight="900">
              Steg ${step.stepNumber}: ${step.pieces}b (${step.cm}cm)
            </text>
          </g>
        `;
      }

      // Om det är det AKTUELLA steget: Rita tydliga A (Starta här) och B (Koppla ihop här) markörer!
      if (isCurrent && !isMiniPreview) {
        const startPt = pts[0];
        const endPt = pts[pts.length - 1];
        stepSvg += `
          <g transform="translate(${startPt.x.toFixed(1)}, ${startPt.y.toFixed(1)})">
            <circle cx="0" cy="0" r="15" fill="#22c55e" stroke="#ffffff" stroke-width="2.5"/>
            <text x="0" y="5" text-anchor="middle" fill="#052e16" font-size="14" font-weight="900">A</text>
          </g>
          <g transform="translate(${endPt.x.toFixed(1)}, ${endPt.y.toFixed(1)})">
            <circle cx="0" cy="0" r="15" fill="#f97316" stroke="#ffffff" stroke-width="2.5"/>
            <text x="0" y="5" text-anchor="middle" fill="#0f172a" font-size="14" font-weight="900">B</text>
          </g>
        `;
      }

      stepSvg += `</g>`;
      return stepSvg;
    };

    // Sortera så att Våning 1 ritas först och Våning 2 (Broar) alltid ritas ÖVER Våning 1,
    // och det aktiva steget alltid har sina A/B-markörer överst!
    const floor1Steps = [];
    const floor2Steps = [];
    track.steps.forEach((step, idx) => {
      if (step.elevation === 2) {
        floor2Steps.push({ step, idx });
      } else {
        floor1Steps.push({ step, idx });
      }
    });

    const floor1Svg = floor1Steps.map(({ step, idx }) => renderStepPath(step, idx)).join('');
    const floor2Svg = floor2Steps.map(({ step, idx }) => renderStepPath(step, idx)).join('');

    // Grupp för den animerade testbilen
    const carOverlaySvg = !isMiniPreview
      ? `<g id="animatedTestCar" visibility="hidden" transform="translate(0,0)">
          <rect x="-18" y="-11" width="36" height="22" rx="6" fill="#ef4444" stroke="#ffffff" stroke-width="2"/>
          <rect x="-6" y="-8" width="14" height="16" rx="3" fill="#bae6fd"/>
          <circle cx="18" cy="-6" r="3" fill="#fef08a"/>
          <circle cx="18" cy="6" r="3" fill="#fef08a"/>
        </g>`
      : '';

    return `
      <svg viewBox="0 0 800 520" xmlns="http://www.w3.org/2000/svg">
        ${gridMarkup}
        ${floor1Svg}
        ${floor2Svg}
        ${carOverlaySvg}
      </svg>
    `;
  }

  // ==========================================================================
  // 🚙 ANIMERAD TESTKÖRNING AV BILEN RUNT HELA RITNINGEN
  // ==========================================================================
  stopCarAnimation() {
    if (this.carAnimFrame) {
      cancelAnimationFrame(this.carAnimFrame);
      this.carAnimFrame = null;
    }
  }

  startCarTestDrive() {
    if (!this.activeTrack) return;
    this.stopCarAnimation();
    window.flexiAudio.playCarHorn();

    // Samla alla punkter längs banan i ordning
    const allPts = [];
    this.activeTrack.steps.forEach((step) => {
      step.points.forEach((p) => allPts.push(p));
    });
    if (allPts.length < 2) return;

    const carEl = document.getElementById('animatedTestCar');
    if (!carEl) return;
    carEl.setAttribute('visibility', 'visible');

    let cursor = 0;
    const speed = 0.55; // punkter per frame
    const maxFrames = allPts.length * 2.2; // Kör drygt 1 helt varv
    let frameCount = 0;

    const tick = () => {
      frameCount++;
      cursor = (cursor + speed) % allPts.length;
      const idx = Math.floor(cursor);
      const nextIdx = (idx + 1) % allPts.length;
      const frac = cursor - idx;

      const p1 = allPts[idx];
      const p2 = allPts[nextIdx];
      const x = p1.x + (p2.x - p1.x) * frac;
      const y = p1.y + (p2.y - p1.y) * frac;
      const deg = (p1.angle * 180) / Math.PI;
      const scale = p1.elev === 2 ? 1.18 : 1.0;

      carEl.setAttribute(
        'transform',
        `translate(${x.toFixed(1)}, ${y.toFixed(1)}) rotate(${deg.toFixed(1)}) scale(${scale})`
      );

      if (frameCount < maxFrames) {
        this.carAnimFrame = requestAnimationFrame(tick);
      } else {
        window.flexiAudio.playCarHorn();
      }
    };

    this.carAnimFrame = requestAnimationFrame(tick);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.flexiApp = new FlexiApp();
});
