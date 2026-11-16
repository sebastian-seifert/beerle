import { splitGraphemes } from './normalization';
import type { GuessEvaluation, KeyStatus, TileStatus } from './types';

const KEY_PRECEDENCE: Record<KeyStatus, number> = {
  default: 0,
  absent: 1,
  present: 2,
  correct: 3,
};

/**
 * Evaluates a normalized guess against a normalized solution using Wordle's
 * strict two-pass frequency depletion algorithm.
 */
export function evaluateGuess(guess: string, solution: string): TileStatus[] {
  const guessChars = splitGraphemes(guess);
  const solChars = splitGraphemes(solution);

  if (guessChars.length !== solChars.length) {
    throw new Error(
      `Guess length (${guessChars.length}) must match solution length (${solChars.length})`,
    );
  }

  const len = solChars.length;
  const result: TileStatus[] = new Array<TileStatus>(len).fill('absent');
  const remainingCounts = new Map<string, number>();

  for (const ch of solChars) {
    remainingCounts.set(ch, (remainingCounts.get(ch) ?? 0) + 1);
  }

  // Pass 1: exact green matches
  for (let i = 0; i < len; i++) {
    if (guessChars[i] === solChars[i]) {
      result[i] = 'correct';
      remainingCounts.set(guessChars[i], (remainingCounts.get(guessChars[i]) ?? 1) - 1);
    }
  }

  // Pass 2: misplaced yellow matches, left-to-right
  for (let i = 0; i < len; i++) {
    if (result[i] === 'correct') {
      continue;
    }
    const ch = guessChars[i];
    const remaining = remainingCounts.get(ch) ?? 0;
    if (remaining > 0) {
      result[i] = 'present';
      remainingCounts.set(ch, remaining - 1);
    }
  }

  return result;
}

/**
 * Merges a newly evaluated row into the virtual keyboard state map,
 * strictly enforcing `correct > present > absent > default` precedence.
 */
export function mergeKeyboardStates(
  prev: Record<string, KeyStatus>,
  guess: string,
  statuses: TileStatus[],
): Record<string, KeyStatus> {
  const next: Record<string, KeyStatus> = { ...prev };
  const chars = splitGraphemes(guess);

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const tileStatus = statuses[i];
    if (tileStatus !== 'correct' && tileStatus !== 'present' && tileStatus !== 'absent') {
      continue;
    }
    const current = next[ch] ?? 'default';
    if (KEY_PRECEDENCE[tileStatus] > KEY_PRECEDENCE[current]) {
      next[ch] = tileStatus;
    }
  }

  return next;
}

/**
 * Validates a guess against Hard Mode constraints from all previous guesses.
 * Returns `null` if valid, or the exact German error toast message if violated.
 */
export function validateHardMode(
  guess: string,
  history: GuessEvaluation[],
): string | null {
  if (history.length === 0) {
    return null;
  }

  const guessChars = splitGraphemes(guess);

  // 1. Check all revealed green (correct) positions left-to-right
  for (const prev of history) {
    const prevChars = splitGraphemes(prev.guess);
    for (let i = 0; i < prev.statuses.length; i++) {
      if (prev.statuses[i] === 'correct' && guessChars[i] !== prevChars[i]) {
        return `${i + 1}. Buchstabe muss ${prevChars[i]} sein`;
      }
    }
  }

  // 2. Check minimum required counts of revealed letters (correct + present in any prior row)
  const requiredMinCounts = new Map<string, number>();
  for (const prev of history) {
    const prevChars = splitGraphemes(prev.guess);
    const rowCounts = new Map<string, number>();
    for (let i = 0; i < prev.statuses.length; i++) {
      if (prev.statuses[i] === 'correct' || prev.statuses[i] === 'present') {
        const ch = prevChars[i];
        rowCounts.set(ch, (rowCounts.get(ch) ?? 0) + 1);
      }
    }
    for (const [ch, count] of rowCounts.entries()) {
      const existing = requiredMinCounts.get(ch) ?? 0;
      if (count > existing) {
        requiredMinCounts.set(ch, count);
      }
    }
  }

  const guessCounts = new Map<string, number>();
  for (const ch of guessChars) {
    guessCounts.set(ch, (guessCounts.get(ch) ?? 0) + 1);
  }

  for (const [ch, minCount] of requiredMinCounts.entries()) {
    if ((guessCounts.get(ch) ?? 0) < minCount) {
      return `Wort muss ${ch} enthalten`;
    }
  }

  return null;
}

/**
 * Computes a deterministic puzzle index for a `YYYY-MM-DD` UTC date string.
 * Uses days since 2026-01-01 modulo poolSize.
 */
export function getDailyPuzzleIndex(dateStr: string, poolSize: number): number {
  if (poolSize <= 0) {
    throw new Error('poolSize must be positive');
  }
  const epochMs = Date.UTC(2026, 0, 1);
  const parts = dateStr.split('-').map(Number);
  const targetMs = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  const dayOffset = Math.floor((targetMs - epochMs) / 86_400_000);
  return ((dayOffset % poolSize) + poolSize) % poolSize;
}

/**
 * Computes the sequential 1-based Beerle puzzle number for a `YYYY-MM-DD` UTC date string.
 */
export function getDailyPuzzleNumber(dateStr: string): number {
  const epochMs = Date.UTC(2026, 0, 1);
  const parts = dateStr.split('-').map(Number);
  const targetMs = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  return Math.floor((targetMs - epochMs) / 86_400_000) + 1;
}
