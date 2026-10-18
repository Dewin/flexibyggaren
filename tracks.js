// ============================================================================
// FlexiByggaren - Dynamisk Ban-Generator & Steg-för-steg Ritningsmotor
// ============================================================================

const FLEXI_CM_PER_BIT = 2.25; // 1 Flexi-Trax länk ≈ 2,25 cm

const SPECIAL_PART_META = {
  supports: {
    id: 'supports',
    name: 'Bropelare / Stöd',
    shortName: 'Bropelare',
    icon: '🏛️',
    color: '#94a3b8'
  },
  bridge: {
    id: 'bridge',
    name: 'Fast Bro / Hängbro',
    shortName: 'Fast Bro',
    icon: '🌉',
    color: '#f97316'
  },
  ySwitch: {
    id: 'ySwitch',
    name: 'Y-växel (Spårbyte)',
    shortName: 'Y-växel',
    icon: '🔀',
    color: '#eab308'
  },
  xCross: {
    id: 'xCross',
    name: 'X-korsning (4-vägs)',
    shortName: 'X-korsning',
    icon: '✖️',
    color: '#a855f7'
  },
  tunnel: {
    id: 'tunnel',
    name: 'Tunnel / Grotta',
    shortName: 'Tunnel',
    icon: '⛰️',
    color: '#22c55e'
  },
  turntableLoop: {
    id: 'turntableLoop',
    name: 'Vändskiva / Loop / Ramp',
    shortName: 'Vändskiva/Ramp',
    icon: '🔄',
    color: '#ec4899'
  }
};

// Catmull-Rom spline-interpolering mellan styrpunkter [{x, y, elev}]
function sampleSplineSegment(p0, p1, p2, p3, numSamples = 24) {
  const pts = [];
  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const t2 = t * t;
    const t3 = t2 * t;

    const x =
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);

    const y =
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);

    const elev1 = p1.elev || 1;
    const elev2 = p2.elev || 1;
    const elev = elev1 === 2 || elev2 === 2 ? 2 : 1;

    pts.push({ x, y, elev });
  }
  // Räkna ut tangentvinkel per punkt
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    pts[i].angle = Math.atan2(next.y - prev.y, next.x - prev.x);
  }
  return pts;
}

// Skapar sammanhängande steg-kurvor från en sluten eller öppen lista av waypoints
function buildLoopStepCurves(waypoints, isClosed = true) {
  const n = waypoints.length;
  const stepCurves = [];

  const count = isClosed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const p0 = isClosed ? waypoints[(i - 1 + n) % n] : waypoints[Math.max(0, i - 1)];
    const p1 = waypoints[i];
    const p2 = waypoints[(i + 1) % n];
    const p3 = isClosed ? waypoints[(i + 2) % n] : waypoints[Math.min(n - 1, i + 2)];

    const pts = sampleSplineSegment(p0, p1, p2, p3, 28);
    let arcLen = 0;
    for (let j = 1; j < pts.length; j++) {
      arcLen += Math.hypot(pts[j].x - pts[j - 1].x, pts[j].y - pts[j - 1].y);
    }

    stepCurves.push({
      points: pts,
      arcLen,
      meta: p1
    });
  }
  return stepCurves;
}

class FlexiTrackGenerator {
  constructor() {
    this.randomSeedCounter = 1;
  }

  // Genererar alla rekommenderade banor anpassade till användarens garage
  generateAllTracks(garage) {
    const availableTracks = Math.max(36, Number(garage.tracks) || 120);
    const tracks = [];

    // 1. MEGA-BANAN ("Använd ALLA våra delar!") - Alltid högst upp som stjärnförslag!
    tracks.push(this.createMegaTrack(garage, availableTracks));

    // 2. Klassiska Åttan (Bro-överfart eller X-korsning)
    tracks.push(this.createFigureEightTrack(garage, availableTracks));

    // 3. Dubbelbro- & Tunneldalen (2 Våningar)
    tracks.push(this.createBridgeAndTunnelTrack(garage, availableTracks));

    // 4. Växel-Labyrinten (Huvudbana + Genväg med Y-växlar)
    tracks.push(this.createSwitchLabyrinthTrack(garage, availableTracks));

    // 5. Lilla Sprint-Rundan (Snabb & enkel nybörjarbana)
    tracks.push(this.createSprintTrack(garage, availableTracks));

    // 6. Orm-Slingan Grand Prix (Tekniska S-kurvor + Vändskiva/Ramp)
    tracks.push(this.createSerpentineGrandPrix(garage, availableTracks));

    return tracks;
  }

