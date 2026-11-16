import { computeDistributionRatios, computeWinPercentage } from '../../shared/stats';
import type { BeerMetadata, UserStats } from '../../shared/types';

export interface BierdeckelModalCallbacks {
  onCopyShare: () => void;
  onChannelShare: () => void;
  onClose: () => void;
}

export class BierdeckelModalView {
  private readonly root: HTMLElement;
  private readonly callbacks: BierdeckelModalCallbacks;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  constructor(container: HTMLElement, callbacks: BierdeckelModalCallbacks) {
    this.root = container;
    this.callbacks = callbacks;
  }

  close(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.root.innerHTML = '';
    this.root.style.display = 'none';
  }

  open(params: {
    won: boolean;
    guessCount: number;
    stats: UserStats;
    metadata?: BeerMetadata;
    canChannelShare: boolean;
  }): void {
    this.close();
    this.root.style.display = 'flex';
    this.root.className = 'modal-backdrop';

    const card = document.createElement('div');
    card.className = 'modal-card';

    // Header
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';

    const heading = document.createElement('h2');
    heading.style.margin = '0';
    heading.style.fontSize = '1.2rem';
    heading.textContent = params.won ? '🍻 Prost! Gelöst' : '🍺 Nächstes Mal!';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'icon-btn';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => {
      this.close();
      this.callbacks.onClose();
    });

    header.appendChild(heading);
    header.appendChild(closeBtn);
    card.appendChild(header);

    // Digitaler Bierdeckel
    if (params.metadata) {
      const deckel = document.createElement('div');
      deckel.className = 'bierdeckel-card';

      const title = document.createElement('strong');
      title.style.fontSize = '1.05rem';
      title.textContent = params.metadata.displayName;

      const brewery = document.createElement('div');
      brewery.style.fontSize = '0.88rem';
      brewery.textContent = `${params.metadata.brewery} • ${params.metadata.origin}`;

      const details = document.createElement('div');
      details.style.fontSize = '0.82rem';
      details.style.color = 'var(--color-muted)';
      const year = params.metadata.foundedYear ? `Gegr. ${params.metadata.foundedYear} • ` : '';
      details.textContent = `${params.metadata.style} • ${year}${params.metadata.abv}`;

      const fact = document.createElement('p');
      fact.style.margin = '6px 0 0 0';
      fact.style.fontSize = '0.84rem';
      fact.textContent = params.metadata.funFact;

      deckel.appendChild(title);
      deckel.appendChild(brewery);
      deckel.appendChild(details);
      deckel.appendChild(fact);
      card.appendChild(deckel);
    }

    // Stats Summary
    const statsRow = document.createElement('div');
    statsRow.className = 'stats-row';
    const metrics: Array<[string, string | number]> = [
      ['Gespielt', params.stats.played],
      ['Siege %', computeWinPercentage(params.stats)],
      ['Serie', params.stats.currentStreak],
      ['Max Serie', params.stats.maxStreak],
    ];
    for (const [label, val] of metrics) {
      const cell = document.createElement('div');
      const v = document.createElement('div');
      v.className = 'stat-value';
      v.textContent = String(val);
      const l = document.createElement('div');
      l.className = 'stat-label';
      l.textContent = label;
      cell.appendChild(v);
      cell.appendChild(l);
      statsRow.appendChild(cell);
    }
    card.appendChild(statsRow);

    // Distribution Bar Chart
    const ratios = computeDistributionRatios(params.stats);
    const distWrap = document.createElement('div');
    distWrap.style.display = 'flex';
    distWrap.style.flexDirection = 'column';
    distWrap.style.gap = '4px';

    for (let i = 1; i <= 6; i++) {
      const row = document.createElement('div');
      row.className = 'dist-bar-row';
      const label = document.createElement('span');
      label.textContent = String(i);
      const bar = document.createElement('div');
      const isHighlight = params.won && params.guessCount === i;
      bar.className = isHighlight ? 'dist-bar highlight' : 'dist-bar';
      const pct = Math.max(7, Math.round((ratios[i] ?? 0) * 100));
      bar.style.width = `${pct}%`;
      bar.textContent = String(params.stats.distribution[i] ?? 0);
      row.appendChild(label);
      row.appendChild(bar);
      distWrap.appendChild(row);
    }
    card.appendChild(distWrap);

    // Countdown + Share Actions
    const countdown = document.createElement('div');
    countdown.style.fontSize = '0.82rem';
    countdown.style.textAlign = 'center';
    countdown.style.color = 'var(--color-muted)';
    const updateCountdown = () => {
      const now = new Date();
      const nextMidnight = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
      );
      const sec = Math.max(0, Math.floor((nextMidnight - now.getTime()) / 1000));
      const hh = String(Math.floor(sec / 3600)).padStart(2, '0');
      const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      countdown.textContent = `Nächstes Beerle in ${hh}:${mm}:${ss}`;
    };
    updateCountdown();
    this.countdownTimer = setInterval(updateCountdown, 1000);
    card.appendChild(countdown);

    const actions = document.createElement('div');
    actions.className = 'share-actions';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'primary-btn';
    copyBtn.setAttribute('data-action', 'copy-share');
    copyBtn.textContent = 'Teilen 📋';
    copyBtn.addEventListener('click', () => this.callbacks.onCopyShare());
    actions.appendChild(copyBtn);

    if (params.canChannelShare) {
      const chanBtn = document.createElement('button');
      chanBtn.type = 'button';
      chanBtn.className = 'primary-btn';
      chanBtn.setAttribute('data-action', 'channel-share');
      chanBtn.textContent = 'In Kanal posten 💬';
      chanBtn.addEventListener('click', () => this.callbacks.onChannelShare());
      actions.appendChild(chanBtn);
    }

    card.appendChild(actions);
    this.root.appendChild(card);
  }
}
