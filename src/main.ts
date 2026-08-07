/**
 * 부트스트랩 (Phase 5).
 *
 * 화면 흐름:  시작 화면 → 플레이 → (일시정지) → 결과 → 시작 화면
 *
 * 완료 기준은 "첫 방문자가 설명 없이 한 판을 끝낼 수 있음"이다.
 * 그래서 학년·무기를 고르지 않아도 기본값으로 바로 시작되고, 조작 안내는
 * 시작 직후 화면에 잠깐 떠 있다가 사라진다.
 */
import './style.css';
import './quiz/quiz.css';
import './vendor/problems.js';
import { Loop, type LoopStats } from './core/loop';
import { Input } from './core/input';
import { makeRng } from './core/rng';
import { Viewport } from './render/viewport';
import { drawJoystick, circle, ring } from './render/draw';
import { drawBoss, drawCreature, drawHero, type ActorState, type CreatureId } from './render/actors';
import { drawTerrain, BIOMES, biomeAt, roundAt } from './render/terrain';
import { DecalField } from './render/decals';
import { drawGem, drawPickup, drawProjectile } from './render/items';
import { World, type RunEvent } from './game/world';
import { BALANCE as B } from './game/balance';
import { ENEMY_KINDS } from './game/enemies';
import { PICKUP_EMOJI, PICKUP_LABEL } from './game/pickups';
import { PASSIVE_BY_ID } from './game/stats';
import { STARTER_WEAPONS, WEAPON_BY_ID, type WeaponId } from './game/weapons';
import { QuizSelector, type Grade } from './quiz/selector';
import { CardOverlay, QuizOverlay, showAwaken } from './ui/overlays';
import { Hud } from './ui/hud';
import { Screens } from './ui/screens';
import { submitScore } from './net/leaderboard';
import { apply as applySettings, getSettings, setSetting } from './meta/settings';
import { sound } from './audio/sound';
import {
  clearRun,
  loadIdentity,
  saveIdentity,
  type Identity,
  computeScore,
  loadBest,
  loadRun,
  saveBest,
  saveRun,
  starsFor,
  titleFor,
  type SavedRun,
} from './meta/save';

applySettings();

const app = document.getElementById('app')!;
const canvas = document.createElement('canvas');
canvas.id = 'game';
app.appendChild(canvas);

const vp = new Viewport(canvas);
const input = new Input(canvas);
const hud = new Hud(app);
hud.applySafeArea(vp.safe);

const quizOverlay = new QuizOverlay(app);
const cardOverlay = new CardOverlay(app);
const screens = new Screens(app);
screens.bestOf = (g) => loadBest()[g];

let grade: Grade = 4;
let starter: WeaponId = STARTER_WEAPONS[0];
let seed = 20260806;
let identity: Identity = loadIdentity();

const world = new World(seed, starter);
let selector = new QuizSelector(grade, makeRng(seed));
// 히든 보스는 정답률이 아주 높을 때만 열린다
world.accuracyProvider = () => selector.accuracy;

let stats: LoopStats = { fps: 0, frameMs: 0, droppedFrames: 0 };
let lowPerf = false;
let lowFpsFor = 0;
let banner = { text: '', until: 0 };
let trialCorrect = 0;
/** 주인공 애니메이션 상태 — 이동 거리로 걷기 위상을 돌린다 */
const hero: ActorState = { walk: 0, facing: 1, hurt: 0, hurtT: 0, hurtDx: 1, levelUp: 0, colorSafe: false };
/** 지나간 자리가 부서지는 자국 */
const decals = new DecalField();
const decalRnd = makeRng(0xd3ca1);
/** 효과음용 — 지난 프레임의 누적값. 차이가 있으면 소리를 낸다 */
let lastShots = 0;
let lastHits = 0;
let lastHurtT = 0;
let lastRound = -1;
let lastBiome = biomeAt(0);
/** 'home' 이면 게임 화면을 그리지 않는다 */
let mode: 'home' | 'play' = 'home';
const eventLog: string[] = [];

