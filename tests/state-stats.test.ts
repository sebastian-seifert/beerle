import { describe, expect, it } from 'vitest';
import {
  createInitialGameState,
  gameReducer,
} from '../src/shared/state';
import {
  buildShareGridText,
  computeDistributionRatios,
  computeWinPercentage,
  createEmptyStats,
  recordGameOutcome,
} from '../src/shared/stats';

describe('Game state reducer & stats/streak calculator', () => {
  it('handles typing, backspace, and word submission transitions', () => {
    let state = createInitialGameState({
      puzzleNumber: 42,
      dateStr: '2026-11-16',
      wordLength: 5,
      hardMode: false,
    });

    state = gameReducer(state, { type: 'TYPE_LETTER', letter: 'J' });
    state = gameReducer(state, { type: 'TYPE_LETTER', letter: 'E' });
    state = gameReducer(state, { type: 'TYPE_LETTER', letter: 'V' });
    state = gameReducer(state, { type: 'BACKSPACE' });
    expect(state.currentInput).toBe('JE');

    state = gameReducer(state, { type: 'TYPE_LETTER', letter: 'V' });
    state = gameReducer(state, { type: 'TYPE_LETTER', letter: 'E' });
    state = gameReducer(state, { type: 'TYPE_LETTER', letter: 'R' });
    // Typing beyond wordLength is ignored
    state = gameReducer(state, { type: 'TYPE_LETTER', letter: 'X' });
    expect(state.currentInput).toBe('JEVER');

    state = gameReducer(state, {
      type: 'APPLY_GUESS_RESULT',
      evaluation: {
        guess: 'JEVER',
        statuses: ['correct', 'correct', 'correct', 'correct', 'correct'],
        isBeerTerm: true,
      },
    });
    expect(state.status).toBe('won');
    expect(state.guesses).toHaveLength(1);
    expect(state.currentInput).toBe('');
    expect(state.keyboardStates.J).toBe('correct');
  });

  it('locks Hard Mode toggle once the first guess is submitted', () => {
    let state = createInitialGameState({
      puzzleNumber: 42,
      dateStr: '2026-11-16',
      wordLength: 5,
      hardMode: false,
    });
    // Allowed before guess 1
    state = gameReducer(state, { type: 'TOGGLE_HARD_MODE' });
    expect(state.hardMode).toBe(true);
    state = gameReducer(state, { type: 'TOGGLE_HARD_MODE' });
    expect(state.hardMode).toBe(false);

    // Submit 1 non-winning guess
    state = gameReducer(state, {
      type: 'APPLY_GUESS_RESULT',
      evaluation: {
        guess: 'STERN',
        statuses: ['absent', 'absent', 'present', 'present', 'absent'],
        isBeerTerm: false,
      },
    });

    // Hard Mode toggle is now ignored
    state = gameReducer(state, { type: 'TOGGLE_HARD_MODE' });
    expect(state.hardMode).toBe(false);
  });

  it('marks game as lost after 6 non-winning guesses', () => {
    let state = createInitialGameState({
      puzzleNumber: 42,
      dateStr: '2026-11-16',
      wordLength: 5,
      hardMode: false,
    });

    for (let i = 0; i < 6; i++) {
      state = gameReducer(state, {
        type: 'APPLY_GUESS_RESULT',
        evaluation: {
          guess: 'STERN',
          statuses: ['absent', 'absent', 'present', 'present', 'absent'],
          isBeerTerm: false,
        },
      });
    }
    expect(state.status).toBe('lost');
    expect(state.guesses).toHaveLength(6);
  });

  it('calculates streaks, win percentage, and guess distribution accurately', () => {
    let stats = createEmptyStats();
    stats = recordGameOutcome(stats, {
      dateStr: '2026-11-15',
      won: true,
      guessCount: 3,
    });
    expect(stats.played).toBe(1);
    expect(stats.wins).toBe(1);
    expect(stats.currentStreak).toBe(1);
    expect(stats.maxStreak).toBe(1);
    expect(stats.distribution[3]).toBe(1);

    // Consecutive day win increments streak
    stats = recordGameOutcome(stats, {
      dateStr: '2026-11-16',
      won: true,
      guessCount: 2,
    });
    expect(stats.currentStreak).toBe(2);
    expect(stats.maxStreak).toBe(2);

    // Skipped day (2026-11-18) resets streak to 1 on win
    stats = recordGameOutcome(stats, {
      dateStr: '2026-11-18',
      won: true,
      guessCount: 4,
    });
    expect(stats.currentStreak).toBe(1);
    expect(stats.maxStreak).toBe(2);

    // Loss resets currentStreak to 0, preserves maxStreak
    stats = recordGameOutcome(stats, {
      dateStr: '2026-11-19',
      won: false,
      guessCount: 6,
    });
    expect(stats.played).toBe(4);
    expect(stats.wins).toBe(3);
    expect(stats.currentStreak).toBe(0);
    expect(stats.maxStreak).toBe(2);
    expect(computeWinPercentage(stats)).toBe(75);
    expect(computeDistributionRatios(stats)).toEqual({
      1: 0,
      2: 1,
      3: 1,
      4: 1,
      5: 0,
      6: 0,
    });
  });

  it('generates spoiler-free emoji share grids for dark, light, and high-contrast modes', () => {
    const text = buildShareGridText({
      puzzleNumber: 42,
      wordLength: 5,
      guesses: [
        {
          guess: 'STERN',
          statuses: ['absent', 'absent', 'present', 'present', 'absent'],
          isBeerTerm: false,
        },
        {
          guess: 'JEVER',
          statuses: ['correct', 'correct', 'correct', 'correct', 'correct'],
          isBeerTerm: true,
        },
      ],
      won: true,
      hardMode: true,
      theme: 'dark',
      highContrast: false,
    });

    expect(text).toBe(
      '🍺 Beerle #42 (5 Buchstaben) 2/6*\n\n⬛⬛🟨🟨⬛\n🟩🟩🟩🟩🟩',
    );

    const hcText = buildShareGridText({
      puzzleNumber: 42,
      wordLength: 5,
      guesses: [
        {
          guess: 'STERN',
          statuses: ['absent', 'present', 'correct', 'absent', 'absent'],
          isBeerTerm: false,
        },
      ],
      won: false,
      hardMode: false,
      theme: 'light',
      highContrast: true,
    });

    expect(hcText).toBe('🍺 Beerle #42 (5 Buchstaben) X/6\n\n⬜🟦🟧⬜⬜');
  });
});
