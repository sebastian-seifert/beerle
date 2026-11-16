/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { PartySidebarView } from '../src/client/components/PartySidebar';
import { BierdeckelModalView } from '../src/client/components/BierdeckelModal';
import { createEmptyStats, recordGameOutcome } from '../src/shared/stats';
import type { BeerMetadata, PlayerProgress } from '../src/shared/types';

describe('Party Sidebar, Bierdeckel Modal & App Integration', () => {
  it('renders spoiler-free participant mini-grids without any letter text', () => {
    const container = document.createElement('aside');
    const sidebar = new PartySidebarView(container, 5);

    const players: PlayerProgress[] = [
      {
        userId: 'u1',
        username: 'Hopfen',
        avatarUrl: null,
        rows: [['absent', 'correct', 'present', 'absent', 'absent']],
        typingCount: 3,
        status: 'playing',
      },
    ];

    sidebar.render(players);

    expect(container.textContent).toContain('Hopfen');
    const tiles = container.querySelectorAll('.mini-tile');
    expect(tiles.length).toBe(30); // 6 rows x 5 cols
    expect(tiles[1].getAttribute('data-state')).toBe('correct');
    expect(tiles[2].getAttribute('data-state')).toBe('present');
    // Row 1 has 3 tbd typing-progress tiles
    expect(tiles[5].getAttribute('data-state')).toBe('tbd');
    expect(tiles[7].getAttribute('data-state')).toBe('tbd');
    expect(tiles[8].getAttribute('data-state')).toBe('empty');
    // Ensure zero letters leaked into mini-tiles
    for (const tile of Array.from(tiles)) {
      expect(tile.textContent).toBe('');
    }
  });

  it('renders the Digitaler Bierdeckel card, stats bar chart, and triggers share callbacks', () => {
    const container = document.createElement('div');
    const onCopyShare = vi.fn();
    const onChannelShare = vi.fn();
    const onClose = vi.fn();

    const modal = new BierdeckelModalView(container, {
      onCopyShare,
      onChannelShare,
      onClose,
    });

    const stats = recordGameOutcome(createEmptyStats(), {
      dateStr: '2026-11-16',
      won: true,
      guessCount: 2,
    });

    const metadata: BeerMetadata = {
      word: 'JEVER',
      displayName: 'Jever Pilsener',
      brewery: 'Friesisches Brauhaus zu Jever',
      origin: 'Jever, Niedersachsen',
      style: 'Friesisch-herbes Pilsener',
      foundedYear: 1848,
      abv: '4,9 % vol.',
      funFact: 'Bekannt für seine friesisch-herbe Note.',
    };

    modal.open({
      won: true,
      guessCount: 2,
      stats,
      metadata,
      canChannelShare: true,
    });

    expect(container.textContent).toContain('Jever Pilsener');
    expect(container.textContent).toContain('Friesisches Brauhaus zu Jever');
    expect(container.textContent).toContain('1848');
    expect(container.querySelector('.dist-bar.highlight')).toBeTruthy();

    (container.querySelector('[data-action="copy-share"]') as HTMLButtonElement).click();
    expect(onCopyShare).toHaveBeenCalledTimes(1);

    (container.querySelector('[data-action="channel-share"]') as HTMLButtonElement).click();
    expect(onChannelShare).toHaveBeenCalledTimes(1);
  });
});
