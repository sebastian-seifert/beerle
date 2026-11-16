import type { RoomClientMessage, RoomServerMessage } from '../shared/protocol';
import type { PlayerProgress } from '../shared/types';

/**
 * Pure, framework-agnostic room state manager for spoiler-free co-presence.
 * Never stores or broadcasts guessed letters — only TileStatus color patterns.
 */
export class BeerleRoomState {
  private readonly players = new Map<string, PlayerProgress>();

  getPlayers(): PlayerProgress[] {
    return Array.from(this.players.values());
  }

  removePlayer(userId: string): RoomServerMessage | null {
    if (!this.players.delete(userId)) {
      return null;
    }
    return { type: 'PLAYER_LEFT', userId };
  }

  applyMessage(msg: RoomClientMessage): RoomServerMessage | null {
    switch (msg.type) {
      case 'JOIN': {
        const player: PlayerProgress = {
          userId: msg.userId,
          username: msg.username,
          avatarUrl: msg.avatarUrl,
          rows: msg.rows,
          typingCount: 0,
          status: msg.status,
        };
        this.players.set(msg.userId, player);
        return { type: 'PLAYER_UPDATED', player };
      }

      case 'TYPING_PROGRESS': {
        const existing = this.players.get(msg.userId);
        if (!existing) {
          return null;
        }
        const updated: PlayerProgress = {
          ...existing,
          typingCount: msg.typingCount,
        };
        this.players.set(msg.userId, updated);
        return { type: 'PLAYER_UPDATED', player: updated };
      }

      case 'ROW_EVALUATED': {
        const existing = this.players.get(msg.userId);
        if (!existing) {
          return null;
        }
        const updated: PlayerProgress = {
          ...existing,
          rows: msg.rows,
          typingCount: 0,
          status: msg.status,
        };
        this.players.set(msg.userId, updated);
        return { type: 'PLAYER_UPDATED', player: updated };
      }
    }
  }
}

/**
 * Cloudflare Durable Object using the WebSocket Hibernation API (`ctx.acceptWebSocket`)
 * so idle multiplayer rooms consume 0 compute duration between player guesses.
 */
export class BeerleRoomDO {
  private readonly ctx: DurableObjectState;

  constructor(ctx: DurableObjectState) {
    this.ctx = ctx;
  }

  private buildRoomStateFromSockets(): BeerleRoomState {
    const state = new BeerleRoomState();
    for (const socket of this.ctx.getWebSockets()) {
      const player = socket.deserializeAttachment() as PlayerProgress | null;
      if (player?.userId) {
        state.applyMessage({
          type: 'JOIN',
          userId: player.userId,
          username: player.username,
          avatarUrl: player.avatarUrl,
          rows: player.rows,
          status: player.status,
        });
        if (player.typingCount > 0) {
          state.applyMessage({
            type: 'TYPING_PROGRESS',
            userId: player.userId,
            typingCount: player.typingCount,
          });
        }
      }
    }
    return state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);

    const snapshot: RoomServerMessage = {
      type: 'ROOM_STATE',
      players: this.buildRoomStateFromSockets().getPlayers(),
    };
    server.send(JSON.stringify(snapshot));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') {
      return;
    }
    let parsed: RoomClientMessage;
    try {
      parsed = JSON.parse(message) as RoomClientMessage;
    } catch {
      return;
    }

    const roomState = this.buildRoomStateFromSockets();
    const broadcast = roomState.applyMessage(parsed);
    if (broadcast && broadcast.type === 'PLAYER_UPDATED') {
      ws.serializeAttachment(broadcast.player);
      this.broadcast(broadcast);
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as PlayerProgress | null;
    if (attachment?.userId) {
      this.broadcast({ type: 'PLAYER_LEFT', userId: attachment.userId });
    }
  }

  private broadcast(msg: RoomServerMessage): void {
    const payload = JSON.stringify(msg);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload);
      } catch {
        // Closed socket will be cleaned up on webSocketClose
      }
    }
  }
}