  // Hjälpfunktion som fördelar exakt antal rälsbitar och cm över alla steg i en bana
  finalizeTrackBlueprint(config, stepDefinitions, targetPieces, garage) {
    const totalArc = stepDefinitions.reduce((acc, s) => acc + s.arcLen, 0) || 1;
    let allocatedPieces = 0;

    const steps = stepDefinitions.map((def, idx) => {
      const isLast = idx === stepDefinitions.length - 1;
      let pieces = isLast
        ? Math.max(8, targetPieces - allocatedPieces)
        : Math.max(8, Math.round((def.arcLen / totalArc) * targetPieces));

      allocatedPieces += pieces;
      const cm = Math.round(pieces * FLEXI_CM_PER_BIT);

      const midPt = def.points[Math.floor(def.points.length * 0.5)];
      const specialPlacements = (def.specialParts || []).map((sp, spIdx) => {
        const frac = sp.frac !== undefined ? sp.frac : (spIdx + 1) / (def.specialParts.length + 1);
        const ptIdx = Math.min(
          def.points.length - 1,
          Math.max(0, Math.floor(frac * (def.points.length - 1)))
        );
        const pt = def.points[ptIdx] || midPt;
        const meta = SPECIAL_PART_META[sp.type] || SPECIAL_PART_META.supports;
        return {
          type: sp.type,
          count: sp.count || 1,
          name: meta.name,
          shortName: meta.shortName,
          icon: meta.icon,
          color: meta.color,
          x: pt.x,
          y: pt.y,
          angle: pt.angle || 0
        };
      });

      // Förslag på färgkombination i steget (t.ex. varannan färg)
      const q = Math.floor(pieces / 4);
      const rem = pieces % 4;
      const colorBreakdown = `${q + (rem > 0 ? 1 : 0)} röda, ${q + (rem > 1 ? 1 : 0)} gula, ${q + (rem > 2 ? 1 : 0)} blå, ${q} gröna`;

      const specialSummaryText =
        specialPlacements.length > 0
          ? specialPlacements.map((s) => `${s.count} st ${s.shortName}`).join(' och ')
          : null;

      const floorBadge =
        def.elevation === 2 ? '🌉 Våning 2 (Uppe på bropelare)' : '🟢 Våning 1 (På golvet)';

      const stepNumber = idx + 1;
      const totalSteps = stepDefinitions.length;

      let instruction = `Sätt ihop ${pieces} rälsbitar (ungefär ${cm} cm) och forma som "${def.shapeBadge}". `;
      if (specialSummaryText) {
        instruction += `Montera med ${specialSummaryText} i den här sektionen. `;
      }
      if (idx === 0) {
        instruction += `Lägg ut sektionen på golvet från markering A till B som start på banan!`;
      } else if (def.isBranch) {
        instruction += `Koppla in sidospåret från markering A (första växeln) till markering B!`;
      } else if (isLast) {
        instruction += `Knäpp fast änden i markering A och slut hela varvet tillbaka till start vid markering B!`;
      } else {
        instruction += `Knäpp fast i föregående del vid markering A och böj fram till markering B.`;
      }

      const voiceText =
        `Steg ${stepNumber} av ${totalSteps}: ${def.title}. ` +
        `Plocka fram ${pieces} rälsbitar, det är ungefär ${cm} centimeter` +
        (specialSummaryText ? `, samt ${specialSummaryText}. ` : '. ') +
        (def.elevation === 2 ? 'Den här delen byggs på våning två uppe på bropelarna. ' : '') +
        (isLast && !def.isBranch ? 'Koppla ihop sista biten med starten så är banan klar!' : def.tip);

      return {
        stepNumber,
        title: def.title,
        shapeBadge: def.shapeBadge,
        floorBadge,
        elevation: def.elevation || 1,
        isBranch: Boolean(def.isBranch),
        pieces,
        cm,
        colorBreakdown,
        specialParts: specialPlacements,
        instruction,
        tip: def.tip || 'Knäpp ihop bitarna till en orm först och böj den sedan på plats.',
        voiceText,
        points: def.points
      };
    });

    const totalPiecesUsed = steps.reduce((sum, s) => sum + s.pieces, 0);
    const totalCmUsed = Math.round(totalPiecesUsed * FLEXI_CM_PER_BIT);

    // Beräkna totala specialdelar som används i banan
    const usedSpecialTotals = {
      supports: 0,
      bridge: 0,
      ySwitch: 0,
      xCross: 0,
      tunnel: 0,
      turntableLoop: 0
    };
    steps.forEach((s) => {
      s.specialParts.forEach((sp) => {
        usedSpecialTotals[sp.type] = (usedSpecialTotals[sp.type] || 0) + sp.count;
      });
    });

    // Beräkna ungefärlig golvyta i cm utifrån banans utbredning och omkrets
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    steps.forEach((s) => {
      s.points.forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
    });
    const svgSpanX = Math.max(100, maxX - minX);
    const svgSpanY = Math.max(100, maxY - minY);
    const scaleCmPerSvgUnit = Math.max(0.16, (totalCmUsed / totalArc) * 1.05);
    const floorWidthCm = Math.max(55, Math.round((svgSpanX * scaleCmPerSvgUnit) / 5) * 5);
    const floorHeightCm = Math.max(45, Math.round((svgSpanY * scaleCmPerSvgUnit) / 5) * 5);

    return {
      ...config,
      totalPiecesUsed,
      totalCmUsed,
      floorWidthCm,
      floorHeightCm,
      usedSpecialTotals,
      fitsInventory: totalPiecesUsed <= (garage.tracks || 120) + 8,
      steps
    };
  }

