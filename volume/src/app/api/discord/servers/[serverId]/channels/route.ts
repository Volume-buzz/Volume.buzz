import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  parent_id?: string | null;
  permission_overwrites?: Array<{ id: string; type: number; allow: string; deny: string }>;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await context.params;

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ensure server belongs to the artist and the bot is installed
    const server = await prisma.artistDiscordServer.findFirst({
      where: {
        artist_discord_id: session.discordId,
        server_id: serverId,
      },
    });

    if (!server) {
      return NextResponse.json({ error: 'Server not found for artist' }, { status: 404 });
    }

    const botToken = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
    if (!botToken) {
      console.warn('Discord bot token not configured.');
      return NextResponse.json({ error: 'Discord bot not configured' }, { status: 503 });
    }

    const response = await fetch(`https://discord.com/api/v10/guilds/${serverId}/channels`, {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Discord API error fetching channels:', response.status, errorBody);
      return NextResponse.json({ error: 'Failed to fetch channels from Discord' }, { status: response.status });
    }

    const channels = (await response.json()) as DiscordChannel[];
    const textChannels = channels
      .filter((channel) => channel.type === 0 || channel.type === 5)
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
      }));

    return NextResponse.json({
      server_id: serverId,
      channels: textChannels,
    });
  } catch (error) {
    console.error('Failed to fetch Discord channels:', error);
    return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 });
  }
}
