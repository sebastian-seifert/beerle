/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { BoardView } from '../src/client/components/Board';
import {
  attachPhysicalKeyboard,
  GERMAN_QWERTZ_ROWS,
  KeyboardView,
} from '../src/client/components/Keyboard';
import { splitGraphemes } from '../src/shared/normalization';
import { createInitialGameState, gameReducer } from '../src/shared/state';

describe('Core Board UI & German QWERTZ Keyboard', () => {
  it('renders a 6 x N dynamic grid matching the daily beer word length', () => {
    const container = document.createElement('div');
    const board = new BoardView(container, 8);
    const state = createInitialGameState({
      puzzleNumber: 1,
      dateStr: '2026-11-16',
      wordLength: 8,
      hardMode: false,
    });
    state.currentInput = 'PAUL';

    board.render(state);

    const rows = container.querySelectorAll('.board-row');
    expect(rows).toHaveLength(6);
    expect(rows[0].querySelectorAll('.tile')).toHaveLength(8);
    expect(rows[0].querySelectorAll('.tile')[0].textContent).toBe('P');
    expect(rows[0].querySelectorAll('.tile')[0].getAttribute('data-state')).toBe('tbd');
    expect(rows[0].querySelectorAll('.tile')[4].getAttribute('data-state')).toBe('empty');
  });

  it('renders a 29-key German QWERTZ keyboard with Ä, Ö, Ü, ENTER, and BACKSPACE', () => {
    expect(GERMAN_QWERTZ_ROWS[0]).toContain('Ü');
    expect(GERMAN_QWERTZ_ROWS[1]).toContain('Ö');
    expect(GERMAN_QWERTZ_ROWS[1]).toContain('Ä');
    expect(GERMAN_QWERTZ_ROWS[2][0]).toBe('ENTER');
    expect(GERMAN_QWERTZ_ROWS[2][GERMAN_QWERTZ_ROWS[2].length - 1]).toBe('BACKSPACE');

    const onKey = vi.fn();
    const container = document.createElement('div');
    const kb = new KeyboardView(container, onKey);
    kb.updateStates({ Ü: 'correct', A: 'present', X: 'absent' });

    const üBtn = container.querySelector('[data-key="Ü"]') as HTMLButtonElement;
    expect(üBtn).toBeTruthy();
    expect(üBtn.getAttribute('data-state')).toBe('correct');

    üBtn.click();
    expect(onKey).toHaveBeenCalledWith('Ü');
  });

  it('triggers shake animation on invalid row and marks beer-term badge on evaluated beer rows', () => {
    const container = document.createElement('div');
    const board = new BoardView(container, 5);
    const state = createInitialGameState({
      puzzleNumber: 1,
      dateStr: '2026-11-16',
      wordLength: 5,
      hardMode: false,
    });
    state.guesses = [
      {
        guess: 'JEVER',
        statuses: ['correct', 'correct', 'correct', 'correct', 'correct'],
        isBeerTerm: true,
      },
    ];
    board.render(state);
    board.triggerRowShake(1);

    const rows = container.querySelectorAll('.board-row');
    expect(rows[0].classList.contains('beer-hit')).toBe(true);
    expect(rows[1].classList.contains('shake')).toBe(true);
  });

  it('handles physical keyboard events (A-Z, Ä/Ö/Ü, ß -> SS, Backspace, Enter) and defers keyboard color updates until flip completes', () => {
    vi.useFakeTimers();
    const boardEl = document.createElement('div');
    const kbEl = document.createElement('div');
    const board = new BoardView(boardEl, 5);
    let state = createInitialGameState({
      puzzleNumber: 1,
      dateStr: '2026-11-16',
      wordLength: 5,
      hardMode: false,
    });

    const handleKey = (raw: string) => {
      if (raw === 'BACKSPACE') {
        state = gameReducer(state, { type: 'BACKSPACE' });
      } else if (raw !== 'ENTER') {
        for (const ch of splitGraphemes(raw)) {
          state = gameReducer(state, { type: 'TYPE_LETTER', letter: ch });
        }
      }
      board.render(state);
    };

    const kb = new KeyboardView(kbEl, handleKey);
    const detach = attachPhysicalKeyboard(window, handleKey);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ß' }));
    expect(state.currentInput).toBe('WEISS');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }));
    expect(state.currentInput).toBe('WEIS');

    state = gameReducer(state, {
      type: 'APPLY_GUESS_RESULT',
      evaluation: {
        guess: 'JEVER',
        statuses: ['correct', 'correct', 'correct', 'correct', 'correct'],
        isBeerTerm: true,
      },
    });

    // Keyboard colors remain default until animateRowReveal finishes
    const jKey = kbEl.querySelector('[data-key="J"]') as HTMLButtonElement;
    expect(jKey.getAttribute('data-state')).toBe('default');

    board.animateRowReveal(0, state.guesses[0].statuses, () => {
      kb.updateStates(state.keyboardStates);
    });

    // Mid-animation: still default
    vi.advanceTimersByTime(600);
    expect(jKey.getAttribute('data-state')).toBe('default');

    // After full 5-tile stagger (4 * 300ms + 500ms = 1700ms): updated to correct
    vi.advanceTimersByTime(1200);
    expect(jKey.getAttribute('data-state')).toBe('correct');

    detach();
    vi.useRealTimers();
  });
});