  // ==========================================================================
  // 1. 🏆 MEGA-BANAN ("Använd ALLA våra delar!")
  // ==========================================================================
  createMegaTrack(garage, availableTracks) {
    const targetPieces = Math.max(48, availableTracks);
    const hasSupports = (garage.supports || 0) > 0;
    const hasBridge = (garage.bridge || 0) > 0;
    const hasYSwitch = (garage.ySwitch || 0) > 0;
    const hasXCross = (garage.xCross || 0) > 0;
    const hasTunnel = (garage.tunnel || 0) > 0;
    const hasTurntable = (garage.turntableLoop || 0) > 0;

    const mainWaypoints = [
      {
        x: 170,
        y: 410,
        elev: 1,
        title: 'Startrakan & Depå-utgången',
        shapeBadge: 'Raksträcka + mjuk startkurva',
        tip: 'Lägg startrakan rakt framför dig på golvet så du har gott om plats bakåt.',
        specialParts: [
          ...(hasYSwitch ? [{ type: 'ySwitch', count: 1, frac: 0.72 }] : []),
          ...(hasTurntable && !hasYSwitch ? [{ type: 'turntableLoop', count: garage.turntableLoop, frac: 0.45 }] : [])
        ]
      },
      {
        x: 420,
        y: 425,
        elev: 1,
        title: hasTunnel ? 'Södra Dalen & Tunnelgrottan' : 'Södra Svepande Kurvan',
        shapeBadge: 'Lång svepande vänstersväng',
        tip: hasTunnel
          ? 'Trä rälsen rakt igenom tunneln/grottan innan du knäpper fast kurvan!'
          : 'Böj rälsen i en stor, mjuk båge så bilen håller hög fart.',
        specialParts: hasTunnel ? [{ type: 'tunnel', count: garage.tunnel, frac: 0.5 }] : []
      },
      {
        x: 675,
        y: 350,
        elev: hasSupports || hasBridge ? 2 : 1,
        title: hasSupports || hasBridge ? 'Östra Klättringen upp till Våning 2' : 'Östra Hårnålskurvan',
        shapeBadge: hasSupports || hasBridge ? 'Uppfart + Högersväng (Våning 2)' : '180° U-sväng åt vänster',
        tip:
          hasSupports || hasBridge
            ? 'Ställ bropelarna stadigt under slutet av kurvan så rälsen lyfts upp inför bron.'
            : 'Se till att kurvan inte blir för snäv så bakhjulen får fäste.',
        specialParts: hasSupports
          ? [{ type: 'supports', count: Math.ceil(garage.supports / 2), frac: 0.65 }]
          : []
      },
      {
        x: 560,
        y: 125,
        elev: hasSupports || hasBridge ? 2 : 1,
        title: hasBridge ? 'Stora Högbron över Korsningen' : 'Norra Topp-Passagen',
        shapeBadge: hasBridge ? 'Högbro på Våning 2' : 'Diagonalt krön',
        tip: hasBridge
          ? 'Klicka fast den fasta brodelen högst upp mellan pelarna!'
          : 'Låt spåret svepa snett över mitten av banan.',
        specialParts: [
          ...(hasBridge ? [{ type: 'bridge', count: garage.bridge, frac: 0.45 }] : []),
          ...(hasSupports && Math.floor(garage.supports / 2) > 0
            ? [{ type: 'supports', count: Math.floor(garage.supports / 2), frac: 0.8 }]
            : [])
        ]
      },
      {
        x: 365,
        y: 255,
        elev: 1,
        title: hasXCross ? 'Centrum-Korsningen (X-Krysset)' : 'Mitten-Passagen & Nedfarten',
        shapeBadge: 'S-kurva genom centrum',
        tip: hasXCross
          ? 'Placera X-korsningen mitt på golvet så banans spår kan korsa varandra!'
          : 'Låt rälsen landa mjukt tillbaka på golvet (Våning 1).',
        specialParts: hasXCross ? [{ type: 'xCross', count: garage.xCross, frac: 0.5 }] : []
      },
      {
        x: 150,
        y: 125,
        elev: 1,
        title: 'Nordvästra Grand Prix-Kurvan',
        shapeBadge: 'Stora U-svängen',
        tip: 'Forma en rund och bred ytterkurva längst upp till vänster.',
        specialParts:
          hasYSwitch && garage.ySwitch >= 2 ? [{ type: 'ySwitch', count: garage.ySwitch - 1, frac: 0.6 }] : []
      },
      {
        x: 105,
        y: 280,
        elev: 1,
        title: 'Slutspurten tillbaka till Start',
        shapeBadge: 'Raksträcka + Anslutning',
        tip: 'Knäpp ihop med Steg 1 så hela huvudvarvet blir helt slutet!',
        specialParts:
          hasTurntable && hasYSwitch && garage.ySwitch === 1
            ? [{ type: 'turntableLoop', count: garage.turntableLoop, frac: 0.5 }]
            : []
      }
    ];

    const stepDefs = buildLoopStepCurves(mainWaypoints, true).map((c) => ({
      points: c.points,
      arcLen: c.arcLen,
      title: c.meta.title,
      shapeBadge: c.meta.shapeBadge,
      elevation: c.meta.elev,
      tip: c.meta.tip,
      specialParts: c.meta.specialParts || [],
      isBranch: false
    }));

    // Om användaren har minst 2 Y-växlar (eller 1 Y-växel + vändskiva), lägg till ett extra sidospår som sista byggsteg!
    if (hasYSwitch && garage.ySwitch >= 2) {
      const branchPts = sampleSplineSegment(
        { x: 260, y: 430, elev: 1 },
        { x: 295, y: 418, elev: 1 },
        { x: 150, y: 125, elev: 1 },
        { x: 110, y: 90, elev: 1 },
        26
      );
      let branchLen = 0;
      for (let i = 1; i < branchPts.length; i++) {
        branchLen += Math.hypot(branchPts[i].x - branchPts[i - 1].x, branchPts[i].y - branchPts[i - 1].y);
      }
      stepDefs.push({
        points: branchPts,
        arcLen: branchLen * 0.85,
        title: 'Bonus-steg: Genvägen mellan Y-växlarna!',
        shapeBadge: 'Inre genvägs-spår',
        elevation: 1,
        isBranch: true,
        tip: 'Koppla ena änden i det lediga uttaget på första Y-växeln och andra änden i andra Y-växeln!',
        specialParts: hasTurntable
          ? [{ type: 'turntableLoop', count: garage.turntableLoop, frac: 0.5 }]
          : []
      });
    }

    return this.finalizeTrackBlueprint(
      {
        id: 'mega-all-parts',
        name: '🏆 Stora Mega-Banan (Alla dina delar!)',
        category: 'maxi',
        difficulty: 'Familjefavorit ⭐',
        badgeColor: '#f59e0b',
        description:
          'Specialuträknad bana som maximerar nästan varenda rälsbit och alla specialdelar ni har i Mitt Garage!'
      },
      stepDefs,
      targetPieces,
      garage
    );
  }