/* ─────────────────────────── HUD 정지 버튼 ─────────────────────────── */
// ESC 는 키보드에서만 쓸 수 있다. 태블릿에도 정지 수단이 있어야 한다.
const pauseBtn = document.createElement('button');
pauseBtn.className = 'pausebtn';
pauseBtn.textContent = '⏸';
pauseBtn.setAttribute('aria-label', '일시정지');
app.appendChild(pauseBtn);
pauseBtn.addEventListener('click', () => void openPause());

/* ─────────────────────────── 소리 토글 ─────────────────────────── */
// 설정 화면 안에만 두면 수업 중에 끄기까지 세 번을 눌러야 한다. 한 번에 닿게 한다.
const soundBtn = document.createElement('button');
soundBtn.className = 'pausebtn soundbtn';
soundBtn.setAttribute('aria-label', '소리 켜기/끄기');
const syncSoundBtn = () => {
  const on = getSettings().sound;
  soundBtn.textContent = on ? '🔊' : '🔇';
  soundBtn.classList.toggle('off', !on);
  soundBtn.setAttribute('aria-pressed', String(on));
};
soundBtn.addEventListener('click', () => {
  const next = !getSettings().sound;
  setSetting('sound', next); // apply() 안에서 sound.setEnabled 까지 걸린다
  syncSoundBtn();
  if (next && mode === 'play') sound.startBgm();
});
app.appendChild(soundBtn);
syncSoundBtn();

/**
 * 브라우저는 **사용자 입력 전에 소리를 낼 수 없다.**
 * 첫 탭/클릭/키 입력에서 오디오 컨텍스트를 깨운다. 한 번이면 충분하다.
 */
const unlockAudio = () => {
  sound.unlock();
  sound.setEnabled(getSettings().sound);
  if (mode === 'play' && getSettings().sound) sound.startBgm();
};
for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
  window.addEventListener(ev, unlockAudio, { once: true, passive: true });
}

/* ─────────────────────────── 보스 체력바 ─────────────────────────── */
const bossBar = document.createElement('div');
bossBar.className = 'bossbar';
bossBar.innerHTML =
  '<div class="name"></div><div class="track"><div class="fill"></div></div>' +
  '<div class="shield">🛡 방어막 — 문제를 풀어야 깨진다!</div>';
app.appendChild(bossBar);
const bossName = bossBar.querySelector('.name') as HTMLElement;
const bossFill = bossBar.querySelector('.fill') as HTMLElement;

/* ─────────────────────────── 이벤트 ─────────────────────────── */

world.on((e: RunEvent) => {
  eventLog.push(`${world.time.toFixed(1)} ${e.type}${'id' in e ? ':' + e.id : ''}${'kind' in e ? ':' + e.kind : ''}`);
  switch (e.type) {
    case 'levelup':
      hero.levelUp = 1; // 금빛 고리 연출
      sound.play('levelUp');
      void runLevelUpFlow();
      break;
    case 'awaken':
      banner = { text: `✨ ${e.evolution.result}`, until: world.time + 1.8 };
      sound.play('awaken');
      break;
    case 'boss':
      bossName.textContent = e.name;
      bossBar.classList.add('show');
      banner = { text: `⚔️ ${e.name} 등장! (타이머 정지)`, until: world.time + 2.4 };
      sound.play('bossAppear');
      break;
    case 'bossdown':
      bossBar.classList.remove('show');
      banner = { text: '🎉 보스 격파!', until: world.time + 2 };
      sound.play('bossDown');
      break;
    case 'shield':
      void runShieldFlow();
      break;
    case 'hidden':
      banner = { text: '🐉 칠흑의 드래곤이 나타났다!', until: world.time + 3 };
      sound.play('bossAppear');
      break;
    case 'bonus':
      void runBonusFlow();
      break;
    case 'trial':
      void runTrialFlow();
      break;
    case 'bossflee':
      bossBar.classList.remove('show');
      banner = { text: '보스가 물러났다!', until: world.time + 2 };
      break;
    case 'transcend':
      banner = { text: '🔥 초월! 힘이 솟아난다', until: world.time + 2.4 };
      sound.play('awaken');
      break;
    case 'pickup':
      banner = { text: PICKUP_LABEL[e.kind], until: world.time + 1.8 };
      sound.play('pickup');
      break;
    case 'gameover':
      void showResult(e.reason);
      break;
  }
});

