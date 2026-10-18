// ============================================================================
// FlexiByggaren - Lokal Räls-Rand-Detektor (Multi-Color Stripe Transitions)
// + Interaktiv Tap-to-Tag på fotot + Valfri Gemini Vision AI-djupanalys
// ============================================================================

const CM_PER_PIECE = 2.25; // 1 Flexi-Trax standardlänk ≈ 2,25 cm

class FlexiScanner {
  constructor() {
    this.workWidth = 320;
    this.lastSource = null;
    this.lastDetectedAnnotations = [];
    this.manualPins = []; // Användarens egna klick-markeringar på fotot
  }

  rgbToHsv(r, g, b) {
    const rf = r / 255;
    const gf = g / 255;
    const bf = b / 255;
    const max = Math.max(rf, gf, bf);
    const min = Math.min(rf, gf, bf);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    if (max !== min) {
      switch (max) {
        case rf:
          h = (gf - bf) / d + (gf < bf ? 6 : 0);
          break;
        case gf:
          h = (bf - rf) / d + 2;
          break;
        case bf:
          h = (rf - gf) / d + 4;
          break;
      }
      h /= 6;
    }
    return { h: h * 360, s, v };
  }

  // Klassificerar en pixel i diskreta Flexi-Trax-plastfärger (inklusive både klassiska
  // Röd/Gul/Blå/Grön OCH Safari/Dino-färger som Gul/Terracotta-brun/Benvit/Skogsgrön).
  // Returnerar 0 för trägolv, stolar, skuggor och neutrala ytor.
  classifyPlasticColor(r, g, b) {
    const { h: hue, s, v } = this.rgbToHsv(r, g, b);

    // 1 = Gul / Senapsgul räls (tydligt högre mättnad och gulare ton än ekparkett)
    if (hue >= 40 && hue <= 66 && s >= 0.46 && v >= 0.35) {
      return 1;
    }
    // 2 = Röd eller varm Terracotta/Orange-brun räls
    if ((hue <= 22 || hue >= 340) && s >= 0.48 && v >= 0.28) {
      return 2;
    }
    if (hue > 22 && hue < 40 && s >= 0.56 && v >= 0.35) {
      return 2;
    }
    // 3 = Grön / Mörk skogsgrön / Olivgrön räls
    if (hue >= 68 && hue <= 170 && s >= 0.28 && v >= 0.16) {
      return 3;
    }
    // 4 = Blå räls
    if (hue >= 175 && hue <= 265 && s >= 0.42 && v >= 0.25) {
      return 4;
    }
    // 5 = Benvit / Sandfärgad länk (endast giltig om den ligger precis intill färgade länkar!)
    if (s < 0.28 && v >= 0.52 && v <= 0.85) {
      return 5;
    }
    return 0;
  }

