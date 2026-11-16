import { normalizeInputKey } from '../../shared/normalization';
import type { KeyStatus } from '../../shared/types';

export const GERMAN_QWERTZ_ROWS: readonly (readonly string[])[] = [
  ['Q', 'W', 'E', 'R', 'T', 'Z', 'U', 'I', 'O', 'P', 'Ü'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ö', 'Ä'],
  ['ENTER', 'Y', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE'],
];

export class KeyboardView {
  private readonly root: HTMLElement;
  private readonly keyButtons = new Map<string, HTMLButtonElement>();

  constructor(container: HTMLElement, onKey: (key: string) => void) {
    this.root = container;
    this.root.className = 'keyboard-container';
    this.root.innerHTML = '';

    for (const row of GERMAN_QWERTZ_ROWS) {
      const rowEl = document.createElement('div');
      rowEl.className = 'keyboard-row';

      for (const key of row) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = key === 'ENTER' || key === 'BACKSPACE' ? 'key-btn wide' : 'key-btn';
        btn.setAttribute('data-key', key);
        btn.setAttribute('data-state', 'default');
        btn.textContent = key === 'BACKSPACE' ? '⌫' : key;
        btn.addEventListener('click', () => onKey(key));
        rowEl.appendChild(btn);
        this.keyButtons.set(key, btn);
      }

      this.root.appendChild(rowEl);
    }
  }

  updateStates(states: Record<string, KeyStatus>): void {
    for (const [key, btn] of this.keyButtons.entries()) {
      if (key === 'ENTER' || key === 'BACKSPACE') {
        continue;
      }
      btn.setAttribute('data-state', states[key] ?? 'default');
    }
  }
}

/**
 * Attaches a physical keyboard listener that normalizes A-Z, Ä/Ö/Ü, ß -> SS,
 * Enter, and Backspace, returning a cleanup function.
 */
export function attachPhysicalKeyboard(
  target: EventTarget,
  onKey: (key: string) => void,
): () => void {
  const handler = (event: Event) => {
    const e = event as KeyboardEvent;
    if (e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }
    if (e.key === 'Enter') {
      onKey('ENTER');
      return;
    }
    if (e.key === 'Backspace') {
      onKey('BACKSPACE');
      return;
    }
    const normalized = normalizeInputKey(e.key);
    if (normalized) {
      onKey(normalized);
    }
  };
  target.addEventListener('keydown', handler);
  return () => target.removeEventListener('keydown', handler);
}
