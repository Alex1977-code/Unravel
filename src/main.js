'use strict';
// Menüs, HUD, Netzwerkrollen und Hauptschleife.
(function () {
  const FF = globalThis.FF;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const cv = $('#game');
  const params = new URLSearchParams(location.search);
  // Grafik: immer 3D (WebGL 2). Ohne WebGL 2 lässt sich das Spiel nicht darstellen – dann ein klarer Hinweis.
  let R = null;
  if (params.get('render') === 'off') {
    // Nur für automatische Tests ohne Grafikkarte: Spiel und Netz laufen, gezeichnet wird nichts
    R = { keyLabels: null, draw() {}, resize() {}, setWeather() {}, ready: () => true };
  } else {
    try { if (FF.has3D()) R = new FF.Renderer3D($('#gl'), cv); } catch (e) { console.warn('3D nicht verfügbar', e); }
  }
  if (!R) {
    document.body.classList.add('nogl');
    document.body.innerHTML = '<div class="nogl"><h1 class="logo">Ver<span>strickt</span></h1><p>Dieser Browser kann keine 3D-Grafik (WebGL 2) anzeigen. Bitte öffne das Spiel in einem aktuellen Safari, Chrome, Firefox oder Edge.</p></div>';
    return;
  }
  const input = new FF.Input();
  const isTouch = (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
  if (isTouch) { input.device = 'touch'; document.body.classList.add('touch'); }
  R.keyLabels = (m) => input.labels(net && net.role === 'guest' ? 'solo' : m);

  let screen = 'title';
  let mode = 'solo';
  let game = null;
  let returnTo = 'title';
  // net: null | { role: 'host', host, tv, slots } | { role: 'guest', client, slot } | { role: 'pad', client, slot }
  let net = null;
  const demo = new FF.Game(0, 'coop');
  const idle = [FF.makeCtl(), FF.makeCtl()];
  const NAMES = ['Rot', 'Blau'];

  const progress = FF.store.get('progress', {});
  const saveProgress = () => FF.store.set('progress', progress);

  // Lokaler Touch-Joystick
  const touchPad = new FF.TouchPad($('#touch'));

  // ------------------------------------------------------------ Bildschirme
  const screens = ['title', 'levels', 'help', 'pause', 'win', 'online', 'lobby', 'tv', 'pads', 'guest'];
  let navSel = null;
  function show(name) {
    screen = name;
    for (const s of screens) $('#scr-' + s).hidden = s !== name;
    const inGame = name === 'play' || name === 'pause' || name === 'win';
    $('#hud').hidden = !inGame;
    document.body.classList.toggle('playing', name === 'play');
    $$('.host-only').forEach((el) => (el.hidden = !!(net && net.role === 'guest')));
    updateTouch();
    input.captureGame = name === 'play';
    if (name !== 'play') {
      const first = document.querySelector('#scr-' + name + ' [data-default]') || document.querySelector('#scr-' + name + ' .btn:not([hidden])');
      navSel = first;
      if (first && !isTouch) setTimeout(() => first.focus({ preventScroll: true }), 30);
    } else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (name === 'pads') renderPadList(true);
    if (net && net.role === 'host') {
      net.host.broadcast({ t: 'screen', name, lv: game ? game.levelIndex : -1, mode });
      if (name === 'lobby') renderLobby();
    }
  }

  function updateTouch() {
    const want = screen === 'play' && (isTouch || input.device === 'touch') && !(net && net.tv);
    $('#touch').hidden = !want;
    touchPad.setSolo(mode === 'solo');
    if (want) input.setVirtual('touch', 0, touchPad.state);
    else { input.setVirtual('touch', null); touchPad.reset(); }
  }

  function buildLevels() {
    $('#levels-title').textContent = mode === 'solo' ? 'Allein – Level wählen' : 'Zu zweit – Level wählen';
    const list = $('#level-list');
    list.textContent = '';
    FF.LEVELS.forEach((L, i) => {
      const pr = progress[mode + ':' + L.id] || {};
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn level-card';
      b.innerHTML = `<span class="num">${i + 1}</span><span><span class="name"></span><br><span class="blurb"></span></span><span class="meta"></span>`;
      const th = FF.THEMES[L.theme];
      if (th) b.querySelector('.num').style.background = `linear-gradient(180deg, ${th.sky[0]}, ${th.sky[1]} 55%, ${th.near} 56%, ${th.earth2})`;
      b.querySelector('.name').textContent = L.name;
      b.querySelector('.blurb').textContent = L.blurb;
      b.querySelector('.meta').innerHTML = pr.done
        ? `<span class="done">✓ geschafft</span> · ${pr.beads || 0}/${L.beads.length}`
        : `${L.beads.length} Funken`;
      b.addEventListener('click', () => startLevel(i));
      li.appendChild(b);
      list.appendChild(li);
    });
  }

  function startLevel(i) {
    FF.audio.init();
    game = new FF.Game(i, mode);
    if (net && net.role === 'host') {
      FF.recordGame(game);
      net.host.broadcast({ t: 'start', lv: i, mode });
    }
    enterLevel(i);
    if (isTouch && !(net && net.tv)) goFullscreen(true);
    if (i === 0 && !net) toast(mode === 'solo' ? 'Du trägst deinen Partner huckepack.' : 'Rot spielt links, Blau rechts.');
  }

  function enterLevel(i) {
    FF.audio.setMood(FF.LEVELS[i].theme);
    R.snap = true;
    $('#toasts').textContent = '';
    $('#hud-level').textContent = `${i + 1} · ${FF.LEVELS[i].name}`;
    show('play');
    updateHud(true);
  }

  function toast(text, who) {
    const box = $('#toasts');
    while (box.children.length > 2) box.firstChild.remove();
    const el = document.createElement('div');
    el.className = 'toast' + (who === 0 ? ' red' : who === 1 ? ' blue' : '');
    el.textContent = text;
    box.appendChild(el);
    setTimeout(() => el.remove(), 3300);
  }

  let hudCache = '';
  function updateHud(force) {
    if (!game) return;
    const beads = `${game.beadsGot()}/${game.beads.length}`;
    let who = '';
    if (game.mode === 'solo') {
      const a = game.players[game.active], o = game.players[1 - game.active];
      who = (o.merged ? `${NAMES[a.id]} trägt ${NAMES[o.id]}` : `Du spielst ${NAMES[a.id]}`) + '|' + a.id;
    } else if (net && net.role === 'guest') who = `Du spielst ${NAMES[net.slot]}|${net.slot}`;
    let netTxt = '';
    if (net && net.role === 'host') netTxt = `Raum ${net.host.code} · ${net.host.count} verbunden`;
    if (net && net.role === 'guest') netTxt = net.client.rtt ? `Online · ${Math.round(net.client.rtt)} ms` : 'Online';
    const key = beads + who + netTxt;
    if (!force && key === hudCache) return;
    hudCache = key;
    $('#hud-beads').textContent = beads;
    const w = $('#hud-who');
    w.hidden = !who;
    if (who) {
      const [txt, id] = who.split('|');
      w.innerHTML = `<span class="who-dot" style="background:${FF.COLORS[+id]}"></span>`;
      w.appendChild(document.createTextNode(txt));
    }
    $('#hud-net').hidden = !netTxt;
    $('#hud-net').textContent = netTxt;
  }

  // Ereignisse aus dem Spiel: Hinweise, Sieg, Vibration
  const outToasts = [];
  function handleEvents() {
    for (const e of game.events) {
      if (e.type === 'toast') { toast(e.text, e.who); outToasts.push([e.text, e.who]); }
      if (e.type === 'won') onWin();
      if (e.type === 'fb') feedback(e.who, e.s, e.ms);
    }
    game.events.length = 0;
  }

  function feedback(who, s, ms) {
    const slot = mode === 'solo' ? 0 : who;
    if (net && net.role === 'host') {
      const occ = net.slots[slot];
      if (occ && occ.kind === 'remote') { net.host.send(occ.info, { t: 'rumble', s, ms }); return; }
    }
    input.rumble(slot, s, ms);
  }

  function onWin() {
    const L = game.L, i = game.levelIndex;
    const k = mode + ':' + L.id;
    const prev = progress[k] || {};
    progress[k] = { done: true, beads: Math.max(prev.beads || 0, game.beadsGot()) };
    saveProgress();
    setTimeout(() => {
      if (screen !== 'play' || !game || game.state !== 'won') return;
      showWin(i, game.beadsGot(), game.beads.length);
      show('win');
    }, 1300);
  }

  function showWin(i, got, total) {
    const last = i === FF.LEVELS.length - 1;
    $('#win-title').textContent = last ? 'Endlich zu Hause!' : 'Geschafft!';
    let text = last
      ? `Ihr habt den ganzen Weg gemeinsam gemeistert. ${got} von ${total} Funken im letzten Level gesammelt.`
      : `„${FF.LEVELS[i].name}“ liegt hinter euch. ${got} von ${total} Funken gesammelt.`;
    if (net && net.role === 'guest') text += ' Rot wählt, wie es weitergeht.';
    $('#win-text').textContent = text;
    $('#btn-next').hidden = last;
  }

  // ------------------------------------------------------------ Vollbild
  function goFullscreen(auto) {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (!auto) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      return;
    }
    if (!req) { if (!auto) toast('Auf dem iPhone: Teilen → „Zum Home-Bildschirm“ für Vollbild.'); return; }
    Promise.resolve(req.call(el)).then(() => {
      if (screen.orientation && screen.orientation.lock && isTouch) screen.orientation.lock('landscape').catch(() => {});
    }).catch(() => {});
  }

  // ------------------------------------------------------------ Online: Gastgeber
  async function openRoom(tv, code) {
    closeNet();
    const host = new FF.NetHost({
      assignSlot: (info) => {
        const order = tv ? [0, 1] : [1];
        for (const s of order) if (!net.slots[s]) { net.slots[s] = { kind: 'remote', info }; return s; }
        return null;
      },
      onJoin: (info) => {
        const kind = info.role === 'pad' ? 'Handy-Controller' : 'eigener Bildschirm';
        toast(`${NAMES[info.slot]} ist dabei (${kind})`, info.slot);
        if (screen === 'lobby') renderLobby();
        // Nachzügler mitten im Spiel abholen
        host.send(info, { t: 'screen', name: screen, lv: game ? game.levelIndex : -1, mode });
        if (game && (screen === 'play' || screen === 'pause' || screen === 'win')) host.send(info, { t: 'start', lv: game.levelIndex, mode });
        updateHud(true);
      },
      onLeave: (info) => {
        if (net && net.slots[info.slot] && net.slots[info.slot].info === info) net.slots[info.slot] = null;
        input.setVirtual('r:' + info.id, null);
        toast(`${NAMES[info.slot]} hat die Verbindung verloren.`, info.slot);
        if (screen === 'lobby') renderLobby();
        updateHud(true);
      },
      onInput: (info, st) => { if (st && st.n) input.setVirtual('r:' + info.id, info.slot, st); },
      onNav: (info, k) => remoteNav(k),
      onError: (t) => toast(t),
    });
    net = { role: 'host', host, tv, slots: tv ? [null, null] : [{ kind: 'local' }, null] };
    $('#lobby-code').textContent = '····';
    $('#lobby-title').textContent = tv ? 'Fernseher bereit' : 'Raum offen';
    document.body.classList.toggle('tv', !!tv);
    show('lobby');
    try {
      const c = await host.open(code);
      if (!net || net.host !== host) { host.close(); return; }
      renderLobby();
      FF.audio.onPlay = (name, v) => { if (net && net.role === 'host') outSfx.push(name); };
      void c;
    } catch (e) {
      closeNet();
      show(tv ? 'tv' : 'online');
      $('#online-msg').textContent = 'Raum konnte nicht geöffnet werden: ' + e.message;
      toast('Raum konnte nicht geöffnet werden: ' + e.message);
    }
  }

  function joinLink(code) { return location.origin + location.pathname + '?join=' + code; }

  async function renderLobby() {
    if (!net || net.role !== 'host') return;
    const code = net.host.code;
    if (code) {
      $('#lobby-code').textContent = code;
      const link = joinLink(code);
      $('#lobby-link').textContent = link;
      const qr = $('#lobby-qr');
      if (qr.dataset.code !== code) {
        qr.dataset.code = code;
        try {
          if (!globalThis.qrcode) await FF.loadScript('vendor/qrcode.js');
          const q = globalThis.qrcode(0, 'M');
          q.addData(link + (net.tv ? '&as=pad' : ''));
          q.make();
          qr.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
        } catch (e) { qr.textContent = ''; }
      }
    }
    $('#lobby-hint').textContent = net.tv
      ? 'Scannt den QR-Code mit euren Handys oder öffnet die Spieladresse und gebt den Code ein. Die Handys werden zu Controllern. Bluetooth-Gamepads an diesem Gerät gehen auch.'
      : 'Der andere Spieler scannt den QR-Code oder gibt unter „Online & WLAN“ den Code ein. Funktioniert im selben WLAN und über das Internet.';
    const ul = $('#lobby-slots');
    ul.textContent = '';
    for (const s of [0, 1]) {
      const occ = net.slots[s];
      const li = document.createElement('li');
      let txt = 'wartet …';
      if (occ && occ.kind === 'local') txt = 'dieses Gerät';
      else if (occ) txt = occ.info.role === 'pad' ? 'Handy-Controller' : 'eigener Bildschirm';
      else if (net.tv && input.pads.length > s) txt = 'Gamepad an diesem Gerät';
      li.innerHTML = `<span class="who-dot" style="background:${FF.COLORS[s]}"></span><b>${NAMES[s]}</b><span>${txt}</span>`;
      li.className = occ ? 'on' : '';
      ul.appendChild(li);
    }
    updateHud(true);
  }

  function closeNet() {
    if (!net) return;
    if (net.role === 'host') { net.host.broadcast({ t: 'bye' }); net.host.close(); }
    else net.client.close();
    for (const k of Object.keys(input.virtual)) if (k.startsWith('r:')) input.setVirtual(k, null);
    FF.audio.onPlay = null;
    net = null;
    document.body.classList.remove('tv');
    stopWake();
  }

  // Menüsteuerung vom Handy-Controller aus (für den Fernseher)
  function remoteNav(k) {
    if (k === 'resume') { if (screen === 'pause') show('play'); return; }
    navPending[k] = 1;
  }
  const navPending = {};

  // Zustandsbilder an Mitspieler mit eigenem Bildschirm schicken
  const outSfx = [];
  let sendT = 0;
  function hostSend(dt) {
    if (!net || net.role !== 'host' || !game) { outSfx.length = 0; outToasts.length = 0; return; }
    sendT -= dt;
    if (sendT > 0) return;
    sendT = 1 / 30;
    if (screen !== 'play' && screen !== 'pause' && screen !== 'win') return;
    const snap = FF.snapshot(game, outSfx.splice(0), outToasts.splice(0));
    net.host.broadcast(snap, 'player');
  }

  // ------------------------------------------------------------ Online: Gast und Controller
  let pendingJoin = null;
  async function joinRoom(code, role) {
    code = FF.cleanCode(code);
    if (code.length !== 4) { $('#online-msg').textContent = 'Der Code hat vier Zeichen.'; return; }
    closeNet();
    if (pendingJoin) pendingJoin.close();   // ein noch laufender Versuch (doppelt getippt) wird ersetzt
    FF.audio.init();
    $('#online-msg').textContent = 'Verbinde …';
    const client = new FF.NetClient({
      onMessage: (m) => (role === 'pad' ? padMessage(m) : guestMessage(m)),
      onClose: () => lostConnection(),
      onError: (t) => toast(t),
      onStatus: (t) => { if (!net) { $('#online-msg').textContent = t; if (role === 'pad') $('#pad-status').textContent = t; } },
    });
    if (role === 'pad') { showPad(); $('#pad-status').textContent = 'Verbinde …'; }
    pendingJoin = client;
    try {
      const w = await client.join(code, role, '');
      if (pendingJoin !== client) { client.close(); return; }
      pendingJoin = null;
      net = { role: role === 'pad' ? 'pad' : 'guest', client, slot: w.slot, code, state: FF.makePadState() };
      $('#online-msg').textContent = '';
      if (role === 'pad') {
        $('#pad-who').textContent = `Du bist ${NAMES[w.slot]}`;
        $('#pad-who').style.background = FF.COLORS[w.slot];
        $('#pad-status').textContent = `Raum ${code}`;
        keepAwake();
      } else {
        $('#guest-title').textContent = `Du spielst ${NAMES[w.slot]}`;
        $('#guest-text').textContent = 'Verbunden. Warte, bis Rot ein Level startet.';
        show('guest');
      }
    } catch (e) {
      if (pendingJoin !== client) return;
      pendingJoin = null;
      if (role === 'pad') { hidePad(); show('online'); }
      $('#online-msg').textContent = e.message;
      toast(e.message);
    }
  }

  function lostConnection() {
    const wasPad = net && net.role === 'pad';
    closeNet();
    game = null;
    if (wasPad) hidePad();
    $('#guest-title').textContent = 'Verbindung verloren';
    $('#guest-text').textContent = 'Der andere Bildschirm ist nicht mehr erreichbar.';
    show('guest');
  }

  function guestMessage(m) {
    switch (m.t) {
      case 'start':
        mode = m.mode;
        game = new FF.Game(m.lv, m.mode);
        game.view = true;
        enterLevel(m.lv);
        break;
      case 'st':
        if (!game || game.levelIndex !== m.lv) { mode = m.mode; game = new FF.Game(m.lv, m.mode); game.view = true; enterLevel(m.lv); }
        FF.applySnapshot(game, m);
        if (m.sfx) for (const s of m.sfx) FF.audio.play(s);
        if (m.ts) for (const [t, w] of m.ts) toast(t, w);
        break;
      case 'screen':
        if (m.name === 'play' && game) show('play');
        else if (m.name === 'pause' && game) show('pause');
        else if (m.name === 'win' && game) { showWin(game.levelIndex, game.beadsGot(), game.beads.length); show('win'); }
        else if (!['play', 'pause', 'win'].includes(m.name)) {
          game = null;
          $('#guest-text').textContent = 'Verbunden. Warte, bis Rot ein Level startet.';
          show('guest');
        }
        break;
      case 'rumble': input.rumble(net.slot, m.s, m.ms); break;
      case 'bye': lostConnection(); break;
    }
  }

  // Gast schickt seine Eingaben (Tastatur, Gamepad, Touch dieses Geräts)
  let inT = 0, lastSent = '';
  function guestSend(dt) {
    if (!net || net.role !== 'guest') return;
    const c = input.controls('solo')[0];
    if (screen !== 'play') for (const k in c) c[k] = 0;
    const g = input.global();
    FF.ctlToPad(c, net.state);
    if (g.pause && screen === 'play') net.state.n.pause++;
    inT -= dt;
    const key = JSON.stringify(net.state);
    if (key !== lastSent || inT <= 0) {
      net.client.send({ t: 'in', s: net.state });
      lastSent = key; inT = 0.2;
    }
  }

  // ---- Handy-Controller
  let padTouch = null;
  function showPad() {
    $('#padui').hidden = false;
    document.body.classList.add('padmode');
    for (const s of screens) $('#scr-' + s).hidden = true;
    $('#hud').hidden = true; $('#touch').hidden = true;
    screen = 'pad';
    if (!padTouch) {
      padTouch = new FF.TouchPad($('#pad-touch'), {
        onChange: (st) => { if (net && net.role === 'pad') net.client.send({ t: 'in', s: st }); },
      });
    }
    padTouch.setSolo(true);
  }
  function hidePad() {
    $('#padui').hidden = true;
    document.body.classList.remove('padmode');
    if (padTouch) padTouch.reset();
  }
  function padMessage(m) {
    if (m.t === 'screen') {
      const play = m.name === 'play';
      $('#pad-nav').hidden = play;
      $('#pad-touch').hidden = !play;
      $('#pad-nav-text').textContent = m.name === 'pause' ? 'Pause – auf dem Fernseher weiterspielen' : 'Menü auf dem Fernseher bedienen';
      if (padTouch) { padTouch.setSolo(m.mode === 'solo'); if (!play) padTouch.reset(); }
    } else if (m.t === 'rumble') { if (navigator.vibrate) { try { navigator.vibrate(Math.round(m.ms)); } catch (e) { /* egal */ } } }
    else if (m.t === 'bye') lostConnection();
  }
  setInterval(() => {
    // regelmäßig senden, damit gehaltene Richtungen nach Paketverlust stimmen
    if (net && net.role === 'pad' && padTouch) net.client.send({ t: 'in', s: padTouch.state });
    if (net && (net.role === 'pad' || net.role === 'guest')) net.client.ping();
  }, 1000);
  $$('#pad-nav [data-nav]').forEach((b) => b.addEventListener('click', () => {
    if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) { /* egal */ }
    if (net && net.role === 'pad') net.client.send({ t: 'nav', k: b.dataset.nav });
  }));
  $('#pad-pause').addEventListener('click', () => { if (net && padTouch) { padTouch.state.n.pause++; net.client.send({ t: 'in', s: padTouch.state }); } });
  $('#pad-leave').addEventListener('click', () => { closeNet(); hidePad(); show('title'); });

  let wake = null;
  function keepAwake() { try { navigator.wakeLock && navigator.wakeLock.request('screen').then((w) => (wake = w)).catch(() => {}); } catch (e) { /* egal */ } }
  function stopWake() { try { wake && wake.release(); } catch (e) { /* egal */ } wake = null; }

  // ------------------------------------------------------------ Chromecast (Presentation API)
  if (globalThis.PresentationRequest) $('#btn-cast').hidden = false;
  async function castToTv() {
    const code = FF.randomCode();
    const url = location.origin + location.pathname + '?tv=1&code=' + code;
    try {
      const req = new globalThis.PresentationRequest([url]);
      await req.start();
      toast('Fernseher verbunden – dieses Handy wird zum Controller.');
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        try { await joinRoom(code, 'pad'); if (net) return; } catch (e) { /* nochmal */ }
      }
    } catch (e) {
      toast('Übertragung abgebrochen oder kein Gerät gefunden.');
    }
  }

  // ------------------------------------------------------------ Controller-Liste
  let padSig = '';
  function renderPadList(force) {
    const ul = $('#pad-list');
    const sig = input.pads.map((p) => p.index + p.id + input.assignment(p) + (p.any ? 1 : 0)).join('|');
    if (!force && sig === padSig) return;
    padSig = sig;
    ul.textContent = '';
    if (!input.pads.length) { ul.innerHTML = '<li class="empty">Noch keiner. Verbinde einen Controller und drücke eine Taste.</li>'; return; }
    for (const p of input.pads) {
      const li = document.createElement('li');
      li.className = p.any ? 'active' : '';
      const a = input.assignment(p);
      const name = (p.id || 'Controller').replace(/\(.*?\)/g, '').trim().slice(0, 42) || 'Controller';
      li.innerHTML = `<span class="pad-name"></span><span class="pad-btns"></span>`;
      li.querySelector('.pad-name').textContent = `${p.index + 1}. ${name}`;
      const box = li.querySelector('.pad-btns');
      for (const [v, label] of [['auto', 'Automatisch'], [0, 'Rot'], [1, 'Blau'], ['off', 'Aus']]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip' + (a === v ? ' sel' : '');
        b.textContent = label;
        b.addEventListener('click', () => { input.setAssignment(p, v); renderPadList(true); });
        box.appendChild(b);
      }
      const t = document.createElement('button');
      t.type = 'button'; t.className = 'chip'; t.textContent = 'Vibration';
      t.addEventListener('click', () => {
        const act = p.gp && p.gp.vibrationActuator;
        if (act && act.playEffect) act.playEffect('dual-rumble', { duration: 300, strongMagnitude: 0.8, weakMagnitude: 0.8 }).catch(() => {});
        else toast('Dieser Controller oder Browser kann nicht vibrieren.');
      });
      box.appendChild(t);
      ul.appendChild(li);
    }
  }
  addEventListener('gamepadconnected', (e) => { toast(`Controller verbunden: ${(e.gamepad.id || '').replace(/\(.*?\)/g, '').trim().slice(0, 30)}`); if (screen === 'lobby') renderLobby(); });
  addEventListener('gamepaddisconnected', () => toast('Controller getrennt.'));

  // ------------------------------------------------------------ Wetter
  let weatherPref = FF.store.get('weather', 'auto');
  if (!FF.WEATHER_ORDER.includes(weatherPref)) weatherPref = 'auto';
  if (R.setWeather) R.setWeather(weatherPref);
  function syncWeather() { $$('#btn-weather, #btn-weather2').forEach((b) => (b.textContent = 'Wetter: ' + FF.WEATHER_NAMES[weatherPref])); }
  function cycleWeather() {
    const o = FF.WEATHER_ORDER;
    weatherPref = o[(o.indexOf(weatherPref) + 1) % o.length];
    FF.store.set('weather', weatherPref);
    if (R.setWeather) R.setWeather(weatherPref);
    syncWeather();
  }
  syncWeather();

  // ------------------------------------------------------------ Aktionen
  function act(a) {
    FF.audio.init();
    FF.audio.play('click');
    switch (a) {
      case 'solo': case 'coop': mode = a; buildLevels(); returnTo = 'title'; show('levels'); break;
      case 'online': $('#online-msg').textContent = ''; show('online'); break;
      case 'tv': show('tv'); break;
      case 'pads': show('pads'); break;
      case 'help': returnTo = screen; show('help'); break;
      case 'fullscreen': goFullscreen(false); break;
      case 'weather': cycleWeather(); break;
      case 'back':
        if (screen === 'help') show(returnTo);
        else if (screen === 'levels' && net && net.role === 'host') show('lobby');
        else show('title');
        break;
      case 'host': openRoom(false); break;
      case 'tv-host': openRoom(true); break;
      case 'cast': castToTv(); break;
      case 'join-player': joinRoom($('#join-code').value, 'player'); break;
      case 'join-pad': joinRoom($('#join-code').value, 'pad'); break;
      case 'lobby-coop': mode = 'coop'; buildLevels(); show('levels'); break;
      case 'lobby-solo': mode = 'solo'; buildLevels(); show('levels'); break;
      case 'close-room': closeNet(); show('title'); break;
      case 'copy-link': {
        const link = $('#lobby-link').textContent;
        if (navigator.clipboard) navigator.clipboard.writeText(link).then(() => toast('Link kopiert.'), () => toast(link));
        else toast(link);
        break;
      }
      case 'leave': closeNet(); game = null; show('title'); break;
      case 'resume':
        if (net && net.role === 'guest') net.client.send({ t: 'nav', k: 'resume' });
        else show('play');
        break;
      case 'checkpoint': game.restartCheckpoint(); show('play'); break;
      case 'restart': startLevel(game.levelIndex); break;
      case 'next': startLevel(Math.min(FF.LEVELS.length - 1, game.levelIndex + 1)); break;
      case 'replay': startLevel(game.levelIndex); break;
      case 'menu':
        if (net && net.role === 'guest') { closeNet(); game = null; show('title'); break; }
        game = null; FF.audio.setMood('garden');
        show(net && net.role === 'host' ? 'lobby' : 'title');
        break;
    }
  }
  $$('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act)));
  $('#join-code').addEventListener('input', (e) => { e.target.value = FF.cleanCode(e.target.value); });
  $('#join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') act('join-player'); });

  $('#btn-pause').addEventListener('click', () => { if (screen === 'play') { if (net && net.role === 'guest') { net.state.n.pause++; } else show('pause'); } });
  $('#btn-full').addEventListener('click', () => goFullscreen(false));
  const muteBtn = $('#btn-mute');
  const syncMute = () => muteBtn.classList.toggle('off', FF.audio.muted);
  muteBtn.addEventListener('click', () => { FF.audio.init(); FF.audio.setMuted(!FF.audio.muted); syncMute(); });
  syncMute();

  // Menü mit Gamepad, Pfeiltasten oder Handy-Controller bedienen
  function menuNav(gl) {
    const btns = $$('#scr-' + screen + ' .btn').filter((b) => !b.hidden && b.offsetParent);
    if (!btns.length) return;
    // Auswahl merken: hat die Seite keinen Fokus (Fernseher, Bedienung vom Handy), zählt die gemerkte Taste
    let i = btns.indexOf(document.activeElement);
    if (i < 0) i = btns.indexOf(navSel);
    const pick = (k) => { navSel = btns[k]; navSel.focus({ preventScroll: false }); };
    if (gl.down) pick((i + 1) % btns.length);
    if (gl.up) pick((i - 1 + btns.length) % btns.length);
    if (gl.ok) {
      if (i < 0) pick(Math.max(0, btns.findIndex((b) => b.hasAttribute('data-default'))));
      else btns[i].click();
    }
    if (gl.back) {
      if (screen === 'pause') act('resume');
      else if (['levels', 'help', 'online', 'tv', 'pads'].includes(screen)) act('back');
    }
  }

  // Größe bei jedem Bild prüfen: iOS meldet Drehen und Leisten-Ein/Ausblenden nicht immer zuverlässig
  const sizeEl = $('#gl');
  let lastSize = '';
  function checkSize(force) {
    const v = FF.viewSize(sizeEl), key = v.w + 'x' + v.h + '@' + devicePixelRatio;
    if (force || key !== lastSize) { lastSize = key; R.resize(); }
  }
  // Kein Seitenzoom: iOS-Safari zoomt sonst bei schnellem Doppeltippen (z. B. mehrmals Springen) und bei zwei
  // Fingern gleichzeitig (Stick + Taste) – dann rutschen Tasten und Hinweise aus dem Bild.
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, { passive: false });
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    // Im Spiel jedes schnelle zweite Tippen abfangen; im Menü nur außerhalb von Knöpfen und Eingabefeldern
    const ui = e.target.closest && e.target.closest('button, input, a, select, textarea');
    if (now - lastTouchEnd < 350 && (document.body.classList.contains('playing') || !ui)) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
  // Falls doch vergrößert wurde (z. B. vor dem Laden): sofort auf 100 % zurück
  const vpMeta = document.querySelector('meta[name="viewport"]');
  function resetZoom() {
    if (!window.visualViewport || visualViewport.scale <= 1.01 || !vpMeta) return;
    const c = vpMeta.getAttribute('content');
    vpMeta.setAttribute('content', c.replace(/maximum-scale=[\d.]+/, 'maximum-scale=1.0001'));
    requestAnimationFrame(() => vpMeta.setAttribute('content', c));
  }
  if (window.visualViewport) visualViewport.addEventListener('resize', resetZoom);
  addEventListener('resize', () => checkSize());
  addEventListener('orientationchange', () => setTimeout(() => checkSize(true), 350));
  if (window.visualViewport) visualViewport.addEventListener('resize', () => checkSize());
  addEventListener('keydown', () => FF.audio.init(), { once: true });
  addEventListener('pointerdown', () => FF.audio.init(), { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play' && !(net && net.role === 'guest')) show('pause');
    if (!document.hidden && net && net.role === 'pad') keepAwake();
  });

  // ------------------------------------------------------------ Schleife
  let last = performance.now();
  let hudT = 0, padT = 0;
  function loop(now) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    checkSize();
    input.poll();
    const gl = input.global();
    for (const k in navPending) { gl[k] = 1; delete navPending[k]; }
    if (gl.mute) { FF.audio.init(); FF.audio.setMuted(!FF.audio.muted); syncMute(); }

    if (screen === 'pad') { input.endFrame(); requestAnimationFrame(loop); return; }

    const guest = net && net.role === 'guest';
    if (screen === 'play' && game && !guest && (!R.ready || R.ready(game))) {
      if (gl.pause) show('pause');
      else {
        let opts = {};
        if (net && net.role === 'host') {
          const occ = net.slots;
          opts = {
            noKeysP1: !!(occ[0] && occ[0].kind === 'remote') || net.tv,
            noKeysP2: !!(occ[1] && occ[1].kind === 'remote'),
            freeSlots: [0, 1].filter((s) => !occ[s]),
          };
          if (net.tv && mode === 'solo') opts.noKeysP1 = false;
        }
        game.frame(dt, input.controls(mode, opts));
        handleEvents();
      }
    } else if (guest && game) {
      game.time += dt;
      for (const e of game.fx) e.t += dt;
      game.fx = game.fx.filter((e) => e.t < e.life);
      FF.smoothView(game, dt);
      game.cosmetics(dt);
      if (screen !== 'play') menuNav(gl);
    } else {
      if (gl.pause && screen === 'pause') show('play');
      else menuNav(gl);
    }
    guestSend(dt);
    hostSend(dt);

    const inGame = game && (screen === 'play' || screen === 'pause' || screen === 'win' || (screen === 'help' && returnTo === 'pause'));
    if (inGame) R.draw(game, dt);
    else {
      demo.frame(dt, idle);
      R.draw(demo, dt, { pan: true });
    }

    hudT -= dt;
    if (hudT <= 0) { updateHud(); hudT = 0.25; }
    padT -= dt;
    if (padT <= 0) { if (screen === 'pads') renderPadList(); if (screen === 'lobby') renderLobbyPads(); padT = 0.3; }
    if (FF.audio.ctx) {
      FF.audio.music(true);
      FF.audio.update(screen === 'play' ? game : null, dt);
    }
    input.endFrame();
    requestAnimationFrame(loop);
  }
  let lobbyPadCount = -1;
  function renderLobbyPads() { if (net && net.tv && input.pads.length !== lobbyPadCount) { lobbyPadCount = input.pads.length; renderLobby(); } }

  show('title');
  requestAnimationFrame(loop);

  // Offline spielbar: Service Worker legt alle Dateien ab (nicht in der Einzeldatei-Fassung und nicht von der Festplatte)
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !FF.ASSET_DATA) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Neue Version auf dem Server? Dann im Menü neu laden, nie mitten im Level. Ohne Netz passiert einfach nichts.
  const myVersion = window.FF_VERSION;
  function checkVersion() {
    if (!myVersion || !/^https?:$/.test(location.protocol) || (navigator.onLine === false)) return;
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (v && v.v && v.v !== myVersion && ['title', 'levels', 'help'].includes(screen) && !net && !params.get('join') && !params.get('tv')) {
          location.replace(location.pathname + '?v=' + encodeURIComponent(v.v));
        }
      })
      .catch(() => {});
  }
  checkVersion();
  setInterval(checkVersion, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });

  // Einstieg über Link: ?join=CODE (Mitspielen/Controller) oder ?tv=1&code=CODE (Fernseher)
  const jc = FF.cleanCode(params.get('join'));
  if (jc) {
    $('#join-code').value = jc;
    show('online');
    if (params.get('as') === 'pad') { $('#online-msg').textContent = 'Tippe auf „Nur als Controller“, um dieses Handy als Controller zu verbinden.'; }
  } else if (params.get('tv')) {
    openRoom(true, FF.cleanCode(params.get('code')) || undefined);
  }

  // Für Tests im Browser
  FF.debug = {
    get game() { return game; }, get net() { return net; }, get screen() { return screen; },
    startLevel, setMode: (m) => (mode = m), input, renderer: R, openRoom, joinRoom, act,
  };
})();