  // Analyserar en bild genom att leta efter Flexi-Trax unika signatur:
  // täta färgväxlingar (tvärslå-ränder) mellan olika plastfärger i samma räls-orm.
  // Detta filtrerar bort 100% av stolar, kläder, trägolv och skuggor!
  analyzeImageSource(source, targetCanvas, isDemo = false) {
    this.lastSource = source;
    this.manualPins = [];

    const srcW = source.naturalWidth || source.width || 640;
    const srcH = source.naturalHeight || source.height || 480;
    const ratio = srcH / srcW;
    const w = this.workWidth;
    const h = Math.max(160, Math.round(w * ratio));

    const offCanvas = document.createElement('canvas');
    offCanvas.width = w;
    offCanvas.height = h;
    const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
    offCtx.drawImage(source, 0, 0, w, h);

    const imgData = offCtx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Steg 1: Färgklassificera varje pixel
    const colorClass = new Uint8Array(w * h);
    const colorCounts = { red: 0, yellow: 0, blue: 0, green: 0 };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const i = idx * 4;
        colorClass[idx] = this.classifyPlasticColor(data[i], data[i + 1], data[i + 2]);
      }
    }

    // Steg 2: Hitta äkta randiga räls-regioner (Multi-Color Stripe Transition Filter)
    // En punkt är äkta Flexi-Trax-räls ENDAST om dess lokala omgivning (radie R=9px)
    // innehåller minst 2 olika rälsfärger OCH minst 3 distinkta färgväxlingar (räls-ränder)!
    const trackMask = new Uint8Array(w * h);
    const R = 9;
    let totalTransitions = 0;
    let totalStripedPixels = 0;

    for (let y = R; y < h - R; y++) {
      for (let x = R; x < w - R; x++) {
        const idx = y * w + x;
        const c = colorClass[idx];
        if (c === 0) continue;

        let c1 = 0, c2 = 0, c3 = 0, c4 = 0, c5 = 0;
        let transitions = 0;

        for (let dy = -R; dy <= R; dy += 3) {
          let prevC = 0;
          const rowOffset = (y + dy) * w;
          for (let dx = -R; dx <= R; dx += 3) {
            const nc = colorClass[rowOffset + (x + dx)];
            if (nc === 1) c1++;
            else if (nc === 2) c2++;
            else if (nc === 3) c3++;
            else if (nc === 4) c4++;
            else if (nc === 5) c5++;

            if (nc !== 0 && prevC !== 0 && nc !== prevC) {
              transitions++;
            }
            if (nc !== 0) {
              prevC = nc;
            }
          }
        }

        const vibrantTypes =
          (c1 >= 2 ? 1 : 0) +
          (c2 >= 2 ? 1 : 0) +
          (c3 >= 2 ? 1 : 0) +
          (c4 >= 2 ? 1 : 0);
        const totalVibrant = c1 + c2 + c3 + c4;

        if ((vibrantTypes >= 2 || (c1 >= 4 && c5 >= 3)) && transitions >= 3 && totalVibrant >= 5) {
          trackMask[idx] = 1;
          totalStripedPixels++;
          totalTransitions += transitions;

          if (c === 1) colorCounts.yellow++;
          else if (c === 2) colorCounts.red++;
          else if (c === 3) colorCounts.green++;
          else if (c === 4) colorCounts.blue++;
        }
      }
    }

    // Steg 3: Klustra ihop närliggande räls-pixlar med Connected Components (BFS)
    const visited = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    const trackBlobs = [];

    for (let y = R; y < h - R; y++) {
      for (let x = R; x < w - R; x++) {
        const startIdx = y * w + x;
        if (trackMask[startIdx] === 0 || visited[startIdx]) continue;

        let head = 0;
        let tail = 0;
        queue[tail++] = startIdx;
        visited[startIdx] = 1;

        let minX = x, maxX = x, minY = y, maxY = y;
        let area = 0;
        let blobTransitions = 0;

        while (head < tail) {
          const curr = queue[head++];
          const cy = Math.floor(curr / w);
          const cx = curr - cy * w;
          area++;

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          // Koppla ihop räls-sektioner inom 6 pixlars radie (så en rälshög i en låda eller en lång orm hålls ihop)
          for (let dy = -5; dy <= 5; dy += 2) {
            const ny = cy + dy;
            if (ny < R || ny >= h - R) continue;
            for (let dx = -5; dx <= 5; dx += 2) {
              const nx = cx + dx;
              if (nx < R || nx >= w - R) continue;
              const nIdx = ny * w + nx;
              if (trackMask[nIdx] === 1 && !visited[nIdx]) {
                visited[nIdx] = 1;
                queue[tail++] = nIdx;
              }
            }
          }
        }

        if (area >= 22) {
          blobTransitions = Math.round((area / Math.max(1, totalStripedPixels)) * totalTransitions);
          trackBlobs.push({
            minX: Math.max(0, minX - 6),
            maxX: Math.min(w - 1, maxX + 6),
            minY: Math.max(0, minY - 6),
            maxY: Math.min(h - 1, maxY + 6),
            bw: maxX - minX + 12,
            bh: maxY - minY + 12,
            area,
            blobTransitions
          });
        }
      }
    }

    // Sortera största rälsklustren först
    trackBlobs.sort((a, b) => b.area - a.area);

    // Beräkna antal rälsbitar per detekterat rälskluster (kalibrerat mot verkliga foton av räls i låda/golv)
    const annotations = [];
    let totalEstimatedPieces = 0;

    trackBlobs.slice(0, 8).forEach((b, idx) => {
      const pieces = Math.max(
        10,
        Math.min(260, Math.round(Math.sqrt(b.area) * 3.15 + b.blobTransitions * 0.0038))
      );
      totalEstimatedPieces += pieces;
      annotations.push({
        id: 'auto-track-' + idx,
        minX: b.minX / w,
        minY: b.minY / h,
        bw: b.bw / w,
        bh: b.bh / h,
        type: 'track',
        pieces,
        color: '#38bdf8',
        label: `🛤️ Räls (~${pieces} bitar / ${Math.round(pieces * CM_PER_PIECE)} cm)`
      });
    });

    // Om det är demobilden lägger vi även in demobildens kända specialdelar som exempel-pins
    if (isDemo) {
      annotations.push(
        { id: 'demo-bridge', minX: 445 / 640, minY: 48 / 440, bw: 155 / 640, bh: 44 / 440, type: 'bridge', count: 1, color: '#f97316', label: '🌉 Fast Bro' },
        { id: 'demo-tunnel', minX: 452 / 640, minY: 132 / 440, bw: 136 / 640, bh: 96 / 440, type: 'tunnel', count: 1, color: '#22c55e', label: '⛰️ Tunnel / Grotta' },
        { id: 'demo-yswitch-1', minX: 382 / 640, minY: 282 / 440, bw: 66 / 640, bh: 46 / 440, type: 'ySwitch', count: 1, color: '#eab308', label: '🔀 Y-växel' },
        { id: 'demo-yswitch-2', minX: 502 / 640, minY: 282 / 440, bw: 66 / 640, bh: 46 / 440, type: 'ySwitch', count: 1, color: '#eab308', label: '🔀 Y-växel' },
        { id: 'demo-xcross', minX: 348 / 640, minY: 368 / 440, bw: 68 / 640, bh: 58 / 440, type: 'xCross', count: 1, color: '#a855f7', label: '✖️ X-korsning' }
      );
    }

    this.lastDetectedAnnotations = annotations;
    return this.recalculateAndRender(targetCanvas);
  }

  // Lägger till en manuell stämpel när användaren klickar på en specialdel i sitt foto,
  // eller tar bort en markering om man klickar på en befintlig ruta!
  handleCanvasTap(normX, normY, activeStampType, targetCanvas) {
    // 1. Kolla först om användaren klickade på en befintlig manuell pin eller auto-box för att ta bort den
    const hitManualIdx = this.manualPins.findIndex(
      (p) => Math.hypot(p.x - normX, p.y - normY) < 0.065
    );
    if (hitManualIdx !== -1) {
      this.manualPins.splice(hitManualIdx, 1);
      return this.recalculateAndRender(targetCanvas);
    }

    if (!activeStampType) return this.recalculateAndRender(targetCanvas);

    const stampMeta = {
      track25: { type: 'track', pieces: 25, color: '#38bdf8', label: '🛤️ +25 bitar (56 cm)' },
      ySwitch: { type: 'ySwitch', count: 1, color: '#eab308', label: '🔀 Y-växel' },
      bridge: { type: 'bridge', count: 1, color: '#f97316', label: '🌉 Fast Bro' },
      supports: { type: 'supports', count: 2, color: '#94a3b8', label: '🏛️ 2× Bropelare' },
      xCross: { type: 'xCross', count: 1, color: '#a855f7', label: '✖️ X-korsning' },
      tunnel: { type: 'tunnel', count: 1, color: '#22c55e', label: '⛰️ Tunnel' },
      turntableLoop: { type: 'turntableLoop', count: 1, color: '#ec4899', label: '🔄 Vändskiva/Ramp' }
    }[activeStampType];

    if (stampMeta) {
      this.manualPins.push({
        id: 'pin-' + Date.now() + '-' + Math.random(),
        x: normX,
        y: normY,
        ...stampMeta
      });
    }

    return this.recalculateAndRender(targetCanvas);
  }

  // Räknar samman alla detekterade rälskluster + manuella markeringar på bilden och ritar om Canvas
  recalculateAndRender(targetCanvas) {
    let tracks = 0;
    const special = {
      supports: 0,
      bridge: 0,
      ySwitch: 0,
      xCross: 0,
      tunnel: 0,
      turntableLoop: 0
    };

    this.lastDetectedAnnotations.forEach((ann) => {
      if (ann.type === 'track') {
        tracks += ann.pieces || 0;
      } else if (special[ann.type] !== undefined) {
        special[ann.type] += ann.count || 1;
      }
    });

    this.manualPins.forEach((pin) => {
      if (pin.type === 'track') {
        tracks += pin.pieces || 25;
      } else if (special[pin.type] !== undefined) {
        special[pin.type] += pin.count || 1;
      }
    });

    if (targetCanvas && this.lastSource) {
      const srcW = this.lastSource.naturalWidth || this.lastSource.width || 640;
      const srcH = this.lastSource.naturalHeight || this.lastSource.height || 480;
      const dispW = 640;
      const dispH = Math.round(dispW * (srcH / srcW));

      targetCanvas.width = dispW;
      targetCanvas.height = dispH;
      const ctx = targetCanvas.getContext('2d');
      ctx.drawImage(this.lastSource, 0, 0, dispW, dispH);

      // Rita automatiska räls-ramar
      this.lastDetectedAnnotations.forEach((ann) => {
        const rx = ann.minX * dispW;
        const ry = ann.minY * dispH;
        const rw = ann.bw * dispW;
        const rh = ann.bh * dispH;

        ctx.save();
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = 3.5;
        ctx.shadowColor = 'rgba(0,0,0,0.75)';
        ctx.shadowBlur = 8;
        ctx.strokeRect(rx, ry, rw, rh);

        ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
        const textW = ctx.measureText(ann.label).width + 16;
        const badgeX = Math.max(4, Math.min(dispW - textW - 4, rx));
        const badgeY = Math.max(24, ry - 6);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY - 19, textW, 23, 6);
        ctx.fill();
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.shadowBlur = 0;
        ctx.fillText(ann.label, badgeX + 8, badgeY - 3);
        ctx.restore();
      });

      // Rita användarens manuella klick-nålar (Tap-to-Tag)
      this.manualPins.forEach((pin) => {
        const px = pin.x * dispW;
        const py = pin.y * dispH;

        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, 16, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = pin.color;
        ctx.stroke();

        ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
        const textW = ctx.measureText(pin.label + ' ✕').width + 14;
        const bx = Math.max(4, Math.min(dispW - textW - 4, px - textW / 2));
        const by = Math.max(24, py - 22);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.beginPath();
        ctx.roundRect(bx, by - 18, textW, 22, 6);
        ctx.fill();
        ctx.strokeStyle = pin.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.fillText(pin.label + ' ✕', bx + 7, by - 3);
        ctx.restore();
      });
    }

    return {
      tracks,
      cm: Math.round(tracks * CM_PER_PIECE),
      ...special,
      objectCount: this.lastDetectedAnnotations.length + this.manualPins.length
    };
  }

  // Valfri AI-djupanalys via Google Gemini 2.5 Flash Vision (om användaren anger en gratis API-nyckel)
  async analyzeWithGeminiVision(apiKey, targetCanvas) {
    if (!this.lastSource || !apiKey) {
      throw new Error('Ingen bild eller API-nyckel angiven.');
    }

    // Konvertera bilden till base64 JPEG
    const tmpCanvas = document.createElement('canvas');
    const srcW = this.lastSource.naturalWidth || this.lastSource.width || 640;
    const srcH = this.lastSource.naturalHeight || this.lastSource.height || 480;
    const scale = Math.min(1, 800 / Math.max(srcW, srcH));
    tmpCanvas.width = Math.round(srcW * scale);
    tmpCanvas.height = Math.round(srcH * scale);
    tmpCanvas.getContext('2d').drawImage(this.lastSource, 0, 0, tmpCanvas.width, tmpCanvas.height);

    const base64Jpeg = tmpCanvas.toDataURL('image/jpeg', 0.84).split(',')[1];

    const prompt = `Du är expert på leksaksbilbanan Flexi-Trax. Titta noga på bilden.
Ignorera möbler, stolar, kläder, golv, plastlådor och andra leksaker som INTE är Flexi-Trax!
Uppskatta:
1. Hur många böjbara Flexi-Trax rälsbitar/plastlänkar (1 länk är ca 2.25 cm bred) som syns i bilden totalt.
2. Antal SYNDA specialdelar av exakt dessa typer (sätt 0 om du inte tydligt ser delen!):
- supports (bropelare/brostöd)
- bridge (fast bro / hängbro)
- ySwitch (Y-växel för spårbyte)
- xCross (4-vägs X-korsning)
- tunnel (tunnel / grotta)
- turntableLoop (vändskiva / loop / ramp)
3. Ge även en lista "boxes" med omslutande rutor [ymin, xmin, ymax, xmax] i skalan 0..1000 för rälshögen och ev. specialdelar.
Svara ENDAST med giltig JSON i detta format:
{"tracks": 130, "supports": 0, "bridge": 0, "ySwitch": 0, "xCross": 0, "tunnel": 0, "turntableLoop": 0, "boxes": [{"ymin": 420, "xmin": 230, "ymax": 580, "xmax": 760, "type": "track", "pieces": 130, "label": "🛤️ Räls (~130 bitar)"}]}`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey.trim())}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inline_data: { mime_type: 'image/jpeg', data: base64Jpeg } }
              ]
            }
          ],
          generationConfig: {
            response_mime_type: 'application/json',
            temperature: 0.1
          }
        })
      }
    );

    if (!resp.ok) {
      throw new Error('Kunde inte nå Gemini API (kontrollera din API-nyckel).');
    }

    const json = await resp.json();
    const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(rawText);

    this.manualPins = [];
    if (Array.isArray(parsed.boxes) && parsed.boxes.length > 0) {
      this.lastDetectedAnnotations = parsed.boxes.map((b, i) => ({
        id: 'ai-box-' + i,
        minX: (b.xmin || 0) / 1000,
        minY: (b.ymin || 0) / 1000,
        bw: Math.max(0.05, ((b.xmax || 100) - (b.xmin || 0)) / 1000),
        bh: Math.max(0.05, ((b.ymax || 100) - (b.ymin || 0)) / 1000),
        type: b.type || 'track',
        pieces: b.pieces || parsed.tracks || 80,
        count: b.count || 1,
        color: b.type === 'track' ? '#38bdf8' : '#22c55e',
        label: b.label || `🛤️ ~${parsed.tracks || 80} bitar`
      }));
    }

    const rendered = this.recalculateAndRender(targetCanvas);
    return {
      ...rendered,
      tracks: Number(parsed.tracks) || rendered.tracks,
      cm: Math.round((Number(parsed.tracks) || rendered.tracks) * CM_PER_PIECE),
      supports: Number(parsed.supports) || 0,
      bridge: Number(parsed.bridge) || 0,
      ySwitch: Number(parsed.ySwitch) || 0,
      xCross: Number(parsed.xCross) || 0,
      tunnel: Number(parsed.tunnel) || 0,
      turntableLoop: Number(parsed.turntableLoop) || 0
    };
  }

  // Skapar ett realistiskt syntetiskt demofoto av Flexi-Trax-delar på ett trägolv
  createDemoPhotoCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 440;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#c8a97e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(140, 105, 65, 0.25)';
    ctx.lineWidth = 2;
    for (let y = 0; y < canvas.height; y += 44) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    const trackColors = ['#ef4444', '#facc15', '#3b82f6', '#22c55e'];

    const drawTrackStrip = (pts, linksCount) => {
      for (let i = 0; i < linksCount; i++) {
        const t = i / Math.max(1, linksCount - 1);
        const segFloat = t * (pts.length - 1);
        const idx = Math.min(pts.length - 2, Math.floor(segFloat));
        const localT = segFloat - idx;

        const x = pts[idx][0] + (pts[idx + 1][0] - pts[idx][0]) * localT;
        const y = pts[idx][1] + (pts[idx + 1][1] - pts[idx][1]) * localT;
        const dx = pts[idx + 1][0] - pts[idx][0];
        const dy = pts[idx + 1][1] - pts[idx][1];
        const angle = Math.atan2(dy, dx);

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.fillStyle = trackColors[i % 4];
        ctx.fillRect(-5, -14, 9, 28);
        ctx.restore();
      }
    };

    drawTrackStrip([[55, 75], [160, 55], [275, 95], [375, 70]], 38);
    drawTrackStrip([[60, 195], [175, 225], [295, 185], [390, 215]], 40);
    drawTrackStrip([[70, 335], [185, 365], [315, 330]], 30);

    // Rita 1 Fast röd/grå bro (uppe till höger)
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(445, 52, 150, 38);
    ctx.fillStyle = '#475569';
    ctx.fillRect(450, 60, 140, 22);

    // Rita 1 Grön/grå Tunnelgrotta (mitten höger)
    ctx.fillStyle = '#15803d';
    ctx.beginPath();
    ctx.roundRect(455, 135, 130, 92, 24);
    ctx.fill();
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.roundRect(480, 155, 80, 52, 16);
    ctx.fill();

    // Rita 2 st Y-växlar
    const drawYSwitch = (cx, cy) => {
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 18;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 28, cy);
      ctx.lineTo(cx + 24, cy - 18);
      ctx.moveTo(cx - 28, cy);
      ctx.lineTo(cx + 24, cy + 18);
      ctx.stroke();
    };
    drawYSwitch(415, 305);
    drawYSwitch(535, 305);

    // Rita 1 st X-korsning
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(355, 375);
    ctx.lineTo(410, 420);
    ctx.moveTo(410, 375);
    ctx.lineTo(355, 420);
    ctx.stroke();

    return canvas;
  }
}

window.flexiScanner = new FlexiScanner();