  // ==========================================================================
  // 2. 🎱 KLASSISKA ÅTTAN (Över/Under på Bro ELLER 4-vägs X-korsning)
  // ==========================================================================
  createFigureEightTrack(garage, availableTracks) {
    const targetPieces = Math.min(availableTracks, Math.max(44, Math.round(availableTracks * 0.78)));
    const useBridgeOverpass = (garage.bridge || 0) > 0 || (garage.supports || 0) >= 2;
    const useXCross = !useBridgeOverpass && (garage.xCross || 0) > 0;

    const waypoints = [
      {
        x: 400,
        y: 260,
        elev: 1,
        title: useXCross ? 'Mitten-Korsningen (Undre spåret)' : 'Undre Passagen i Mitten',
        shapeBadge: 'Diagonalt rakt spår (Våning 1)',
        tip: useXCross
          ? 'Lägg X-korsningen precis i mitten av golvet och koppla på rälsen!'
          : 'Det här spåret ligger på golvet (Våning 1) och kommer snart korsas ovanifrån.',
        specialParts: useXCross ? [{ type: 'xCross', count: 1, frac: 0.25 }] : []
      },
      {
        x: 665,
        y: 135,
        elev: 1,
        title: 'Högra Övre Kurvan',
        shapeBadge: 'Stor högersväng (180°)',
        tip: 'Böj en rund och fin ögla till höger på golvet.',
        specialParts: (garage.tunnel || 0) > 0 ? [{ type: 'tunnel', count: 1, frac: 0.55 }] : []
      },
      {
        x: 665,
        y: 385,
        elev: useBridgeOverpass ? 2 : 1,
        title: useBridgeOverpass ? 'Högra Uppfarten mot Bron' : 'Högra Nedre Kurvan',
        shapeBadge: useBridgeOverpass ? 'Kurva + Uppfart (Våning 2)' : 'Mjuk sväng tillbaka mot mitten',
        tip: useBridgeOverpass
          ? 'Ställ bropelare under rälsen så den lyfts upp inför mittenkorsningen!'
          : 'Fortsätt böja spåret snett upp mot mitten.',
        specialParts:
          useBridgeOverpass && (garage.supports || 0) > 0
            ? [{ type: 'supports', count: Math.min(2, garage.supports), frac: 0.75 }]
            : []
      },
      {
        x: 400,
        y: 260,
        elev: useBridgeOverpass ? 2 : 1,
        title: useBridgeOverpass ? 'Bro-Överfarten i Mitten (Våning 2!)' : 'Korsningen genom Mitten',
        shapeBadge: useBridgeOverpass ? 'Bro rakt ÖVER Steg 1' : 'Diagonalt spår genom mitten',
        tip: useBridgeOverpass
          ? 'Låt bron gå rakt ÖVER spåret du lade i Steg 1!'
          : 'Koppla spåret rakt genom X-korsningen i mitten!',
        specialParts: [
          ...((garage.bridge || 0) > 0 ? [{ type: 'bridge', count: 1, frac: 0.2 }] : []),
          ...(useBridgeOverpass && (garage.supports || 0) >= 3
            ? [{ type: 'supports', count: Math.min(2, garage.supports - 2), frac: 0.5 }]
            : [])
        ]
      },
      {
        x: 135,
        y: 135,
        elev: 1,
        title: 'Vänstra Övre Kurvan',
        shapeBadge: 'Stor vänstersväng (180°)',
        tip: 'Nu är vi nere på golvet igen! Forma vänstra öglan av åttan.',
        specialParts: []
      },
      {
        x: 135,
        y: 385,
        elev: 1,
        title: 'Vänstra Nedre Kurvan & Målgång',
        shapeBadge: 'Sista kurvan in i mitten',
        tip: 'Koppla ihop änden med starten i mitten så är hela Åttan klar!',
        specialParts: []
      }
    ];

    const stepDefs = buildLoopStepCurves(waypoints, true).map((c) => ({
      points: c.points,
      arcLen: c.arcLen,
      title: c.meta.title,
      shapeBadge: c.meta.shapeBadge,
      elevation: c.meta.elev,
      tip: c.meta.tip,
      specialParts: c.meta.specialParts || []
    }));

    return this.finalizeTrackBlueprint(
      {
        id: 'classic-figure-eight',
        name: useBridgeOverpass ? '🎱 Klassiska Bro-Åttan (Över & Under)' : '🎱 Action-Åttan med Mittkorsning',
        category: 'bridge',
        difficulty: 'Medel ⭐⭐',
        badgeColor: '#3b82f6',
        description:
          'En tidlös favorit i 6 steg där bilen svänger åt både höger och vänster och korsar sitt eget spår i mitten!'
      },
      stepDefs,
      targetPieces,
      garage
    );
  }

