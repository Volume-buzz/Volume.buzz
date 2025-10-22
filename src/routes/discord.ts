import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../database/prisma';

const router: Router = Router();

/**
 * GET /api/discord/servers
 * Get Discord servers where the bot is a member and the user has access
 */
router.get('/servers', requireAuth, async (req: Request, res: Response) => {
  try {
    const discordId = (req as any).sessionUser.discordId;

    if (!discordId) {
      return res.status(400).json({ error: 'Discord ID not found in session' });
    }

    // Get all servers where this user has created listening parties
    // or is registered as an artist
    const artistServers = await prisma.listeningParty.findMany({
      where: {
        artist_discord_id: discordId,
      },
      select: {
        server_id: true,
      },
      distinct: ['server_id'],
    });

    // Get unique server IDs
    const serverIds = [...new Set(artistServers.map(p => p.server_id).filter(Boolean))];

    // Format response
    const servers = serverIds.map(id => ({
      id: id,
      name: `Server ${id}`, // In a real implementation, fetch from Discord API
    }));

    return res.json(servers);
  } catch (err) {
    console.error('Error fetching Discord servers:', err);
    return res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

export default router;
