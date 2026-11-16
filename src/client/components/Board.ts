import { splitGraphemes } from '../../shared/normalization';
import { MAX_GUESSES, type GameState } from '../../shared/state';
import type { TileStatus } from '../../shared/types';

export class BoardView {
  private readonly root: HTMLElement;
  private wordLength: number;
  private rowEls: HTMLElement[] = [];
  private tileEls: HTMLElement[][] = [];

  constructor(container: HTMLElement, wordLength: number) {
    this.root = container;
    this.wordLength = wordLength;
    this.buildGrid();
  }

  setWordLength(wordLength: number): void {
    if (this.wordLength !== wordLength) {
      this.wordLength = wordLength;
      this.buildGrid();
    }
  }

  private buildGrid(): void {
    this.root.innerHTML = '';
    this.root.className = 'board-grid';
    this.root.style.setProperty('--cols', String(this.wordLength));
    this.rowEls = [];
    this.tileEls = [];

    for (let r = 0; r < MAX_GUESSES; r++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'board-row';
      const rowTiles: HTMLElement[] = [];

      for (let c = 0; c < this.wordLength; c++) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.setAttribute('data-state', 'empty');
        rowEl.appendChild(tile);
        rowTiles.push(tile);
      }

      this.root.appendChild(rowEl);
      this.rowEls.push(rowEl);
      this.tileEls.push(rowTiles);
    }
  }

  render(state: GameState): void {
    this.setWordLength(state.wordLength);

    for (let r = 0; r < MAX_GUESSES; r++) {
      const rowEl = this.rowEls[r];
      const evaluated = state.guesses[r];

      if (evaluated) {
        const chars = splitGraphemes(evaluated.guess);
        rowEl.classList.toggle('beer-hit', evaluated.isBeerTerm);
        for (let c = 0; c < state.wordLength; c++) {
          const tile = this.tileEls[r][c];
          tile.textContent = chars[c] ?? '';
          tile.setAttribute('data-state', evaluated.statuses[c] ?? 'absent');
        }
      } else if (r === state.guesses.length) {
        const chars = splitGraphemes(state.currentInput);
        rowEl.classList.remove('beer-hit');
        for (let c = 0; c < state.wordLength; c++) {
          const tile = this.tileEls[r][c];
          const ch = chars[c] ?? '';
          tile.textContent = ch;
          tile.setAttribute('data-state', ch ? 'tbd' : 'empty');
        }
      } else {
        rowEl.classList.remove('beer-hit');
        for (let c = 0; c < state.wordLength; c++) {
          const tile = this.tileEls[r][c];
          tile.textContent = '';
          tile.setAttribute('data-state', 'empty');
        }
      }
    }
  }

  triggerRowShake(rowIndex: number): void {
    const rowEl = this.rowEls[rowIndex];
    if (!rowEl) {
      return;
    }
    rowEl.classList.remove('shake');
    // Force reflow so rapid repeated invalid guesses re-trigger animation
    void rowEl.offsetWidth;
    rowEl.classList.add('shake');
    setTimeout(() => rowEl.classList.remove('shake'), 620);
  }

  /**
   * Animates a submitted row with sequential 3D FlipIn rotations, swapping
   * each tile's data-state at the exact 250ms 90deg midpoint.
   */
  animateRowReveal(
    rowIndex: number,
    statuses: TileStatus[],
    onComplete: () => void,
  ): void {
    const tiles = this.tileEls[rowIndex];
    if (!tiles) {
      onComplete();
      return;
    }

    const staggerMs = Math.min(300, Math.floor(1500 / this.wordLength));
    let completed = 0;

    tiles.forEach((tile, colIndex) => {
      const delay = colIndex * staggerMs;
      setTimeout(() => {
        tile.classList.add('flip');
        setTimeout(() => {
          tile.setAttribute('data-state', statuses[colIndex] ?? 'absent');
        }, 250);
        setTimeout(() => {
          tile.classList.remove('flip');
          completed += 1;
          if (completed === tiles.length) {
            onComplete();
          }
        }, 500);
      }, delay);
    });
  }

  triggerVictoryBounce(rowIndex: number): void {
    const tiles = this.tileEls[rowIndex];
    if (!tiles) {
      return;
    }
    tiles.forEach((tile, colIndex) => {
      setTimeout(() => {
        tile.classList.add('bounce');
        setTimeout(() => tile.classList.remove('bounce'), 1050);
      }, colIndex * 100);
    });
  }
}