  // ==========================================================================
  // 3. 🌉 DUBBELBRO- & TUNNELDALEN (2 Våningar)
  // ==========================================================================
  createBridgeAndTunnelTrack(garage, availableTracks) {
    const targetPieces = Math.min(availableTracks, Math.max(48, Math.round(availableTracks * 0.85)));
    const supportsCount = Math.max(0, garage.supports || 0);
    const hasBridge = (garage.bridge || 0) > 0;
    const hasTunnel = (garage.tunnel || 0) > 0;

    const waypoints = [
      {
        x: 180,
        y: 390,
        elev: 1,
        title: 'Startdalen & Första Raksträckan',
        shapeBadge: 'Raksträcka på golvet',
        tip: 'Börja längst ner till vänster och bygg rakt åt höger.',
        specialParts: []
      },
      {
        x: 580,
        y: 395,
        elev: 2,
        title: 'Stora Backen upp på Bergskammen',
        shapeBadge: 'Uppfart + 90° sväng (Våning 2)',
        tip: 'Placera bropelare under kurvan så banan klättrar upp på våning 2.',
        specialParts: supportsCount > 0 ? [{ type: 'supports', count: Math.ceil(supportsCount / 2), frac: 0.6 }] : []
      },
      {
        x: 650,
        y: 155,
        elev: 2,
        title: hasBridge ? 'Hängbron på Höjden' : 'Högplatån på Våning 2',
        shapeBadge: 'Bro-sektion högst upp',
        tip: hasBridge
          ? 'Sätt fast den fasta brodelen här så bilen kör högt ovanför golvet!'
          : 'Håll banan upphöjd med pelare längs den övre kanten.',
        specialParts: [
          ...(hasBridge ? [{ type: 'bridge', count: garage.bridge, frac: 0.45 }] : []),
          ...(supportsCount > 1 ? [{ type: 'supports', count: Math.floor(supportsCount / 2), frac: 0.75 }] : [])
        ]
      },
      {
        x: 390,
        y: 120,
        elev: 1,
        title: 'Branta Nedfarten & S-Kurvan',
        shapeBadge: 'Nedfart + S-sväng',
        tip: 'Låt rälsen svepa mjukt ner till golvet igen mot mitten.',
        specialParts: (garage.turntableLoop || 0) > 0 ? [{ type: 'turntableLoop', count: 1, frac: 0.6 }] : []
      },
      {
        x: 280,
        y: 255,
        elev: 1,
        title: hasTunnel ? 'Mörka Tunnelgrottan i Dalen' : 'Inre Dal-Kurvan',
        shapeBadge: 'Skarp sväng genom dalen',
        tip: hasTunnel
          ? 'Ställ tunneln/grottan över spåret i dalen!'
          : 'Forma en djup inbuktning i banan innan sista kurvan.',
        specialParts: hasTunnel ? [{ type: 'tunnel', count: garage.tunnel, frac: 0.45 }] : []
      },
      {
        x: 115,
        y: 205,
        elev: 1,
        title: 'Västra Ytterkurvan & Mål',
        shapeBadge: '180° U-sväng till mål',
        tip: 'Böj runt ytterkanten och knäpp fast i Steg 1!',
        specialParts: []
      }
    ];

    const stepDefs = buildLoopStepCurves(waypoints, true).map((c) => ({
      points: c.points,
      arcLen: c.arcLen,
      title: c.meta.title,
      shapeBadge: c.meta.shapeBadge,
      elevation: c.meta.elev,
      tip: c.meta.tip,
      specialParts: c.meta.specialParts || []
    }));

    return this.finalizeTrackBlueprint(
      {
        id: 'bridge-tunnel-valley',
        name: '🌉 Bro- & Tunneldalen (2 Våningar)',
        category: 'bridge',
        difficulty: 'Medel ⭐⭐',
        badgeColor: '#10b981',
        description:
          'Bilen klättrar upp på bropelare och fast bro på våning 2, susar nedför backen och dundrar rakt genom tunnelgrottan!'
      },
      stepDefs,
      targetPieces,
      garage
    );
  }

