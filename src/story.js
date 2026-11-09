'use strict';
// Die Geschichte: Aus Astrids rotem Garn erwacht eine kleine Figur und sammelt die verlorenen Erinnerungen des alten
// Leuchtturmwärters Nils. Am Ziel jedes Levels liegt ein Gegenstand aus seinem Leben mit einem glimmenden Fadenrest,
// dem Erinnerungsknoten. Jede Erinnerung wird zu einer Reihe im Schal, den seine Tochter Maja ihm am Ende bringt.
(function () {
  const FF = globalThis.FF;

  FF.STORY = {
    intro: 'Im Flur des alten Leuchtturmhäuschens steht ein Strickkorb mit einem halbfertigen roten Schal. Aus dem Knäuel ' +
      'erwacht eine kleine Garnfigur. Sammelt die verlorenen Erinnerungen des Leuchtturmwärters Nils – mit jeder wächst der Schal, ' +
      'der seine Tochter Maja zu ihm zurückführt.',
    levels: {
      garten: { world: 'Rund ums Häuschen', item: 'compass', name: 'Nils’ Messingkompass', pattern: 'star',
        text: 'Ein junger Nils zeigt der kleinen Maja, wie die Nadel immer nach Norden weist.' },
      steinbruch: { world: 'Rund ums Häuschen', item: 'knife', name: 'Nils’ Taschenmesser', pattern: 'zigzag',
        text: 'Geduldig zeigt Nils einem schüchternen Jungen, wie man ein Ruder schnitzt. Maja schaut von weitem zu – einer der Tage, an denen ihr Vater einfach da war.' },
      teich: { world: 'Rund ums Häuschen', item: 'oar', name: 'Das Ruder mit „N + A“', pattern: 'waves',
        text: 'Nils und Astrid, jung, im Holzboot. Sie strickt, er rudert, beide lachen.' },
      herbstwald: { world: 'Moor und Wald', item: 'bird', name: 'Der unfertige Holzvogel', pattern: 'leaf',
        text: 'Nils schnitzt im Wald einen Vogel für Maja. Dann ruft das Signalhorn vom Leuchtturm – der Vogel bleibt unfertig.' },
      heimweg: { world: 'Moor und Wald', item: 'photo', name: 'Das Foto von der Galerie', pattern: 'diamond',
        text: 'Wind, Licht, ein junger Mann oben auf dem Leuchtturm. Die Hand zum Gruß erhoben, der Blick stolz in die Ferne.' },
      moor: { world: 'Moor und Wald', item: 'bucket', name: 'Der Moltebeeren-Eimer', pattern: 'berry',
        text: 'Zwei Griffe, ein großer und ein kleiner. Maja isst mehr Beeren, als sie sammelt. Nils tut, als merke er es nicht.' },
      kueste: { world: 'Die Küste', item: 'bottle', name: 'Die Flaschenpost', pattern: 'gull',
        text: 'Die kleine Maja wirft einen Brief ins Meer, mit gemaltem Herz und Boot – in Richtung Leuchtturm. Nils hat jeden ihrer Briefe aufgehoben.' },
      winterpass: { world: 'Der Winterfjord', item: 'skate', name: 'Der alte Schlittschuh', pattern: 'crystal',
        text: 'Nils zieht Maja über den zugefrorenen Fjord. Sie fällt, er lacht und hebt sie auf.' },
      schrottplatz: { world: 'Die Sturminsel', item: 'bell', name: 'Die Schiffsglocke', pattern: 'anchor',
        text: 'Für jedes Schiff, das er nicht retten konnte, hat Nils eine Kerbe in die Glocke geschlagen. Es sind nur wenige. Er berührt jede.' },
      kuerbisnacht: { world: 'Moor und Wald', item: 'glove', name: 'Der grüne Kinderhandschuh', pattern: 'heart', green: true,
        text: 'Majas Handschuh, vor vielen Wintern im Dunkeln verloren. Der zweite fehlt bis heute.' },
      leuchtturm: { world: 'Die Sturminsel', item: 'ring', name: 'Der Rettungsring', pattern: 'beam',
        text: 'Sturmnacht: Nils hält das Licht am Brennen, ein Kutter kommt sicher heim. Zur selben Zeit wartet Maja im Festkleid vor einem Kuchen, dessen Kerzen herunterbrennen.' },
      nordlicht: { world: 'Der Winterfjord', item: 'sled', name: 'Der Schlitten mit dem „M“', pattern: 'aurora',
        text: 'Nachts baut Nils im Schein der Taschenlampe einen Schlitten. Am Morgen ist er auf See – der Schlitten steht mit Schleife vor der Tür.' },
      vergessen: { world: 'Das Vergessen', item: 'needles', name: 'Astrids Stricknadeln', pattern: 'knot',
        text: 'Astrid strickt am Krankenbett, Nils hält ihre Hand. Sie kommt nicht bis zum Ende. Er legt die Nadeln in den Korb und schließt den Deckel.' },
    },
    finale: {
      title: 'Die letzte Masche',
      text: 'Maja legt Nils den Schal um. Seine Finger tasten über die Reihen: Wellen, Möwen, Eiskristalle, Birkenblätter. ' +
        'An der letzten Masche hält er inne und beginnt zu summen – Astrids Lied. Sein Blick wird klar. „Maja.“',
    },
  };
  FF.storyOf = (level) => FF.STORY.levels[level.id] || null;

  // ------------------------------------------------------------ Der Schal
  // Muster je Reihe, gezeichnet in ein Feld von 24 x 24 (Linien in Wollweiß)
  const MOTIFS = {
    star: 'M12 4 L12 20 M4 12 L20 12 M7 7 L17 17 M17 7 L7 17',
    zigzag: 'M3 16 L8 8 L13 16 L18 8 L21 13',
    waves: 'M2 10 Q6 5 10 10 T18 10 T26 10 M2 17 Q6 12 10 17 T18 17 T26 17',
    leaf: 'M12 21 L12 9 M12 9 Q5 10 6 4 Q12 3 12 9 M12 13 Q19 13 19 7 Q13 7 12 13',
    diamond: 'M12 4 L20 12 L12 20 L4 12 Z M12 9 L15 12 L12 15 L9 12 Z',
    berry: 'M9 14 a3 3 0 1 0 0.1 0 M15 14 a3 3 0 1 0 0.1 0 M12 9 a3 3 0 1 0 0.1 0 M12 6 L12 3',
    gull: 'M3 10 Q7 5 12 11 Q17 5 21 10 M7 18 Q10 15 12 19 Q14 15 17 18',
    crystal: 'M12 3 L12 21 M4.2 7.5 L19.8 16.5 M19.8 7.5 L4.2 16.5 M12 6 L10 4 M12 6 L14 4 M12 18 L10 20 M12 18 L14 20',
    anchor: 'M12 5 L12 20 M8 9 L16 9 M5 15 Q6 20 12 20 Q18 20 19 15 M12 5 a1.5 1.5 0 1 0 0.1 0',
    heart: 'M12 20 L5 12 Q3 7 8 6 Q11 6 12 10 Q13 6 16 6 Q21 7 19 12 Z',
    beam: 'M10 21 L11 9 L13 9 L14 21 M9 9 L15 9 M12 6 L3 3 M12 6 L21 3 M12 6 L2 8 M12 6 L22 8',
    aurora: 'M3 18 Q8 4 12 14 Q16 22 21 6 M3 12 Q7 4 10 9 M14 15 Q18 16 21 12',
    knot: 'M5 12 Q5 5 12 8 Q19 11 19 15 Q19 20 12 16 Q5 12 8 7 M12 16 Q15 21 20 20',
  };

  // Schal als SVG: links die Fransen, dann je Level eine Reihe; fertige Reihen sind gestrickt, offene nur angedeutet
  FF.scarfSVG = function (doneIds) {
    const L = FF.LEVELS, bw = 30, h = 54, pad = 16;
    const w = pad + L.length * bw + 8;
    let s = `<svg viewBox="0 0 ${w} ${h + 8}" role="img" aria-label="Der Schal: ${doneIds.size} von ${L.length} Reihen"><defs>` +
      '<pattern id="knit" width="6" height="7" patternUnits="userSpaceOnUse"><path d="M0 1 L3 6 L6 1" fill="none" stroke="rgba(0,0,0,0.22)" stroke-width="1.1"/></pattern></defs>';
    for (let i = 0; i < 7; i++) s += `<path d="M${pad} ${7 + i * 7.4} q-7 ${i % 2 ? 2 : -2} -${11 + (i * 5) % 4} ${i % 2 ? -1 : 2}" stroke="#c9483a" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    L.forEach((lv, i) => {
      const st = FF.storyOf(lv), x = pad + i * bw, done = doneIds.has(lv.id);
      if (!done) {
        s += `<rect x="${x + 1}" y="5" width="${bw - 2}" height="${h - 2}" rx="3" fill="none" stroke="rgba(241,232,214,0.22)" stroke-dasharray="3 4"/>`;
        return;
      }
      const base = st && st.green ? '#5f8a4a' : i % 2 ? '#b43a2d' : '#c9483a';
      s += `<rect x="${x}" y="4" width="${bw}" height="${h}" fill="${base}"/><rect x="${x}" y="4" width="${bw}" height="${h}" fill="url(#knit)"/>`;
      const d = st && MOTIFS[st.pattern];
      if (d) s += `<g transform="translate(${x + 3} ${4 + (h - 24) / 2})" fill="none" stroke="#f3e6cc" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></g>`;
      s += `<title>${st ? st.name : lv.name}</title>`;
    });
    return s + '</svg>';
  };
})();
