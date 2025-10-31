/**
 * Listening Parties Routes
 *
 * Handles API endpoints for the new Artist Control Station
 * Endpoints for Discord bot integration and artist management
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../database/prisma';
import Joi from 'joi';
import { validate, commonSchemas } from '../middleware/validation';
import { LISTENING_PARTY_CONSTANTS } from '../config/listeningPartyConstants';
import type PartyPosterService from '../services/partyPoster';

const router: Router = Router();

// Party poster service (set by bot)
let partyPoster: PartyPosterService | null = null;

export function setPartyPoster(service: PartyPosterService) {
  partyPoster = service;
  console.log('🎉 Party poster service connected to listening parties routes');
}

// ============================================================================
// PUBLIC ENDPOINTS (for Discord Bot)
// ============================================================================

/**
 * GET /api/listening-parties/active
 * Get all active listening parties (no auth required for Discord bot)
 */
router.get('/active', async (req: Request, res: Response) => {
  try {
    const parties = await prisma.listeningParty.findMany({
      where: {
        status: 'ACTIVE',
        expires_at: {
          gt: new Date(), // Not expired
        },
      },
      select: {
        id: true,
        track_id: true,
        track_title: true,
        track_artist: true,
        track_artwork_url: true,
        platform: true,
        token_mint: true,
        tokens_per_participant: true,
        max_participants: true,
        claimed_count: true,
        duration_minutes: true,
        created_at: true,
        started_at: true,
        expires_at: true,
        raid_id: true,
        raid_escrow_pda: true,
        artist_discord_id: true,
        server_id: true,
      },
    });

    return res.json({
      count: parties.length,
      parties: parties.map((p) => ({
        id: p.id,
        track: {
          id: p.track_id,
          title: p.track_title,
          artist: p.track_artist,
          artwork: p.track_artwork_url,
        },
        platform: p.platform,
        reward: {
          token_mint: p.token_mint,
          tokens_per_participant: p.tokens_per_participant.toString(),
        },
        capacity: {
          max: p.max_participants,
          claimed: p.claimed_count,
          available: p.max_participants - p.claimed_count,
        },
        timing: {
          created_at: p.created_at,
          expires_at: p.expires_at,
          duration_minutes: p.duration_minutes,
        },
        smart_contract: {
          raid_id: p.raid_id,
          escrow_pda: p.raid_escrow_pda,
        },
        artist_discord_id: p.artist_discord_id,
        server_id: p.server_id,
      })),
    });
  } catch (err) {
    console.error('Error fetching active parties:', err);
    return res.status(500).json({ error: 'Failed to fetch active parties' });
  }
});

/**
 * GET /api/listening-parties/active/by-server?server_id=xxx
 * Get active listening parties for a specific Discord server
 */
router.get(
  '/active/by-server',
  validate({
    query: Joi.object({
      server_id: Joi.string().required(),
    }),
  }),
  async (req: Request, res: Response) => {
    try {
      const { server_id } = req.query as { server_id: string };

      const parties = await prisma.listeningParty.findMany({
        where: {
          status: 'ACTIVE',
          expires_at: {
            gt: new Date(),
          },
          OR: [
            { server_id: server_id }, // For this server
            { server_id: null }, // Or global parties
          ],
        },
        include: {
          participants: {
            select: {
              discord_id: true,
              qualified_at: true,
            },
          },
        },
      });

      return res.json({
        server_id,
        count: parties.length,
        parties: parties.map((p) => ({
          id: p.id,
          track: {
            id: p.track_id,
            title: p.track_title,
            artist: p.track_artist,
            artwork: p.track_artwork_url,
          },
          platform: p.platform,
          reward: {
            token_mint: p.token_mint,
            tokens_per_participant: p.tokens_per_participant.toString(),
          },
          capacity: {
            max: p.max_participants,
            claimed: p.claimed_count,
            available: p.max_participants - p.claimed_count,
          },
          timing: {
            created_at: p.created_at,
            expires_at: p.expires_at,
          },
          participants_count: p.participants.length,
          qualified_count: p.participants.filter((p) => p.qualified_at).length,
        })),
      });
    } catch (err) {
      console.error('Error fetching parties by server:', err);
      return res.status(500).json({ error: 'Failed to fetch parties' });
    }
  }
);