  // ==========================================================================
  // 4. 🔀 VÄXEL-LABYRINTEN (Dubbla Slingor med Y-växlar)
  // ==========================================================================
  createSwitchLabyrinthTrack(garage, availableTracks) {
    const targetPieces = Math.min(availableTracks, Math.max(52, Math.round(availableTracks * 0.9)));
    const switchCount = Math.max(1, garage.ySwitch || 2);

    const outerWaypoints = [
      {
        x: 220,
        y: 410,
        elev: 1,
        title: 'Startrakan med Första Y-Växeln (Växel A)',
        shapeBadge: 'Raksträcka + Y-växel A',
        tip: 'Sätt dit första Y-växeln här! Vi bygger yttervarvet först och kopplar in genvägen på slutet.',
        specialParts: [{ type: 'ySwitch', count: 1, frac: 0.65 }]
      },
      {
        x: 615,
        y: 390,
        elev: 1,
        title: 'Stora Högra Ytterslingan',
        shapeBadge: 'Bred 180° högerkurva',
        tip: 'Bygg ut den stora ytterkurvan från det ena spåret på Y-växeln.',
        specialParts: (garage.tunnel || 0) > 0 ? [{ type: 'tunnel', count: 1, frac: 0.5 }] : []
      },
      {
        x: 560,
        y: 120,
        elev: 1,
        title: 'Norra Raksträckan med Andra Y-Växeln (Växel B)',
        shapeBadge: 'Övre raksträcka + Y-växel B',
        tip: 'Sätt dit andra Y-växeln så att det lediga uttaget pekar snett inåt mot mitten av banan!',
        specialParts: switchCount >= 2 ? [{ type: 'ySwitch', count: 1, frac: 0.45 }] : []
      },
      {
        x: 155,
        y: 145,
        elev: 1,
        title: 'Västra Yttersvängen tillbaka till Start',
        shapeBadge: 'Stor U-sväng till Steg 1',
        tip: 'Koppla ihop yttervarvet med Steg 1 så du har en komplett huvudbana på golvet!',
        specialParts: []
      }
    ];

    const stepDefs = buildLoopStepCurves(outerWaypoints, true).map((c) => ({
      points: c.points,
      arcLen: c.arcLen,
      title: c.meta.title,
      shapeBadge: c.meta.shapeBadge,
      elevation: c.meta.elev,
      tip: c.meta.tip,
      specialParts: c.meta.specialParts || [],
      isBranch: false
    }));

    // Steg 5: Inre genvägen / sidospåret mellan Växel A och Växel B!
    const innerBranchPts = sampleSplineSegment(
      { x: 220, y: 410, elev: 1 },
      { x: 445, y: 395, elev: 1 },
      { x: 380, y: 125, elev: 1 },
      { x: 155, y: 145, elev: 1 },
      28
    );
    let innerArc = 0;
    for (let i = 1; i < innerBranchPts.length; i++) {
      innerArc += Math.hypot(
        innerBranchPts[i].x - innerBranchPts[i - 1].x,
        innerBranchPts[i].y - innerBranchPts[i - 1].y
      );
    }

    stepDefs.push({
      points: innerBranchPts,
      arcLen: innerArc,
      title: 'Inre Genvägs-Spåret mellan Växel A & Växel B!',
      shapeBadge: 'S-formad genväg genom mitten',
      elevation: (garage.supports || 0) >= 2 ? 2 : 1,
      isBranch: true,
      tip: 'Nu kopplar du ihop det lediga spåret på Växel A (nere) med Växel B (uppe)! Nu kan bilen välja två olika vägar!',
      specialParts: [
        ...((garage.xCross || 0) > 0 ? [{ type: 'xCross', count: 1, frac: 0.5 }] : []),
        ...((garage.turntableLoop || 0) > 0 ? [{ type: 'turntableLoop', count: 1, frac: 0.7 }] : [])
      ]
    });

    return this.finalizeTrackBlueprint(
      {
        id: 'switch-labyrinth',
        name: '🔀 Växel-Labyrinten (Ytterbana + Genväg)',
        category: 'switch',
        difficulty: 'Klurig & Kul ⭐⭐⭐',
        badgeColor: '#eab308',
        description:
          'Bygg först den stora ytterrundan och koppla sedan in genvägen i mitten med dina Y-växlar så bilen kan byta spår i farten!'
      },
      stepDefs,
      targetPieces,
      garage
    );
  }

