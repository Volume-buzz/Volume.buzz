/**
 * Discord Routes
 * Provides endpoints for fetching Discord server and channel information
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { Client, GuildChannel, TextChannel, ChannelType, PermissionFlagsBits } from 'discord.js';
import config from '../config/environment';

const router: Router = Router();

// Get Discord client instance (needs to be injected from bot)
let discordClient: Client | null = null;

export function setDiscordClient(client: Client) {
  discordClient = client;
}

/**
 * GET /api/discord/servers
 * Get all servers (guilds) where the bot is installed and user is admin
 */
router.get('/servers', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!discordClient) {
      return res.status(503).json({ error: 'Discord bot not connected' });
    }

    const discordId = (req as any).sessionUser.discordId;

    // Get all guilds the bot is in
    const guilds = discordClient.guilds.cache.map((guild) => ({
      id: guild.id,
      name: guild.name,
      icon: guild.iconURL(),
      memberCount: guild.memberCount,
    }));

    // Filter guilds where user is admin
    const userGuilds = [];
    for (const guild of guilds) {
      try {
        const fullGuild = discordClient.guilds.cache.get(guild.id);
        if (!fullGuild) continue;

        const member = await fullGuild.members.fetch(discordId).catch(() => null);
        if (!member) continue;

        // Check if user has administrator or manage guild permissions
        const isAdmin =
          member.permissions.has(PermissionFlagsBits.Administrator) ||
          member.permissions.has(PermissionFlagsBits.ManageGuild);

        if (isAdmin) {
          userGuilds.push(guild);
        }
      } catch (err) {
        // User not in this guild, skip
        continue;
      }
    }

    return res.json({
      servers: userGuilds,
    });
  } catch (err) {
    console.error('Error fetching servers:', err);
    return res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

/**
 * GET /api/discord/servers/:serverId/channels
 * Get all text channels in a specific server
 */
router.get('/servers/:serverId/channels', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!discordClient) {
      return res.status(503).json({ error: 'Discord bot not connected' });
    }

    const { serverId } = req.params;
    const discordId = (req as any).sessionUser.discordId;

    // Get guild
    const guild = discordClient.guilds.cache.get(serverId);
    if (!guild) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Verify user is admin in this guild
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member) {
      return res.status(403).json({ error: 'You are not a member of this server' });
    }

    const isAdmin =
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageGuild);

    if (!isAdmin) {
      return res.status(403).json({ error: 'You must be an admin of this server' });
    }

    // Get all text channels where bot can send messages
    const channels = guild.channels.cache
      .filter((channel) => {
        if (channel.type !== ChannelType.GuildText) return false;

        // Check if bot has permission to send messages and embed links
        const botMember = guild.members.me;
        if (!botMember) return false;

        const permissions = (channel as TextChannel).permissionsFor(botMember);
        return (
          permissions?.has(PermissionFlagsBits.SendMessages) &&
          permissions?.has(PermissionFlagsBits.EmbedLinks)
        );
      })
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: 'text',
      }));

    return res.json({
      server_id: serverId,
      channels: Array.from(channels),
    });
  } catch (err) {
    console.error('Error fetching channels:', err);
    return res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

export default router;
