import { describe, expect, it } from 'vitest';
import {
  evaluateGuess,
  getDailyPuzzleIndex,
  mergeKeyboardStates,
  validateHardMode,
} from '../src/shared/engine';
import {
  DAILY_BEER_SOLUTIONS,
  validateGuessWord,
} from '../src/shared/dictionary';
import type { GuessEvaluation, KeyStatus } from '../src/shared/types';

describe('Two-pass Wordle evaluation engine', () => {
  it('evaluates exact, present, and absent letters for variable lengths', () => {
    expect(evaluateGuess('JEVER', 'JEVER')).toEqual([
      'correct',
      'correct',
      'correct',
      'correct',
      'correct',
    ]);
    expect(evaluateGuess('PAULANER', 'ERLANGER')).toEqual([
      'absent',
      'present',
      'absent',
      'present',
      'absent',
      'present',
      'correct',
      'correct',
    ]);
  });

  it('never over-counts duplicate letters in a guess', () => {
    // Solution: SKILL (1 S, 1 K, 1 I, 2 L)
    // Guess:    ULLAL -> index 1 L is present, index 2 L is absent, index 4 L is correct
    expect(evaluateGuess('ULLAL', 'SKILL')).toEqual([
      'absent',
      'present',
      'absent',
      'absent',
      'correct',
    ]);

    // Solution: BECKS (1 E), Guess: EEEEE -> only index 1 is correct, rest absent
    expect(evaluateGuess('EEEEE', 'BECKS')).toEqual([
      'absent',
      'correct',
      'absent',
      'absent',
      'absent',
    ]);
  });

  it('handles German umlauts as distinct single tiles', () => {
    expect(evaluateGuess('KÖLSCH', 'KÖLSCH')).toEqual([
      'correct',
      'correct',
      'correct',
      'correct',
      'correct',
      'correct',
    ]);
    // O does not match Ö
    expect(evaluateGuess('KOLSCH', 'KÖLSCH')).toEqual([
      'correct',
      'absent',
      'correct',
      'correct',
      'correct',
      'correct',
    ]);
  });

  it('merges keyboard states with strict precedence correct > present > absent > default', () => {
    const prev: Record<string, KeyStatus> = {
      E: 'correct',
      R: 'present',
      X: 'absent',
    };
    const next = mergeKeyboardStates(prev, 'ERXAB', [
      'present',
      'correct',
      'absent',
      'present',
      'absent',
    ]);
    expect(next.E).toBe('correct'); // never downgrades from correct to present
    expect(next.R).toBe('correct'); // upgrades from present to correct
    expect(next.X).toBe('absent');
    expect(next.A).toBe('present');
    expect(next.B).toBe('absent');
  });

  it('enforces Hard Mode green position and yellow count constraints with exact German errors', () => {
    const history: GuessEvaluation[] = [
      {
        guess: 'ASTRA',
        statuses: ['present', 'absent', 'absent', 'correct', 'absent'],
        isBeerTerm: true,
      },
    ];
    // Missing green R at 4th position (index 3)
    expect(validateHardMode('ABEND', history)).toBe('4. Buchstabe muss R sein');
    // Has R at 4th position, but missing yellow A (note: index 0 A was present, index 4 A was absent => min count of A is 1)
    expect(validateHardMode('STERN', history)).toBe('Wort muss A enthalten');
    // Valid Hard Mode guess: R at index 3 and contains A
    expect(validateHardMode('STARK', history)).toBeNull();
  });

  it('validates two-tier dictionary: beer terms, German filler words, and rejects invalid words', () => {
    expect(DAILY_BEER_SOLUTIONS.length).toBeGreaterThanOrEqual(40);
    // Tier 1 solution
    expect(validateGuessWord('JEVER', 5)).toEqual({ valid: true, isBeerTerm: true });
    // Tier 2A extended beer term
    expect(validateGuessWord('HOPFEN', 6)).toEqual({ valid: true, isBeerTerm: true });
    // Tier 2B standard German word
    expect(validateGuessWord('STERN', 5)).toEqual({ valid: true, isBeerTerm: false });
    // Wrong length
    expect(validateGuessWord('JEVER', 6)).toEqual({ valid: false, isBeerTerm: false });
    // Nonsense
    expect(validateGuessWord('ZZZZZ', 5)).toEqual({ valid: false, isBeerTerm: false });
  });

  it('computes deterministic daily puzzle index from YYYY-MM-DD UTC date', () => {
    const idx1 = getDailyPuzzleIndex('2026-11-16', DAILY_BEER_SOLUTIONS.length);
    const idx2 = getDailyPuzzleIndex('2026-11-17', DAILY_BEER_SOLUTIONS.length);
    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx1).toBeLessThan(DAILY_BEER_SOLUTIONS.length);
    expect(idx2).not.toBe(idx1);
  });
});
