/**
 * 메타 화면 — 시작 / 게임 방법 / 도감 / 일시정지 / 결과.
 *
 * 완료 기준은 "첫 방문자가 설명 없이 한 판을 끝낼 수 있음"이다. 그래서
 *  - 시작 화면에서 학년과 무기를 **고르지 않아도** 기본값으로 바로 시작되고,
 *  - 무기 카드에 타입 라벨과 각성 짝꿍을 함께 보여 주며,
 *  - 게임 방법은 한 화면에 들어가는 분량으로 줄였다.
 */
import { EVOLUTIONS } from '../game/evolution';
import { PASSIVE_BY_ID } from '../game/stats';
import { STARTER_WEAPONS, WEAPON_BY_ID, type WeaponId } from '../game/weapons';
import type { Grade } from '../quiz/selector';
import { PICKUP_EMOJI } from '../game/pickups';
import { fetchRanking, type RankRow } from '../net/leaderboard';
import type { Identity } from '../meta/save';
import { getSettings, setSetting, SETTING_LABELS, type Settings } from '../meta/settings';

export type StartResult =
  | { action: 'new'; grade: Grade; starter: WeaponId; identity: Identity }
  | { action: 'resume' };

const GRADE_UNITS: Record<Grade, string> = {
  3: '덧셈·뺄셈 · 곱셈 · 나눗셈',
  4: '큰 수 곱셈·나눗셈 · 분수 · 소수',
  5: '혼합 계산 · 약수와 배수 · 분수',
  6: '분수·소수 나눗셈 · 비와 비율',
};

