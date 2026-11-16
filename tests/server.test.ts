import { describe, expect, it } from 'vitest';
import { createServerApp } from '../src/server/index';
import { BeerleRoomState } from '../src/server/room-do';
import type { RoomClientMessage } from '../src/shared/protocol';

describe('Cloudflare Worker API & D1/DO co-presence', () => {
  it('issues a session JWT on /api/token in local dev mode and serves daily puzzle without leaking target word', async () => {
    const app = createServerApp();

    const tokenRes = await app.fetch(
      new Request('http://localhost/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'local-dev-mock' }),
      }),
    );
    expect(tokenRes.status).toBe(200);
    const tokenJson = (await tokenRes.json()) as {
      sessionJwt: string;
      user: { id: string; username: string };
    };
    expect(tokenJson.sessionJwt).toBeTruthy();

    const puzzleRes = await app.fetch(
      new Request('http://localhost/api/puzzle?date=2026-11-16', {
        headers: { Authorization: `Bearer ${tokenJson.sessionJwt}` },
      }),
    );
    expect(puzzleRes.status).toBe(200);
    const puzzleJson = (await puzzleRes.json()) as {
      puzzleNumber: number;
      wordLength: number;
      solutionMetadata?: unknown;
    };
    expect(puzzleJson.puzzleNumber).toBeGreaterThan(0);
    expect(puzzleJson.wordLength).toBeGreaterThanOrEqual(4);
    expect(puzzleJson.solutionMetadata).toBeUndefined();
  });

  it('evaluates guesses server-side, rejects invalid words, and reveals metadata only on win/loss', async () => {
    const app = createServerApp();
    const tokenRes = await app.fetch(
      new Request('http://localhost/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'local-dev-mock' }),
      }),
    );
    const { sessionJwt } = (await tokenRes.json()) as { sessionJwt: string };

    // Invalid word
    const badRes = await app.fetch(
      new Request('http://localhost/api/guess', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionJwt}`,
        },
        body: JSON.stringify({
          dateStr: '2026-11-16',
          guess: 'ZZZZZZZZZZ',
          hardMode: false,
        }),
      }),
    );
    expect(badRes.status).toBe(400);
    const badJson = (await badRes.json()) as { valid: boolean; error: string };
    expect(badJson.valid).toBe(false);
    expect(badJson.error).toBeTruthy();
  });

  it('rate-limits /api/share to one post per user per daily puzzle', async () => {
    const app = createServerApp();
    const tokenRes = await app.fetch(
      new Request('http://localhost/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'local-dev-mock' }),
      }),
    );
    const { sessionJwt } = (await tokenRes.json()) as { sessionJwt: string };

    const share1 = await app.fetch(
      new Request('http://localhost/api/share', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionJwt}`,
        },
        body: JSON.stringify({
          dateStr: '2026-11-16',
          channelId: 'chan-1',
          shareText: '🍺 Beerle #320 2/6',
        }),
      }),
    );
    expect(share1.status).toBe(200);

    const share2 = await app.fetch(
      new Request('http://localhost/api/share', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionJwt}`,
        },
        body: JSON.stringify({
          dateStr: '2026-11-16',
          channelId: 'chan-1',
          shareText: '🍺 Beerle #320 2/6',
        }),
      }),
    );
    expect(share2.status).toBe(429);
  });

  it('broadcasts masked spoiler-free color rows in BeerleRoomState without letters', () => {
    const room = new BeerleRoomState();
    const joinMsg: RoomClientMessage = {
      type: 'JOIN',
      userId: 'u1',
      username: 'Hopfen',
      avatarUrl: null,
      rows: [],
      status: 'playing',
    };
    const joinEvent = room.applyMessage(joinMsg);
    expect(joinEvent?.type).toBe('PLAYER_UPDATED');

    const rowEvent = room.applyMessage({
      type: 'ROW_EVALUATED',
      userId: 'u1',
      rows: [['absent', 'correct', 'present', 'absent', 'absent']],
      status: 'playing',
    });
    expect(rowEvent).toEqual({
      type: 'PLAYER_UPDATED',
      player: {
        userId: 'u1',
        username: 'Hopfen',
        avatarUrl: null,
        rows: [['absent', 'correct', 'present', 'absent', 'absent']],
        typingCount: 0,
        status: 'playing',
      },
    });
  });
});
