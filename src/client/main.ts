import './styles/wordle.css';
import { initDiscordActivity, type DiscordActivitySession } from './discord';
import { BoardView } from './components/Board';
import { attachPhysicalKeyboard, KeyboardView } from './components/Keyboard';
import { PartySidebarView } from './components/PartySidebar';
import { BierdeckelModalView } from './components/BierdeckelModal';
import { splitGraphemes } from '../shared/normalization';
import { createInitialGameState, gameReducer, type GameState } from '../shared/state';
import { buildShareGridText, createEmptyStats } from '../shared/stats';
import type {
  DailyPuzzleResponse,
  GuessResponse,
  RoomClientMessage,
  RoomServerMessage,
} from '../shared/protocol';
import type { BeerMetadata, PlayerProgress, ThemeMode, UserStats } from '../shared/types';

const VICTORY_PRAISES = [
  'Prost! Genie!',
  'Braumeister!',
  'Starkbier!',
  'Solide!',
  'Knapp!',
  'Puh!',
];

export async function bootstrapBeerleApp(root: HTMLElement): Promise<void> {
  let theme: ThemeMode = 'dark';
  let highContrast = false;
  let isAnimating = false;
  let stats: UserStats = createEmptyStats();
  let solutionMetadata: BeerMetadata | undefined;
  let ws: WebSocket | null = null;

  root.innerHTML = `
    <div class="app-shell">
      <header class="app-header">
        <h1 class="brand-title">🍺 BEERLE</h1>
        <div class="header-actions">
          <button type="button" class="icon-btn" id="btn-hardmode" title="Schwerer Modus">Hard: Aus</button>
          <button type="button" class="icon-btn" id="btn-contrast" title="Hoher Kontrast">🎨</button>
          <button type="button" class="icon-btn" id="btn-theme" title="Design wechseln">☀️</button>
          <button type="button" class="icon-btn" id="btn-stats" title="Statistik">📊</button>
        </div>
      </header>
      <div class="toast-container" id="toast-container"></div>
      <main class="main-layout">
        <div class="game-column">
          <div class="board-wrapper"><div id="board-root"></div></div>
          <div id="keyboard-root"></div>
        </div>
        <aside id="party-root"></aside>
      </main>
      <div id="modal-root" style="display:none;"></div>
    </div>
  `;

  const toastContainer = root.querySelector('#toast-container') as HTMLElement;
  const boardRoot = root.querySelector('#board-root') as HTMLElement;
  const keyboardRoot = root.querySelector('#keyboard-root') as HTMLElement;
  const partyRoot = root.querySelector('#party-root') as HTMLElement;
  const modalRoot = root.querySelector('#modal-root') as HTMLElement;
  const hardBtn = root.querySelector('#btn-hardmode') as HTMLButtonElement;
  const contrastBtn = root.querySelector('#btn-contrast') as HTMLButtonElement;
  const themeBtn = root.querySelector('#btn-theme') as HTMLButtonElement;
  const statsBtn = root.querySelector('#btn-stats') as HTMLButtonElement;

  function showToast(message: string, durationMs = 1350): void {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastContainer.appendChild(toast);
    if (durationMs !== Infinity) {
      setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 260);
      }, durationMs);
    }
  }

  const session: DiscordActivitySession = await initDiscordActivity();
  const todayStr = new Date().toISOString().slice(0, 10);

  const puzzleRes = await fetch(`/api/puzzle?date=${todayStr}`, {
    headers: { Authorization: `Bearer ${session.sessionJwt}` },
  });
  const puzzle = (await puzzleRes.json()) as DailyPuzzleResponse;
  stats = puzzle.stats;
  solutionMetadata = puzzle.solutionMetadata;

  let state: GameState = createInitialGameState({
    puzzleNumber: puzzle.puzzleNumber,
    dateStr: puzzle.dateStr,
    wordLength: puzzle.wordLength,
    hardMode: false,
  });

  for (const prevGuess of puzzle.guesses) {
    state = gameReducer(state, { type: 'APPLY_GUESS_RESULT', evaluation: prevGuess });
  }

  const board = new BoardView(boardRoot, state.wordLength);
  const partySidebar = new PartySidebarView(partyRoot, state.wordLength);
  const partyPlayers = new Map<string, PlayerProgress>();

  function sendWs(msg: RoomClientMessage): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  // Connect WebSocket co-presence if available
  try {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/api/ws?instanceId=${encodeURIComponent(session.instanceId)}`);
    ws.addEventListener('open', () => {
      sendWs({
        type: 'JOIN',
        userId: session.user.id,
        username: session.user.username,
        avatarUrl: session.user.avatarUrl,
        rows: state.guesses.map((g) => g.statuses),
        status: state.status,
      });
    });
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data)) as RoomServerMessage;
      if (msg.type === 'ROOM_STATE') {
        partyPlayers.clear();
        for (const p of msg.players) {
          partyPlayers.set(p.userId, p);
        }
      } else if (msg.type === 'PLAYER_UPDATED') {
        partyPlayers.set(msg.player.userId, msg.player);
      } else if (msg.type === 'PLAYER_LEFT') {
        partyPlayers.delete(msg.userId);
      }
      partySidebar.render(Array.from(partyPlayers.values()));
    });
  } catch {
    // Offline/mock fallback
  }

  const modal = new BierdeckelModalView(modalRoot, {
    onCopyShare: () => {
      const text = buildShareGridText({
        puzzleNumber: state.puzzleNumber,
        wordLength: state.wordLength,
        guesses: state.guesses,
        won: state.status === 'won',
        hardMode: state.hardMode,
        theme,
        highContrast,
      });
      void navigator.clipboard?.writeText(text);
      showToast('Ergebnis kopiert!');
    },
    onChannelShare: async () => {
      if (!session.channelId) {
        return;
      }
      const text = buildShareGridText({
        puzzleNumber: state.puzzleNumber,
        wordLength: state.wordLength,
        guesses: state.guesses,
        won: state.status === 'won',
        hardMode: state.hardMode,
        theme,
        highContrast,
      });
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.sessionJwt}`,
        },
        body: JSON.stringify({
          dateStr: state.dateStr,
          channelId: session.channelId,
          shareText: text,
        }),
      });
      if (res.ok) {
        showToast('Im Kanal geteilt! 🍻');
      } else {
        const err = (await res.json()) as { message?: string };
        showToast(err.message ?? 'Teilen fehlgeschlagen');
      }
    },
    onClose: () => {},
  });

  async function submitGuess(): Promise<void> {
    if (isAnimating || state.status !== 'playing') {
      return;
    }
    const rowIndex = state.guesses.length;
    if (splitGraphemes(state.currentInput).length < state.wordLength) {
      board.triggerRowShake(rowIndex);
      showToast('Nicht genug Buchstaben');
      return;
    }

    isAnimating = true;
    let data: GuessResponse;
    try {
      const res = await fetch('/api/guess', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.sessionJwt}`,
        },
        body: JSON.stringify({
          dateStr: state.dateStr,
          guess: state.currentInput,
          hardMode: state.hardMode,
          instanceId: session.instanceId,
        }),
      });
      data = (await res.json()) as GuessResponse;
    } catch {
      isAnimating = false;
      board.triggerRowShake(rowIndex);
      showToast('Verbindungsfehler');
      return;
    }

    if (!data.valid || !data.evaluation) {
      isAnimating = false;
      board.triggerRowShake(rowIndex);
      showToast(data.error ?? 'Nicht in der Wortliste');
      return;
    }

    const evaluation = data.evaluation;
    state = gameReducer(state, { type: 'APPLY_GUESS_RESULT', evaluation });
    if (data.stats) {
      stats = data.stats;
    }
    if (data.solutionMetadata) {
      solutionMetadata = data.solutionMetadata;
    }

    sendWs({
      type: 'ROW_EVALUATED',
      userId: session.user.id,
      rows: state.guesses.map((g) => g.statuses),
      status: state.status,
    });

    board.animateRowReveal(rowIndex, evaluation.statuses, () => {
      isAnimating = false;
      keyboard.updateStates(state.keyboardStates);
      board.render(state);

      if (state.status === 'won') {
        board.triggerVictoryBounce(rowIndex);
        showToast(VICTORY_PRAISES[rowIndex] ?? 'Prost!', 1800);
        setTimeout(() => {
          modal.open({
            won: true,
            guessCount: state.guesses.length,
            stats,
            metadata: solutionMetadata,
            canChannelShare: Boolean(session.channelId),
          });
        }, 1500);
      } else if (state.status === 'lost') {
        if (solutionMetadata) {
          showToast(solutionMetadata.word, Infinity);
        }
        setTimeout(() => {
          modal.open({
            won: false,
            guessCount: state.guesses.length,
            stats,
            metadata: solutionMetadata,
            canChannelShare: Boolean(session.channelId),
          });
        }, 1500);
      }
    });
  }

  function handleKeyInput(rawKey: string): void {
    if (isAnimating || state.status !== 'playing') {
      return;
    }
    if (rawKey === 'ENTER') {
      void submitGuess();
      return;
    }
    if (rawKey === 'BACKSPACE') {
      state = gameReducer(state, { type: 'BACKSPACE' });
      board.render(state);
      sendWs({
        type: 'TYPING_PROGRESS',
        userId: session.user.id,
        typingCount: splitGraphemes(state.currentInput).length,
      });
      return;
    }
    for (const ch of splitGraphemes(rawKey)) {
      state = gameReducer(state, { type: 'TYPE_LETTER', letter: ch });
    }
    board.render(state);
    sendWs({
      type: 'TYPING_PROGRESS',
      userId: session.user.id,
      typingCount: splitGraphemes(state.currentInput).length,
    });
  }

  const keyboard = new KeyboardView(keyboardRoot, handleKeyInput);
  keyboard.updateStates(state.keyboardStates);
  board.render(state);

  attachPhysicalKeyboard(window, handleKeyInput);

  hardBtn.addEventListener('click', () => {
    if (state.guesses.length > 0) {
      showToast('Hard Mode nur vor dem 1. Versuch umschaltbar');
      return;
    }
    state = gameReducer(state, { type: 'TOGGLE_HARD_MODE' });
    hardBtn.textContent = state.hardMode ? 'Hard: An' : 'Hard: Aus';
  });

  themeBtn.addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
  });

  contrastBtn.addEventListener('click', () => {
    highContrast = !highContrast;
    document.documentElement.setAttribute('data-high-contrast', String(highContrast));
  });

  statsBtn.addEventListener('click', () => {
    modal.open({
      won: state.status === 'won',
      guessCount: state.guesses.length,
      stats,
      metadata: solutionMetadata,
      canChannelShare: Boolean(session.channelId) && state.status !== 'playing',
    });
  });

  if (state.status !== 'playing') {
    modal.open({
      won: state.status === 'won',
      guessCount: state.guesses.length,
      stats,
      metadata: solutionMetadata,
      canChannelShare: Boolean(session.channelId),
    });
  }
}

if (typeof document !== 'undefined') {
  const appEl = document.getElementById('app');
  if (appEl) {
    void bootstrapBeerleApp(appEl);
  }
}