  // ==========================================================================
  // 5. 🟢 LILLA SPRINT-RUNDAN (Snabb & Barnvänlig i 4 steg)
  // ==========================================================================
  createSprintTrack(garage, availableTracks) {
    const targetPieces = Math.min(availableTracks, Math.max(36, Math.min(84, Math.round(availableTracks * 0.55))));

    const waypoints = [
      {
        x: 220,
        y: 380,
        elev: 1,
        title: 'Startrakan',
        shapeBadge: 'Raksträcka + mjuk böj',
        tip: 'Enkel och snabb start! Sätt ihop bitarna och lägg ut rakt på golvet.',
        specialParts: []
      },
      {
        x: 600,
        y: 350,
        elev: 1,
        title: 'Högra Sprint-Kurvan',
        shapeBadge: '180° U-sväng',
        tip: 'Böj en jämn halvcirkel uppåt.',
        specialParts: (garage.tunnel || 0) > 0 ? [{ type: 'tunnel', count: 1, frac: 0.5 }] : []
      },
      {
        x: 540,
        y: 140,
        elev: 1,
        title: 'Övre Våg-Kurvan',
        shapeBadge: 'Mjuk vågform åt vänster',
        tip: 'Låt rälsen svänga mjukt inåt i mitten som en njure/bumerang.',
        specialParts: (garage.bridge || 0) > 0 ? [{ type: 'bridge', count: 1, frac: 0.45 }] : []
      },
      {
        x: 180,
        y: 170,
        elev: 1,
        title: 'Vänstra Kurvan tillbaka i Mål',
        shapeBadge: '180° U-sväng till start',
        tip: 'Knäpp ihop med Steg 1 så är ni redo att köra direkt!',
        specialParts: []
      }
    ];

    const stepDefs = buildLoopStepCurves(waypoints, true).map((c) => ({
      points: c.points,
      arcLen: c.arcLen,
      title: c.meta.title,
      shapeBadge: c.meta.shapeBadge,
      elevation: c.meta.elev,
      tip: c.meta.tip,
      specialParts: c.meta.specialParts || []
    }));

    return this.finalizeTrackBlueprint(
      {
        id: 'quick-sprint-loop',
        name: '🟢 Lilla Sprint-Rundan (Bygg på 3 min!)',
        category: 'easy',
        difficulty: 'Lätt ⭐',
        badgeColor: '#22c55e',
        description:
          'Perfekt när barnen vill komma igång snabbt eller bygga helt själva i 4 superenkla steg!'
      },
      stepDefs,
      targetPieces,
      garage
    );
  }

  // ==========================================================================
  // 6. 🐍 ORM-SLINGAN GRAND PRIX (S-kurvor + Vändskiva/Ramp)
  // ==========================================================================
  createSerpentineGrandPrix(garage, availableTracks) {
    const targetPieces = Math.min(availableTracks, Math.max(48, Math.round(availableTracks * 0.88)));

    const waypoints = [
      {
        x: 140,
        y: 390,
        elev: 1,
        title: 'Grand Prix-Starten',
        shapeBadge: 'Lång startkurva',
        tip: 'Börja nere till vänster och sväng snett upp mot mitten.',
        specialParts: (garage.turntableLoop || 0) > 0 ? [{ type: 'turntableLoop', count: 1, frac: 0.45 }] : []
      },
      {
        x: 375,
        y: 255,
        elev: 1,
        title: 'Chikanen i Mitten (S-Kurvan)',
        shapeBadge: 'Snäv S-sväng',
        tip: 'Här svänger bilen först vänster och direkt höger igen!',
        specialParts: []
      },
      {
        x: 645,
        y: 395,
        elev: 1,
        title: 'Sydöstra Hårnålen',
        shapeBadge: 'Skarp 180° rundning',
        tip: 'Forma en rejäl vändkurva längst ner till höger.',
        specialParts: (garage.tunnel || 0) > 0 ? [{ type: 'tunnel', count: 1, frac: 0.5 }] : []
      },
      {
        x: 655,
        y: 120,
        elev: (garage.supports || 0) >= 2 ? 2 : 1,
        title: 'Norra Panorama-Kurvan',
        shapeBadge: 'Lång ytterbåge',
        tip: 'Dra spåret högt upp längs högerkanten och sväng vänster.',
        specialParts:
          (garage.supports || 0) >= 2
            ? [{ type: 'supports', count: Math.min(4, garage.supports), frac: 0.5 }]
            : []
      },
      {
        x: 150,
        y: 125,
        elev: 1,
        title: 'Nordvästra Kurvan & Målrakan',
        shapeBadge: 'U-sväng + Raksträcka till mål',
        tip: 'Koppla ihop med Steg 1 så är Grand Prix-slingan redo för race!',
        specialParts: (garage.bridge || 0) > 0 ? [{ type: 'bridge', count: 1, frac: 0.4 }] : []
      }
    ];

    const stepDefs = buildLoopStepCurves(waypoints, true).map((c) => ({
      points: c.points,
      arcLen: c.arcLen,
      title: c.meta.title,
      shapeBadge: c.meta.shapeBadge,
      elevation: c.meta.elev,
      tip: c.meta.tip,
      specialParts: c.meta.specialParts || []
    }));

    return this.finalizeTrackBlueprint(
      {
        id: 'serpentine-gp',
        name: '🐍 Orm-Slingan Grand Prix',
        category: 'switch',
        difficulty: 'Medel ⭐⭐',
        badgeColor: '#ec4899',
        description:
          'En kurvig teknisk bana med härliga S-svängar, hårnålskurvor och maximal körglädje!'
      },
      stepDefs,
      targetPieces,
      garage
    );
  }

