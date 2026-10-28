'use strict';
// Menüs, HUD, Hauptschleife.
(function () {
  const FF = globalThis.FF;
  const $ = (s) => document.querySelector(s);
  const cv = $('#game');
  const R = new FF.Renderer(cv);
  const input = new FF.Input();
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  if (coarse) input.device = 'touch';
  R.keyLabels = (mode) => input.labels(mode);

  let screen = 'title';
  let mode = 'solo';
  let game = null;
  let returnTo = 'title';
  const demo = new FF.Game(0, 'coop');
  const isTouch = (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;

  const progress = FF.store.get('progress', {});
  const saveProgress = () => FF.store.set('progress', progress);

  // ------------------------------------------------------------ Bildschirme
  const screens = ['title', 'levels', 'help', 'pause', 'win'];
  function show(name) {
    screen = name;
    for (const s of screens) $('#scr-' + s).hidden = s !== name;
    const inGame = name === 'play' || name === 'pause' || name === 'win';
    $('#hud').hidden = !inGame;
    $('#touch').hidden = !(name === 'play' && (isTouch || input.device === 'touch'));
    input.captureGame = name === 'play';
    if (name !== 'play') {
      const first = document.querySelector('#scr-' + name + ' .btn');
      if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
    } else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
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
    R.snap = true;
    $('#toasts').textContent = '';
    $('#hud-level').textContent = `${i + 1} · ${FF.LEVELS[i].name}`;
    document.querySelectorAll('.solo-only').forEach((el) => (el.hidden = mode !== 'solo'));
    show('play');
    updateHud(true);
    if (i === 0) toast(mode === 'solo' ? 'Du trägst deinen Partner huckepack.' : 'Rot spielt links, Blau rechts.');
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
      const nm = (id) => (id === 0 ? 'Rot' : 'Blau');
      who = o.merged ? `${nm(a.id)} trägt ${nm(o.id)}` : `Du spielst ${nm(a.id)}`;
      who += '|' + a.id;
    }
    const key = beads + who;
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
  }

  function handleEvents() {
    for (const e of game.events) {
      if (e.type === 'toast') toast(e.text, e.who);
      if (e.type === 'won') onWin();
    }
    game.events.length = 0;
  }

  function onWin() {
    const L = game.L, i = game.levelIndex;
    const k = mode + ':' + L.id;
    const prev = progress[k] || {};
    progress[k] = { done: true, beads: Math.max(prev.beads || 0, game.beadsGot()) };
    saveProgress();
    setTimeout(() => {
      if (screen !== 'play' || !game || game.state !== 'won') return;
      const last = i === FF.LEVELS.length - 1;
      $('#win-title').textContent = last ? 'Endlich zu Hause!' : 'Geschafft!';
      $('#win-text').textContent = last
        ? `Ihr habt den ganzen Weg gemeinsam gemeistert. ${game.beadsGot()} von ${game.beads.length} Funken im letzten Level gesammelt.`
        : `„${L.name}“ liegt hinter euch. ${game.beadsGot()} von ${game.beads.length} Funken gesammelt.`;
      $('#btn-next').hidden = last;
      show('win');
    }, 1300);
  }

  // ------------------------------------------------------------ Aktionen
  function act(a) {
    FF.audio.init();
    FF.audio.play('click');
    switch (a) {
      case 'solo': case 'coop': mode = a; buildLevels(); show('levels'); break;
      case 'help': returnTo = screen; show('help'); break;
      case 'back': show(screen === 'help' ? returnTo : 'title'); break;
      case 'resume': show('play'); break;
      case 'checkpoint': game.restartCheckpoint(); show('play'); break;
      case 'restart': startLevel(game.levelIndex); break;
      case 'next': startLevel(Math.min(FF.LEVELS.length - 1, game.levelIndex + 1)); break;
      case 'replay': startLevel(game.levelIndex); break;
      case 'menu': game = null; show('title'); break;
    }
  }
  document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act)));

  $('#btn-pause').addEventListener('click', () => { if (screen === 'play') show('pause'); });
  const muteBtn = $('#btn-mute');
  const syncMute = () => muteBtn.classList.toggle('off', FF.audio.muted);
  muteBtn.addEventListener('click', () => { FF.audio.init(); FF.audio.setMuted(!FF.audio.muted); syncMute(); });
  syncMute();

  // Touch-Knöpfe
  document.querySelectorAll('#touch button').forEach((b) => {
    const code = b.dataset.code;
    const on = (e) => { e.preventDefault(); FF.audio.init(); input.press(code); b.classList.add('on'); };
    const off = (e) => { e.preventDefault(); input.release(code); b.classList.remove('on'); };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('pointerleave', off);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // Menü mit Gamepad oder Pfeiltasten bedienen
  function menuNav(gl) {
    const btns = Array.from(document.querySelectorAll('#scr-' + screen + ' .btn')).filter((b) => !b.hidden && b.offsetParent);
    if (!btns.length) return;
    let i = btns.indexOf(document.activeElement);
    if (gl.down) { i = (i + 1) % btns.length; btns[i].focus(); }
    if (gl.up) { i = (i - 1 + btns.length) % btns.length; btns[i].focus(); }
    if (gl.ok && i >= 0) btns[i].click();
    if (gl.back) {
      if (screen === 'pause') act('resume');
      else if (screen === 'levels' || screen === 'help') act('back');
    }
  }

  addEventListener('resize', () => R.resize());
  addEventListener('keydown', () => FF.audio.init(), { once: true });
  addEventListener('pointerdown', () => FF.audio.init(), { once: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'play') show('pause'); });

  // ------------------------------------------------------------ Schleife
  let last = performance.now();
  let hudT = 0;
  const idle = [FF.makeCtl(), FF.makeCtl()];
  function loop(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    input.poll();
    const gl = input.global();
    if (gl.mute) { FF.audio.init(); FF.audio.setMuted(!FF.audio.muted); syncMute(); }

    if (screen === 'play' && game) {
      if (gl.pause) show('pause');
      else {
        game.frame(dt, input.controls(mode));
        handleEvents();
      }
      const tv = !$('#touch').hidden, want = isTouch || input.device === 'touch';
      if (tv !== want) $('#touch').hidden = !want;
    } else {
      if (gl.pause && screen === 'pause') show('play');
      else menuNav(gl);
    }

    if (game && screen !== 'title' && screen !== 'levels' && !(screen === 'help' && returnTo === 'title')) {
      R.draw(game, dt);
    } else {
      demo.frame(dt, idle);
      R.draw(demo, dt, { pan: true });
    }

    hudT -= dt;
    if (hudT <= 0) { updateHud(); hudT = 0.15; }
    if (FF.audio.ctx) FF.audio.music(true);
    input.endFrame();
    requestAnimationFrame(loop);
  }

  show('title');
  requestAnimationFrame(loop);

  // Neue Version auf dem Server? Dann im Menü neu laden, nie mitten im Level.
  const myVersion = window.FF_VERSION;
  function checkVersion() {
    if (!myVersion || location.protocol === 'file:') return;
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (v && v.v && v.v !== myVersion && screen !== 'play' && screen !== 'pause') {
          location.replace(location.pathname + '?v=' + encodeURIComponent(v.v));
        }
      })
      .catch(() => {});
  }
  checkVersion();
  setInterval(checkVersion, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });

  // Für Tests im Browser
  FF.debug = { get game() { return game; }, startLevel, setMode: (m) => (mode = m), input, renderer: R };
})();
