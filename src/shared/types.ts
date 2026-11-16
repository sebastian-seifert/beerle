export type TileStatus = 'empty' | 'tbd' | 'correct' | 'present' | 'absent';

export type KeyStatus = 'default' | 'correct' | 'present' | 'absent';

export type GameStatus = 'playing' | 'won' | 'lost';

export type ThemeMode = 'dark' | 'light';

export interface BeerMetadata {
  /** Canonical normalized puzzle word (e.g. "BECKS", "KÖLSCH", "AUGUSTINER") */
  word: string;
  /** Display name with original punctuation/casing (e.g. "Beck's", "Augustiner-Bräu") */
  displayName: string;
  /** Official brewery name */
  brewery: string;
  /** City and Bundesland (e.g. "Bremen", "München, Bayern") */
  origin: string;
  /** Primary beer style */
  style: string;
  /** Founding year or historical note */
  foundedYear: number | null;
  /** Alcohol by volume (e.g. "4,9 % vol.") */
  abv: string;
  /** Short cultural trivia shown on the post-game Bierdeckel card */
  funFact: string;
}

export interface GuessEvaluation {
  guess: string;
  statuses: TileStatus[];
  isBeerTerm: boolean;
}

export interface UserStats {
  played: number;
  wins: number;
  currentStreak: number;
  maxStreak: number;
  /** 1-indexed keys "1".."6" */
  distribution: Record<number, number>;
  lastPlayedDate: string | null;
  lastWonDate: string | null;
}

export interface PlayerProgress {
  userId: string;
  username: string;
  avatarUrl: string | null;
  rows: TileStatus[][];
  typingCount: number;
  status: GameStatus;
}