/**
 * GET /api/listening-parties/:id
 * Get specific listening party details
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const party = await prisma.listeningParty.findUnique({
      where: { id },
      include: {
        participants: {
          select: {
            id: true,
            discord_id: true,
            discord_handle: true,
            joined_at: true,
            qualified_at: true,
            total_listening_duration: true,
            is_listening: true,
          },
        },
      },
    });

    if (!party) {
      return res.status(404).json({ error: 'Party not found' });
    }

    return res.json({
      id: party.id,
      artist_discord_id: party.artist_discord_id,
      track: {
        id: party.track_id,
        title: party.track_title,
        artist: party.track_artist,
        artwork: party.track_artwork_url,
      },
      platform: party.platform,
      reward: {
        token_mint: party.token_mint,
        tokens_per_participant: party.tokens_per_participant.toString(),
      },
      status: party.status,
      timing: {
        created_at: party.created_at,
        started_at: party.started_at,
        ended_at: party.ended_at,
        expires_at: party.expires_at,
        duration_minutes: party.duration_minutes,
      },
      capacity: {
        max: party.max_participants,
        claimed: party.claimed_count,
        available: party.max_participants - party.claimed_count,
      },
      smart_contract: {
        raid_id: party.raid_id,
        escrow_pda: party.raid_escrow_pda,
        metadata_uri: party.metadata_uri,
      },
      participants: party.participants.map((p) => ({
        id: p.id,
        discord_id: p.discord_id,
        discord_handle: p.discord_handle,
        joined_at: p.joined_at,
        qualified_at: p.qualified_at,
        listening_duration: p.total_listening_duration,
        is_listening: p.is_listening,
      })),
    });
  } catch (err) {
    console.error('Error fetching party:', err);
    return res.status(500).json({ error: 'Failed to fetch party' });
  }
});

// ============================================================================
// PARTICIPANT ENDPOINTS
// ============================================================================

/**
 * POST /api/listening-parties/:id/participants
 * Register a participant in a listening party (Discord bot calls this)
 */
router.post(
  '/:id/participants',
  validate({
    params: Joi.object({
      id: Joi.string().required(),
    }),
    body: Joi.object({
      discord_id: Joi.string().required(),
      discord_handle: Joi.string().optional(),
      server_id: Joi.string().optional(),
    }),
  }),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { discord_id, discord_handle, server_id } = req.body;

      // Verify party exists and is active
      const party = await prisma.listeningParty.findUnique({
        where: { id },
      });

      if (!party) {
        return res.status(404).json({ error: 'Party not found' });
      }

      if (party.status !== 'ACTIVE' || party.expires_at < new Date()) {
        return res.status(400).json({ error: 'Party is not active' });
      }

      // Check if already joined
      const existing = await prisma.listeningPartyParticipant.findUnique({
        where: {
          party_id_discord_id: {
            party_id: id,
            discord_id,
          },
        },
      });

      if (existing) {
        return res.status(200).json({
          participant_id: existing.id,
          party_id: id,
          discord_id,
          joined_at: existing.joined_at,
          qualifying_duration_seconds: LISTENING_PARTY_CONSTANTS.QUALIFYING_THRESHOLD,
          already_joined: true,
        });
      }

      // Create participant
      const participant = await prisma.listeningPartyParticipant.create({
        data: {
          party_id: id,
          discord_id,
          discord_handle,
          server_id,
          joined_at: new Date(),
        },
      });

      return res.status(201).json({
        participant_id: participant.id,
        party_id: id,
        discord_id,
        joined_at: participant.joined_at,
        qualifying_duration_seconds: LISTENING_PARTY_CONSTANTS.QUALIFYING_THRESHOLD,
      });
    } catch (err) {
      console.error('Error creating participant:', err);
      return res.status(500).json({ error: 'Failed to join party' });
    }
  }
);

/**
 * POST /api/listening-parties/:id/heartbeat
 * Record heartbeat/listening verification from Discord bot
 */
