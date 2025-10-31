import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const ADMINISTRATOR = BigInt('0x00000008');
const MANAGE_GUILD = BigInt('0x00000020');

interface DiscordGuild {
  id: string;
  name: string;
  icon?: string | null;
  owner?: boolean;
  permissions?: string;
}

function hasAdminPermissions(guild: DiscordGuild): boolean {
  if (guild.owner) {
    return true;
  }

  if (!guild.permissions) {
    return false;
  }

  try {
    const permissions = BigInt(guild.permissions);
    return (
      (permissions & ADMINISTRATOR) === ADMINISTRATOR ||
      (permissions & MANAGE_GUILD) === MANAGE_GUILD
    );
  } catch {
    return false;
  }
}

function buildIconUrl(guild: DiscordGuild): string | null {
  if (!guild.icon) {
    return null;
  }
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`;
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!session.discordAccessToken) {
      return NextResponse.json(
        { error: 'Discord access token missing. Please re-connect your Discord account.' },
        { status: 403 }
      );
    }

    const guildResponse = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
      headers: {
        Authorization: `Bearer ${session.discordAccessToken}`,
      },
      cache: 'no-store',
    });

    if (guildResponse.status === 401) {
      return NextResponse.json(
        { error: 'Discord session expired. Please log in again.' },
        { status: 401 }
      );
    }

    if (!guildResponse.ok) {
      const errorText = await guildResponse.text();
      console.error('Discord guild fetch failed:', guildResponse.status, errorText);
      return NextResponse.json(
        { error: 'Failed to load Discord servers' },
        { status: 502 }
      );
    }

    const guilds = (await guildResponse.json()) as DiscordGuild[];
    const adminGuilds = guilds.filter(hasAdminPermissions);

    const serverRecords = await Promise.all(
      adminGuilds.map(async (guild) => {
        const existing = await prisma.artistDiscordServer.findUnique({
          where: {
            artist_discord_id_server_id: {
              artist_discord_id: session.discordId,
              server_id: guild.id,
            },
          },
        });

        let record;
        if (existing) {
          record = await prisma.artistDiscordServer.update({
            where: { id: existing.id },
            data: { server_name: guild.name },
          });
        } else {
          record = await prisma.artistDiscordServer.create({
            data: {
              artist_discord_id: session.discordId,
              server_id: guild.id,
              server_name: guild.name,
              bot_installed: false,
            },
          });
        }

        return {
          id: guild.id,
          name: guild.name,
          icon: buildIconUrl(guild),
          botInstalled: record.bot_installed,
          owner: guild.owner ?? false,
        };
      })
    );

    return NextResponse.json(serverRecords);
  } catch (error) {
    console.error('Failed to fetch Discord servers:', error);
    return NextResponse.json({ error: 'Failed to fetch servers' }, { status: 500 });
  }
}