/* ─────────────────────────── 퀴즈 흐름 (직렬화) ─────────────────────────── */

/**
 * 레벨업·보너스·초월 수련·방어막이 **같은 오버레이 하나를 공유**한다.
 * 두 흐름이 겹치면 뒤에 온 쪽이 앞의 DOM 을 덮어써 앞 흐름의 Promise 가
 * 영원히 resolve 되지 않는다. 그래서 하나의 체인에 태워 순서대로 실행한다.
 */
let chain: Promise<void> = Promise.resolve();
let queued = 0;

function enqueue(fn: () => Promise<void>) {
  queued++;
  chain = chain
    .then(async () => {
      loop.setPaused(true);
      await fn();
    })
    .catch((err) => console.error('[flow]', err))
    .finally(() => {
      queued--;
      if (queued === 0 && !world.over && mode === 'play') loop.setPaused(false);
    });
  return chain;
}

async function runLevelUpFlow() {
  await enqueue(async () => {
    for (let lv = world.takeLevelUp(); lv && !world.over; lv = world.takeLevelUp()) {
      // 모든 레벨업마다 문제를 내면 10분에 30문항이 나온다. 절반만 묻고
      // 나머지는 바로 카드를 준다 — 성장 속도는 그대로 두고 문항만 줄인다
      const quiz = lv.withQuiz ? selector.next() : null;
      let ok = true;
      if (quiz) {
        ok = await quizOverlay.ask(quiz);
        selector.grade_(quiz, ok);
        sound.play(ok ? 'correct' : 'wrong');
      }
      if (!ok) continue;

      const choices = world.rollChoices(3);
      if (choices.length) {
        const picked = await cardOverlay.pick(choices);
        world.applyUpgrade(picked);
        banner = { text: `${picked.emoji} ${picked.id}`, until: world.time + 1.4 };
      }
      // 각성은 정답을 맞힌 뒤에만 판정한다
      const evo = world.tryEvolve();
      if (evo) await showAwaken(app, evo, WEAPON_BY_ID.get(evo.result)?.emoji ?? '✨');
    }
  });
}

/** 미믹 보너스 문제 — 맞히면 맵 전체 자석 또는 폭탄이 떨어진다 */
async function runBonusFlow() {
  await enqueue(async () => {
    const quiz = selector.next();
    if (!quiz) return;
    const ok = await quizOverlay.ask(quiz, '🎁 미믹 보너스 문제! 맞히면 특별 아이템');
    selector.grade_(quiz, ok);
    sound.play(ok ? 'correct' : 'wrong');
    if (!ok) return;
    const kind = Math.random() < 0.5 ? 'magnet' : 'bomb';
    const a = Math.random() * Math.PI * 2;
    world.dropPickup(kind, world.player.x + Math.cos(a) * 140, world.player.y + Math.sin(a) * 140);
    banner = { text: `${PICKUP_EMOJI[kind]} 아이템 드랍! 주우러 가자`, until: world.time + 2 };
  });
}

/** 초월 수련 — 특별 문제 3개. 맞힌 수만큼 초월이 강해진다. */
async function runTrialFlow() {
  await enqueue(async () => {
    trialCorrect = 0;
    for (let i = 0; i < B.transcend.trialQuestions; i++) {
      const quiz = selector.next();
      if (!quiz) break;
      const ok = await quizOverlay.ask(quiz, `🔥 초월 수련 ${i + 1}/${B.transcend.trialQuestions}`);
      selector.grade_(quiz, ok);
      sound.play(ok ? 'correct' : 'wrong');
      if (ok) trialCorrect++;
    }
    world.addTranscendBonus(trialCorrect);
    banner = { text: `🔥 초월 수련 ${trialCorrect}/${B.transcend.trialQuestions} 성공`, until: world.time + 2.4 };
  });
}