  // ==========================================================================
  // 🎲 SLUMPA NY BANA! (Procedur-generator som skapar helt nya unika banor)
  // ==========================================================================
  generateRandomCustomTrack(garage) {
    const availableTracks = Math.max(40, Number(garage.tracks) || 120);
    const seed = this.randomSeedCounter++;
    const numSteps = Math.min(8, Math.max(5, Math.round(availableTracks / 22)));
    const useAllParts = seed % 2 === 1;
    const targetPieces = useAllParts
      ? availableTracks
      : Math.max(40, Math.round(availableTracks * (0.72 + (seed % 3) * 0.1)));

    const cx = 400;
    const cy = 260;
    const rx = 265;
    const ry = 165;

    const waypoints = [];
    for (let i = 0; i < numSteps; i++) {
      const baseAngle = (i / numSteps) * Math.PI * 2 + Math.PI * 0.5;
      // Skapa spännande in- och utbuktningar (stjärn-/bumerang-/S-kurv-variation)
      const wave = Math.sin(i * 2.1 + seed * 1.7) * 0.26;
      const radX = rx * (1 + wave);
      const radY = ry * (1 - wave * 0.6);

      const x = Math.round(cx + Math.cos(baseAngle) * radX);
      const y = Math.round(cy + Math.sin(baseAngle) * radY);
      const isElevated = i === 2 && ((garage.supports || 0) >= 2 || (garage.bridge || 0) > 0);

      const specialParts = [];
      if (i === 1 && (garage.tunnel || 0) > 0) {
        specialParts.push({ type: 'tunnel', count: 1, frac: 0.5 });
      }
      if (i === 2 && (garage.bridge || 0) > 0) {
        specialParts.push({ type: 'bridge', count: 1, frac: 0.45 });
      }
      if (i === 2 && (garage.supports || 0) > 0) {
        specialParts.push({ type: 'supports', count: Math.min(4, garage.supports), frac: 0.7 });
      }
      if (i === 3 && (garage.xCross || 0) > 0) {
        specialParts.push({ type: 'xCross', count: 1, frac: 0.5 });
      }
      if (i === 0 && (garage.ySwitch || 0) > 0) {
        specialParts.push({ type: 'ySwitch', count: 1, frac: 0.6 });
      }
      if (i === 4 && (garage.turntableLoop || 0) > 0) {
        specialParts.push({ type: 'turntableLoop', count: 1, frac: 0.5 });
      }

      const stepNames = [
        'Startrakan & Utgången',
        'Sydöstra Kurvpartiet',
        isElevated ? 'Högbro-Passagen (Våning 2)' : 'Östra Chikanen',
        'Norra Toppsvängen',
        'Nordvästra Dalen',
        'Västra Hårnålskurvan',
        'Södra Spurten',
        'Målgångs-Slingan'
      ];

      waypoints.push({
        x: Math.max(85, Math.min(715, x)),
        y: Math.max(85, Math.min(435, y)),
        elev: isElevated ? 2 : 1,
        title: stepNames[i % stepNames.length],
        shapeBadge: wave > 0.05 ? 'Vid ytterkurva' : wave < -0.05 ? 'Inre S-sväng' : 'Mjuk båge',
        tip: isElevated
          ? 'Lyft upp sektionen på bropelare så bilen får en häftig backe!'
          : 'Böj rälsen längs med den lysande linjen från A till B.',
        specialParts
      });
    }

    const stepDefs = buildLoopStepCurves(waypoints, true).map((c) => ({
      points: c.points,
      arcLen: c.arcLen,
      title: c.meta.title,
      shapeBadge: c.meta.shapeBadge,
      elevation: c.meta.elev,
      tip: c.meta.tip,
      specialParts: c.meta.specialParts || []
    }));

    const themeNames = [
      '🎲 Slumpad Super-Slinga #' + seed,
      '🎲 Safari-Äventyret #' + seed,
      '🎲 Dino-Cirkeln #' + seed,
      '🎲 Turbo-Racet #' + seed
    ];

    return this.finalizeTrackBlueprint(
      {
        id: 'random-track-' + seed,
        name: themeNames[(seed - 1) % themeNames.length],
        category: 'all',
        difficulty: 'Unik Slumpbana 🎲',
        badgeColor: '#a855f7',
        description: `Specialslumpad bana #${seed} skapad direkt utifrån era ${availableTracks} rälsbitar (${Math.round(availableTracks * FLEXI_CM_PER_BIT)} cm)!`
      },
      stepDefs,
      targetPieces,
      garage
    );
  }
}

window.flexiTrackGenerator = new FlexiTrackGenerator();
window.SPECIAL_PART_META = SPECIAL_PART_META;
window.FLEXI_CM_PER_BIT = FLEXI_CM_PER_BIT;
