'use strict';
// Leveldaten. Koordinaten in Weltpixeln, y wächst nach unten.
// Spieler: 16 x 26, Sprunghöhe ca. 84, Sprungweite ca. 110, Faden zwischen beiden: 400.
(function () {
  const FF = globalThis.FF;
  // Ein Erdblock von x0 bis x1 mit Oberkante top, der bis tief nach unten reicht.
  const col = (x0, x1, top, bottom = 1600) => [x0, top, x1 - x0, bottom - top];
  const walls = (w) => [[-60, -800, 60, 2600], [w, -800, 60, 2600]];

  FF.LEVELS = [
    {
      id: 'garten',
      name: 'Morgengarten',
      blurb: 'Laufen, springen, das erste Lasso.',
      theme: 'garden',
      width: 2700, height: 900,
      spawn: [110, 600],
      solids: [
        col(-60, 640, 600),
        [300, 565, 70, 35],
        [440, 530, 80, 70],
        col(720, 1240, 600),
        col(1240, 1760, 460),
        col(1990, 2760, 460),
        ...walls(2700),
      ],
      water: [[640, 640, 80, 400], [1760, 680, 230, 400]],
      anchors: [[1250, 380], [1875, 330]],
      checkpoints: [[1340, 460]],
      beads: [[335, 520], [480, 488], [680, 556], [1010, 560], [1520, 420], [1875, 505], [2240, 420], [2380, 380]],
      signs: [[170, 600, 'move'], [1040, 600, 'lasso'], [1610, 460, 'swing'], [2120, 460, 'together']],
      goal: [2540, 460],
    },
    {
      id: 'steinbruch',
      name: 'Alter Steinbruch',
      blurb: 'Festhalten, abseilen, am Faden des anderen schwingen.',
      theme: 'quarry',
      width: 2500, height: 1000,
      spawn: [110, 450],
      solids: [
        col(-60, 800, 450),
        col(800, 1020, 900),
        col(1020, 1700, 705),
        col(1700, 2560, 505),
        [380, 410, 90, 40],
        ...walls(2500),
      ],
      anchors: [[1712, 440]],
      checkpoints: [[1110, 705], [1820, 505]],
      beads: [[425, 380], [700, 420], [910, 830], [1250, 670], [1560, 600], [1680, 560], [2000, 470], [2150, 470]],
      signs: [[230, 450, 'grip'], [1190, 705, 'tetherclimb'], [1540, 705, 'lasso2']],
      goal: [2330, 505],
    },
    {
      id: 'teich',
      name: 'Am Teich',
      blurb: 'Kisten schieben, auf dem Wasser treiben.',
      theme: 'pond',
      width: 3600, height: 900,
      spawn: [110, 600],
      solids: [
        col(-60, 900, 600),
        col(900, 1500, 480),
        col(1950, 2500, 500),
        col(2500, 2800, 360),
        col(3020, 3660, 360),
        ...walls(3600),
      ],
      water: [[1500, 520, 450, 500, 48], [2800, 560, 220, 400]],
      crates: [[430, 600, 46], [1380, 480, 46], [2240, 500, 64, true]],
      anchors: [[2910, 230]],
      checkpoints: [[1000, 480], [2020, 500], [2600, 360]],
      beads: [[560, 520], [1200, 440], [1725, 470], [1880, 450], [2380, 400], [2910, 430], [3200, 320], [3330, 280]],
      signs: [[200, 600, 'crate'], [1300, 480, 'float'], [2100, 500, 'heavy'], [2700, 360, 'swing2']],
      goal: [3420, 360],
    },
    {
      id: 'herbstwald',
      name: 'Herbstwald',
      blurb: 'Knoten knüpfen und vom Faden abfedern.',
      theme: 'autumn',
      width: 2900, height: 900,
      spawn: [110, 600],
      solids: [
        col(-60, 1000, 600),
        col(1000, 1600, 455),
        col(1600, 2250, 640),
        col(2250, 2960, 490),
        ...walls(2900),
      ],
      oneways: [[1250, 380, 90]],
      thorns: [[1700, 624, 80, 16]],
      anchors: [[800, 582, 1], [960, 582, 1], [2060, 622, 1], [2210, 622, 1]],
      checkpoints: [[1090, 455], [1660, 640]],
      beads: [[880, 470], [930, 420], [1295, 345], [1440, 420], [1755, 560], [2135, 470], [2400, 450], [2560, 450]],
      signs: [[520, 600, 'knot'], [1900, 640, 'knot2']],
      goal: [2700, 490],
    },
    {
      id: 'heimweg',
      name: 'Heimweg',
      blurb: 'Alles zusammen – bis nach Hause.',
      theme: 'dusk',
      width: 3700, height: 1250,
      spawn: [110, 500],
      solids: [
        col(-60, 600, 500),
        col(1180, 1800, 500),
        col(1800, 2020, 1190),
        col(2020, 2900, 740),
        col(2900, 3760, 540),
        ...walls(3700),
      ],
      water: [[600, 760, 580, 600]],
      thorns: [[1800, 1160, 220, 30]],
      anchors: [[720, 360], [900, 360], [1080, 360], [2700, 722, 1], [2840, 722, 1], [2930, 350]],
      checkpoints: [[1270, 500], [2150, 740]],
      beads: [[810, 520], [990, 520], [1500, 470], [1900, 870], [2400, 700], [2770, 620], [3150, 500], [3300, 460]],
      signs: [[470, 500, 'chain'], [1620, 500, 'pit'], [2560, 740, 'combo']],
      goal: [3480, 540],
    },
  ];

  // Hinweistafeln. {taste} wird je nach Steuerung durch Tastenkappen ersetzt.
  FF.SIGNS = {
    move: {
      solo: 'Laufen {move} · Springen {up}\nPartner absetzen/aufnehmen {merge} · Wechseln {swap}',
      coop: 'Laufen {move} · Springen {up}\nIhr hängt am selben Faden – bleibt beisammen.',
    },
    lasso: { all: 'Lasso {lasso} – an den Haken vor dir werfen\nAm Faden klettern {updown}' },
    swing: { all: 'Im Flug mit {move} Schwung holen\n{lasso} loslassen oder zum nächsten Haken' },
    together: {
      solo: 'Ins Ziel müsst ihr beide –\nhuckepack {merge} geht’s am leichtesten.',
      coop: 'Ins Ziel müsst ihr beide kommen.',
    },
    grip: {
      solo: 'Setz deinen Partner an der Kante ab {merge}.\nEr hält sich fest – du seilst dich ab und schwingst.',
      coop: 'Festhalten {grip} gedrückt halten.\nDann kann sich der andere abseilen und schwingen.',
    },
    tetherclimb: {
      solo: 'Wechsle {swap}: Wer drüben steht, hält fest.\nAm Faden hochklettern {up}',
      coop: 'Wer oben ist, hält fest {grip}.\nWer unten hängt, klettert hoch {up}.',
    },
    lasso2: { all: 'Ganz nah an die Wand und den Haken werfen {lasso}.\nOben angekommen zieht ihr den anderen nach.' },
    crate: { all: 'Kisten lassen sich schieben.\nVon der Kiste kommst du höher hinaus.' },
    float: { all: 'Kisten schwimmen. Wer draufsteht,\nwird von der Strömung mitgenommen.' },
    heavy: {
      solo: 'Diese Kiste ist zu schwer für einen.\nHuckepack {merge} seid ihr stark genug.',
      coop: 'Diese Kiste ist zu schwer für einen.\nSchiebt zu zweit.',
    },
    swing2: { all: 'Hoch über dem Wasser hängt ein Haken.' },
    knot: { all: 'Lasso {lasso} an einen Pflock, zum zweiten laufen,\nKnoten {knot} – der Faden federt wie ein Trampolin.' },
    knot2: { all: 'Noch einmal: zwei Pflöcke, ein Knoten {knot}.' },
    chain: { all: 'Von Haken zu Haken: im Flug {lasso} drücken,\nwenn der nächste Haken leuchtet.' },
    pit: {
      solo: 'Unten sind Dornen. Einer hält oben fest,\nder andere schwingt hinüber und klettert.',
      coop: 'Unten sind Dornen. Einer hält oben fest {grip},\nder andere schwingt hinüber und klettert.',
    },
    combo: { all: 'Vom Faden-Trampolin aus erreicht\ndas Lasso {lasso} den hohen Haken.' },
  };
})();