/** 최종보스 방어막 — 맞힐 때까지 문제를 낸다. 틀려도 벌은 없다. */
async function runShieldFlow() {
  await enqueue(async () => {
    for (let guard = 0; guard < 12; guard++) {
      const quiz = selector.next();
      if (!quiz) break;
      const ok = await quizOverlay.ask(quiz, '🛡 방어막을 깨라!');
      selector.grade_(quiz, ok);
      sound.play(ok ? 'correct' : 'wrong');
      if (ok) break;
    }
    world.breakShield();
    banner = { text: '💥 방어막이 깨졌다!', until: world.time + 1.6 };
  });
}

/* ─────────────────────────── 화면 전환 ─────────────────────────── */

async function goHome() {
  mode = 'home';
  loop.setPaused(true);
  sound.stopBgm();
  bossBar.classList.remove('show');
  const saved = loadRun();
  const r = await screens.start({
    grade,
    starter,
    best: loadBest()[grade],
    canResume: !!saved,
    identity,
  });
  if (r.action === 'resume' && saved) {
    resumeRun(saved);
  } else if (r.action === 'new') {
    identity = r.identity;
    saveIdentity(identity);
    startRun(r.grade, r.starter);
  } else {
    startRun(grade, starter);
  }
}

function startRun(g: Grade, w: WeaponId) {
  grade = g;
  starter = w;
  seed = Math.floor(Math.random() * 1e9);
  world.reset(seed, starter);
  selector = new QuizSelector(grade, makeRng(seed));
  clearRun();
  decals.clear();
  resetSfxCounters();
  mode = 'play';
  banner = { text: '🕹️ 드래그하거나 방향키로 움직이자!', until: 4 };
  sound.setRound(0);
  sound.startBgm();
  loop.setPaused(false);
}

/** 새 판을 시작할 때 누적 카운터를 맞춰 둔다. 안 하면 첫 프레임에 소리가 몰린다 */
function resetSfxCounters() {
  lastShots = world.shotsFired;
  lastHits = world.hitsLanded;
  lastHurtT = 0;
  lastRound = -1;
}

function resumeRun(s: SavedRun) {
  grade = s.grade;
  starter = s.starter as WeaponId;
  seed = s.seed;
  world.reset(seed, starter);
  selector = new QuizSelector(grade, makeRng(seed));
  // 진행도만 복원한다 — 적·투사체는 새로 시작한다
  world.skipTo(s.time);
  world.kills = s.kills;
  world.player.level = s.level;
  world.player.xp = s.xp;
  world.player.maxHp = s.maxHp;
  world.player.hp = s.hp;
  world.weapons.clear();
  for (const [id, lv] of s.weapons) world.weapons.set(id as WeaponId, lv);
  world.passives.clear();
  for (const [id, lv] of s.passives) world.applyUpgrade({ type: 'passive', id, emoji: '', level: lv, isNew: true, text: '' } as never);
  decals.clear();
  resetSfxCounters();
  mode = 'play';
  banner = { text: '💾 이어서 시작!', until: world.time + 2.5 };
  sound.setRound(roundAt(world.time));
  sound.startBgm();
  loop.setPaused(false);
}

function snapshotRun(): SavedRun {
  return {
    grade,
    starter,
    seed,
    time: world.time,
    kills: world.kills,
    level: world.player.level,
    xp: world.player.xp,
    hp: world.player.hp,
    maxHp: world.player.maxHp,
    weapons: [...world.weapons],
    passives: [...world.passives],
    quizTotal: selector.total,
    quizCorrect: selector.correct,
    savedAt: Date.now(),
  };
}

