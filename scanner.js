// ============================================================================
// FlexiByggaren - 100% Lokal Bildanalys (Canvas HSV + Connected Components)
// ============================================================================

const CM_PER_PIECE = 2.25; // 1 Flexi-Trax standardlänk ≈ 2,25 cm

class FlexiScanner {
  constructor() {
    this.workWidth = 320;
    this.workHeight = 240;
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

  // Analyserar en HTMLImageElement eller HTMLCanvasElement och ritar detekteringar på targetCanvas
  analyzeImageSource(source, targetCanvas) {
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

    // 1. Modellera bakgrundsfärg (golv/bord) från bildens ytterkanter
    const bgSamples = [];
    const border = Math.max(4, Math.floor(Math.min(w, h) * 0.05));
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        if (x < border || x >= w - border || y < border || y >= h - border) {
          const i = (y * w + x) * 4;
          bgSamples.push([data[i], data[i + 1], data[i + 2]]);
        }
      }
    }

    let bgR = 180;
    let bgG = 165;
    let bgB = 145;
    if (bgSamples.length > 0) {
      bgSamples.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
      const mid = bgSamples[Math.floor(bgSamples.length / 2)];
      bgR = mid[0];
      bgG = mid[1];
      bgB = mid[2];
    }
    const bgHsv = this.rgbToHsv(bgR, bgG, bgB);

    // 2. Klassificera varje pixel: 0=bakgrund, 1=röd, 2=gul, 3=blå, 4=grön, 5=special(grå/mörk/struktur)
    const mask = new Uint8Array(w * h);
    const colorCounts = { red: 0, yellow: 0, blue: 0, green: 0, special: 0 };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const i = idx * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const { h: hue, s, v } = this.rgbToHsv(r, g, b);
        const distBg = Math.hypot(r - bgR, g - bgG, b - bgB);
        const hueDiff = Math.min(Math.abs(hue - bgHsv.h), 360 - Math.abs(hue - bgHsv.h));