router.post(
  '/:id/heartbeat',
  validate({
    params: Joi.object({
      id: Joi.string().required(),
    }),
    body: Joi.object({
      discord_id: Joi.string().required(),
      is_playing: Joi.boolean().required(),
      current_position_seconds: Joi.number().optional(),
    }),
  }),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { discord_id, is_playing, current_position_seconds } = req.body;

      // Get participant
      const participant = await prisma.listeningPartyParticipant.findUnique({
        where: {
          party_id_discord_id: {
            party_id: id,
            discord_id,
          },
        },
      });

      if (!participant) {
        return res.status(404).json({ error: 'Participant not found in this party' });
      }

      // Update participant listening status
      const updated = await prisma.listeningPartyParticipant.update({
        where: { id: participant.id },
        data: {
          is_listening: is_playing,
          last_heartbeat_at: new Date(),
          first_heartbeat_at: participant.first_heartbeat_at || new Date(),
          total_listening_duration: is_playing
            ? participant.total_listening_duration + LISTENING_PARTY_CONSTANTS.HEARTBEAT_INTERVAL
            : participant.total_listening_duration,
        },
      });

      // Check if qualified
      const qualified = updated.total_listening_duration >= LISTENING_PARTY_CONSTANTS.QUALIFYING_THRESHOLD;

      // Update qualified status
      if (qualified && !participant.qualified_at) {
        await prisma.listeningPartyParticipant.update({
          where: { id: participant.id },
          data: {
            qualified_at: new Date(),
          },
        });
      }

      return res.json({
        participant_id: participant.id,
        qualified: qualified,
        can_claim: qualified && !participant.claimed_at,
        listening_duration: updated.total_listening_duration,
        required_duration: LISTENING_PARTY_CONSTANTS.QUALIFYING_THRESHOLD,
        progress: `${updated.total_listening_duration}/${LISTENING_PARTY_CONSTANTS.QUALIFYING_THRESHOLD}`,
        is_playing,
      });
    } catch (err) {
      console.error('Error processing heartbeat:', err);
      return res.status(500).json({ error: 'Failed to process heartbeat' });
    }
  }
);

/**
 * POST /api/listening-parties/:id/claim-confirmed
 * Record successful token claim from smart contract
 */
router.post(
  '/:id/claim-confirmed',
  validate({
    params: Joi.object({
      id: Joi.string().required(),
    }),
    body: Joi.object({
      discord_id: Joi.string().required(),
      tx_signature: Joi.string().required(),
    }),
  }),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { discord_id, tx_signature } = req.body;

      // Update participant with claim confirmation
      const participant = await prisma.listeningPartyParticipant.update({
        where: {
          party_id_discord_id: {
            party_id: id,
            discord_id,
          },
        },
        data: {
          claimed_at: new Date(),
          claim_tx_signature: tx_signature,
        },
      });

      // Increment party's claimed count
      await prisma.listeningParty.update({
        where: { id },
        data: {
          claimed_count: {
            increment: 1,
          },
        },
      });

      return res.json({
        participant_id: participant.id,
        claimed_at: participant.claimed_at,
        tx_signature,
      });
    } catch (err) {
      console.error('Error confirming claim:', err);
      return res.status(500).json({ error: 'Failed to confirm claim' });
    }
  }
);

// ============================================================================
// ARTIST ENDPOINTS (Requires Authentication)
// ============================================================================

/**
 * GET /api/listening-parties/artist/servers
 * Get Discord servers where the artist is admin and bot is installed
 */