async function openPause() {
  if (mode !== 'play' || world.over || queued > 0) return;
  loop.setPaused(true);
  const r = await screens.pause({
    time: world.time,
    level: world.player.level,
    kills: world.kills,
    accuracy: selector.accuracy,
    quizTotal: selector.total,
    weapons: [...world.weapons].map(([id, level]) => ({ id, level, emoji: WEAPON_BY_ID.get(id)?.emoji ?? '?' })),
    passives: [...world.passives].map(([id, level]) => ({ id, level, emoji: PASSIVE_BY_ID.get(id)?.emoji ?? '?' })),
  });
  if (r === 'resume') {
    loop.setPaused(false);
  } else {
    sound.stopBgm();
    // 그만두면 이어할 수 있게 남겨 둔다
    saveRun(snapshotRun());
    void goHome();
  }
}

async function showResult(reason: 'dead' | 'cleared') {
  mode = 'home';
  loop.setPaused(true);
  sound.stopBgm();
  sound.play(reason === 'cleared' ? 'awaken' : 'gameOver');
  bossBar.classList.remove('show');
  clearRun();

  const cleared = reason === 'cleared';
  const score = computeScore(world.time, world.kills, world.player.level, selector.accuracy);
  const newBest = saveBest(grade, score);

  // 랭킹 제출은 **실패해도 게임 흐름을 막지 않는다**. 별명이 없으면 아예 보내지 않는다.
  let rankLine: string | null = null;
  if (identity.name) {
    const res = await submitScore({
      name: identity.name,
      classCode: identity.classCode || null,
      grade,
      surviveMs: Math.round(world.time * 1000),
      kills: world.kills,
      level: world.player.level,
      accuracy: selector.accuracy,
      cleared,
    });
    rankLine = res.ok ? `🏅 ${identity.classCode ? '우리 반' : '전체'} ${res.rank}위!` : res.reason;
  }

  const r = await screens.result({
    cleared,
    time: world.time,
    kills: world.kills,
    level: world.player.level,
    accuracy: selector.accuracy,
    score,
    stars: starsFor(world.time, cleared),
    title: titleFor(selector.accuracy),
    newBest,
    rankLine,
  });
  if (r === 'retry') startRun(grade, starter);
  else void goHome();
}

/* ─────────────────────────── 루프 ─────────────────────────── */

const loop = new Loop({
  update: (dt) => {
    if (mode !== 'play') return;
    world.update(dt, input.axis());
    // 자국은 **이동 거리** 기준이라 프레임률이 흔들려도 간격이 일정하다
    decals.step(dt);
    if (!lowPerf && !getSettings().forceLowPerf) {
      decals.trail(world.player.x, world.player.y, biomeAt(world.time), decalRnd);
    }
  },
  render: (alpha) => render(alpha),
  onStats: (s) => {
    stats = s;
    if (s.fps < B.perf.lowFpsThreshold) {
      lowFpsFor += 1;
      if (lowFpsFor >= B.perf.lowFpsSeconds) lowPerf = true;
    } else {
      lowFpsFor = 0;
    }
  },
});

input.onTap('escape', () => void openPause());

// 백그라운드에서 타이머가 흐르면 태블릿 멀티태스킹 중 억울하게 죽는다
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'play') {
    loop.setPaused(true);
    sound.stopBgm(); // 탭을 내렸는데 음악만 계속 나오면 안 된다
    saveRun(snapshotRun());
  } else if (!document.hidden && mode === 'play' && getSettings().sound) {
    sound.startBgm();
  }
});

/* ─────────────────────────── 렌더 ─────────────────────────── */

