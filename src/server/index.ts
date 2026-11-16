import { DAILY_BEER_SOLUTIONS, validateGuessWord } from '../shared/dictionary';
import {
  evaluateGuess,
  getDailyPuzzleIndex,
  getDailyPuzzleNumber,
  validateHardMode,
} from '../shared/engine';
import { normalizeBeerString, splitGraphemes } from '../shared/normalization';
import type {
  DailyPuzzleResponse,
  GuessRequest,
  GuessResponse,
  ShareRequest,
  ShareResponse,
  TokenExchangeResponse,
} from '../shared/protocol';
import { createEmptyStats, recordGameOutcome } from '../shared/stats';
import type { GameStatus, GuessEvaluation, UserStats } from '../shared/types';
import { BeerleRoomDO } from './room-do';

export { BeerleRoomDO };

export interface Env {
  DB?: D1Database;
  ROOMS?: DurableObjectNamespace;
  ASSETS?: Fetcher;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_BOT_TOKEN?: string;
  JWT_SECRET?: string;
}

interface StoredDailyGame {
  guesses: GuessEvaluation[];
  status: GameStatus;
  shared: boolean;
}

interface SessionPayload {
  sub: string;
  username: string;
  avatarUrl: string | null;
  exp: number;
}

const DEFAULT_DEV_SECRET = 'beerle-local-dev-secret-change-in-prod';

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array<ArrayBuffer> {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function signJwt(payload: SessionPayload, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signingInput));
  return `${signingInput}.${base64UrlEncode(new Uint8Array(sig))}`;
}

