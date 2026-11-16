import type {
  BeerMetadata,
  GameStatus,
  GuessEvaluation,
  PlayerProgress,
  TileStatus,
  UserStats,
} from './types';

export interface TokenExchangeResponse {
  access_token: string;
  sessionJwt: string;
  user: {
    id: string;
    username: string;
    avatarUrl: string | null;
  };
}

export interface DailyPuzzleResponse {
  puzzleNumber: number;
  dateStr: string;
  wordLength: number;
  guesses: GuessEvaluation[];
  status: GameStatus;
  stats: UserStats;
  /** Only populated once status is 'won' or 'lost' */
  solutionMetadata?: BeerMetadata;
}

export interface GuessRequest {
  dateStr: string;
  guess: string;
  hardMode: boolean;
  instanceId?: string;
}

export interface GuessResponse {
  valid: boolean;
  error?: string;
  evaluation?: GuessEvaluation;
  status: GameStatus;
  stats?: UserStats;
  solutionMetadata?: BeerMetadata;
}

export interface ShareRequest {
  dateStr: string;
  channelId: string;
  shareText: string;
}

export interface ShareResponse {
  ok: boolean;
  message?: string;
}

export type RoomClientMessage =
  | {
      type: 'JOIN';
      userId: string;
      username: string;
      avatarUrl: string | null;
      rows: TileStatus[][];
      status: GameStatus;
    }
  | {
      type: 'TYPING_PROGRESS';
      userId: string;
      typingCount: number;
    }
  | {
      type: 'ROW_EVALUATED';
      userId: string;
      rows: TileStatus[][];
      status: GameStatus;
    };

export type RoomServerMessage =
  | {
      type: 'ROOM_STATE';
      players: PlayerProgress[];
    }
  | {
      type: 'PLAYER_UPDATED';
      player: PlayerProgress;
    }
  | {
      type: 'PLAYER_LEFT';
      userId: string;
    };