const WEAPON_TAG: Partial<Record<WeaponId, string>> = {
  연필: '밸런스형',
  샤프펜슬: '관통형',
  각도기: '광역형',
  계산기: '폭발형',
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const escapeAttr = escapeHtml;

/** 시작 화면의 입력값을 읽어 정리한다 */
function readIdentity(root: HTMLElement): Identity {
  const name = (root.querySelector('.name') as HTMLInputElement | null)?.value.trim() ?? '';
  const classCode = (root.querySelector('.cls') as HTMLInputElement | null)?.value.trim() ?? '';
  return { name: name.slice(0, 12), classCode: classCode.slice(0, 12) };
}

function el(html: string): HTMLElement {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild as HTMLElement;
}

export class Screens {
  private layer: HTMLElement;

  constructor(parent: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.className = 'screens';
    parent.appendChild(this.layer);
  }

  private show(node: HTMLElement) {
    this.layer.innerHTML = '';
    this.layer.appendChild(node);
    this.layer.classList.add('show');
  }

  hide() {
    this.layer.classList.remove('show');
    this.layer.innerHTML = '';
  }

  /* ─────────────── 시작 화면 ─────────────── */

  start(opts: {
    grade: Grade;
    starter: WeaponId;
    best: number | undefined;
    canResume: boolean;
    identity: Identity;
  }): Promise<StartResult> {
    return new Promise((resolve) => {
      let grade = opts.grade;
      let starter = opts.starter;

      const node = el(`
        <div class="screen start">
          <h1>수학 용사</h1>
          <p class="sub">문제를 풀어 강해져라! 10분 생존 대작전 🦔</p>

          <div class="section">
            <div class="label">📚 학년 고르기</div>
            <div class="grade-grid">
              ${([3, 4, 5, 6] as Grade[])
                .map(
                  (g) => `<button class="pick grade ${g === grade ? 'on' : ''}" data-g="${g}">
                    <b>${g}학년</b><span>${GRADE_UNITS[g]}</span></button>`,
                )
                .join('')}
            </div>
          </div>

          <div class="section">
            <div class="label">⚔️ 시작 무기 고르기</div>
            <div class="weapon-grid">
              ${STARTER_WEAPONS.map((id) => {
                const w = WEAPON_BY_ID.get(id)!;
                const partner = EVOLUTIONS.find((e) => e.base === id)?.partner;
                return `<button class="pick weapon ${id === starter ? 'on' : ''}" data-w="${id}">
                  <span class="skin">🦔<i>${w.emoji}</i></span>
                  <span class="info">
                    <b>${id} <em>${WEAPON_TAG[id] ?? ''}</em></b>
                    <span>${w.describe}</span>
                    ${partner ? `<span class="hint">✨ 각성 짝꿍 · ${PASSIVE_BY_ID.get(partner)?.emoji ?? ''} ${partner}</span>` : ''}
                  </span>
                </button>`;
              }).join('')}
            </div>
          </div>

          <div class="section">
            <div class="label">🏅 명예의 전당에 올리려면 (선택)</div>
            <div class="idrow">
              <input class="txt name" maxlength="12" placeholder="별명 (예: 용사수달)"
                     value="${escapeAttr(opts.identity.name)}" aria-label="별명" />
              <input class="txt cls" maxlength="12" placeholder="학급 코드 (예: 용사41)"
                     value="${escapeAttr(opts.identity.classCode)}" aria-label="학급 코드" />
            </div>
            <div class="note">💡 <b>실명 대신 별명</b>을 써 주세요. 학급 코드를 넣으면 우리 반끼리 순위를 볼 수 있어요.</div>
          </div>

          <div class="best">🏆 ${grade}학년 최고 점수: <b class="bestval">${opts.best ?? '-'}</b></div>

          <div class="actions">
            <button class="primary go">🚀 모험 시작!</button>
            ${opts.canResume ? '<button class="ghost resume">💾 이어하기</button>' : ''}
          </div>
          <div class="actions small">
            <button class="ghost how">❓ 게임 방법</button>
            <button class="ghost dex">✨ 각성 도감</button>
            <button class="ghost hall">🏆 전당</button>
            <button class="ghost opt">⚙️ 설정</button>
          </div>
        </div>`);

      const bestVal = node.querySelector('.bestval') as HTMLElement;
      const bestLabel = node.querySelector('.best') as HTMLElement;

      node.addEventListener('click', (ev) => {
        const b = (ev.target as HTMLElement).closest('button');
        if (!b) return;
        if (b.dataset.g) {
          grade = Number(b.dataset.g) as Grade;
          node.querySelectorAll('.grade').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          bestLabel.firstChild!.textContent = `🏆 ${grade}학년 최고 점수: `;
          bestVal.textContent = String(this.bestOf?.(grade) ?? '-');
        } else if (b.dataset.w) {
          starter = b.dataset.w as WeaponId;
          node.querySelectorAll('.weapon').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
        } else if (b.classList.contains('go')) {
          this.hide();
          resolve({ action: 'new', grade, starter, identity: readIdentity(node) });
        } else if (b.classList.contains('resume')) {
          this.hide();
          resolve({ action: 'resume' });
        } else if (b.classList.contains('how')) {
          this.how(() => this.start(opts).then(resolve));
        } else if (b.classList.contains('dex')) {
          this.dex(() => this.start(opts).then(resolve));
        } else if (b.classList.contains('opt')) {
          const id = readIdentity(node);
          this.options(() => this.start({ ...opts, identity: id }).then(resolve));
        } else if (b.classList.contains('hall')) {
          const id = readIdentity(node);
          void this.hall(grade, id.classCode, () =>
            this.start({ ...opts, identity: id }).then(resolve),
          );
        }
      });

      this.show(node);
    });
  }

  /** 학년별 최고 점수 조회기 — main 이 주입한다 */
  bestOf?: (g: Grade) => number | undefined;

  /* ─────────────── 게임 방법 ─────────────── */

  how(onClose: () => void) {
    const node = el(`
      <div class="screen sheet">
        <h2>게임 방법 🎮</h2>
        <ul class="how-list">
          <li>🕹️ <b>이동만 하면 돼!</b> 공격은 자동 — 화면 드래그 / 방향키·WASD</li>
          <li>💎 몬스터를 잡고 보석을 모아 레벨업!</li>
          <li>📖 레벨업 문제를 맞히면 원하는 강화를 고를 수 있어. <b>틀려도 죽지 않아</b> — 그 문제는 곧 다시 나와</li>
          <li>⏱ <b>문제 푸는 동안 시간이 멈춰.</b> 천천히 생각해도 괜찮아</li>
          <li>🎁 <b>미믹</b>(보물상자인 척하는 몬스터)을 잡으면 보너스 문제! 맞히면 ${PICKUP_EMOJI.magnet} 자석 / ${PICKUP_EMOJI.bomb} 폭탄이 떨어져</li>
          <li>🐈 생선 도둑 고양이를 잡으면 ${PICKUP_EMOJI.fish} 생선 — 먹으면 체력 회복!</li>
          <li>👑 3분·6분에 중간보스, 9분에 초월, 10분에 최종보스! <b>보스전에도 타이머는 멈춰</b></li>
          <li>✨ 무기 Lv.5 + 짝꿍 강화 = <b>각성 무기로 진화!</b></li>
          <li>⏸ 오른쪽 위 정지 버튼(또는 ESC)으로 잠깐 쉬어갈 수 있어</li>
        </ul>
        <button class="primary close">알겠어!</button>
      </div>`);
    node.querySelector('.close')!.addEventListener('click', onClose);
    this.show(node);
  }

  /* ─────────────── 각성 도감 ─────────────── */

  dex(onClose: () => void) {
    const rows = EVOLUTIONS.map((e) => {
      const base = WEAPON_BY_ID.get(e.base)!;
      const result = WEAPON_BY_ID.get(e.result)!;
      const p = PASSIVE_BY_ID.get(e.partner);
      return `<li>
        <span class="a">${base.emoji} ${e.base}</span>
        <span class="plus">＋</span>
        <span class="b">${p?.emoji ?? ''} ${e.partner}</span>
        <span class="arrow">→</span>
        <span class="r">${result.emoji} ${e.result}</span>
      </li>`;
    }).join('');

    const node = el(`
      <div class="screen sheet">
        <h2>각성 도감 ✨</h2>
        <p class="sub">무기 <b>Lv.5</b> + 짝꿍 강화를 갖추고 레벨업 문제를 맞히면 각성!</p>
        <ul class="dex-list">${rows}</ul>
        <button class="primary close">닫기</button>
      </div>`);
    node.querySelector('.close')!.addEventListener('click', onClose);
    this.show(node);
  }

  /* ─────────────── 설정 (접근성) ─────────────── */

  options(onClose: () => void) {
    const st = getSettings();
    const keys = Object.keys(SETTING_LABELS) as (keyof Settings)[];
    const node = el(`
      <div class="screen sheet">
        <h2>⚙️ 설정</h2>
        <p class="sub">한 반에는 색이 잘 안 보이는 친구도, 느린 태블릿도 섞여 있어요.</p>
        <ul class="opt-list">
          ${keys
            .map(
              (k) => `<li>
                <button class="toggle ${st[k] ? 'on' : ''}" data-k="${k}" role="switch" aria-checked="${st[k]}">
                  <span class="tl">
                    <b>${SETTING_LABELS[k].label}</b>
                    <span>${SETTING_LABELS[k].desc}</span>
                  </span>
                  <span class="sw"></span>
                </button>
              </li>`,
            )
            .join('')}
        </ul>
        <button class="primary close">닫기</button>
      </div>`);
    node.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest('.toggle') as HTMLElement | null;
      if (!b) return;
      const k = b.dataset.k as keyof Settings;
      const next = !getSettings()[k];
      setSetting(k, next);
      b.classList.toggle('on', next);
      b.setAttribute('aria-checked', String(next));
    });
    node.querySelector('.close')!.addEventListener('click', onClose);
    this.show(node);
  }

  /* ─────────────── 명예의 전당 ─────────────── */

  async hall(grade: Grade, classCode: string, onClose: () => void) {
    const node = el(`
      <div class="screen sheet">
        <h2>🏆 명예의 전당</h2>
        <p class="sub">${grade}학년 ${classCode ? `· 학급 <b>${escapeHtml(classCode)}</b>` : '· 전체'}</p>
        <div class="hall-status">불러오는 중…</div>
        <ol class="hall-list"></ol>
        <button class="primary close">닫기</button>
      </div>`);
    node.querySelector('.close')!.addEventListener('click', onClose);
    this.show(node);

    const status = node.querySelector('.hall-status') as HTMLElement;
    const list = node.querySelector('.hall-list') as HTMLElement;
    const res = await fetchRanking(grade, classCode || null);

    if (!res.ok) {
      status.textContent = res.reason;
      return;
    }
    if (!res.rows.length) {
      status.textContent = '아직 기록이 없어요. 첫 기록의 주인공이 되어 보세요!';
      return;
    }
    status.remove();
    list.innerHTML = res.rows.map((r: RankRow) => {
      const sec = Math.floor(r.surviveMs / 1000);
      const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `${r.rank}`;
      return `<li>
        <span class="rk">${medal}</span>
        <span class="nm">${escapeHtml(r.name)}${r.cleared ? ' 🏆' : ''}</span>
        <span class="dt">${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')} · Lv.${r.level} · 📝${r.accuracy}%</span>
        <span class="sc">${r.score}</span>
      </li>`;
    }).join('');
  }

  /* ─────────────── 일시정지 ─────────────── */

  pause(info: {
    time: number;
    level: number;
    kills: number;
    accuracy: number | null;
    quizTotal: number;
    weapons: { emoji: string; id: string; level: number }[];
    passives: { emoji: string; id: string; level: number }[];
  }): Promise<'resume' | 'quit'> {
    return new Promise((resolve) => {
      const t = Math.floor(info.time);
      const list = (items: typeof info.weapons, empty: string) =>
        items.length
          ? items.map((s) => `<li>${s.emoji} ${s.id} <b>Lv.${s.level}</b></li>`).join('')
          : `<li class="empty">${empty}</li>`;

      const node = el(`
        <div class="screen sheet">
          <h2>⏸ 잠깐 쉬어가기</h2>
          <div class="stat-grid">
            <div><b>${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}</b><span>진행 시간</span></div>
            <div><b>Lv.${info.level}</b><span>레벨</span></div>
            <div><b>${info.kills}</b><span>처치 수</span></div>
            <div><b>${info.accuracy === null ? '-' : Math.round(info.accuracy * 100) + '%'}</b><span>정답률 (${info.quizTotal}문제)</span></div>
          </div>
          <div class="skill-sec"><div class="skill-head">⚔️ 무기</div><ul class="skill-list">${list(info.weapons, '아직 없어')}</ul></div>
          <div class="skill-sec"><div class="skill-head">🎒 강화</div><ul class="skill-list">${list(info.passives, '아직 없어')}</ul></div>
          <button class="primary resume">계속하기!</button>
          <button class="ghost quit">그만하기</button>
        </div>`);
      node.querySelector('.resume')!.addEventListener('click', () => {
        this.hide();
        resolve('resume');
      });
      node.querySelector('.quit')!.addEventListener('click', () => {
        this.hide();
        resolve('quit');
      });
      this.show(node);
    });
  }

  /* ─────────────── 결과 ─────────────── */

  result(info: {
    cleared: boolean;
    time: number;
    kills: number;
    level: number;
    accuracy: number | null;
    score: number;
    stars: number;
    title: string;
    newBest: boolean;
    /** 랭킹 제출 결과 한 줄 (없으면 표시하지 않음) */
    rankLine?: string | null;
  }): Promise<'retry' | 'home'> {
    return new Promise((resolve) => {
      const t = Math.floor(info.time);
      const stars = '★'.repeat(info.stars) + '☆'.repeat(3 - info.stars);
      const node = el(`
        <div class="screen sheet result-screen">
          <div class="big">${info.cleared ? '🏆' : '💤'}</div>
          <h2>${info.cleared ? '10분 생존 성공!' : '여기까지! 잘 싸웠어'}</h2>
          <div class="hero-title">${info.title}</div>
          <div class="stars">${stars}</div>
          <div class="stat-grid">
            <div><b>${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}</b><span>생존 시간</span></div>
            <div><b>${info.kills}</b><span>처치 수</span></div>
            <div><b>Lv.${info.level}</b><span>최종 레벨</span></div>
            <div><b>${info.accuracy === null ? '-' : Math.round(info.accuracy * 100) + '%'}</b><span>정답률</span></div>
          </div>
          <div class="score">점수 <b>${info.score}</b></div>
          ${info.newBest ? '<div class="newbest">🎊 신기록 달성!</div>' : ''}
          ${info.rankLine ? `<div class="rankline">${escapeHtml(info.rankLine)}</div>` : ''}
          <button class="primary retry">다시 도전!</button>
          <button class="ghost home">처음으로</button>
        </div>`);
      node.querySelector('.retry')!.addEventListener('click', () => {
        this.hide();
        resolve('retry');
      });
      node.querySelector('.home')!.addEventListener('click', () => {
        this.hide();
        resolve('home');
      });
      this.show(node);
    });
  }
}