        // Tydligt färgmättade leksaksfärger (Röd, Gul, Blå, Grön)
        if (s >= 0.34 && v >= 0.22 && (distBg > 36 || s - bgHsv.s > 0.22 || hueDiff > 28)) {
          if (hue <= 22 || hue >= 335) {
            mask[idx] = 1; // Röd
            colorCounts.red++;
          } else if (hue > 22 && hue <= 72) {
            mask[idx] = 2; // Gul / Orange
            colorCounts.yellow++;
          } else if (hue > 72 && hue <= 168) {
            mask[idx] = 4; // Grön
            colorCounts.green++;
          } else if (hue > 168 && hue <= 265) {
            mask[idx] = 3; // Blå
            colorCounts.blue++;
          } else {
            mask[idx] = 1;
            colorCounts.red++;
          }
        } else if (distBg > 52 && v > 0.12 && v < 0.85) {
          // Grå/mörka/strukturella specialdelar som skiljer sig tydligt från golvet
          mask[idx] = 5;
          colorCounts.special++;
        }
      }
    }

    // 3. Connected Components (BFS) för att hitta separata kluster av delar på golvet
    const visited = new Uint8Array(w * h);
    const blobs = [];
    const queue = new Int32Array(w * h);

    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        const startIdx = y * w + x;
        if (mask[startIdx] === 0 || visited[startIdx]) continue;

        let head = 0;
        let tail = 0;
        queue[tail++] = startIdx;
        visited[startIdx] = 1;

        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;
        let area = 0;
        const cHist = [0, 0, 0, 0, 0, 0];

        while (head < tail) {
          const curr = queue[head++];
          const cy = Math.floor(curr / w);
          const cx = curr - cy * w;
          area++;
          cHist[mask[curr]]++;

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          // 8-grannar + 2-stegsbrygga så ihopknäppta rälsbitar bildar en gemensam sektion
          for (let dy = -2; dy <= 2; dy++) {
            const ny = cy + dy;
            if (ny < 1 || ny >= h - 1) continue;
            for (let dx = -2; dx <= 2; dx++) {
              const nx = cx + dx;
              if (nx < 1 || nx >= w - 1) continue;
              const nIdx = ny * w + nx;
              if (mask[nIdx] !== 0 && !visited[nIdx]) {
                visited[nIdx] = 1;
                queue[tail++] = nIdx;
              }
            }
          }
        }

        if (area >= 26) {
          blobs.push({
            minX,
            maxX,
            minY,
            maxY,
            bw: maxX - minX + 1,
            bh: maxY - minY + 1,
            area,
            cHist
          });
        }
      }
    }

    // 4. Tolka kluster till Flexi-Trax rälsbitar & specialdelar
    let detectedTrackPieces = 0;
    const detectedSpecial = {
      supports: 0,
      bridge: 0,
      ySwitch: 0,
      xCross: 0,
      tunnel: 0,
      turntableLoop: 0
    };

    const annotations = [];
    const totalPixels = w * h;

    // Sortera kluster från störst till minst
    blobs.sort((a, b) => b.area - a.area);

    blobs.forEach((b) => {
      const coloredPixels = b.cHist[1] + b.cHist[2] + b.cHist[3] + b.cHist[4];
      const greyPixels = b.cHist[5];
      const distinctTrackColors = [b.cHist[1], b.cHist[2], b.cHist[3], b.cHist[4]].filter(
        (cnt) => cnt > Math.max(8, b.area * 0.08)
      ).length;

      const aspect = Math.max(b.bw, b.bh) / Math.max(1, Math.min(b.bw, b.bh));
      const fillRatio = b.area / Math.max(1, b.bw * b.bh);
      const relArea = b.area / totalPixels;

      // Om klustret har minst 2 klassiska rälsfärger ELLER är långsmalt och färgglatt -> Böjbar räls!
      if (distinctTrackColors >= 2 || (coloredPixels > greyPixels * 1.4 && (aspect >= 1.65 || relArea > 0.025))) {
        // Beräkna antal länkar utifrån area och utsträckning
        const spanLength = Math.hypot(b.bw, b.bh);
        const estFromSpan = Math.round(spanLength * 0.24);
        const estFromArea = Math.round(Math.sqrt(b.area) * 0.85);
        const pieces = Math.max(6, Math.min(140, Math.round((estFromSpan + estFromArea) * 0.65)));
        detectedTrackPieces += pieces;

        annotations.push({
          ...b,
          type: 'track',
          color: '#38bdf8',
          label: `🛤️ ~${pieces} bitar (${Math.round(pieces * CM_PER_PIECE)} cm)`
        });
      } else if (relArea > 0.028 && fillRatio > 0.48 && (b.cHist[4] > b.area * 0.25 || greyPixels > b.area * 0.35)) {
        // Större kompakt grön/grå/brun klump -> Tunnel / Grotta!
        detectedSpecial.tunnel++;
        annotations.push({
          ...b,
          type: 'tunnel',
          color: '#22c55e',
          label: '⛰️ Tunnel / Grotta'
        });
      } else if (aspect >= 2.0 && (b.cHist[1] > b.area * 0.3 || greyPixels > b.area * 0.3)) {
        // Långsmal röd eller grå struktur -> Fast Bro!
        detectedSpecial.bridge++;
        annotations.push({
          ...b,
          type: 'bridge',
          color: '#f97316',
          label: '🌉 Fast Bro'
        });
      } else if (b.area >= 95 && aspect < 1.45 && fillRatio >= 0.28 && fillRatio <= 0.62) {
        // Symmetrisk X- eller Y-formad del -> X-korsning eller Vändskiva
        if (detectedSpecial.xCross === 0) {
          detectedSpecial.xCross++;
          annotations.push({
            ...b,
            type: 'xCross',
            color: '#a855f7',
            label: '✖️ X-korsning'
          });
        } else {
          detectedSpecial.turntableLoop++;
          annotations.push({
            ...b,
            type: 'turntableLoop',
            color: '#ec4899',
            label: '🔄 Vändskiva / Loop'
          });
        }
      } else if (b.area >= 65 && aspect >= 1.2 && aspect < 2.1 && fillRatio < 0.65) {
        // Förgrenad mellanstor del -> Y-växel!
        detectedSpecial.ySwitch++;
        annotations.push({
          ...b,
          type: 'ySwitch',
          color: '#eab308',
          label: '🔀 Y-växel'
        });
      } else if (b.area >= 26 && b.area < 190) {
        // Mindre pelare/stöd -> Bropelare!
        detectedSpecial.supports++;
        annotations.push({
          ...b,
          type: 'supports',
          color: '#94a3b8',
          label: '🏛️ Bropelare'
        });
      }
    });

    // Fallback: om hela bilden är en tät rälshög där alla färgpixlar flöt ihop
    const totalColoredPixels = colorCounts.red + colorCounts.yellow + colorCounts.blue + colorCounts.green;
    if (detectedTrackPieces < 20 && totalColoredPixels > totalPixels * 0.04) {
      const densityPieces = Math.max(24, Math.min(260, Math.round((totalColoredPixels / totalPixels) * 420)));
      detectedTrackPieces = Math.max(detectedTrackPieces, densityPieces);
    }

    // 5. Rita ut fotot + snygga detekterings-boxar på targetCanvas
    if (targetCanvas) {
      const dispW = 640;
      const dispH = Math.round(dispW * ratio);
      targetCanvas.width = dispW;
      targetCanvas.height = dispH;
      const ctx = targetCanvas.getContext('2d');
      ctx.drawImage(source, 0, 0, dispW, dispH);

      const scaleX = dispW / w;
      const scaleY = dispH / h;

      annotations.slice(0, 18).forEach((ann) => {
        const rx = ann.minX * scaleX;
        const ry = ann.minY * scaleY;
        const rw = ann.bw * scaleX;
        const rh = ann.bh * scaleY;

        ctx.save();
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 6;
        ctx.strokeRect(rx, ry, rw, rh);

        // Hörnfästen i scanner-stil
        ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
        const textW = ctx.measureText(ann.label).width + 14;
        const badgeX = Math.max(4, Math.min(dispW - textW - 4, rx));
        const badgeY = Math.max(22, ry - 6);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY - 18, textW, 22, 6);
        ctx.fill();
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.shadowBlur = 0;
        ctx.fillText(ann.label, badgeX + 7, badgeY - 3);
        ctx.restore();
      });
    }

    // Beräkna färgfördelning i procent
    const sumColors = Math.max(1, totalColoredPixels);
    const colorRatio = {
      red: Math.round((colorCounts.red / sumColors) * 100),
      yellow: Math.round((colorCounts.yellow / sumColors) * 100),
      blue: Math.round((colorCounts.blue / sumColors) * 100),
      green: Math.round((colorCounts.green / sumColors) * 100)
    };

    return {
      tracks: Math.max(16, detectedTrackPieces),
      cm: Math.round(Math.max(16, detectedTrackPieces) * CM_PER_PIECE),
      supports: detectedSpecial.supports,
      bridge: detectedSpecial.bridge,
      ySwitch: detectedSpecial.ySwitch,
      xCross: detectedSpecial.xCross,
      tunnel: detectedSpecial.tunnel,
      turntableLoop: detectedSpecial.turntableLoop,
      colorRatio,
      objectCount: annotations.length
    };
  }

  // Skapar ett realistiskt syntetiskt demofoto av Flexi-Trax-delar på ett trägolv
  // så att man kan provköra den lokala bildanalysen med ett knapptryck!
  createDemoPhotoCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 440;
    const ctx = canvas.getContext('2d');

    // 1. Varmt ekparkett-golv som bakgrund
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

    // Hjälpfunktion för att rita en ihopknäppt räls-orm på golvet
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
        ctx.fillStyle = trackColors[Math.floor(i / 3) % 4];
        ctx.fillRect(-5, -14, 9, 28);
        ctx.restore();
      }
    };

    // Rita 3 färgglada räls-ormar på golvet
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

    // Rita 4 st grå Bropelare
    [
      [480, 390],
      [525, 390],
      [570, 390],
      [610, 390]
    ].forEach(([px, py]) => {
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(px, py, 14, 0, Math.PI * 2);
      ctx.fill();
    });

    return canvas;
  }
}

window.flexiScanner = new FlexiScanner();
