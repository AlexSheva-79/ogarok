/* Восхождение Огарка — герой лезет по ступенькам вокруг крутящейся башни.
 * Весь код игры в одном файле. Phaser 3 подключён из vendor/phaser.min.js.
 */
(function () {
  'use strict';

  // ---------- Экран ----------
  const W = 1080;
  function calcVH() {
    const r = (window.innerHeight || 1920) / (window.innerWidth || 1080);
    return Math.round(Math.min(2600, Math.max(1700, W * r)));
  }
  let VH = calcVH();

  // ---------- Мир ----------
  const TEX_WORLD = 300;                      // 512 пикселей кладки = 300 пикселей мира
  const R = 7 * TEX_WORLD / (2 * Math.PI);    // радиус башни: по кругу ровно 7 плиток кладки
  const COLS = 16, COLA = Math.PI * 2 / COLS; // 16 мест для ступенек по кругу
  const FH = 150;                             // высота этажа
  const CX = W / 2;
  const LEDGE_W = 2 * R * Math.sin(COLA / 2); // ширина ступеньки ~130
  const HALF_A = COLA / 2 * 0.96;             // половина ступеньки по углу
  const FOOT_A = 20 / R;                      // половина ступни по углу
  const GRAV = 2600, JUMP_V = 1060, SUPER_V = 1650, WALK = 300, ACC = 2600;
  const STRIPS = 56;                          // из скольких полосок рисуется цилиндр

  const FONT = '"Trebuchet MS", "Arial Black", Arial, sans-serif';
  const BONE = '#e8d5a8', BLOOD = '#c8191e', GOLD = '#ffd34d', LIME = '#b5e04a';

  const BONUS = {
    jump: { img: 'b_jump', name: 'Суперпрыжок' },
    tongue: { img: 'b_tongue', name: 'Липкий язык' },
    shell: { img: 'b_shell', name: 'Глиняный панцирь' },
    stone: { img: 'b_stone', name: 'Окаменение' },
    magnet: { img: 'b_magnet', name: 'Магнит' },
    burp: { img: 'b_burp', name: 'Отрыжка' },
  };
  const BONUS_TYPES = Object.keys(BONUS);

  const wrap = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
  const colAngle = (c) => (((c % COLS) + COLS) % COLS) * COLA;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function rng(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  const store = {
    get(key, def) {
      try { const v = localStorage.getItem('og_' + key); return v === null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    set(key, v) { try { localStorage.setItem('og_' + key, JSON.stringify(v)); } catch (e) { /* ничего */ } },
  };

  // =====================================================================
  // Уровень: путь наверх по спирали, двери, лифты, ловушки, враги.
  function makeLevel(level) {
    const rnd = rng(level * 9973 + 17);
    const L = Math.min(10 + level * 4, 46);
    const ledges = new Map();
    const key = (c, r) => (((c % COLS) + COLS) % COLS) + ',' + r;
    const addLedge = (c, r, kind = 'ledge', path = false) => {
      const k = key(c, r);
      if (!ledges.has(k)) ledges.set(k, { c: ((c % COLS) + COLS) % COLS, r, kind, path });
      else if (path) ledges.get(k).path = true;
      return ledges.get(k);
    };
    const doors = [], lifts = [], teeth = [], flames = [], coins = [];
    const path = [];

    // нижнее кольцо с провалами в болото
    for (let c = 0; c < COLS; c++) if (c <= 2 || c >= 14 || rnd() > 0.35) addLedge(c, 0);
    let c = 0, r = 0, dir = 1, sinceSpecial = 0;
    path.push(addLedge(0, 0, 'ledge', true));
    while (r < L - 1) {
      sinceSpecial++;
      const x = rnd();
      if (r >= 3 && x < 0.09 && sinceSpecial > 4) {
        doors.push({ c: ((c % COLS) + COLS) % COLS, r, to: ((c + 8) % COLS + COLS) % COLS });
        doors.push({ c: ((c + 8) % COLS + COLS) % COLS, r, to: ((c % COLS) + COLS) % COLS });
        c += 8;
        path.push(addLedge(c, r, 'ledge', true));
        sinceSpecial = 0;
        continue;
      }
      if (r >= 2 && x < 0.17 && r + 3 < L - 1 && sinceSpecial > 4) {
        lifts.push({ c: (((c + dir) % COLS) + COLS) % COLS, r0: r, r1: r + 3, t: rnd() * 6 });
        c += dir * 2; r += 3;
        path.push(addLedge(c, r, 'ledge', true));
        sinceSpecial = 0;
        continue;
      }
      if (rnd() < 0.15) dir = -dir;
      let dc = rnd() < 0.7 ? 1 : 2;
      const dr = rnd() < 0.55 ? 1 : 0;
      if (dc === 2 && dr === 1 && rnd() < 0.5) dc = 1;
      c += dir * dc; r += dr;
      path.push(addLedge(c, r, 'ledge', true));
    }
    // верхнее кольцо — финиш
    for (let k = 0; k < COLS; k++) addLedge(k, L, 'ledge', true);

    // особые ступеньки на пути
    path.forEach((p, i) => {
      if (i < 5 || p.r === 0 || p.r >= L - 1) return;
      const nearDoor = doors.some((d) => d.r === p.r && (d.c === p.c || d.to === p.c));
      const nearLift = lifts.some((l) => (l.r1 === p.r || l.r0 === p.r));
      if (nearDoor || nearLift) return;
      const y = rnd();
      if (y < 0.12) p.kind = 'crumble';
      else if (level >= 2 && y < 0.22) p.kind = 'slime';
    });
    // ложные ступеньки
    const extra = Math.round(L * 0.7);
    for (let i = 0; i < extra; i++) {
      const cc = Math.floor(rnd() * COLS), rr = 1 + Math.floor(rnd() * (L - 1));
      if (!ledges.has(key(cc, rr)) && !lifts.some((l) => l.c === cc && rr >= l.r0 && rr <= l.r1 + 1)) {
        addLedge(cc, rr, rnd() < 0.2 ? 'crumble' : 'ledge');
      }
    }
    // зубы в стене, огоньки, бонусы
    path.forEach((p, i) => {
      if (i > 4 && p.r >= 3 && p.r < L && rnd() < 0.1 + level * 0.01 &&
        !doors.some((d) => d.r === p.r && d.c === p.c)) teeth.push({ c: p.c, r: p.r, t: rnd() * 3 });
      if (i > 0 && p.r < L && rnd() < 0.38) flames.push({ a: colAngle(p.c), y: p.r * FH + 70 });
    });
    const coinCount = 2 + Math.min(2, Math.floor(level / 2));
    for (let i = 0; i < coinCount; i++) {
      const p = path[3 + Math.floor(rnd() * Math.max(1, path.length - 6))];
      if (p && p.r < L) coins.push({ a: colAngle(p.c), y: p.r * FH + 80, type: BONUS_TYPES[Math.floor(rnd() * BONUS_TYPES.length)] });
    }
    const spikes = [];
    const nSpikes = level >= 2 ? Math.min(1 + Math.floor((level - 1) / 2), 4) : 0;
    for (let i = 0; i < nSpikes; i++) {
      spikes.push({ a: rnd() * Math.PI * 2, r: 3 + Math.floor(rnd() * (L - 5)), w: (0.35 + rnd() * 0.35) * (rnd() < 0.5 ? -1 : 1) });
    }
    const blobs = [];
    const nBlobs = Math.min(level, 4);
    for (let i = 0; i < nBlobs; i++) {
      const p = path[4 + Math.floor(rnd() * Math.max(1, path.length - 8))];
      if (p && p.r > 1 && p.r < L) blobs.push({ a0: colAngle(p.c) - COLA, a1: colAngle(p.c) + COLA * 1.5, r: p.r, ph: rnd() * 6 });
    }
    return {
      level, L, ledges: [...ledges.values()], doors, lifts, teeth, flames, coins, spikes, blobs,
      eyeEvery: Math.max(3.2, 9 - level * 0.9),
      time: Math.round(50 + L * 3.6),
    };
  }

  // =====================================================================
  // Кукла Огарка: детали на шарнирах, двигает их код.
  const HS = 0.4;                       // детали в файлах уменьшены в 0.4 от листа
  const P = {
    leg: [99, 52], arm: [55, 36], candle: [140, 187], wick: [145, 5], flame: [56, 157],
    lid: [126, 104], tongue: [12, 63],
    eye: [386, 164], hipN: [287, 702], hipF: [347, 692], shN: [302, 472], shF: [362, 452],
    mouth: [432, 522], seat: [232, 27], bodyH: 753, legLen: 228,
  };

  class Puppet {
    constructor(scene, x, y, scale) {
      this.scene = scene;
      this.c = scene.add.container(x, y);
      this.k = scale;
      const img = (key, piv, dark) => {
        const s = scene.add.image(0, 0, key);
        s.setOrigin(piv[0] * HS / s.width, piv[1] * HS / s.height);
        if (dark) s.setTint(0xa8a8a8);
        return s;
      };
      this.armF = img('h_arm', P.arm, true);
      this.legF = img('h_leg', P.leg, true);
      this.body = scene.add.image(0, 0, 'h_body').setOrigin(0, 1);
      this.lid = img('h_lid', [126, 104]).setVisible(false);
      this.candle = img('h_candle', P.candle);
      this.flame = img('h_flame', P.flame);
      this.legN = img('h_leg', P.leg);
      this.armN = img('h_arm', P.arm);
      this.tongue = img('h_tongue', P.tongue);
      this.c.add([this.armF, this.legF, this.body, this.lid, this.candle, this.flame, this.legN, this.armN, this.tongue]);
      this.cur = { aN: 0, aF: 0, lN: 0, lF: 0, armN: 8, armF: -8, lean: 0, tongue: 70, tLen: 0.55 };
      this.dir = 1; this.time = 0; this.walkPh = 0; this.squash = 0; this.blinkT = 2;
      this.setFacing(1);
    }
    setFacing(d) { this.dir = d; }
    // state: idle | walk | up | down | hurt | spit | win
    update(dt, st, vx, vy) {
      this.time += dt;
      const t = this.time;
      const A = 26;
      const tg = { aN: 0, aF: 0, lN: 0, lF: 0, armN: 8, armF: -8, lean: 0, tongue: 70 + 6 * Math.sin(t * 3), tLen: 0.55 };
      let drop = 0, bob = 0;
      if (st === 'walk') {
        this.walkPh += dt * Math.abs(vx) / 165;          // шаг в ногу со скоростью
        const p = this.walkPh;
        const s = Math.sin(p * Math.PI * 2), c = Math.cos(p * Math.PI * 2);
        tg.aN = -A * s; tg.aF = A * s;
        tg.lN = Math.max(0, c) * 40; tg.lF = Math.max(0, -c) * 40;
        tg.armN = A * 0.9 * s; tg.armF = -A * 0.9 * s;
        drop = P.legLen * (1 - Math.cos(A * Math.abs(s) * Math.PI / 180));
        bob = Math.abs(s);
        tg.lean = 4;
        tg.tongue = 70 + 6 * s + 8 * Math.sin(p * Math.PI * 4);
        if (this.lastStep !== undefined && Math.sign(s) !== Math.sign(this.lastStep) && this.onStep) this.onStep();
        this.lastStep = s;
      } else if (st === 'up') {
        tg.aN = -32; tg.aF = 18; tg.lN = 50; tg.lF = 30; tg.armN = -150; tg.armF = -165; tg.lean = -3; tg.tongue = 95;
      } else if (st === 'down') {
        tg.aN = 10; tg.aF = -12; tg.armN = -95; tg.armF = -70; tg.lean = 3; tg.tongue = 40 + 10 * Math.sin(t * 9);
      } else if (st === 'hurt') {
        tg.aN = -30; tg.aF = 25; tg.armN = -150; tg.armF = -120; tg.lean = -22; tg.tongue = 20 + 25 * Math.sin(t * 20);
      } else if (st === 'spit') {
        tg.armN = -40; tg.armF = -30; tg.lean = 10; tg.tongue = 0; tg.tLen = 0.2;
      } else if (st === 'win') {
        const w = Math.sin(t * 10);
        tg.armN = -160 + 20 * w; tg.armF = -170 - 20 * w; tg.aN = -15 * w; tg.aF = 15 * w; tg.tongue = 80 + 20 * w;
      } else if (st === 'lash') {
        tg.tongue = -80; tg.tLen = 2.4; tg.armN = -60; tg.armF = -50; tg.lean = -6;
      } else {
        // стоит и дышит
        tg.armN = 8 + 3 * Math.sin(t * 2.2); tg.armF = -8 - 3 * Math.sin(t * 2.2);
        bob = 0.25 + 0.25 * Math.sin(t * 2.6);
      }
      const f = Math.min(1, dt * (st === 'walk' ? 30 : 16));
      for (const k in tg) this.cur[k] = lerp(this.cur[k], tg[k], f);
      const cu = this.cur;

      // пружинистость глины
      this.squash = Math.max(0, this.squash - dt * 4);
      const sq = 0.035 * bob + 0.22 * this.squash * this.squash;
      let bsx = 1 + sq, bsy = 1 - sq;
      if (st === 'up') { bsx = 0.93; bsy = 1.08; }
      const s = HS;
      const BX = -P.hipN[0], BY = -(P.legLen + P.hipN[1]) + drop + P.bodyH;   // низ тела
      const B = (pt) => [(BX + pt[0] * bsx) * s, (BY - (P.bodyH - pt[1]) * bsy) * s];
      this.body.setPosition(BX * s, BY * s).setScale(bsx, bsy);
      const hn = B(P.hipN), hf = B(P.hipF), sn = B(P.shN), sf = B(P.shF);
      this.legN.setPosition(hn[0], hn[1] - cu.lN * s).setAngle(cu.aN);
      this.legF.setPosition(hf[0], hf[1] - cu.lF * s).setAngle(cu.aF);
      this.armN.setPosition(sn[0], sn[1]).setAngle(cu.armN).setScale(0.85);
      this.armF.setPosition(sf[0], sf[1]).setAngle(cu.armF).setScale(0.85);
      const m = B([P.mouth[0] - 6, P.mouth[1] - 4]);
      this.tongue.setPosition(m[0], m[1]).setAngle(cu.tongue).setScale(cu.tLen, 0.75);
      const seat = B(P.seat);
      const candleA = -3 * Math.sin(this.walkPh * Math.PI * 2) * (st === 'walk' ? 1 : 0);
      this.candle.setPosition(seat[0], seat[1] + 6 * s).setAngle(candleA).setScale(0.75);
      const wickY = seat[1] + 6 * s - (P.candle[1] - P.wick[1]) * HS * 0.75;
      const fl = 0.85 + 0.08 * Math.sin(t * 23) + 0.05 * Math.sin(t * 37.3);
      const lean = clamp(-vx * 0.05 * this.dir + vy * 0.01, -40, 40) + 6 * Math.sin(t * 17);
      this.flame.setPosition(seat[0] + (P.wick[0] - P.candle[0]) * HS * 0.75, wickY + 4)
        .setAngle(lean).setScale(0.8 * (1 - 0.04 * Math.sin(t * 29)), 0.8 * fl);
      // моргание
      this.blinkT -= dt;
      const blink = this.blinkT < 0.12 || st === 'hurt';
      if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3;
      const e = B(P.eye);
      this.lid.setVisible(blink).setPosition(e[0] + 4 * s, e[1]).setScale(0.82 * bsx, 0.82 * bsy);
      this.c.setScale(this.k * this.dir, this.k).setAngle(cu.lean * this.dir);
    }
  }

  // =====================================================================
  class Preload extends Phaser.Scene {
    constructor() { super('Preload'); }
    preload() {
      const bar = this.add.graphics();
      this.load.on('progress', (v) => {
        bar.clear();
        bar.fillStyle(0x2a1030, 1).fillRect(W / 2 - 300, VH / 2 - 10, 600, 20);
        bar.fillStyle(0xb5e04a, 1).fillRect(W / 2 - 300, VH / 2 - 10, 600 * v, 20);
      });
      const imgs = ['tower', 'abyss'];
      this.load.image('tower', 'assets/img/tower.jpg');
      this.load.image('abyss', 'assets/img/abyss.jpg');
      for (const n of ['swamp', 'ledge', 'ledge_crumble', 'ledge_slime', 'door', 'teeth_closed', 'teeth_open', 'lift',
        'enemy_eye', 'enemy_blob', 'enemy_spike', 'b_jump', 'b_tongue', 'b_shell', 'b_stone', 'b_magnet', 'b_burp',
        'ui_timer', 'ui_life', 'ui_slot', 'ui_play', 'ui_pause', 'ui_restart', 'ui_home', 'ui_sound', 'ui_mute',
        'top', 'title', 'eye', 'h_body', 'h_candle', 'h_flame', 'h_lid', 'h_tongue', 'h_leg', 'h_arm']) {
        if (!imgs.includes(n)) this.load.image(n, 'assets/img/' + n + '.png');
      }
      for (const s of ['step', 'jump', 'tongue', 'spit', 'hurt', 'death', 'swamp', 'bonus', 'superjump', 'burp', 'blast',
        'teeth', 'crumble', 'door', 'tick', 'win', 'shell', 'stone', 'magnet']) {
        this.load.audio(s, 'assets/sfx/' + s + '.mp3');
      }
      this.load.audio('music', 'assets/music/music.mp3');
    }
    create() {
      const el = document.getElementById('loading');
      if (el) el.remove();
      this.scene.start('Main');
    }
  }

  // =====================================================================
  class Main extends Phaser.Scene {
    constructor() { super('Main'); }

    create() {
      this.musicOn = store.get('music', true);
      this.soundOn = store.get('sound', true);
      this.buttonsOn = store.get('buttons', true);
      this.best = store.get('best', 0);
      this.bestLevel = store.get('bestLevel', 1);
      this.mode = 'menu';
      this.input.addPointer(4);

      this.isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
      if (this.isNative && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar) {
        window.Capacitor.Plugins.StatusBar.hide().catch(() => {});
      }

      // ---- слои ----
      this.abyss = this.add.tileSprite(0, 0, W, VH, 'abyss').setOrigin(0).setDepth(0);
      this.abyss.setTileScale(W / 720);
      this.strips = [];
      for (let i = 0; i < STRIPS; i++) {
        const s = this.add.tileSprite(0, 0, 4, 4, 'tower').setOrigin(0, 0).setDepth(1);
        s.phi1 = -Math.PI / 2 + Math.PI * i / STRIPS;
        s.phi2 = -Math.PI / 2 + Math.PI * (i + 1) / STRIPS;
        this.strips.push(s);
      }
      this.topImg = this.add.image(CX, 0, 'top').setOrigin(0.5, 0.65).setDepth(1.5);
      this.topFlame = this.add.image(CX, 0, 'h_flame').setOrigin(0.4, 0.95).setDepth(1.6).setVisible(false);
      this.topEye = this.add.image(CX, 0, 'eye').setDepth(1.6).setVisible(false);
      this.topGlow = this.add.graphics().setDepth(1.4).setBlendMode(Phaser.BlendModes.ADD);
      this.worldLayer = this.add.layer().setDepth(2);    // ступеньки, двери, враги
      this.swamp = this.add.tileSprite(0, 0, W, 544, 'swamp').setOrigin(0, 0).setDepth(6);
      this.swampFill = this.add.rectangle(0, 0, W, 10, 0x15100c).setOrigin(0, 0).setDepth(6);
      this.fx = this.add.graphics().setDepth(5);

      this.hero = new Puppet(this, CX, 0, 0.42);
      this.hero.c.setDepth(4);
      this.hero.onStep = () => { if (this.mode === 'play' && this.h && this.h.ground) this.sfx('step', 0.35); };

      this.music = this.sound.add('music', { loop: true, volume: 0.42 });
      if (this.sound.locked) this.sound.once('unlocked', () => this.updateMusic());
      else this.updateMusic();

      this.keys = this.input.keyboard ? this.input.keyboard.addKeys('LEFT,RIGHT,UP,DOWN,SPACE,A,D,W,S,B,ESC,P') : null;
      if (this.input.keyboard) {
        this.input.keyboard.on('keydown-SPACE', () => this.press('jump'));
        this.input.keyboard.on('keydown-W', () => this.press('jump'));
        this.input.keyboard.on('keydown-UP', () => this.press('spit'));
        this.input.keyboard.on('keydown-DOWN', () => this.press('door'));
        this.input.keyboard.on('keydown-S', () => this.press('door'));
        this.input.keyboard.on('keydown-B', () => this.useBonus());
        this.input.keyboard.on('keydown-ESC', () => this.togglePause());
        this.input.keyboard.on('keydown-P', () => this.togglePause());
      }
      this.setupGestures();
      this.layout();
      this.game.events.on('hidden', () => { if (this.mode === 'play') this.pauseGame(); });
      window.addEventListener('resize', () => {
        clearTimeout(this.rsz);
        this.rsz = setTimeout(() => this.onResize(), 250);
      });

      this.score = 0; this.lives = 3; this.levelNo = 1;
      this.buildLevel(1);
      this.showMenu();
    }

    // ---------- Экран и раскладка ----------
    onResize() {
      const nv = calcVH();
      if (Math.abs(nv - VH) < 8) return;
      VH = nv;
      this.scale.setGameSize(W, VH);
      this.abyss.setSize(W, VH);
      this.layout();
      if (this.mode === 'menu') this.showMenu();
      else if (this.mode === 'pause') { this.closeOverlay(); this.mode = 'play'; this.pauseGame(); }
    }
    get HY() { return VH * 0.6; }                        // где на экране стоит герой
    sy(y) { return this.HY - (y - this.camY); }

    layout() {
      if (this.hud) this.hud.destroy(true);
      if (this.ctl) this.ctl.destroy(true);
      this.drawHud();
      this.drawControls();
    }

    // ---------- Звук ----------
    sfx(key, vol = 1) { if (this.soundOn) this.sound.play(key, { volume: vol }); }
    updateMusic() {
      if (!this.music) return;
      const want = this.musicOn && this.mode !== 'over';
      if (want && !this.music.isPlaying) this.music.play();
      if (!want && this.music.isPlaying) this.music.stop();
    }

    // ---------- Уровень ----------
    buildLevel(n) {
      this.levelNo = n;
      const lv = this.lv = makeLevel(n);
      this.worldLayer.removeAll(true);
      this.rows = [];
      for (let r = 0; r <= lv.L; r++) this.rows.push([]);
      for (const l of lv.ledges) {
        l.a = colAngle(l.c); l.on = true; l.timer = 0; l.drop = 0;
        l.spr = this.add.image(0, 0, l.kind === 'crumble' ? 'ledge_crumble' : l.kind === 'slime' ? 'ledge_slime' : 'ledge').setOrigin(0.5, 0.1);
        this.worldLayer.add(l.spr);
        this.rows[l.r].push(l);
      }
      for (const d of lv.doors) { d.a = colAngle(d.c); d.spr = this.add.image(0, 0, 'door').setOrigin(0.5, 0.97); this.worldLayer.add(d.spr); }
      for (const t of lv.teeth) { t.a = colAngle(t.c); t.open = false; t.spr = this.add.image(0, 0, 'teeth_closed'); this.worldLayer.add(t.spr); }
      for (const l of lv.lifts) { l.a = colAngle(l.c); l.y = l.r0 * FH; l.spr = this.add.image(0, 0, 'lift').setOrigin(0.5, 0.2); this.worldLayer.add(l.spr); }
      for (const f of lv.flames) { f.on = true; f.spr = this.add.image(0, 0, 'h_flame').setScale(0.55); this.worldLayer.add(f.spr); }
      for (const c of lv.coins) { c.on = true; c.spr = this.add.image(0, 0, BONUS[c.type].img).setScale(0.48); this.worldLayer.add(c.spr); }
      for (const s of lv.spikes) { s.on = true; s.spr = this.add.image(0, 0, 'enemy_spike').setScale(0.42); this.worldLayer.add(s.spr); }
      for (const b of lv.blobs) { b.on = true; b.a = b.a0; b.dir = 1; b.spr = this.add.image(0, 0, 'enemy_blob').setScale(0.45).setOrigin(0.5, 0.95); this.worldLayer.add(b.spr); }
      this.eyes = [];
      this.spits = [];
      this.eyeTimer = lv.eyeEvery;
      this.timeLeft = lv.time;
      this.h = { a: 0, y: 0, vx: 0, vy: 0, ground: true, on: this.rows[0][0], dir: 1, hurt: 0, inv: 0, spit: 0, busy: false, lastGround: { a: 0, y: 0 } };
      this.cp = { a: 0, y: 0, r: 0 };
      this.camY = 140;
      this.effects = { shell: 0, stone: 0, magnet: 0, tongue: 0, superjump: false };
      this.slot = null;
      this.topLit = false;
      this.topFlame.setVisible(false); this.topEye.setVisible(false); this.topGlow.clear();
      this.hero.c.setVisible(true).setAlpha(1);
      this.updateHud();
    }

    // ---------- Опора под ногами ----------
    supportAt(a, y, tol) {
      const r = Math.round(y / FH);
      if (r >= 0 && r < this.rows.length && Math.abs(y - r * FH) <= tol) {
        for (const l of this.rows[r]) {
          if (l.on && l.drop === 0 && Math.abs(wrap(l.a - a)) < HALF_A + FOOT_A) return l;
        }
      }
      for (const l of this.lv.lifts) {
        if (Math.abs(wrap(l.a - a)) < HALF_A + FOOT_A && Math.abs(y - l.y) <= tol) return l;
      }
      return null;
    }

    // ---------- Управление ----------
    press(what) {
      if (this.mode !== 'play') return;
      const h = this.h;
      if (h.busy || h.dead) return;
      if (what === 'jump') {
        if (!h.ground) return;
        h.ground = false; h.on = null;
        if (this.effects.superjump) { h.vy = SUPER_V; this.effects.superjump = false; this.sfx('superjump', 0.9); this.updateHud(); }
        else { h.vy = JUMP_V; this.sfx('jump', 0.7); }
        this.hero.squash = 0.3;
      } else if (what === 'spit') {
        if (h.spit > 0) return;
        h.spit = 0.45;
        this.sfx('spit', 0.8);
        this.spits.push({ a: h.a + h.dir * 30 / R, y: h.y + 95, dir: h.dir, life: 0.6, spr: this.add.circle(0, 0, 13, 0x9fd23a).setStrokeStyle(4, 0x4c6b12) });
        this.worldLayer.add(this.spits[this.spits.length - 1].spr);
        h.spitPose = 0.25;
      } else if (what === 'door') {
        if (!h.ground) return;
        const d = this.lv.doors.find((dd) => Math.abs(wrap(dd.a - h.a)) < HALF_A && Math.abs(h.y - dd.r * FH) < 4);
        if (d) this.enterDoor(d);
      }
    }

    enterDoor(d) {
      const h = this.h;
      h.busy = true; h.vx = 0;
      this.sfx('door', 0.9);
      this.tweens.add({ targets: this.hero.c, alpha: 0, duration: 300 });
      const from = h.a, to = from + Math.PI;
      this.tweens.addCounter({
        from: 0, to: 1, delay: 320, duration: 950, ease: 'Sine.easeInOut',
        onUpdate: (tw) => { h.a = from + Math.PI * tw.getValue(); },
        onComplete: () => {
          h.a = colAngle(d.to);
          this.tweens.add({ targets: this.hero.c, alpha: 1, duration: 300, onComplete: () => { h.busy = false; } });
        },
      });
    }

    useBonus() {
      if (this.mode !== 'play' || !this.slot) return;
      const t = this.slot; this.slot = null;
      const e = this.effects;
      if (t === 'jump') { e.superjump = true; this.sfx('superjump', 0.6); }
      if (t === 'tongue') { e.tongue = 15; this.sfx('tongue'); }
      if (t === 'shell') { e.shell = 10; this.sfx('shell'); }
      if (t === 'stone') { e.stone = 7; this.sfx('stone'); }
      if (t === 'magnet') { e.magnet = 12; this.sfx('magnet'); }
      if (t === 'burp') {
        this.sfx('burp'); this.time.delayedCall(250, () => this.sfx('blast', 0.9));
        this.cameras.main.shake(350, 0.012);
        for (const ey of this.eyes) if (ey.on) this.killEnemy(ey, ey.x, this.sy(ey.y));
        for (const b of this.lv.blobs) if (b.on && Math.cos(wrap(b.a - this.h.a)) > 0.2 && Math.abs(b.r * FH - this.h.y) < VH) this.killEnemy(b);
        for (const s of this.lv.spikes) if (s.on && Math.cos(wrap(s.a - this.h.a)) > 0.2 && Math.abs(s.r * FH - this.h.y) < VH) this.killEnemy(s);
        this.burpFx = 0.6;
      }
      this.updateHud();
    }

    killEnemy(e, x, y) {
      e.on = false;
      if (e.spr) {
        this.tweens.add({ targets: e.spr, alpha: 0, scale: e.spr.scale * 1.6, angle: 90, duration: 350, onComplete: () => e.spr.setVisible(false) });
      }
      this.score += 50; this.updateHud();
    }

    // Жесты: палец ведут влево/вправо — герой идёт туда же (как джойстик, где бы ни коснулся);
    // держишь палец — идёт дальше, повёл обратно — разворачивается. Тап — прыжок,
    // свайп вверх — тоже прыжок, свайп вниз — дверь. Плевок только красной кнопкой. Второй палец может прыгать во время ходьбы.
    setupGestures() {
      this.touches = {};
      const START = 34, TRAIL = 30;
      this.input.on('pointerdown', (p, over) => {
        if (over && over.length) return;
        if (this.mode !== 'play') return;
        this.touches[p.id] = { x: p.x, y: p.y, ax: p.x, t: performance.now(), used: false, walk: 0, moved: 0 };
      });
      this.input.on('pointermove', (p) => {
        const g = this.touches[p.id];
        if (!g || g.used) return;
        const dx = p.x - g.x, dy = p.y - g.y;
        g.moved = Math.max(g.moved, Math.hypot(dx, dy));
        if (!g.walk) {
          // рывок пальцем вверх — тоже прыжок; плевок только красной кнопкой
          if (dy < -60 && -dy > Math.abs(dx) * 1.2) {
            g.used = true;
            this.press('jump');
            return;
          }
          if (dy > 110 && dy > Math.abs(dx) * 1.3) {
            g.used = true;
            this.press('door');
            return;
          }
          if (Math.abs(dx) > START && Math.abs(dx) > Math.abs(dy) * 0.8) {
            g.walk = Math.sign(dx);
            g.ax = p.x - g.walk * TRAIL;
          }
          return;
        }
        // опорная точка тянется за пальцем: разворот — стоит повести палец назад
        const ddx = p.x - g.ax;
        if (Math.sign(ddx) === g.walk) {
          if (Math.abs(ddx) > TRAIL) g.ax = p.x - g.walk * TRAIL;
        } else if (Math.abs(ddx) > 4) {
          g.walk = -g.walk;
          g.ax = p.x - g.walk * TRAIL;
        }
      });
      const end = (p) => {
        const g = this.touches[p.id];
        if (!g) return;
        delete this.touches[p.id];
        // отпустил палец, не поведя его в сторону — прыжок (без ограничения по времени, чтобы не пропадал)
        if (!g.used && !g.walk) this.press('jump');
      };
      this.input.on('pointerup', end);
      this.input.on('pointerupoutside', end);
    }

    gestureWalk() {
      let d = 0;
      for (const id in this.touches) {
        const g = this.touches[id];
        if (!g.used && g.walk) d = g.walk;
      }
      return d;
    }

    // ---------- Кнопки на экране ----------
    drawControls() {
      const c = this.ctl = this.add.container(0, 0).setDepth(20);
      this.btn = { left: false, right: false };
      const g = this.add.graphics();
      c.add(g);
      const items = [];
      const circle = (x, y, r, draw, onDown, onUp) => {
        g.lineStyle(5, 0xf1e3bd, 0.32).strokeCircle(x, y, r);
        g.fillStyle(0x000000, 0.08).fillCircle(x, y, r);
        draw(x, y, r);
        const z = this.add.zone(x, y, r * 2.2, r * 2.2).setOrigin(0.5).setInteractive();
        z.on('pointerdown', onDown);
        if (onUp) { z.on('pointerup', onUp); z.on('pointerout', onUp); }
        c.add(z); items.push(z);
      };
      const tri = (x, y, s, ang) => {
        const p = [];
        for (let i = 0; i < 3; i++) {
          const a = ang + i * Math.PI * 2 / 3;
          p.push(new Phaser.Geom.Point(x + Math.cos(a) * s, y + Math.sin(a) * s));
        }
        g.lineStyle(5, 0xf1e3bd, 0.42).strokePoints(p, true);
      };
      const by = VH - 190;
      circle(150, by, 105, (x, y) => tri(x - 6, y, 40, Math.PI), () => { this.btn.left = true; }, () => { this.btn.left = false; });
      circle(385, by, 105, (x, y) => tri(x + 6, y, 40, 0), () => { this.btn.right = true; }, () => { this.btn.right = false; });
      circle(W - 165, by - 10, 120, (x, y) => tri(x, y + 8, 46, -Math.PI / 2), () => this.press('jump'));
      circle(W - 390, by + 55, 78, (x, y) => tri(x, y - 4, 30, Math.PI / 2), () => this.press('door'));
      this.ctlItems = items;
      this.applyButtons();
    }
    applyButtons() {
      if (!this.ctl) return;
      this.ctl.setVisible(this.buttonsOn && this.mode === 'play');
      for (const z of this.ctlItems) {
        if (this.buttonsOn && this.mode === 'play') z.setInteractive(); else z.disableInteractive();
      }
      this.btn.left = this.btn.right = false;
    }

    // ---------- Полоска сверху ----------
    drawHud() {
      const c = this.hud = this.add.container(0, 0).setDepth(21);
      const top = 40;
      const shade = this.add.graphics();
      shade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.65, 0.65, 0, 0).fillRect(0, 0, W, 230);
      c.add(shade);
      c.add(this.add.image(80, top + 65, 'ui_timer').setScale(0.6));
      this.tTime = this.add.text(140, top + 65, '', { fontFamily: FONT, fontSize: '58px', color: BONE, fontStyle: 'bold', stroke: '#000', strokeThickness: 8 }).setOrigin(0, 0.5);
      this.tScore = this.add.text(W / 2, top + 45, '', { fontFamily: FONT, fontSize: '52px', color: GOLD, fontStyle: 'bold', stroke: '#000', strokeThickness: 8 }).setOrigin(0.5);
      this.tLevel = this.add.text(W / 2, top + 100, '', { fontFamily: FONT, fontSize: '32px', color: BONE, stroke: '#000', strokeThickness: 6 }).setOrigin(0.5);
      c.add([this.tTime, this.tScore, this.tLevel]);
      this.lifeIcons = [];
      for (let i = 0; i < 3; i++) {
        const s = this.add.image(W - 330 + i * 72, top + 65, 'ui_life').setScale(0.42);
        this.lifeIcons.push(s); c.add(s);
      }
      const pause = this.add.image(W - 80, top + 65, 'ui_pause').setScale(0.6).setInteractive();
      pause.on('pointerdown', () => { this.sfx('step', 0.6); this.togglePause(); });
      c.add(pause);
      this.pauseBtn = pause;
      // ячейка бонуса — всегда видна
      const sx = W - 120, sy = VH - 470;
      this.slotBg = this.add.image(sx, sy, 'ui_slot').setScale(0.72).setInteractive();
      this.slotIcon = this.add.image(sx, sy, 'b_jump').setScale(0.62).setVisible(false);
      this.slotBg.on('pointerdown', () => this.useBonus());
      this.slotRing = this.add.graphics();
      c.add([this.slotBg, this.slotIcon, this.slotRing]);
      // кнопка плевка — всегда видна, как ячейка бонуса
      const px = sx, py = sy - 200, pr = 78;
      const sp = this.add.graphics();
      sp.fillStyle(0x000000, 0.28).fillCircle(px, py, pr);
      sp.lineStyle(6, 0xd2463c, 0.75).strokeCircle(px, py, pr);
      sp.fillStyle(0xd2463c, 0.85).fillCircle(px, py + 14, 17);
      sp.lineStyle(7, 0xd2463c, 0.85);
      for (let i = -1; i <= 1; i++) sp.lineBetween(px + i * 9, py - 2, px + i * 22, py - 34);
      const spz = this.add.zone(px, py, pr * 2.3, pr * 2.3).setOrigin(0.5).setInteractive();
      spz.on('pointerdown', () => {
        if (this.mode !== 'play') return;
        this.press('spit');
        this.tweens.add({ targets: sp, alpha: 0.4, yoyo: true, duration: 90 });
      });
      c.add([sp, spz]);
      this.tMsg = this.add.text(W / 2, VH * 0.3, '', { fontFamily: FONT, fontSize: '64px', color: LIME, fontStyle: 'bold', stroke: '#000', strokeThickness: 10, align: 'center' }).setOrigin(0.5).setAlpha(0);
      c.add(this.tMsg);
      this.updateHud();
    }
    updateHud() {
      if (!this.hud) return;
      const inGame = this.mode !== 'menu';
      this.hud.setVisible(inGame);
      if (!this.lv) return;
      const t = Math.max(0, Math.ceil(this.timeLeft || 0));
      this.tTime.setText(Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'));
      this.tTime.setColor(t <= 10 ? '#ff5a4a' : BONE);
      this.tScore.setText(String(this.score || 0));
      this.tLevel.setText('Башня ' + this.levelNo);
      this.lifeIcons.forEach((s, i) => s.setAlpha(i < this.lives ? 1 : 0.18));
      if (this.slot) this.slotIcon.setTexture(BONUS[this.slot].img).setVisible(true);
      else this.slotIcon.setVisible(false);
    }
    message(text, color = LIME) {
      this.tMsg.setText(text).setColor(color).setAlpha(1).setScale(0.6).setY(VH * 0.3);
      this.tweens.killTweensOf(this.tMsg);
      this.tweens.add({ targets: this.tMsg, scale: 1, duration: 250, ease: 'Back.easeOut' });
      this.tweens.add({ targets: this.tMsg, alpha: 0, y: VH * 0.26, delay: 1100, duration: 500 });
    }

    // ---------- Главный цикл ----------
    update(time, deltaMs) {
      const dt = Math.min(0.05, deltaMs / 1000);
      if (this.mode === 'play') this.stepPlay(dt);
      else if (this.mode === 'menu') { this.h.a += dt * 0.25; this.camY = lerp(this.camY, 300, dt * 2); }
      else if (this.mode === 'win') this.stepWin(dt);
      else if (this.mode === 'dying') this.stepDying(dt);
      this.render(dt);
    }

    stepPlay(dt) {
      const h = this.h, e = this.effects;
      // таймер
      const before = Math.ceil(this.timeLeft);
      this.timeLeft -= dt;
      const after = Math.ceil(this.timeLeft);
      if (after !== before) {
        if (after <= 10 && after > 0) this.sfx('tick', 0.7);
        this.updateHud();
      }
      if (this.timeLeft <= 0) { this.die('time'); return; }
      for (const k of ['shell', 'stone', 'magnet', 'tongue']) if (e[k] > 0) e[k] = Math.max(0, e[k] - dt);
      h.spit = Math.max(0, h.spit - dt);
      h.spitPose = Math.max(0, (h.spitPose || 0) - dt);
      h.inv = Math.max(0, h.inv - dt);

      // ввод
      let dir = 0;
      if (!h.busy) {
        if (this.btn.left) dir -= 1;
        if (this.btn.right) dir += 1;
        if (this.keys) {
          if (this.keys.LEFT.isDown || this.keys.A.isDown) dir -= 1;
          if (this.keys.RIGHT.isDown || this.keys.D.isDown) dir += 1;
        }
        if (!dir) dir = this.gestureWalk();
      }
      if (h.hurt > 0) { h.hurt -= dt; dir = 0; }
      if (dir) h.dir = dir;
      const onSlime = h.ground && h.on && h.on.kind === 'slime';
      let target = dir * WALK;
      let acc = h.ground ? ACC : ACC * 0.7;
      if (onSlime) { acc = 380; if (Math.abs(target) < 160) target = h.dir * 160; }
      if (h.hurt > 0) { target = h.vx; acc = 0; }
      if (h.busy) { target = 0; acc = ACC * 2; }
      h.vx += clamp(target - h.vx, -acc * dt, acc * dt);
      if (!h.busy) h.a += h.vx / R * dt;

      // вертикаль
      if (h.ground) {
        const l = h.on;
        if (l && l.r0 !== undefined) h.y = l.y;       // едем на лифте
        const sup = this.supportAt(h.a, h.y, 6);
        if (!sup) { h.ground = false; h.on = null; h.vy = 0; }
        else {
          h.on = sup;
          if (sup.kind === 'crumble' && sup.timer === 0) { sup.timer = 0.55; this.sfx('crumble', 0.7); }
          if (h.lastGround.y !== h.y || Math.abs(wrap(h.lastGround.a - h.a)) > 0.01) h.lastGround = { a: h.a, y: h.y };
          if (sup.r !== undefined && sup.kind === 'ledge' && sup.r >= this.cp.r) this.cp = { a: sup.a, y: sup.r * FH, r: sup.r };
          if (sup.r === this.lv.L) { this.winLevel(); return; }
        }
      }
      if (!h.ground && !h.busy) {
        const prevY = h.y;
        h.vy -= GRAV * dt;
        h.y += h.vy * dt;
        if (h.vy <= 0) {
          // приземление
          const r0 = Math.floor(h.y / FH), r1 = Math.ceil(prevY / FH);
          let land = null;
          for (let r = r1; r >= r0 && !land; r--) {
            if (r < 0 || r >= this.rows.length) continue;
            const top = r * FH;
            if (prevY >= top - 1 && h.y <= top) {
              for (const l of this.rows[r]) if (l.on && l.drop === 0 && Math.abs(wrap(l.a - h.a)) < HALF_A + FOOT_A) { land = l; break; }
            }
          }
          if (!land) {
            for (const l of this.lv.lifts) {
              if (Math.abs(wrap(l.a - h.a)) < HALF_A + FOOT_A && prevY >= l.y - 25 && h.y <= l.y + 2) { land = l; break; }
            }
          }
          if (land) {
            h.y = land.r0 !== undefined ? land.y : land.r * FH;
            h.vy = 0; h.ground = true; h.on = land;
            this.hero.squash = Math.min(1, 0.4 + (prevY - h.y) / 400 + 0.5);
            this.sfx('step', 0.5);
            this.dust(h.y);
          }
        }
        // липкий язык спасает от падения
        if (!h.ground && e.tongue > 0 && h.y < h.lastGround.y - 70) {
          e.tongue = 0;
          this.sfx('tongue');
          h.busy = true; h.lash = 0.4;
          const fa = h.a, fy = h.y, ta = h.lastGround.a, ty = h.lastGround.y;
          this.tweens.addCounter({ from: 0, to: 1, duration: 380, ease: 'Cubic.easeOut',
            onUpdate: (tw) => { const v = tw.getValue(); h.a = fa + wrap(ta - fa) * v; h.y = lerp(fy, ty, v); },
            onComplete: () => { h.busy = false; h.vy = 0; h.ground = true; h.on = this.supportAt(h.a, h.y, 8); if (!h.on) h.ground = false; } });
        }
        if (h.y < -90) { this.die('swamp'); return; }
      }

      this.stepWorld(dt);
      this.collide();
      this.camY = lerp(this.camY, Math.max(h.y + 140, 160), Math.min(1, dt * 4));
    }

    stepWorld(dt) {
      const lv = this.lv, h = this.h, frozen = this.effects.stone > 0;
      for (const l of lv.lifts) { l.t += dt; l.y = lerp(l.r0 * FH, l.r1 * FH, 0.5 - 0.5 * Math.cos(l.t * 2 * Math.PI / 6)); }
      for (const l of lv.ledges) {
        if (l.timer > 0) {
          l.timer -= dt;
          if (l.timer <= 0) { l.drop = 0.001; l.timer = 0; l.respawn = 5; }
        }
        if (l.drop > 0) {
          l.drop += dt;
          if (l.drop > 0.6) { l.on = false; }
          l.respawn -= dt;
          if (l.respawn <= 0) { l.drop = 0; l.on = true; }
        }
      }
      for (const t of lv.teeth) {
        t.t += dt;
        const ph = t.t % 2.6;
        const open = !frozen && ph > 1.7;
        if (open && !t.open && Math.abs(wrap(t.a - h.a)) < 1.2 && Math.abs(t.r * FH - h.y) < 600) this.sfx('teeth', 0.6);
        t.open = open;
      }
      if (!frozen) {
        for (const s of lv.spikes) s.a += s.w * dt;
        for (const b of lv.blobs) {
          b.ph += dt * 3.2;
          b.a += b.dir * dt * 0.6;
          if (b.a > b.a1) b.dir = -1; if (b.a < b.a0) b.dir = 1;
        }
        this.eyeTimer -= dt;
        if (this.eyeTimer <= 0) {
          this.eyeTimer = lv.eyeEvery * (0.7 + Math.random() * 0.6);
          if (h.y > FH) {
            const from = Math.random() < 0.5 ? -1 : 1;
            const ey = { x: from < 0 ? -130 : W + 130, y: h.y + 70 + Math.random() * 160, vx: -from * (230 + lv.level * 22), ph: Math.random() * 6, on: true };
            ey.spr = this.add.image(ey.x, 0, 'enemy_eye').setScale(0.55);
            this.worldLayer.add(ey.spr);
            this.eyes.push(ey);
          }
        }
        for (const ey of this.eyes) { if (!ey.on) continue; ey.x += ey.vx * dt; ey.ph += dt * 3; if (ey.x < -200 || ey.x > W + 200) { ey.on = false; ey.spr.destroy(); } }
        this.eyes = this.eyes.filter((ey) => ey.on || ey.spr.active);
      }
      // плевки
      for (const s of this.spits) {
        s.life -= dt;
        s.a += s.dir * 950 / R * dt;
        if (s.life <= 0) { s.spr.destroy(); s.dead = true; continue; }
        for (const b of lv.blobs) if (b.on && Math.abs(wrap(b.a - s.a)) < 40 / R && Math.abs(this.blobY(b) + 40 - s.y) < 80) { this.killEnemy(b); this.sfx('blast', 0.6); s.life = 0; }
        for (const sp of lv.spikes) if (sp.on && Math.abs(wrap(sp.a - s.a)) < 40 / R && Math.abs(sp.r * FH + 45 - s.y) < 70) { s.life = 0; }
        const sx = CX + R * Math.sin(wrap(s.a - h.a));
        for (const ey of this.eyes) if (ey.on && Math.abs(ey.x - sx) < 60 && Math.abs(ey.y - s.y) < 70) { this.killEnemy(ey); this.sfx('blast', 0.6); s.life = 0; }
      }
      this.spits = this.spits.filter((s) => !s.dead);
      // огоньки и бонусы
      for (const f of lv.flames) {
        if (!f.on) continue;
        if (this.effects.magnet > 0) {
          const da = wrap(h.a - f.a), dy = h.y + 70 - f.y;
          if (Math.abs(da) < 0.9 && Math.abs(dy) < 500) { f.a += da * Math.min(1, dt * 4); f.y += dy * Math.min(1, dt * 4); }
        }
        if (Math.abs(wrap(f.a - h.a)) < 34 / R && Math.abs(f.y - (h.y + 70)) < 85) {
          f.on = false; f.spr.setVisible(false); this.score += 10; this.sfx('bonus', 0.35); this.updateHud();
        }
      }
      for (const c of lv.coins) {
        if (c.on && Math.abs(wrap(c.a - h.a)) < 40 / R && Math.abs(c.y - (h.y + 70)) < 90) {
          c.on = false; c.spr.setVisible(false); this.slot = c.type; this.sfx('bonus', 0.9);
          this.message(BONUS[c.type].name.toUpperCase()); this.updateHud();
        }
      }
    }
    blobY(b) { return b.r * FH + Math.abs(Math.sin(b.ph)) * 110; }

    collide() {
      const h = this.h, lv = this.lv;
      if (h.inv > 0 || h.busy || this.effects.stone > 0) return;
      const hy = h.y + 75;
      let hit = null;
      for (const t of lv.teeth) if (t.open && Math.abs(wrap(t.a - h.a)) < 44 / R && Math.abs(t.r * FH + 75 - hy) < 70) hit = { from: Math.sign(wrap(h.a - t.a)) || -h.dir };
      for (const s of lv.spikes) if (s.on && Math.abs(wrap(s.a - h.a)) < 52 / R && Math.abs(s.r * FH + 45 - hy) < 80) hit = { from: Math.sign(wrap(h.a - s.a)) || -h.dir };
      for (const b of lv.blobs) if (b.on && Math.abs(wrap(b.a - h.a)) < 50 / R && Math.abs(this.blobY(b) + 40 - hy) < 80) hit = { from: Math.sign(wrap(h.a - b.a)) || -h.dir };
      for (const ey of this.eyes) if (ey.on && Math.abs(ey.x - CX) < 70 && Math.abs(ey.y - hy) < 75) hit = { from: Math.sign(CX - ey.x) || -h.dir };
      if (!hit) return;
      if (this.effects.shell > 0) { h.inv = 0.5; this.sfx('shell', 0.5); return; }
      this.sfx('hurt', 0.9);
      h.hurt = 0.55; h.inv = 1.6;
      h.vx = hit.from * 330; h.vy = 420; h.ground = false; h.on = null;
      this.cameras.main.shake(200, 0.008);
    }

    die(why) {
      if (this.mode !== 'play') return;
      this.mode = 'dying';
      this.dieT = 0; this.dieWhy = why;
      this.applyButtons();
      if (why === 'swamp') this.sfx('swamp');
      this.time.delayedCall(why === 'swamp' ? 200 : 0, () => this.sfx('death', 0.8));
      if (why === 'time') this.message('ВРЕМЯ ВЫШЛО', '#ff5a4a');
      this.lives -= 1;
      this.updateHud();
    }
    stepDying(dt) {
      this.dieT += dt;
      const h = this.h;
      if (this.dieWhy === 'swamp') { h.y -= 60 * dt; }
      if (this.dieT > 1.6) {
        if (this.lives <= 0) { this.gameOver(); return; }
        // снова на последней надёжной ступеньке
        h.a = this.cp.a; h.y = this.cp.y; h.vx = 0; h.vy = 0; h.ground = true; h.on = this.supportAt(h.a, h.y, 6); h.inv = 2; h.hurt = 0; h.busy = false;
        if (!h.on) { h.a = 0; h.y = 0; h.on = this.rows[0][0]; }
        if (this.dieWhy === 'time') this.timeLeft = Math.round(this.lv.time * 0.5);
        this.eyes.forEach((e) => { e.on = false; e.spr.destroy(); }); this.eyes = [];
        this.mode = 'play';
        this.applyButtons();
        this.hero.c.setAlpha(1);
        this.updateHud();
      }
    }

    winLevel() {
      this.mode = 'win';
      this.applyButtons();
      this.winT = 0;
      this.h.vx = 0;
      this.timeBonus = Math.ceil(this.timeLeft) * 10;
      this.sfx('win');
    }
    stepWin(dt) {
      this.winT += dt;
      const topY = this.lv.L * FH;
      this.camY = lerp(this.camY, topY + 380, Math.min(1, dt * 2.5));
      if (this.winT > 0.6 && !this.topLit) {
        this.topLit = true;
        this.topFlame.setVisible(true).setScale(0);
        this.tweens.add({ targets: this.topFlame, scale: 2.3, duration: 700, ease: 'Back.easeOut' });
        this.topEye.setVisible(true).setAlpha(0).setScale(0.3);
        this.tweens.add({ targets: this.topEye, alpha: 1, scale: 1, duration: 900, delay: 300, ease: 'Back.easeOut' });
        this.cameras.main.flash(400, 255, 200, 120);
      }
      if (this.winT > 2.6 && !this.winShown) {
        this.winShown = true;
        this.score += 500 + this.timeBonus;
        const record = this.score > this.best;
        if (record) { this.best = this.score; store.set('best', this.best); }
        if (this.levelNo + 1 > this.bestLevel) { this.bestLevel = this.levelNo + 1; store.set('bestLevel', this.bestLevel); }
        this.updateHud();
        const c = this.ui = this.overlay(0.55);
        c.add(this.add.text(W / 2, VH * 0.36, 'БАШНЯ ' + this.levelNo + '\nПОКОРЕНА!', { fontFamily: FONT, fontSize: '104px', color: GOLD, fontStyle: 'bold', stroke: '#000', strokeThickness: 14, align: 'center' }).setOrigin(0.5));
        c.add(this.add.text(W / 2, VH * 0.36 + 190, 'Время: +' + this.timeBonus + '   Свеча: +500', { fontFamily: FONT, fontSize: '44px', color: BONE, stroke: '#000', strokeThickness: 6 }).setOrigin(0.5));
        c.add(this.add.text(W / 2, VH * 0.36 + 255, 'Очки: ' + this.score, { fontFamily: FONT, fontSize: '56px', color: '#fff', fontStyle: 'bold', stroke: '#000', strokeThickness: 8 }).setOrigin(0.5));
        this.makeButton(c, W / 2, VH * 0.36 + 420, 600, 160, 'ДАЛЬШЕ', () => this.startLevel(this.levelNo + 1), { size: 72 });
      }
    }

    gameOver() {
      this.mode = 'over';
      this.applyButtons();
      this.updateMusic();
      const record = this.score > this.best;
      if (record) { this.best = this.score; store.set('best', this.best); }
      const c = this.ui = this.overlay(0.7);
      c.add(this.add.text(W / 2, VH * 0.3, 'ОГАРОК\nПОГАС', { fontFamily: FONT, fontSize: '124px', color: BLOOD, fontStyle: 'bold', stroke: '#000', strokeThickness: 16, align: 'center' }).setOrigin(0.5));
      c.add(this.add.text(W / 2, VH * 0.3 + 200, 'Очки: ' + this.score, { fontFamily: FONT, fontSize: '72px', color: '#fff', fontStyle: 'bold', stroke: '#000', strokeThickness: 8 }).setOrigin(0.5));
      c.add(this.add.text(W / 2, VH * 0.3 + 290, record ? 'НОВЫЙ РЕКОРД!' : 'Рекорд: ' + this.best, { fontFamily: FONT, fontSize: '52px', color: GOLD, fontStyle: 'bold', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5));
      c.add(this.add.text(W / 2, VH * 0.3 + 360, 'Дошёл до башни ' + this.levelNo, { fontFamily: FONT, fontSize: '40px', color: BONE }).setOrigin(0.5));
      this.makeButton(c, W / 2, VH * 0.3 + 520, 600, 160, 'ЕЩЁ РАЗ', () => this.startGame(), { size: 70 });
      this.makeButton(c, W / 2, VH * 0.3 + 710, 600, 130, 'МЕНЮ', () => { this.updateMusic(); this.showMenu(); }, { size: 54, fill: 0x1d1027 });
    }

    dust(y) {
      const g = this.add.graphics().setDepth(4.5);
      const yy = this.sy(y);
      const parts = [];
      for (let i = 0; i < 7; i++) parts.push({ x: CX + (Math.random() - 0.5) * 50, vx: (Math.random() - 0.5) * 260, r: 6 + Math.random() * 8 });
      this.tweens.addCounter({ from: 0, to: 1, duration: 420, onUpdate: (tw) => {
        const v = tw.getValue(); g.clear();
        for (const p of parts) { g.fillStyle(0xc9b38a, 0.55 * (1 - v)).fillCircle(p.x + p.vx * v * 0.4, yy - 8 - 30 * v, p.r * (1 + v)); }
      }, onComplete: () => g.destroy() });
    }

    // ---------- Рисование мира ----------
    render(dt) {
      const h = this.h, lv = this.lv, theta = h.a;
      const frozen = this.effects.stone > 0;
      const t = this.time.now / 1000;
      // бездна позади
      this.abyss.tilePositionX = theta * R * 0.22 / (W / 720);
      this.abyss.tilePositionY = -this.camY * 0.28 / (W / 720);

      // башня — цилиндр из полосок
      const topY = lv.L * FH, baseY = -160;
      const yTop = clamp(this.sy(topY - 30), -10, VH + 10), yBot = clamp(this.sy(baseY), -10, VH + 10);
      const hgt = Math.max(0, yBot - yTop);
      const worldTop = this.camY + (this.HY - yTop);
      const texPerWorld = 512 / TEX_WORLD;
      for (const s of this.strips) {
        const x1 = CX + R * Math.sin(s.phi1), x2 = CX + R * Math.sin(s.phi2);
        const ws = x2 - x1;
        if (hgt <= 0 || ws < 0.05) { s.setVisible(false); continue; }
        s.setVisible(true);
        const wpx = Math.ceil(ws) + 1;
        if (s.width !== wpx || s.height !== Math.ceil(hgt)) s.setSize(wpx, Math.ceil(hgt));
        s.setPosition(Math.floor(x1), yTop);
        const texW = (s.phi2 - s.phi1) * R * texPerWorld;
        s.setTileScale(ws / texW, 1 / texPerWorld);
        s.tilePositionX = (theta + s.phi1) * R * texPerWorld;
        s.tilePositionY = -worldTop * texPerWorld;
        const m = (s.phi1 + s.phi2) / 2, cm = Math.cos(m);
        let b = (0.16 + 0.84 * Math.pow(cm, 0.75)) * 0.68;
        b *= 0.92 + 0.08 * Math.sin(m * 3 + 1);
        if (frozen) { const gr = Math.round(150 * b); s.setTint(Phaser.Display.Color.GetColor(gr, gr, gr + 10)); }
        else s.setTint(Phaser.Display.Color.GetColor(Math.round(255 * b), Math.round(232 * b), Math.round(228 * b)));
      }
      // вершина с Великой Свечой
      const tsc = (2 * R) / 794 * 1.02;
      this.topImg.setScale(tsc).setPosition(CX, this.sy(topY));
      this.topImg.setVisible(this.sy(topY) > -700 && this.sy(topY) < VH + 400);
      const timgTop = this.sy(topY) - 0.65 * this.topImg.displayHeight;
      const tw = this.topImg.displayWidth, th = this.topImg.displayHeight;
      const tl = CX - tw / 2;
      this.topFlame.setPosition(tl + tw * 0.498, timgTop + th * 0.10);
      if (this.topLit) this.topFlame.setAngle(4 * Math.sin(t * 9)).setScale(2.3 * (0.95 + 0.05 * Math.sin(t * 23)), 2.3 * (0.93 + 0.07 * Math.sin(t * 31)));
      this.topEye.setPosition(tl + tw * 0.5, timgTop + th * 0.36);
      this.topGlow.clear();
      if (this.topLit) {
        const gx = this.topFlame.x, gy = this.topFlame.y - 60;
        for (let i = 6; i > 0; i--) this.topGlow.fillStyle(0xffa040, 0.05).fillCircle(gx, gy, 60 + i * 55 + 8 * Math.sin(t * 7));
      }

      // объекты на башне
      const front = (a) => wrap(a - theta);
      const place = (spr, a, y, out, baseScale, alphaCut = 1.35, sy2) => {
        const d = front(a);
        if (Math.abs(d) > alphaCut) { spr.setVisible(false); return null; }
        const yy = this.sy(y);
        if (yy < -300 || yy > VH + 300) { spr.setVisible(false); return null; }
        const c = Math.cos(d);
        spr.setVisible(true);
        spr.setPosition(CX + (R + out) * Math.sin(d), yy);
        spr.setScale(baseScale * Math.max(0.05, c), sy2 !== undefined ? sy2 : baseScale);
        const b = 0.35 + 0.65 * c;
        return { d, c, b };
      };
      const ledgeScale = LEDGE_W / 300;
      const depthList = [];
      for (const d of lv.doors) {
        const p = place(d.spr, d.a, d.r * FH + 2, 0, 0.47, 1.35);
        if (p) { d.spr.setTint(shade(p.b)); d.spr.setDepth(0); }
      }
      for (const tt of lv.teeth) {
        tt.spr.setTexture(tt.open ? 'teeth_open' : 'teeth_closed');
        const p = place(tt.spr, tt.a, tt.r * FH + 78, 2, 0.42, 1.35);
        if (p) tt.spr.setTint(frozen ? 0x999999 : shade(p.b)).setDepth(0.5);
      }
      for (const l of lv.ledges) {
        if (!l.on) { l.spr.setVisible(false); continue; }
        const shake = l.timer > 0 ? (Math.random() - 0.5) * 6 : 0;
        const p = place(l.spr, l.a + shake / R, l.r * FH - l.drop * l.drop * 900, 16, ledgeScale, 1.35, ledgeScale * 1.3);
        if (p) { l.spr.setTint(shade(p.b)).setAlpha(l.drop > 0 ? Math.max(0, 1 - l.drop * 1.6) : 1); l.spr.setDepth(1 + p.c); }
      }
      for (const l of lv.lifts) {
        const p = place(l.spr, l.a, l.y, 18, LEDGE_W / 240, 1.35, 0.32);
        if (p) l.spr.setTint(shade(p.b)).setDepth(1 + p.c);
      }
      for (const f of lv.flames) {
        if (!f.on) continue;
        const p = place(f.spr, f.a, f.y + 8 * Math.sin(t * 3 + f.a * 5), 30, 0.55);
        if (p) f.spr.setAngle(6 * Math.sin(t * 13 + f.a)).setDepth(2 + p.c).setAlpha(clamp(p.c * 2, 0, 1));
      }
      for (const c of lv.coins) {
        if (!c.on) continue;
        const p = place(c.spr, c.a, c.y + 10 * Math.sin(t * 2.5 + c.a), 30, 0.48 * (0.85 + 0.15 * Math.abs(Math.sin(t * 2))));
        if (p) c.spr.setDepth(2 + p.c).setTint(shade(0.4 + 0.6 * p.b));
      }
      for (const s of lv.spikes) {
        if (!s.on) continue;
        const p = place(s.spr, s.a, s.r * FH + 45, 45, 0.42, 1.4, 0.42);
        if (p) s.spr.setAngle(-(s.a * R / 45) * 57.3).setDepth(2.5 + p.c).setTint(frozen ? 0x8a8a8a : shade(p.b)).setScale(0.42 * (0.5 + 0.5 * p.c), 0.42);
      }
      for (const b of lv.blobs) {
        if (!b.on) continue;
        const air = Math.abs(Math.sin(b.ph));
        const p = place(b.spr, b.a, this.blobY(b), 40, 0.45, 1.4);
        if (p) {
          const sq = air < 0.15 && !frozen ? 0.2 * (1 - air / 0.15) : 0;
          b.spr.setScale(0.45 * (1 + sq) * Math.max(0.1, p.c), 0.45 * (1 - sq)).setFlipX(b.dir < 0).setDepth(2.5 + p.c).setTint(frozen ? 0x8a8a8a : shade(p.b));
        }
      }
      for (const ey of this.eyes) {
        if (!ey.on) continue;
        const flap = frozen ? 1 : 0.75 + 0.25 * Math.sin(t * 22 + ey.ph);
        ey.spr.setPosition(ey.x, this.sy(ey.y) + (frozen ? 0 : 18 * Math.sin(ey.ph))).setScale(0.55, 0.55 * flap).setFlipX(ey.vx > 0).setDepth(3.5).setTint(frozen ? 0x8a8a8a : 0xffffff);
      }
      for (const s of this.spits) {
        const d = front(s.a);
        s.spr.setPosition(CX + (R + 60) * Math.sin(d), this.sy(s.y)).setVisible(Math.abs(d) < 1.4).setDepth(3.6);
      }

      // герой
      const hst = this.mode === 'win' ? 'win' : h.lash > 0 ? 'lash'
        : h.hurt > 0 ? 'hurt' : h.spitPose > 0 ? 'spit' : !h.ground ? (h.vy > 0 ? 'up' : 'down')
          : Math.abs(h.vx) > 30 ? 'walk' : 'idle';
      if (h.lash > 0) h.lash -= dt;
      this.hero.setFacing(h.dir);
      this.hero.update(dt, this.mode === 'menu' ? 'walk' : hst, this.mode === 'menu' ? 200 : h.vx, h.vy);
      this.hero.c.setPosition(CX, this.sy(h.y));
      if (this.mode === 'dying' && this.dieWhy !== 'swamp') this.hero.c.setAlpha(Math.max(0, 1 - this.dieT));
      else if (h.inv > 0 && this.mode === 'play') this.hero.c.setAlpha(0.45 + 0.55 * (Math.sin(t * 30) > 0 ? 1 : 0));
      else if (!h.busy) this.hero.c.setAlpha(1);
      if (this.effects.shell > 0) this.hero.body.setTint(0xc9a27a); else this.hero.body.clearTint();

      // болото спереди
      const swS = 0.75;
      this.swamp.setTileScale(swS).setSize(W, Math.round(544 * swS));
      this.swampFill.setPosition(0, this.sy(-55) - 183 * swS + 544 * swS - 4).setSize(W, VH + 50);
      this.swamp.setPosition(0, this.sy(-55) - 183 * swS);
      this.swamp.tilePositionX = theta * (R + 260) / swS;
      this.swamp.setVisible(this.sy(-55) - 183 * swS < VH + 50);

      // эффекты
      this.fx.clear();
      if (this.burpFx > 0) {
        this.burpFx -= dt;
        const v = 1 - this.burpFx / 0.6;
        this.fx.lineStyle(30 * (1 - v), 0xffa53a, 0.7 * (1 - v)).strokeCircle(CX, this.sy(h.y + 90), 60 + v * 900);
      }
      if (this.effects.shell > 0) {
        this.fx.lineStyle(6, 0xc9a27a, 0.5 + 0.2 * Math.sin(t * 8)).strokeCircle(CX, this.sy(h.y + 80), 105);
      }
      if (this.effects.magnet > 0) {
        this.fx.lineStyle(3, 0x6aa8ff, 0.35).strokeCircle(CX, this.sy(h.y + 80), 120 + 20 * Math.sin(t * 6));
      }
      // кольцо таймера бонусов вокруг ячейки
      if (this.slotRing) {
        this.slotRing.clear();
        const e = this.effects;
        const act = e.shell > 0 ? e.shell / 10 : e.stone > 0 ? e.stone / 7 : e.magnet > 0 ? e.magnet / 12 : e.tongue > 0 ? e.tongue / 15 : e.superjump ? 1 : 0;
        if (act > 0) {
          this.slotRing.lineStyle(10, 0xb5e04a, 0.9).beginPath()
            .arc(this.slotBg.x, this.slotBg.y, 78, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * act).strokePath();
        }
        if (this.slot) this.slotBg.setScale(0.72 * (1 + 0.05 * Math.sin(t * 6))); else this.slotBg.setScale(0.72);
      }
    }

    // ---------- Меню и окна ----------
    overlay(alpha = 0.6) {
      this.closeOverlay();
      const c = this.add.container(0, 0).setDepth(30);
      const bg = this.add.rectangle(0, 0, W, VH, 0x07030c, alpha).setOrigin(0).setInteractive();
      c.add(bg);
      return c;
    }
    closeOverlay() { if (this.ui) { this.ui.destroy(true); this.ui = null; } }

    makeButton(parent, x, y, w, h, label, onClick, opts = {}) {
      const g = this.add.graphics();
      const fill = opts.fill || 0x4b1238;
      const draw = (hover) => {
        g.clear();
        g.fillStyle(0x000000, 0.45).fillRoundedRect(x - w / 2 + 6, y - h / 2 + 10, w, h, 34);
        g.fillStyle(hover ? 0x6a1a4c : fill, 1).fillRoundedRect(x - w / 2, y - h / 2, w, h, 34);
        g.lineStyle(6, 0xb5e04a, 0.9).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 34);
      };
      draw(false);
      const t = this.add.text(x, y, label, { fontFamily: FONT, fontSize: (opts.size || 56) + 'px', color: BONE, fontStyle: 'bold', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5);
      const z = this.add.zone(x, y, w, h).setOrigin(0.5).setInteractive({ useHandCursor: true });
      z.on('pointerover', () => draw(true));
      z.on('pointerout', () => draw(false));
      z.on('pointerup', () => { this.sfx('step', 0.6); onClick(t); });
      parent.add([g, t, z]);
      return t;
    }
    toggles(c, y, exit) {
      const label = (on, name) => name + (on ? ': вкл' : ': выкл');
      this.makeButton(c, W / 2 - 215, y, 400, 110, label(this.musicOn, 'Музыка'), (t) => {
        this.musicOn = !this.musicOn; store.set('music', this.musicOn); t.setText(label(this.musicOn, 'Музыка')); this.updateMusic();
      }, { size: 42, fill: 0x1d1027 });
      this.makeButton(c, W / 2 + 215, y, 400, 110, label(this.soundOn, 'Звуки'), (t) => {
        this.soundOn = !this.soundOn; store.set('sound', this.soundOn); t.setText(label(this.soundOn, 'Звуки'));
      }, { size: 42, fill: 0x1d1027 });
      this.makeButton(c, exit ? W / 2 - 215 : W / 2, y + 130, 400, 110, label(this.buttonsOn, 'Кнопки'), (t) => {
        this.buttonsOn = !this.buttonsOn; store.set('buttons', this.buttonsOn); t.setText(label(this.buttonsOn, 'Кнопки')); this.applyButtons();
      }, { size: 42, fill: 0x1d1027 });
      if (exit) this.makeButton(c, W / 2 + 215, y + 130, 400, 110, 'Выход', () => this.exitGame(), { size: 46, fill: 0x3a0f14 });
    }
    exitGame() {
      const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
      if (App && App.exitApp) { App.exitApp(); return; }
      try { window.close(); } catch (e) { /* браузер не даёт закрыть вкладку */ }
      this.message('Закройте вкладку браузера', BONE);
    }

    showMenu() {
      this.mode = 'menu';
      this.score = 0; this.lives = 3;
      this.buildLevel(1);
      this.h.a = 0;
      this.applyButtons();
      this.updateHud();
      const c = this.ui = this.overlay(0.25);
      const ti = this.add.image(W / 2, VH * 0.16, 'title');
      ti.setScale(Math.min(980 / ti.width, 1));
      c.add(ti);
      this.tweens.add({ targets: ti, scale: ti.scale * 1.03, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.easeInOut' });
      const y0 = VH * 0.6 + 170;
      this.makeButton(c, W / 2, y0, 560, 160, 'ИГРАТЬ', () => this.startGame(), { size: 76 });
      this.toggles(c, y0 + 180, true);
      c.add(this.add.text(W / 2, y0 + 400, 'Рекорд: ' + this.best, { fontFamily: FONT, fontSize: '44px', color: GOLD, fontStyle: 'bold', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5));
      c.add(this.add.text(W / 2, y0 + 490,
        'Веди палец влево-вправо — идти, тап — прыжок,\nсвайп вниз — в дверь, красная кнопка — плевок.\nДоберись до Великой Свечи и зажги её!', {
          fontFamily: FONT, fontSize: '32px', color: '#cbb894', align: 'center', lineSpacing: 6, stroke: '#000', strokeThickness: 4,
        }).setOrigin(0.5, 0));
    }

    startGame() {
      this.score = 0; this.lives = 3;
      this.startLevel(1);
    }
    startLevel(n) {
      this.closeOverlay();
      this.winShown = false;
      if (!this.isNative && this.sys.game.device.input.touch && !this.scale.isFullscreen) {
        try { this.scale.startFullscreen(); } catch (e) { /* не страшно */ }
      }
      this.buildLevel(n);
      this.mode = 'play';
      this.applyButtons();
      this.updateMusic();
      this.updateHud();
      this.message('БАШНЯ ' + n);
    }

    togglePause() { if (this.mode === 'play') this.pauseGame(); else if (this.mode === 'pause') this.resumeGame(); }
    pauseGame() {
      if (this.mode !== 'play') return;
      this.mode = 'pause';
      this.touches = {};
      this.applyButtons();
      const c = this.ui = this.overlay(0.7);
      c.add(this.add.text(W / 2, VH * 0.27, 'ПАУЗА', { fontFamily: FONT, fontSize: '130px', color: LIME, fontStyle: 'bold', stroke: '#000', strokeThickness: 16 }).setOrigin(0.5));
      const y = VH * 0.27 + 240;
      this.makeButton(c, W / 2, y, 600, 150, 'ПРОДОЛЖИТЬ', () => this.resumeGame(), { size: 64 });
      this.makeButton(c, W / 2, y + 180, 600, 130, 'ЗАНОВО', () => { this.lives = Math.max(1, this.lives); this.startLevel(this.levelNo); }, { size: 54, fill: 0x1d1027 });
      this.makeButton(c, W / 2, y + 340, 600, 130, 'МЕНЮ', () => this.showMenu(), { size: 54, fill: 0x1d1027 });
      this.toggles(c, y + 520, true);
    }
    resumeGame() {
      if (this.mode !== 'pause') return;
      this.closeOverlay();
      this.mode = 'play';
      this.applyButtons();
    }
  }

  function shade(b) {
    const v = Math.round(clamp(b, 0, 1) * 255);
    return Phaser.Display.Color.GetColor(v, v, v);
  }

  // =====================================================================
  window.game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: W,
    height: VH,
    backgroundColor: '#0a0610',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 5 },
    render: { antialias: true },
    fps: { target: 60 },
    scene: [Preload, Main],
  });
})();
