import type { GuessEvaluation, ThemeMode, TileStatus, UserStats } from './types';

export function createEmptyStats(): UserStats {
  return {
    played: 0,
    wins: 0,
    currentStreak: 0,
    maxStreak: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    lastPlayedDate: null,
    lastWonDate: null,
  };
}

function isConsecutiveUtcDay(prevDateStr: string | null, nextDateStr: string): boolean {
  if (!prevDateStr) {
    return false;
  }
  const [py, pm, pd] = prevDateStr.split('-').map(Number);
  const [ny, nm, nd] = nextDateStr.split('-').map(Number);
  const prevMs = Date.UTC(py, pm - 1, pd);
  const nextMs = Date.UTC(ny, nm - 1, nd);
  return nextMs - prevMs === 86_400_000;
}

export function recordGameOutcome(
  stats: UserStats,
  outcome: { dateStr: string; won: boolean; guessCount: number },
): UserStats {
  // Prevent double-counting the same daily puzzle
  if (stats.lastPlayedDate === outcome.dateStr) {
    return stats;
  }

  const nextDistribution = { ...stats.distribution };
  let nextStreak = 0;

  if (outcome.won) {
    const key = Math.min(6, Math.max(1, outcome.guessCount));
    nextDistribution[key] = (nextDistribution[key] ?? 0) + 1;
    nextStreak = isConsecutiveUtcDay(stats.lastWonDate, outcome.dateStr)
      ? stats.currentStreak + 1
      : 1;
  }

  return {
    played: stats.played + 1,
    wins: stats.wins + (outcome.won ? 1 : 0),
    currentStreak: nextStreak,
    maxStreak: Math.max(stats.maxStreak, nextStreak),
    distribution: nextDistribution,
    lastPlayedDate: outcome.dateStr,
    lastWonDate: outcome.won ? outcome.dateStr : stats.lastWonDate,
  };
}

export function computeWinPercentage(stats: UserStats): number {
  if (stats.played === 0) {
    return 0;
  }
  return Math.round((stats.wins / stats.played) * 100);
}

/**
 * Computes normalized 1–6 guess distribution bar ratios in `[0, 1]` relative
 * to the highest bucket count (returning `0` for all buckets when empty).
 */
export function computeDistributionRatios(stats: UserStats): Record<number, number> {
  let maxCount = 0;
  for (let i = 1; i <= 6; i++) {
    const count = stats.distribution[i] ?? 0;
    if (count > maxCount) {
      maxCount = count;
    }
  }

  const ratios: Record<number, number> = {};
  for (let i = 1; i <= 6; i++) {
    ratios[i] = maxCount === 0 ? 0 : (stats.distribution[i] ?? 0) / maxCount;
  }
  return ratios;
}

function statusToEmoji(
  status: TileStatus,
  theme: ThemeMode,
  highContrast: boolean,
): string {
  if (status === 'correct') {
    return highContrast ? '🟧' : '🟩';
  }
  if (status === 'present') {
    return highContrast ? '🟦' : '🟨';
  }
  return theme === 'dark' ? '⬛' : '⬜';
}

export function buildShareGridText(params: {
  puzzleNumber: number;
  wordLength: number;
  guesses: GuessEvaluation[];
  won: boolean;
  hardMode: boolean;
  theme: ThemeMode;
  highContrast: boolean;
}): string {
  const score = params.won ? String(params.guesses.length) : 'X';
  const hardMarker = params.hardMode ? '*' : '';
  const header = `🍺 Beerle #${params.puzzleNumber} (${params.wordLength} Buchstaben) ${score}/6${hardMarker}`;

  const rows = params.guesses.map((row) =>
    row.statuses
      .map((s) => statusToEmoji(s, params.theme, params.highContrast))
      .join(''),
  );

  return `${header}\n\n${rows.join('\n')}`;
}
