import { mergeKeyboardStates } from './engine';
import { splitGraphemes } from './normalization';
import type { GameStatus, GuessEvaluation, KeyStatus } from './types';

export const MAX_GUESSES = 6;

export interface GameState {
  puzzleNumber: number;
  dateStr: string;
  wordLength: number;
  hardMode: boolean;
  guesses: GuessEvaluation[];
  currentInput: string;
  status: GameStatus;
  keyboardStates: Record<string, KeyStatus>;
}

export type GameAction =
  | { type: 'TYPE_LETTER'; letter: string }
  | { type: 'BACKSPACE' }
  | { type: 'APPLY_GUESS_RESULT'; evaluation: GuessEvaluation }
  | { type: 'TOGGLE_HARD_MODE' }
  | { type: 'HYDRATE'; state: GameState };

export function createInitialGameState(params: {
  puzzleNumber: number;
  dateStr: string;
  wordLength: number;
  hardMode: boolean;
}): GameState {
  return {
    puzzleNumber: params.puzzleNumber,
    dateStr: params.dateStr,
    wordLength: params.wordLength,
    hardMode: params.hardMode,
    guesses: [],
    currentInput: '',
    status: 'playing',
    keyboardStates: {},
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'HYDRATE':
      return action.state;

    case 'TYPE_LETTER': {
      if (state.status !== 'playing') {
        return state;
      }
      const currentChars = splitGraphemes(state.currentInput);
      const addedChars = splitGraphemes(action.letter);
      if (currentChars.length + addedChars.length > state.wordLength) {
        return state;
      }
      return {
        ...state,
        currentInput: state.currentInput + action.letter,
      };
    }

    case 'BACKSPACE': {
      if (state.status !== 'playing' || state.currentInput.length === 0) {
        return state;
      }
      const chars = splitGraphemes(state.currentInput);
      chars.pop();
      return {
        ...state,
        currentInput: chars.join(''),
      };
    }

    case 'TOGGLE_HARD_MODE': {
      if (state.guesses.length > 0) {
        return state;
      }
      return {
        ...state,
        hardMode: !state.hardMode,
      };
    }

    case 'APPLY_GUESS_RESULT': {
      if (state.status !== 'playing') {
        return state;
      }
      const nextGuesses = [...state.guesses, action.evaluation];
      const won = action.evaluation.statuses.every((s) => s === 'correct');
      const nextStatus: GameStatus = won
        ? 'won'
        : nextGuesses.length >= MAX_GUESSES
          ? 'lost'
          : 'playing';

      const nextKeyboardStates = mergeKeyboardStates(
        state.keyboardStates,
        action.evaluation.guess,
        action.evaluation.statuses,
      );

      return {
        ...state,
        guesses: nextGuesses,
        currentInput: '',
        status: nextStatus,
        keyboardStates: nextKeyboardStates,
      };
    }
  }
}