router.get('/artist/servers', requireAuth, async (req: Request, res: Response) => {
  try {
    const discordId = (req as any).sessionUser.discordId;

    // Get artist's servers from database
    const servers = await prisma.artistDiscordServer.findMany({
      where: {
        artist_discord_id: discordId,
        bot_installed: true,
      },
    });

    return res.json({
      count: servers.length,
      servers: servers.map((s) => ({
        server_id: s.server_id,
        server_name: s.server_name,
      })),
    });
  } catch (err) {
    console.error('Error fetching artist servers:', err);
    return res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

/**
 * GET /api/listening-parties/artist/my-parties
 * Get all listening parties created by the authenticated artist
 */
router.get('/artist/my-parties', requireAuth, async (req: Request, res: Response) => {
  try {
    const discordId = (req as any).sessionUser.discordId;

    const parties = await prisma.listeningParty.findMany({
      where: {
        artist_discord_id: discordId,
      },
      include: {
        participants: {
          select: {
            qualified_at: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return res.json(
      parties.map((p) => ({
        id: p.id,
        track: {
          id: p.track_id,
          title: p.track_title,
          artist: p.track_artist,
          artwork: p.track_artwork_url,
        },
        platform: p.platform,
        status: p.status,
        reward: {
          token_mint: p.token_mint,
          tokens_per_participant: p.tokens_per_participant.toString(),
        },
        capacity: {
          max: p.max_participants,
          claimed: p.claimed_count,
          participants: p.participants.length,
          qualified: p.participants.filter((p) => p.qualified_at).length,
        },
        timing: {
          created_at: p.created_at,
          expires_at: p.expires_at,
          duration_minutes: p.duration_minutes,
        },
      }))
    );
  } catch (err) {
    console.error('Error fetching artist parties:', err);
    return res.status(500).json({ error: 'Failed to fetch parties' });
  }
});

/**
 * POST /api/listening-parties
 * Create a new listening party (requires artist authentication)
 */
router.post(
  '/',
  requireAuth,
  validate({
    body: Joi.object({
      track_id: Joi.string().required(),
      track_title: Joi.string().required(),
      track_artist: Joi.string().optional(),
      track_artwork_url: Joi.string().optional(),
      track_permalink: Joi.string().optional(), // For Audius track URL construction
      platform: Joi.string().valid('audius', 'spotify').required(),
      token_mint: Joi.string().required(),
      tokens_per_participant: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
      max_participants: Joi.number().min(1).max(100).required(),
      duration_minutes: Joi.number().min(1).required(),
      server_id: Joi.string().optional(),
      channel_id: Joi.string().optional(),
      raid_id: Joi.string().optional(), // From dashboard when escrow already created
      raid_escrow_pda: Joi.string().optional(), // From dashboard when escrow already created
    }),
  }),
  async (req: Request, res: Response) => {
    try {
      const discordId = (req as any).sessionUser.discordId;
      const {
        track_id,
        track_title,
        track_artist,
        track_artwork_url,
        track_permalink,
        platform,
        token_mint,
        tokens_per_participant,
        max_participants,
        duration_minutes,
        server_id,
        channel_id,
        raid_id: providedRaidId,
        raid_escrow_pda: providedEscrowPda,
      } = req.body;

      const normalizedPlatform = (typeof platform === 'string' ? platform.toUpperCase() : 'AUDIUS') as 'AUDIUS' | 'SPOTIFY';
      if (!['AUDIUS', 'SPOTIFY'].includes(normalizedPlatform)) {
        return res.status(400).json({ error: 'Invalid platform value' });
      }

      // Convert tokens_per_participant to BigInt
      const tokensPerParticipant = BigInt(
        typeof tokens_per_participant === 'string'
          ? tokens_per_participant
          : tokens_per_participant.toString()
      );

      // Generate unique party ID (full format for database)
      const partyId = `${track_id}_${discordId}_${Date.now()}`;

      // Use provided raid_id from dashboard, or generate new one
      // If raid_id is provided, it means escrow was already created on-chain
      const raidId = providedRaidId || (() => {
        const timestamp = Date.now().toString().slice(-8);
        return `${track_id}_${timestamp}`;
      })();

      // Calculate expiration time
      const now = new Date();
      const expiresAt = new Date(now.getTime() + duration_minutes * 60 * 1000);

      // Create listening party (without escrow initially)
      let party = await prisma.listeningParty.create({
        data: {
          id: partyId,
          artist_discord_id: discordId,
          track_id,
          track_title,
          track_artist: track_artist || '',
          track_artwork_url: track_artwork_url || '',
          platform: normalizedPlatform,
          token_mint,
          tokens_per_participant: tokensPerParticipant,
          max_participants,
          duration_minutes,
          status: 'ACTIVE',
          created_at: now,
          started_at: now,
          expires_at: expiresAt,
          server_id: server_id || null,
          channel_id: channel_id || null,
          // raid_id is used for PDA derivation, must be <32 bytes
          raid_id: raidId,
          // raid_escrow_pda is set when escrow is created via dashboard
          raid_escrow_pda: providedEscrowPda || null,
          metadata_uri: null,
        },
      });

      // Auto-post to Discord if channel is specified and party poster is available
      if (partyPoster && party.channel_id) {
        console.log(`📤 Posting party ${party.id} to Discord channel ${party.channel_id}`);

        // Post asynchronously (don't block response)
        partyPoster.postPartyToChannel(party.id).then((result) => {
          if (result.success) {
            console.log(`✅ Successfully posted party ${party.id} to Discord`);
          } else {
            console.error(`❌ Failed to post party ${party.id} to Discord:`, result.error);
          }
        }).catch((error) => {
          console.error(`❌ Error posting party ${party.id} to Discord:`, error);
        });
      }

      return res.status(201).json({
        id: party.id,
        party_id: party.id,
        artist_discord_id: party.artist_discord_id,
        track: {
          id: party.track_id,
          title: party.track_title,
          artist: party.track_artist,
          artwork: party.track_artwork_url,
        },
        platform: party.platform,
        reward: {
          token_mint: party.token_mint,
          tokens_per_participant: party.tokens_per_participant.toString(),
        },
        capacity: {
          max: party.max_participants,
          claimed: 0,
          available: party.max_participants,
        },
        timing: {
          created_at: party.created_at,
          expires_at: party.expires_at,
          duration_minutes: party.duration_minutes,
        },
        status: party.status,
        smart_contract: {
          raid_id: party.raid_id,
          escrow_pda: party.raid_escrow_pda,
          metadata_uri: party.metadata_uri,
        },
        message: 'Listening party created. Posting to Discord...',
      });
    } catch (err) {
      console.error('Error creating listening party:', err);
      return res.status(500).json({ error: 'Failed to create listening party' });
    }
  }
);

export default router;
