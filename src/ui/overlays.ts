/**
 * 퀴즈 · 강화 카드 오버레이.
 *
 * 두 가지 원칙을 지킨다 (원작 블랙박스 측정에서 확인한 좋은 결정들).
 *  1. **오답에 게임적 페널티를 주지 않는다.** 강화를 못 받을 뿐, 죽지 않는다.
 *     틀린 학생이 더 불리해지면 학습 도구로서 실패한다.
 *  2. **각성 짝꿍을 카드에 상시 표기한다.** 초등 대상에서 진화 조건을 숨기지 않는다.
 *
 * 접근성: 보기·카드는 최소 44px 터치 타깃, 좁은 화면에서 1열로 떨어진다.
 */
import type { GameQuiz } from '../quiz/types';
import type { Upgrade } from '../game/upgrades';
import type { Evolution } from '../game/evolution';
import { PASSIVE_BY_ID } from '../game/stats';

export class QuizOverlay {
  private root: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'overlay quiz-overlay';
    parent.appendChild(this.root);
  }

  /** 문제를 띄우고 정답 여부를 돌려준다. 정답을 맞힐 때까지 기다리지 않는다(1회 응답). */
  ask(quiz: GameQuiz, tag = '레벨업 문제! 맞히면 강화를 골라요'): Promise<boolean> {
    return new Promise((resolve) => {
      this.root.innerHTML = `
        <div class="panel quiz">
          <div class="tag">${tag}</div>
          <div class="q">${quiz.promptHtml}</div>
          <div class="choices">
            ${quiz.choices
              .map((c, i) => `<button class="choice" data-i="${i}"><span class="n">${i + 1}</span>${c}</button>`)
              .join('')}
          </div>
          <div class="explain"></div>
        </div>`;
      this.root.setAttribute('data-answer', String(quiz.answer)); // 자동화 테스트에서 정답을 고르기 위함
      this.root.classList.add('show');

      const explain = this.root.querySelector('.explain') as HTMLElement;
      const buttons = [...this.root.querySelectorAll<HTMLButtonElement>('.choice')];

      const onPick = (i: number) => {
        const ok = i === quiz.answer;
        buttons.forEach((b, bi) => {
          b.disabled = true;
          if (bi === quiz.answer) b.classList.add('correct');
          else if (bi === i) b.classList.add('wrong');
        });
        explain.innerHTML = ok
          ? '<b class="ok">정답! 강화를 골라요 🎉</b>'
          : `<b class="bad">아쉬워요.</b> 정답은 <b>${quiz.choicesText[quiz.answer]}</b> 였어요. <span class="sub">이번엔 강화를 못 받지만 곧 다시 나와요!</span>`;
        // 결과를 읽을 시간을 준다. 타이머는 멈춰 있으므로 서두를 이유가 없다.
        setTimeout(
          () => {
            this.hide();
            resolve(ok);
          },
          ok ? 550 : 1700,
        );
      };

      buttons.forEach((b) => b.addEventListener('click', () => onPick(Number(b.dataset.i))));
    });
  }

  hide() {
    this.root.classList.remove('show');
    this.root.innerHTML = '';
  }
}

export class CardOverlay {
  private root: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'overlay card-overlay';
    parent.appendChild(this.root);
  }

  pick(choices: Upgrade[]): Promise<Upgrade> {
    return new Promise((resolve) => {
      this.root.innerHTML = `
        <div class="panel cards">
          <h2>🎉 강화를 골라!</h2>
          <div class="card-row">
            ${choices
              .map((u, i) => {
                const partner =
                  u.type === 'weapon' && u.partner
                    ? `<span class="hint">✨ 각성 짝꿍 · ${PASSIVE_BY_ID.get(u.partner)?.emoji ?? ''} ${u.partner}</span>`
                    : '';
                const tag = u.isNew ? '<span class="new">NEW</span>' : `<span class="lv">Lv.${u.level}</span>`;
                return `<button class="card" data-i="${i}">
                  <span class="ico">${u.emoji}</span>
                  <span class="body">
                    <span class="nm">${u.id} ${tag}</span>
                    <span class="ds">${u.text}${partner}</span>
                  </span>
                </button>`;
              })
              .join('')}
          </div>
        </div>`;
      this.root.classList.add('show');
      this.root.querySelectorAll<HTMLButtonElement>('.card').forEach((b) =>
        b.addEventListener('click', () => {
          this.root.classList.remove('show');
          this.root.innerHTML = '';
          resolve(choices[Number(b.dataset.i)]);
        }),
      );
    });
  }
}

/** 각성 연출 — 짧게 보여주고 스스로 사라진다 */
export function showAwaken(parent: HTMLElement, e: Evolution, emoji: string): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'awaken';
    el.innerHTML = `<div class="line">✨ 각성! ✨</div><div class="name">${emoji} ${e.result}</div>
      <div class="from">${e.base} + ${e.partner}</div>`;
    parent.appendChild(el);
    setTimeout(() => {
      el.remove();
      resolve();
    }, 1800);
  });
}
