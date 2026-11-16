import { describe, expect, it, vi } from 'vitest';
import { initDiscordActivity } from '../src/client/discord';

describe('Discord Embedded SDK wrapper & mock provider', () => {
  it('uses mock mode when frame_id is absent and exchanges OAuth/session via fetcher', async () => {
    const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/token') {
        expect(init?.method).toBe('POST');
        return new Response(
          JSON.stringify({
            access_token: 'mock-access-token',
            sessionJwt: 'mock-jwt-token',
            user: {
              id: 'user-123',
              username: 'Braumeister',
              avatarUrl: null,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('Not found', { status: 404 });
    });

    const session = await initDiscordActivity({
      search: '',
      clientId: 'test-client-id',
      fetcher: mockFetch,
    });

    expect(session.isEmbedded).toBe(false);
    expect(session.platform).toBe('desktop');
    expect(session.instanceId).toBe('local-dev-instance');
    expect(session.sessionJwt).toBe('mock-jwt-token');
    expect(session.user.username).toBe('Braumeister');
    expect(session.canOpenShareMomentDialog).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('detects mobile platform restrictions for openShareMomentDialog', async () => {
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          access_token: 'tok',
          sessionJwt: 'jwt',
          user: { id: 'u1', username: 'Hopfen', avatarUrl: null },
        }),
        { status: 200 },
      ),
    );

    const session = await initDiscordActivity({
      search: '',
      clientId: 'test-client-id',
      platformOverride: 'mobile',
      fetcher: mockFetch,
    });

    expect(session.platform).toBe('mobile');
    expect(session.canOpenShareMomentDialog).toBe(false);
  });
});