async function verifyJwt(token: string, secret: string): Promise<SessionPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [headerB64, payloadB64, sigB64] = parts;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlDecode(sigB64),
    enc.encode(`${headerB64}.${payloadB64}`),
  );
  if (!valid) {
    return null;
  }
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64))) as SessionPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getTodayUtcDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createServerApp() {
  // In-memory fallback store for unit tests & local dev without D1
  const memoryGames = new Map<string, StoredDailyGame>();
  const memoryStats = new Map<string, UserStats>();

  async function getGame(env: Env, userId: string, dateStr: string): Promise<StoredDailyGame> {
    if (env.DB) {
      const row = await env.DB.prepare(
        'SELECT guesses_json, status, shared FROM daily_games WHERE user_id = ? AND puzzle_date = ?',
      )
        .bind(userId, dateStr)
        .first<{ guesses_json: string; status: GameStatus; shared: number }>();

      if (row) {
        return {
          guesses: JSON.parse(row.guesses_json) as GuessEvaluation[],
          status: row.status,
          shared: row.shared === 1,
        };
      }
      return { guesses: [], status: 'playing', shared: false };
    }

    return memoryGames.get(`${userId}:${dateStr}`) ?? {
      guesses: [],
      status: 'playing',
      shared: false,
    };
  }

  async function saveGame(
    env: Env,
    userId: string,
    dateStr: string,
    game: StoredDailyGame,
  ): Promise<void> {
    if (env.DB) {
      await env.DB.prepare(
        `INSERT INTO daily_games (user_id, puzzle_date, guesses_json, status, shared, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id, puzzle_date) DO UPDATE SET
           guesses_json = excluded.guesses_json,
           status = excluded.status,
           shared = excluded.shared,
           updated_at = CURRENT_TIMESTAMP`,
      )
        .bind(userId, dateStr, JSON.stringify(game.guesses), game.status, game.shared ? 1 : 0)
        .run();
      return;
    }
    memoryGames.set(`${userId}:${dateStr}`, game);
  }

  async function getStats(env: Env, userId: string): Promise<UserStats> {
    if (env.DB) {
      const row = await env.DB.prepare(
        `SELECT played, wins, current_streak, max_streak,
                dist_1, dist_2, dist_3, dist_4, dist_5, dist_6,
                last_played_date, last_won_date
         FROM users WHERE id = ?`,
      )
        .bind(userId)
        .first<{
          played: number;
          wins: number;
          current_streak: number;
          max_streak: number;
          dist_1: number;
          dist_2: number;
          dist_3: number;
          dist_4: number;
          dist_5: number;
          dist_6: number;
          last_played_date: string | null;
          last_won_date: string | null;
        }>();

      if (row) {
        return {
          played: row.played,
          wins: row.wins,
          currentStreak: row.current_streak,
          maxStreak: row.max_streak,
          distribution: {
            1: row.dist_1,
            2: row.dist_2,
            3: row.dist_3,
            4: row.dist_4,
            5: row.dist_5,
            6: row.dist_6,
          },
          lastPlayedDate: row.last_played_date,
          lastWonDate: row.last_won_date,
        };
      }
      return createEmptyStats();
    }
    return memoryStats.get(userId) ?? createEmptyStats();
  }

  async function saveStats(
    env: Env,
    userId: string,
    username: string,
    avatarUrl: string | null,
    stats: UserStats,
  ): Promise<void> {
    if (env.DB) {
      await env.DB.prepare(
        `INSERT INTO users (
           id, username, avatar_url, played, wins, current_streak, max_streak,
           dist_1, dist_2, dist_3, dist_4, dist_5, dist_6, last_played_date, last_won_date
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           username = excluded.username,
           avatar_url = excluded.avatar_url,
           played = excluded.played,
           wins = excluded.wins,
           current_streak = excluded.current_streak,
           max_streak = excluded.max_streak,
           dist_1 = excluded.dist_1,
           dist_2 = excluded.dist_2,
           dist_3 = excluded.dist_3,
           dist_4 = excluded.dist_4,
           dist_5 = excluded.dist_5,
           dist_6 = excluded.dist_6,
           last_played_date = excluded.last_played_date,
           last_won_date = excluded.last_won_date,
           updated_at = CURRENT_TIMESTAMP`,
      )
        .bind(
          userId,
          username,
          avatarUrl,
          stats.played,
          stats.wins,
          stats.currentStreak,
          stats.maxStreak,
          stats.distribution[1] ?? 0,
          stats.distribution[2] ?? 0,
          stats.distribution[3] ?? 0,
          stats.distribution[4] ?? 0,
          stats.distribution[5] ?? 0,
          stats.distribution[6] ?? 0,
          stats.lastPlayedDate,
          stats.lastWonDate,
        )
        .run();
      return;
    }
    memoryStats.set(userId, stats);
  }

  return {
    async fetch(request: Request, env: Env = {}): Promise<Response> {
      const url = new URL(request.url);
      const secret = env.JWT_SECRET ?? DEFAULT_DEV_SECRET;

      // 1. OAuth2 Token Exchange (/api/token)
      if (url.pathname === '/api/token' && request.method === 'POST') {
        const body = (await request.json()) as { code?: string };
        if (!body.code) {
          return jsonResponse({ error: 'Missing code' }, 400);
        }

        let accessToken = 'local-dev-token';
        let user = {
          id: 'local-dev-user',
          username: 'Braumeister',
          avatarUrl: null as string | null,
        };

        const hasDiscordOAuth = Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET);
        if (hasDiscordOAuth) {
          if (body.code === 'local-dev-mock') {
            return jsonResponse({ error: 'Mock login disabled in production' }, 401);
          }
          const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: env.DISCORD_CLIENT_ID!,
              client_secret: env.DISCORD_CLIENT_SECRET!,
              grant_type: 'authorization_code',
              code: body.code,
            }),
          });

          if (!tokenRes.ok) {
            return jsonResponse({ error: 'Discord OAuth exchange failed' }, 401);
          }

          const tokenJson = (await tokenRes.json()) as { access_token: string };
          accessToken = tokenJson.access_token;

          const meRes = await fetch('https://discord.com/api/v10/users/@me', {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!meRes.ok) {
            return jsonResponse({ error: 'Failed to fetch Discord user' }, 401);
          }
          const me = (await meRes.json()) as {
            id: string;
            username: string;
            global_name?: string | null;
            avatar?: string | null;
          };
          user = {
            id: me.id,
            username: me.global_name ?? me.username,
            avatarUrl: me.avatar
              ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128`
              : null,
          };
        }

        const sessionJwt = await signJwt(
          {
            sub: user.id,
            username: user.username,
            avatarUrl: user.avatarUrl,
            exp: Math.floor(Date.now() / 1000) + 86_400,
          },
          secret,
        );

        const response: TokenExchangeResponse = {
          access_token: accessToken,
          sessionJwt,
          user,
        };
        return jsonResponse(response);
      }

      // 2. WebSocket Room Upgrade (/api/ws)
      if (url.pathname === '/api/ws') {
        const instanceId = url.searchParams.get('instanceId') ?? 'local-dev-instance';
        if (!env.ROOMS) {
          return new Response('Durable Objects not bound', { status: 501 });
        }
        const id = env.ROOMS.idFromName(instanceId);
        return env.ROOMS.get(id).fetch(request);
      }

      // Authenticated API routes require Bearer sessionJwt
      if (url.pathname.startsWith('/api/')) {
        const authHeader = request.headers.get('Authorization') ?? '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
        const session = token ? await verifyJwt(token, secret) : null;
        if (!session) {
          return jsonResponse({ error: 'Unauthorized' }, 401);
        }

        // 3. GET /api/puzzle
        if (url.pathname === '/api/puzzle' && request.method === 'GET') {
          const dateStr = url.searchParams.get('date') ?? getTodayUtcDateStr();
          const idx = getDailyPuzzleIndex(dateStr, DAILY_BEER_SOLUTIONS.length);
          const solution = DAILY_BEER_SOLUTIONS[idx];
          const game = await getGame(env, session.sub, dateStr);
          const stats = await getStats(env, session.sub);

          const payload: DailyPuzzleResponse = {
            puzzleNumber: getDailyPuzzleNumber(dateStr),
            dateStr,
            wordLength: splitGraphemes(solution.word).length,
            guesses: game.guesses,
            status: game.status,
            stats,
            solutionMetadata:
              game.status === 'won' || game.status === 'lost' ? solution : undefined,
          };
          return jsonResponse(payload);
        }

        // 4. POST /api/guess
        if (url.pathname === '/api/guess' && request.method === 'POST') {
          const reqBody = (await request.json()) as GuessRequest;
          const dateStr = reqBody.dateStr || getTodayUtcDateStr();
          const idx = getDailyPuzzleIndex(dateStr, DAILY_BEER_SOLUTIONS.length);
          const solution = DAILY_BEER_SOLUTIONS[idx];
          const targetLength = splitGraphemes(solution.word).length;

          const game = await getGame(env, session.sub, dateStr);
          if (game.status !== 'playing') {
            return jsonResponse(
              { valid: false, error: 'Spiel bereits beendet', status: game.status },
              400,
            );
          }

          const normalizedGuess = normalizeBeerString(reqBody.guess);
          if (splitGraphemes(normalizedGuess).length !== targetLength) {
            return jsonResponse(
              { valid: false, error: 'Nicht genug Buchstaben', status: game.status },
              400,
            );
          }

          const dictCheck = validateGuessWord(normalizedGuess, targetLength);
          if (!dictCheck.valid) {
            return jsonResponse(
              { valid: false, error: 'Nicht in der Wortliste', status: game.status },
              400,
            );
          }

          if (reqBody.hardMode) {
            const hardError = validateHardMode(normalizedGuess, game.guesses);
            if (hardError) {
              return jsonResponse(
                { valid: false, error: hardError, status: game.status },
                400,
              );
            }
          }

          const statuses = evaluateGuess(normalizedGuess, solution.word);
          const evaluation: GuessEvaluation = {
            guess: normalizedGuess,
            statuses,
            isBeerTerm: dictCheck.isBeerTerm,
          };

          const nextGuesses = [...game.guesses, evaluation];
          const won = statuses.every((s) => s === 'correct');
          const nextStatus: GameStatus = won
            ? 'won'
            : nextGuesses.length >= 6
              ? 'lost'
              : 'playing';

          await saveGame(env, session.sub, dateStr, {
            guesses: nextGuesses,
            status: nextStatus,
            shared: game.shared,
          });

          let updatedStats = await getStats(env, session.sub);
          if (nextStatus === 'won' || nextStatus === 'lost') {
            updatedStats = recordGameOutcome(updatedStats, {
              dateStr,
              won,
              guessCount: nextGuesses.length,
            });
            await saveStats(env, session.sub, session.username, session.avatarUrl, updatedStats);
          }

          const resPayload: GuessResponse = {
            valid: true,
            evaluation,
            status: nextStatus,
            stats: updatedStats,
            solutionMetadata:
              nextStatus === 'won' || nextStatus === 'lost' ? solution : undefined,
          };
          return jsonResponse(resPayload);
        }

        // 5. POST /api/share
        if (url.pathname === '/api/share' && request.method === 'POST') {
          const reqBody = (await request.json()) as ShareRequest;
          const dateStr = reqBody.dateStr || getTodayUtcDateStr();
          const game = await getGame(env, session.sub, dateStr);

          if (game.shared) {
            const resp: ShareResponse = {
              ok: false,
              message: 'Ergebnis heute bereits im Kanal geteilt',
            };
            return jsonResponse(resp, 429);
          }

          if (env.DISCORD_BOT_TOKEN && reqBody.channelId) {
            if (!/^\d{15,22}$/.test(reqBody.channelId)) {
              return jsonResponse({ ok: false, message: 'Invalid channelId' }, 400);
            }
            const discordRes = await fetch(
              `https://discord.com/api/v10/channels/${reqBody.channelId}/messages`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  content: `**${session.username}**\n${reqBody.shareText}`,
                }),
              },
            );
            if (!discordRes.ok) {
              return jsonResponse(
                { ok: false, message: 'Kanal-Nachricht konnte nicht gesendet werden' },
                502,
              );
            }
          }

          await saveGame(env, session.sub, dateStr, { ...game, shared: true });
          const resp: ShareResponse = { ok: true };
          return jsonResponse(resp);
        }

        return jsonResponse({ error: 'Not found' }, 404);
      }

      // Static Assets fallback in Cloudflare Workers
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return new Response('Beerle Worker', { status: 200 });
    },
  };
}

export default createServerApp();
