import { DiscordSDK, DiscordSDKMock, Events, Platform } from '@discord/embedded-app-sdk';
import type { TokenExchangeResponse } from '../shared/protocol';

export interface DiscordParticipantInfo {
  id: string;
  username: string;
  avatarUrl: string | null;
}

export interface DiscordActivitySession {
  isEmbedded: boolean;
  platform: 'desktop' | 'mobile';
  canOpenShareMomentDialog: boolean;
  instanceId: string;
  channelId: string | null;
  guildId: string | null;
  sessionJwt: string;
  accessToken: string;
  user: DiscordParticipantInfo;
  subscribeParticipants: (
    cb: (participants: DiscordParticipantInfo[]) => void,
  ) => () => void;
  shareLink: (customId: string, message: string) => Promise<void>;
  openShareMomentDialog: (mediaUrl: string) => Promise<void>;
}

export interface InitDiscordOptions {
  search?: string;
  clientId?: string;
  platformOverride?: 'desktop' | 'mobile';
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

function buildAvatarUrl(userId: string, avatarHash: string | null | undefined): string | null {
  if (!avatarHash) {
    return null;
  }
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=128`;
}

export async function initDiscordActivity(
  options: InitDiscordOptions = {},
): Promise<DiscordActivitySession> {
  const search =
    options.search ?? (typeof window !== 'undefined' ? window.location.search : '');
  const queryParams = new URLSearchParams(search);
  const isEmbedded = queryParams.get('frame_id') != null;
  const clientId =
    options.clientId ??
    (import.meta.env?.VITE_DISCORD_CLIENT_ID as string | undefined) ??
    'beerle-local-dev';
  const fetcher = options.fetcher ?? fetch;

  if (!isEmbedded) {
    // Local browser / automated test mock mode
    const mockSdk = new DiscordSDKMock(clientId, 'mock-guild', 'mock-channel', 'mock-loc');
    void mockSdk;

    const tokenRes = await fetcher('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'local-dev-mock' }),
    });

    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed (${tokenRes.status})`);
    }
    const tokenData = (await tokenRes.json()) as TokenExchangeResponse;
    const platform = options.platformOverride ?? 'desktop';

    return {
      isEmbedded: false,
      platform,
      canOpenShareMomentDialog: platform === 'desktop',
      instanceId: 'local-dev-instance',
      channelId: 'mock-channel',
      guildId: 'mock-guild',
      sessionJwt: tokenData.sessionJwt,
      accessToken: tokenData.access_token,
      user: tokenData.user,
      subscribeParticipants: (cb) => {
        cb([tokenData.user]);
        return () => {};
      },
      shareLink: async () => {},
      openShareMomentDialog: async () => {},
    };
  }

  // Live Discord Activity iframe mode
  const discordSdk = new DiscordSDK(clientId);
  await discordSdk.ready();

  const { code } = await discordSdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify', 'guilds', 'guilds.members.read'],
  });

  const tokenRes = await fetcher('/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!tokenRes.ok) {
    throw new Error(`OAuth token exchange failed (${tokenRes.status})`);
  }
  const tokenData = (await tokenRes.json()) as TokenExchangeResponse;

  const auth = await discordSdk.commands.authenticate({
    access_token: tokenData.access_token,
  });

  const platform: 'desktop' | 'mobile' =
    options.platformOverride ??
    (discordSdk.platform === Platform.MOBILE ? 'mobile' : 'desktop');

  const user: DiscordParticipantInfo = {
    id: auth.user.id,
    username: auth.user.global_name ?? auth.user.username,
    avatarUrl: buildAvatarUrl(auth.user.id, auth.user.avatar),
  };

  return {
    isEmbedded: true,
    platform,
    canOpenShareMomentDialog: platform === 'desktop',
    instanceId: discordSdk.instanceId,
    channelId: discordSdk.channelId,
    guildId: discordSdk.guildId,
    sessionJwt: tokenData.sessionJwt,
    accessToken: tokenData.access_token,
    user,
    subscribeParticipants: (cb) => {
      void discordSdk.commands
        .getActivityInstanceConnectedParticipants()
        .then(({ participants }) => {
          cb(
            participants.map((p) => ({
              id: p.id,
              username: p.global_name ?? p.username,
              avatarUrl: buildAvatarUrl(p.id, p.avatar),
            })),
          );
        });

      const listener = ({ participants }: { participants: Array<{ id: string; username: string; global_name?: string | null; avatar?: string | null }> }) => {
        cb(
          participants.map((p) => ({
            id: p.id,
            username: p.global_name ?? p.username,
            avatarUrl: buildAvatarUrl(p.id, p.avatar),
          })),
        );
      };

      void discordSdk.subscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, listener);
      return () => {
        void discordSdk.unsubscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, listener);
      };
    },
    shareLink: async (customId: string, message: string) => {
      await discordSdk.commands.shareLink({ custom_id: customId, message });
    },
    openShareMomentDialog: async (mediaUrl: string) => {
      if (platform !== 'desktop') {
        return;
      }
      await discordSdk.commands.openShareMomentDialog({ mediaUrl });
    },
  };
}
