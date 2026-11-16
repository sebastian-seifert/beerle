import { MAX_GUESSES } from '../../shared/state';
import type { PlayerProgress } from '../../shared/types';

export class PartySidebarView {
  private readonly root: HTMLElement;
  private wordLength: number;

  constructor(container: HTMLElement, wordLength: number) {
    this.root = container;
    this.root.className = 'party-sidebar';
    this.wordLength = wordLength;
  }

  setWordLength(wordLength: number): void {
    this.wordLength = wordLength;
  }

  render(players: PlayerProgress[]): void {
    this.root.innerHTML = '';

    const title = document.createElement('h2');
    title.className = 'party-title';
    title.textContent = `Stammtisch (${players.length})`;
    this.root.appendChild(title);

    for (const player of players) {
      const card = document.createElement('div');
      card.className = 'party-card';

      const userRow = document.createElement('div');
      userRow.className = 'party-user';

      if (player.avatarUrl) {
        const img = document.createElement('img');
        img.className = 'party-avatar';
        img.src = player.avatarUrl;
        img.alt = player.username;
        userRow.appendChild(img);
      }

      const nameSpan = document.createElement('span');
      nameSpan.textContent =
        player.status === 'won'
          ? `${player.username} 🍻`
          : player.status === 'lost'
            ? `${player.username} ✖`
            : player.username;
      userRow.appendChild(nameSpan);
      card.appendChild(userRow);

      const grid = document.createElement('div');
      grid.className = 'mini-grid';

      for (let r = 0; r < MAX_GUESSES; r++) {
        const rowEl = document.createElement('div');
        rowEl.className = 'mini-row';
        const evaluatedRow = player.rows[r];

        for (let c = 0; c < this.wordLength; c++) {
          const tile = document.createElement('div');
          tile.className = 'mini-tile';
          if (evaluatedRow) {
            tile.setAttribute('data-state', evaluatedRow[c] ?? 'absent');
          } else if (r === player.rows.length && c < player.typingCount) {
            tile.setAttribute('data-state', 'tbd');
          } else {
            tile.setAttribute('data-state', 'empty');
          }
          rowEl.appendChild(tile);
        }

        grid.appendChild(rowEl);
      }

      card.appendChild(grid);
      this.root.appendChild(card);
    }
  }
}