function render(alpha: number) {
  const { ctx } = vp;
  vp.begin();

  const p = world.player;
  const pxPos = p.px + (p.x - p.px) * alpha;
  const pyPos = p.py + (p.y - p.py) * alpha;
  if (world.shakeRequest > 0) {
    // 흔들림 끄기는 접근성 옵션 — 멀미를 느끼는 학생이 있다
    if (!getSettings().reduceShake) vp.addShake(world.shakeRequest);
    world.shakeRequest = 0;
  }
  vp.follow(pxPos, pyPos, 1 / 60);

  // 단계별 지형 — 3·6·9분에 바뀐다
  drawTerrain(ctx, world.time, vp.camX, vp.camY, vp.scale, vp.width, vp.height, vp.dpr);
  vp.begin(); // drawTerrain 이 변환을 건드리므로 되돌린다

  // 지나온 자리의 파손 자국 — 지형 위, 액터 아래
  if (!lowPerf && !getSettings().forceLowPerf) {
    decals.draw(
      ctx,
      (x) => vp.toScreenX(x),
      (y) => vp.toScreenY(y),
      vp.scale,
      vp.dpr,
      vp.camX,
      vp.camY,
      vp.viewRadiusWorld + 120,
    );
  }

  const nowBiome = biomeAt(world.time);
  if (nowBiome !== lastBiome && mode === 'play') {
    lastBiome = nowBiome;
    const eff = B.biome[nowBiome]?.label;
    banner = {
      text: eff ? `🗺 ${BIOMES[nowBiome].name} — ${eff}` : `🗺 ${BIOMES[nowBiome].name}에 들어섰다!`,
      until: world.time + 3,
    };
  }

  const cull = vp.viewRadiusWorld + 90;
  const S = vp.scale;
  const cs = getSettings().colorSafe;
  hero.colorSafe = cs;
  const visible = (x: number, y: number) => Math.abs(x - vp.camX) < cull && Math.abs(y - vp.camY) < cull;

  world.gems.forEach((g) => {
    if (!visible(g.x, g.y)) return;
    drawGem(ctx, vp.toScreenX(g.x), vp.toScreenY(g.y), B.gem.radius * S, g.xp > 1, world.time);
  });

  world.enemies.forEach((e) => {
    const ex = e.px + (e.x - e.px) * alpha;
    const ey = e.py + (e.y - e.py) * alpha;
    if (!visible(ex, ey)) return;
    const kind = ENEMY_KINDS[e.kind];
    const sx = vp.toScreenX(ex);
    const sy = vp.toScreenY(ey);
    if (lowPerf || getSettings().forceLowPerf) {
      circle(ctx, sx, sy, kind.radius * S, e.flash > 0 ? '#fff' : kind.color);
      // 색약 모드: 색만으로 구분되지 않도록 테두리 두께를 종류별로 다르게 준다
      if (getSettings().colorSafe) ring(ctx, sx, sy, kind.radius * S, '#fff', 1 + (e.kind % 3));
    } else {
      drawCreature(ctx, kind.id as CreatureId, sx, sy, kind.radius * 2.2 * S, e.anim, e.flash > 0, vp.dpr, cs);
    }
  });

  world.projectiles.forEach((pr) => {
    if (!visible(pr.x, pr.y)) return;
    drawProjectile(
      ctx,
      pr.kind,
      pr.owner,
      vp.toScreenX(pr.x),
      vp.toScreenY(pr.y),
      pr.radius * S,
      pr.vx,
      pr.vy,
    );
  });

  world.pickups.forEach((it) => {
    if (!visible(it.x, it.y)) return;
    drawPickup(ctx, it.kind, vp.toScreenX(it.x), vp.toScreenY(it.y), 16 * S, it.age);
  });

  if (world.boss.active) {
    const b = world.boss;
    const bx = vp.toScreenX(b.px + (b.x - b.px) * alpha);
    const by = vp.toScreenY(b.py + (b.y - b.py) * alpha);
    const br = b.def.radius * S;
    const breathT = b.breathing > 0 ? 1 - b.breathing / b.def.breathTime : 0;
    // hurtT 는 초 단위로 줄어든다. 0~1 진행도로 바꿔 넘긴다
    drawBoss(
      ctx, b.def.skin, bx, by, br * 1.7, b.anim, b.facing, breathT, b.breathAngle,
      b.flash > 0, cs, Math.min(1, b.hurtT / 0.3),
    );
    if (b.shielded) {
      ring(ctx, bx, by, br * 1.25, 'rgba(120,200,255,0.9)', Math.max(3, 5 * S));
      ring(ctx, bx, by, br * 1.45, 'rgba(120,200,255,0.4)', Math.max(2, 3 * S));
    }
    bossFill.style.width = `${Math.max(0, (b.hp / b.maxHp) * 100)}%`;
    bossBar.classList.toggle('shielded', b.shielded);
  }

  // ── 효과음: 누적 카운터의 **차이**만 본다. 이벤트로 흘리면 초당 수십 건이 된다
  if (mode === 'play') {
    if (world.shotsFired !== lastShots) {
      lastShots = world.shotsFired;
      sound.play('shoot');
    }
    // 타격음. 초당 수십 발이 꽂히므로 sound 쪽에서 60ms 간격으로 솎아낸다
    if (world.hitsLanded !== lastHits) {
      lastHits = world.hitsLanded;
      sound.play('hit');
    }
    // 피격은 잔여 시간이 **올라간** 프레임에만 (계속 울리면 안 된다)
    if (p.hurtT > lastHurtT + 0.01) sound.play('playerHurt');
    lastHurtT = p.hurtT;

    // 라운드가 오르면 배경음이 조여든다
    const r = roundAt(world.time);
    if (r !== lastRound) {
      lastRound = r;
      sound.setRound(r);
    }
  }

  const sx = vp.toScreenX(pxPos);
  const sy = vp.toScreenY(pyPos);

  // 걷기 위상은 실제 이동 거리에 비례시킨다 — 제자리에 서면 다리도 멈춘다
  const moved = Math.hypot(p.x - p.px, p.y - p.py);
  hero.walk = (hero.walk + moved / 46) % 1;
  if (Math.abs(p.x - p.px) > 0.01) hero.facing = p.x > p.px ? 1 : -1;
  hero.hurt = Math.max(0, p.invuln - (B.player.invulnAfterHit - 0.25));
  hero.hurtT = Math.min(1, p.hurtT / B.player.hurtMotion);
  // 밀려나는 방향은 화면 x 부호만 쓴다 — 어느 쪽으로 젖혀질지만 정하면 된다
  if (p.hurtT > 0 && (p.hurtDx || p.hurtDy)) hero.hurtDx = p.hurtDx;
  hero.levelUp = Math.max(0, hero.levelUp - 1 / 45);
  drawHero(ctx, sx, sy, B.player.radius * 3.2 * S, hero);

  const j = input.joystick();
  if (j.active) drawJoystick(ctx, j.ox, j.oy, j.kx, j.ky, j.radius);

  if (banner.text && world.time < banner.until) {
    ctx.save();
    ctx.font = `700 ${Math.round(20 * Math.min(1.4, S + 0.5))}px Pretendard, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    const w = ctx.measureText(banner.text).width + 28;
    // 보스 체력바(상단 120~165px)가 떠 있으면 그 아래로 내린다.
    // 보스 등장 배너와 보스 체력바는 **항상 동시에** 뜨므로 안 비키면 반드시 겹친다.
    const top = world.boss.active
      ? Math.min(vp.height * 0.55, 176)
      : vp.height * 0.18;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(vp.width / 2 - w / 2, top, w, 38);
    ctx.fillStyle = '#ffe08a';
    ctx.fillText(banner.text, vp.width / 2, top + 26);
    ctx.restore();
  }

  // 홈 화면에서는 HUD 를 숨긴다
  hud.setVisible(mode === 'play');
  pauseBtn.classList.toggle('show', mode === 'play');
  // .pausebtn 은 기본이 display:none 이다. 소리 버튼도 같은 클래스를 쓰므로 함께 켠다
  soundBtn.classList.toggle('show', mode === 'play');
  if (mode !== 'play') return;

  hud.update({
    hp: p.hp,
    maxHp: p.maxHp,
    time: world.time,
    level: p.level,
    xp: p.xp,
    xpNext: p.xpNext,
    kills: world.kills,
    enemies: world.enemies.active,
    fps: stats.fps,
    frameMs: stats.frameMs,
    dpr: vp.dpr,
    lowPerf,
    accuracy: selector.accuracy,
    weapons: [...world.weapons].map(([id, level]) => ({ id, level, emoji: WEAPON_BY_ID.get(id)?.emoji ?? '?' })),
    passives: [...world.passives].map(([id, level]) => ({ id, level, emoji: PASSIVE_BY_ID.get(id)?.emoji ?? '?' })),
  });
}

loop.start();
void goHome();

/* ─────────────────────────── 자동화 계측 훅 ─────────────────────────── */

declare global {
  interface Window {
    __engine: {
      stats: () => LoopStats;
      enemies: () => number;
      setStress: (n: number) => void;
      lowPerf: () => boolean;
      pos: () => { x: number; y: number };
      axis: () => { x: number; y: number };
      joystick: () => { active: boolean; ox: number; oy: number; kx: number; ky: number };
      paused: () => boolean;
      snapshot: () => Record<string, unknown>;
      setStarter: (id: WeaponId) => void;
      setGrade: (g: Grade) => void;
      quiz: () => { total: number; correct: number; accuracy: number | null; open: boolean };
      grant: (kind: 'weapon' | 'passive', id: string, level: number) => void;
      tryEvolve: () => string | null;
      skipTo: (t: number) => void;
      boss: () => { name: string; hp: number; maxHp: number; shielded: boolean } | null;
      timeFrozen: () => boolean;
      defeatBoss: () => void;
      events: () => string[];
      mode: () => string;
      /** 테스트용 — 시작 화면을 건너뛰고 바로 시작 */
      begin: (g?: Grade, w?: WeaponId) => void;
      godMode: (on: boolean) => void;
    };
  }
}

let god = false;
setInterval(() => {
  if (god && mode === 'play' && !world.over) world.player.hp = world.player.maxHp;
}, 100);

window.__engine = {
  stats: () => stats,
  enemies: () => world.enemies.active,
  setStress: (n) => {
    world.stressTarget = n;
  },
  lowPerf: () => lowPerf,
  pos: () => ({ x: world.player.x, y: world.player.y }),
  axis: () => input.axis(),
  joystick: () => {
    const j = input.joystick();
    return { active: j.active, ox: j.ox, oy: j.oy, kx: j.kx, ky: j.ky };
  },
  paused: () => loop.isPaused,
  snapshot: () => ({
    time: world.time,
    hp: world.player.hp,
    maxHp: world.player.maxHp,
    level: world.player.level,
    kills: world.kills,
    enemies: world.enemies.active,
    projectiles: world.projectiles.active,
    gems: world.gems.active,
    pickups: world.pickups.active,
    over: world.over,
    transcended: world.transcended,
    timeFrozen: world.timeFrozen,
    bossActive: world.boss.active,
    mode,
    weapons: [...world.weapons],
    passives: [...world.passives],
  }),
  setStarter: (id) => startRun(grade, id),
  setGrade: (g) => startRun(g, starter),
  quiz: () => ({
    total: selector.total,
    correct: selector.correct,
    accuracy: selector.accuracy,
    open: !!document.querySelector('.quiz-overlay.show'),
  }),
  grant: (kind, id, level) => {
    world.applyUpgrade({ type: kind, id, emoji: '', level, isNew: true, text: '' } as never);
  },
  tryEvolve: () => world.tryEvolve()?.result ?? null,
  skipTo: (t) => world.skipTo(t),
  boss: () =>
    world.boss.active
      ? {
          name: world.boss.def.name,
          hp: Math.round(world.boss.hp),
          maxHp: world.boss.maxHp,
          shielded: world.boss.shielded,
        }
      : null,
  timeFrozen: () => world.timeFrozen,
  defeatBoss: () => world.defeatBoss(),
  events: () => eventLog.slice(),
  mode: () => mode,
  begin: (g = grade, w = starter) => {
    screens.hide();
    startRun(g, w);
  },
  godMode: (on) => {
    god = on;
  },
};
