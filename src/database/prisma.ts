import { PrismaClient, User, Admin, OAuthSession, Wallet, Token, ArtistDeposit } from '@prisma/client';
import { DatabaseUser, UserRole } from '../types';
import LISTENING_PARTY_CONSTANTS from '../config/listeningPartyConstants';

// Initialize Prisma client with proper configuration
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  errorFormat: 'pretty'
});

// Include types for complex queries
type UserWithWallet = User & {
  wallets?: any[];
};

// DEPRECATED: Raid types - kept for backwards compatibility
// These types are no longer used but exist to prevent compilation errors
type Raid = any;
type RaidParticipant = any;

type RaidWithParticipants = any;
type ParticipantWithRaidAndUser = any;

// Allow any return type for these complex Prisma queries to avoid type conflicts
type AnyParticipantQuery = any;

class PrismaDatabase {
  // User methods
  static async getUser(discordId: string): Promise<User | null> {
    return await prisma.user.findUnique({
      where: { discord_id: discordId }
    });
  }

  static async createUser(userData: {
    discordId: string;
    spotifyUserId?: string;
    spotifyDisplayName?: string;
    spotifyEmail?: string;
    audiusUserId?: string;
    audiusHandle?: string;
    audiusName?: string;
    audiusEmail?: string;
    audiusProfilePicture?: string;
    audiusVerified?: boolean;
    tokensBalance?: number;
    discordUsername?: string;
  }): Promise<User> {
    return await prisma.user.upsert({
      where: { discord_id: userData.discordId },
      update: {
        spotify_user_id: userData.spotifyUserId,
        spotify_display_name: userData.spotifyDisplayName,
        spotify_email: userData.spotifyEmail,
        audius_user_id: userData.audiusUserId,
        audius_handle: userData.audiusHandle,
        audius_name: userData.audiusName,
        audius_email: userData.audiusEmail,
        audius_profile_picture: userData.audiusProfilePicture,
        ...(userData.audiusVerified !== undefined ? { audius_verified: userData.audiusVerified } : {}),
        discord_username: userData.discordUsername
      },
      create: {
        discord_id: userData.discordId,
        spotify_user_id: userData.spotifyUserId,
        spotify_display_name: userData.spotifyDisplayName,
        spotify_email: userData.spotifyEmail,
        audius_user_id: userData.audiusUserId,
        audius_handle: userData.audiusHandle,
        audius_name: userData.audiusName,
        audius_email: userData.audiusEmail,
        audius_profile_picture: userData.audiusProfilePicture,
        audius_verified: userData.audiusVerified ?? false,
        discord_username: userData.discordUsername,
        tokens_balance: userData.tokensBalance || 0
      }
    });
  }

  // Removed duplicate - see updateUser method below with better typing

  static async updateUserTokens(discordId: string, tokens: number): Promise<User> {
    return await prisma.user.update({
      where: { discord_id: discordId },
      data: {
        tokens_balance: { increment: tokens },
        total_rewards_claimed: { increment: 1 }
      }
    });
  }

  static async deleteUser(discordId: string): Promise<User> {
    // Instead of deleting the user (which would break foreign key constraints),
    // we clear their Spotify account data while preserving their raid history
    return await prisma.user.update({
      where: { discord_id: discordId },
      data: {
        spotify_user_id: null,
        spotify_display_name: null,
        spotify_email: null,
        spotify_is_premium: false,
        spotify_access_token: null,
        spotify_refresh_token: null,
        spotify_token_expires_at: null,
        spotify_scope: null,
        spotify_product: null,
        spotify_country: null,
        audius_user_id: null,
        audius_handle: null,
        audius_name: null,
        audius_email: null,
        audius_profile_picture: null,
        audius_verified: false
      }
    });
  }



  static async updateUserRaidParticipation(discordId: string): Promise<User> {
    return await prisma.user.update({
      where: { discord_id: discordId },
      data: {
        total_parties_participated: { increment: 1 }
      }
    });
  }

  // Admin methods
  static async isAdmin(discordId: string): Promise<boolean> {
    // Check both environment variables for admin IDs
    const superAdminIds = process.env.SUPER_ADMIN_IDS?.split(',').map(id => id.trim()) || [];
    const adminDiscordIds = process.env.ADMIN_DISCORD_ID?.split(',').map(id => id.trim()) || [];
    
    // Check if user is in either admin list
    if (superAdminIds.includes(discordId) || adminDiscordIds.includes(discordId)) {
      console.log(`✅ Admin access granted for Discord ID: ${discordId}`);
      return true;
    }
    
    // Then check admin table in database
    const admin = await prisma.admin.findUnique({
      where: { discord_id: discordId }
    });
    
    const isAdmin = admin !== null;
    if (isAdmin) {
      console.log(`✅ Admin access granted from database for Discord ID: ${discordId}`);
    } else {
      console.log(`❌ Admin access denied for Discord ID: ${discordId}`);
    }
    
    return isAdmin;
  }

  static async addAdmin(discordId: string): Promise<Admin> {
    return await prisma.admin.upsert({
      where: { discord_id: discordId },
      update: {},
      create: {
        discord_id: discordId,
        added_by: 'SYSTEM',
        added_at: new Date()
      }
    });
  }

  static async updateUserBalance(discordId: string, newBalance: number): Promise<User | null> {
    try {
      return await prisma.user.update({
        where: { discord_id: discordId },
        data: { tokens_balance: newBalance }
      });
    } catch (error) {
      console.error('Error updating user balance:', error);
      return null;
    }
  }

  static async updateUser(discordId: string, updates: {
    spotifyUserId?: string;
    spotifyDisplayName?: string;
    spotifyEmail?: string;
    spotifyIsPremium?: boolean;
    spotifyAccessToken?: string;
    spotifyRefreshToken?: string;
    spotifyTokenExpiresAt?: Date;
    spotifyScope?: string;
    spotifyProduct?: string;
    spotifyCountry?: string;
    audiusUserId?: string;
    audiusHandle?: string;
    audiusName?: string;
    audiusEmail?: string;
    audiusProfilePicture?: string;
    audiusVerified?: boolean;
    discordUsername?: string;
  }): Promise<User | null> {
    try {
      const updateData: Partial<Pick<User, 
        'spotify_user_id' | 'spotify_display_name' | 'spotify_email' | 
        'spotify_is_premium' | 'spotify_access_token' | 'spotify_refresh_token' |
        'spotify_token_expires_at' | 'spotify_scope' | 'spotify_product' | 'spotify_country' |
        'audius_user_id' | 'audius_handle' | 'audius_name' | 'audius_email' | 'audius_profile_picture' | 'audius_verified' |
        'discord_username'
      >> = {};
      
      if (updates.spotifyUserId) updateData.spotify_user_id = updates.spotifyUserId;
      if (updates.spotifyDisplayName) updateData.spotify_display_name = updates.spotifyDisplayName;
      if (updates.spotifyEmail) updateData.spotify_email = updates.spotifyEmail;
      if (updates.spotifyIsPremium !== undefined) updateData.spotify_is_premium = updates.spotifyIsPremium;
      if (updates.spotifyAccessToken !== undefined) updateData.spotify_access_token = updates.spotifyAccessToken;
      if (updates.spotifyRefreshToken !== undefined) updateData.spotify_refresh_token = updates.spotifyRefreshToken;
      if (updates.spotifyTokenExpiresAt !== undefined) updateData.spotify_token_expires_at = updates.spotifyTokenExpiresAt;
      if (updates.spotifyScope !== undefined) updateData.spotify_scope = updates.spotifyScope;
      if (updates.spotifyProduct !== undefined) updateData.spotify_product = updates.spotifyProduct;
      if (updates.spotifyCountry !== undefined) updateData.spotify_country = updates.spotifyCountry;
      if (updates.audiusUserId !== undefined) updateData.audius_user_id = updates.audiusUserId;
      if (updates.audiusHandle !== undefined) updateData.audius_handle = updates.audiusHandle;
      if (updates.audiusName !== undefined) updateData.audius_name = updates.audiusName;
      if (updates.audiusEmail !== undefined) updateData.audius_email = updates.audiusEmail;
      if (updates.audiusProfilePicture !== undefined) updateData.audius_profile_picture = updates.audiusProfilePicture;
      if (updates.audiusVerified !== undefined) updateData.audius_verified = updates.audiusVerified;
      if (updates.discordUsername) updateData.discord_username = updates.discordUsername;

      // Use upsert to handle both update and create cases
      return await prisma.user.upsert({
        where: { discord_id: discordId },
        update: updateData,
        create: {
          discord_id: discordId,
          discord_username: updates.discordUsername,
          tokens_balance: 0,
          total_parties_participated: 0,
          total_rewards_claimed: 0,
          ...updateData
        }
      });
    } catch (error) {
      console.error('Error updating user:', error);
      return null;
    }
  }

  static async initializeAdmins(): Promise<void> {
    try {
      // Use SUPER_ADMIN_IDS from environment config
      const adminIds = process.env.SUPER_ADMIN_IDS;
      if (adminIds) {
        const ids = adminIds.split(',').map(id => id.trim()).filter(id => id);
        
        for (const discordId of ids) {
          await this.addAdmin(discordId);
          console.log(`✅ Super Admin initialized: ${discordId}`);
        }
        
        console.log(`🔐 Initialized ${ids.length} super admin(s)`);
      }
    } catch (error) {
      console.error('Error initializing super admins:', error);
    }
  }

  // ============================================================================
  // DEPRECATED: Old Raid Methods - Use ListeningParty instead
  // These methods are kept for backwards compatibility but should not be used
  // ============================================================================

  /* DEPRECATED RAID METHODS - COMMENTED OUT

  // Raid methods
  static async createRaid(raidData: {
    trackId: string;
    trackUrl: string;
    trackTitle: string;
    trackArtist: string;
    trackArtworkUrl?: string;
    platform: 'SPOTIFY';
    premiumOnly?: boolean;
    requiredListenTime?: number;
    streamsGoal: number;
    rewardAmount: number;
    rewardTokenMint?: string;
    channelId: string;
    guildId: string;
    creatorId: string;
    durationMinutes: number;
    // Enhanced metadata fields
    metadataJson?: string;
    linkedTrackId?: string;
    isPlayable?: boolean;
    trackDurationMs?: number;
    isExplicit?: boolean;
    albumName?: string;
  }): Promise<Raid> {
    const expiresAt = new Date(Date.now() + raidData.durationMinutes * 60 * 1000);
    
    return await prisma.raid.create({
      data: {
        track_id: raidData.trackId,
        track_url: raidData.trackUrl,
        track_title: raidData.trackTitle,
        track_artist: raidData.trackArtist,
        track_artwork_url: raidData.trackArtworkUrl,
        platform: 'SPOTIFY',
        premium_only: raidData.premiumOnly || false,
        required_listen_time: raidData.requiredListenTime || 30,
        streams_goal: raidData.streamsGoal,
        reward_amount: raidData.rewardAmount,
        token_mint: raidData.rewardTokenMint || 'SOL',
        channel_id: raidData.channelId,
        guild_id: raidData.guildId,
        creator_id: raidData.creatorId,
        duration_minutes: raidData.durationMinutes,
        expires_at: expiresAt,
        // Enhanced metadata
        metadata_json: raidData.metadataJson,
        linked_track_id: raidData.linkedTrackId,
        is_playable: raidData.isPlayable ?? true,
        track_duration_ms: raidData.trackDurationMs,
        is_explicit: raidData.isExplicit ?? false,
        album_name: raidData.albumName
      }
    });
  }

  static async updateRaid(raidId: number, updates: {
    current_streams?: number;
    status?: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
    message_id?: string;
    completed_at?: Date;
    first_finisher_discord_id?: string;
    first_finisher_handle?: string;
    first_finisher_time?: Date;
  }): Promise<Raid | null> {
    try {
      return await prisma.raid.update({
        where: { id: raidId },
        data: updates
      });
    } catch (error) {
      console.error(`Error updating raid ${raidId}:`, error);
      return null;
    }
  }

  static async getActiveRaids(): Promise<Raid[]> {
    return await prisma.raid.findMany({
      where: {
        status: 'ACTIVE',
        expires_at: { gt: new Date() }
      }
    });
  }

  static async getUserRaids(discordId: string) {
    return await prisma.raidParticipant.findMany({
      where: { discord_id: discordId },
      include: {
        raid: true
      },
      orderBy: { created_at: 'desc' }
    });
  }

  static async getUserRaidHistory(discordId: string) {
    return await prisma.raidParticipant.findMany({
      where: {
        discord_id: discordId,
        raid: { status: { in: ['COMPLETED', 'EXPIRED', 'CANCELLED'] } }
      },
      include: { raid: true },
      orderBy: { created_at: 'desc' }
    });
  }

  static async getRaid(raidId: number | string): Promise<Raid | null> {
    return await prisma.raid.findUnique({
      where: { id: parseInt(raidId.toString()) }
    });
  }

  static async updateRaidProgress(raidId: number | string, currentStreams: number): Promise<Raid> {
    return await prisma.raid.update({
      where: { id: parseInt(raidId.toString()) },
      data: { current_streams: currentStreams }
    });
  }

  static async completeRaid(raidId: number | string): Promise<Raid> {
    return await prisma.raid.update({
      where: { id: parseInt(raidId.toString()) },
      data: {
        status: 'COMPLETED',
        completed_at: new Date()
      }
    });
  }

  static async updateRaidMessageId(raidId: number | string, messageId: string): Promise<Raid> {
    return await prisma.raid.update({
      where: { id: parseInt(raidId.toString()) },
      data: { message_id: messageId }
    });
  }

  static async setFirstFinisher(raidId: number | string, discordId: string, handle: string): Promise<Raid> {
    return await prisma.raid.update({
      where: { id: parseInt(raidId.toString()) },
      data: {
        first_finisher_discord_id: discordId,
        first_finisher_handle: handle,
        first_finisher_time: new Date()
      }
    });
  }

  static async getLastRaid(): Promise<RaidWithParticipants | null> {
    return await prisma.raid.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { completed_at: 'desc' },
      include: {
        participants: {
          where: { qualified: true },
          include: {
            user: {
              select: {
                spotify_display_name: true,
                discord_username: true
              }
            }
          }
        }
      }
    });
  }

  // Participant methods
  static async addRaidParticipant(raidId: number | string, discordId: string, platformUserId?: string): Promise<RaidParticipant> {
    return await prisma.raidParticipant.upsert({
      where: {
        raid_id_discord_id: {
          raid_id: parseInt(raidId.toString()),
          discord_id: discordId
        }
      },
      update: {
        listen_start_time: new Date(),
        last_check: new Date(),
        is_listening: true
      },
      create: {
        raid_id: parseInt(raidId.toString()),
        discord_id: discordId,
        listen_start_time: new Date(),
        last_check: new Date(),
        is_listening: true,
        total_listen_duration: 0
      }
    });
  }

  static async updateRaidParticipant(
    raidId: number | string, 
    discordId: string, 
    updates: Partial<RaidParticipant>
  ): Promise<RaidParticipant> {
    return await prisma.raidParticipant.update({
      where: {
        raid_id_discord_id: {
          raid_id: parseInt(raidId.toString()),
          discord_id: discordId
        }
      },
      data: {
        ...updates,
        last_check: new Date()
      }
    });
  }

  static async getParticipantsNeedingVerification(): Promise<AnyParticipantQuery[]> {
    const twentySecondsAgo = new Date(Date.now() - 20 * 1000);
    
    return await prisma.raidParticipant.findMany({
      where: {
        is_listening: true,
        total_listen_duration: 0,
        listen_start_time: {
          not: null,
          lte: twentySecondsAgo
        },
        OR: [
          { last_check: null },
          {
            AND: [
              { last_check: { not: null } },
              { listen_start_time: { not: null } }
            ]
          }
        ],
        raid: {
          status: 'ACTIVE',
          expires_at: { gt: new Date() }
        }
      },
      include: {
        raid: {
          select: {
            id: true,
            track_id: true,
            track_title: true,
            reward_amount: true
          }
        },
        user: {
          select: {
            spotify_user_id: true,
            spotify_display_name: true
          }
        }
      }
    });
  }

  static async updateParticipantListenTime(raidId: number | string, discordId: string, duration: number): Promise<RaidParticipant> {
    const minimumListenTime = parseInt(process.env.MINIMUM_LISTEN_TIME || '30');
    
    return await prisma.raidParticipant.update({
      where: {
        raid_id_discord_id: {
          raid_id: parseInt(raidId.toString()),
          discord_id: discordId
        }
      },
      data: {
        total_listen_duration: duration,
        qualified: duration >= minimumListenTime,
        qualified_at: duration >= minimumListenTime ? new Date() : null
      }
    });
  }

  static async getQualifiedParticipants(raidId: number | string) {
    return await prisma.raidParticipant.findMany({
      where: {
        raid_id: parseInt(raidId.toString()),
        qualified: true,
        claimed_reward: false
      },
      include: {
        user: {
          select: {
            spotify_display_name: true,
            discord_username: true
          }
        }
      }
    });
  }

  static async claimReward(raidId: number | string, discordId: string): Promise<RaidParticipant> {
    return await prisma.raidParticipant.update({
      where: {
        raid_id_discord_id: {
          raid_id: parseInt(raidId.toString()),
          discord_id: discordId
        }
      },
      data: {
        claimed_reward: true,
        claimed_at: new Date()
      }
    });
  }

  static async checkExistingParticipant(raidId: number | string, discordId: string): Promise<RaidParticipant | null> {
    return await prisma.raidParticipant.findUnique({
      where: {
        raid_id_discord_id: {
          raid_id: parseInt(raidId.toString()),
          discord_id: discordId
        }
      }
    });
  }

  static async getParticipantCount(raidId: number | string): Promise<number> {
    return await prisma.raidParticipant.count({
      where: { raid_id: parseInt(raidId.toString()) }
    });
  }

  static async getActiveListeners(): Promise<AnyParticipantQuery[]> {
    return await prisma.raidParticipant.findMany({
      where: {
        is_listening: true,
        listen_start_time: { not: null },
        raid: {
          status: 'ACTIVE',
          expires_at: { gt: new Date() }
        }
      },
      include: {
        raid: {
          select: {
            id: true,
            track_id: true,
            track_title: true,
            reward_amount: true
          }
        },
        user: {
          select: {
            spotify_user_id: true,
            spotify_display_name: true
          }
        }
      }
    });
  }

  static async getAllActiveParticipants(): Promise<AnyParticipantQuery[]> {
    return await prisma.raidParticipant.findMany({
      where: {
        raid: {
          status: 'ACTIVE',
          expires_at: { gt: new Date() }
        },
        OR: [
          { qualified: false },
          { 
            AND: [
              { qualified: true },
              { is_listening: true }
            ]
          }
        ]
      },
      include: {
        raid: {
          select: {
            id: true,
            track_id: true,
            track_title: true,
            reward_amount: true
          }
        },
        user: {
          select: {
            spotify_user_id: true,
            spotify_display_name: true
          }
        }
      }
    });
  }

  static async getInactiveParticipants() {
    const sixtySecondsAgo = new Date(Date.now() - 60 * 1000);
    
    return await prisma.raidParticipant.findMany({
      where: {
        is_listening: false,
        qualified: false,
        last_check: { lt: sixtySecondsAgo },
        raid: {
          status: 'ACTIVE',
          expires_at: { gt: new Date() }
        }
      },
      include: {
        raid: {
          select: {
            id: true,
            track_id: true
          }
        },
        user: {
          select: {
            spotify_user_id: true
          }
        }
      }
    });
  }

  static async updateParticipantListening(
    participantId: number, 
    isListening: boolean, 
    listenStartTime: Date | null = null, 
    totalDuration: number | null = null
  ): Promise<RaidParticipant> {
    const updateData: Partial<Pick<RaidParticipant, 
      'is_listening' | 'last_check' | 'listen_start_time' | 'total_listen_duration'
    >> = {
      is_listening: isListening,
      last_check: new Date()
    };

    if (listenStartTime) {
      updateData.listen_start_time = listenStartTime;
    }

    if (totalDuration !== null) {
      updateData.total_listen_duration = totalDuration;
    }

    return await prisma.raidParticipant.update({
      where: { id: participantId },
      data: updateData
    });
  }

  static async updateParticipantStatus(participantId: number, updates: Partial<RaidParticipant>): Promise<RaidParticipant> {
    return await prisma.raidParticipant.update({
      where: { id: participantId },
      data: {
        ...updates,
        last_check: new Date()
      }
    });
  }

  static async resetParticipantProgress(participantId: number): Promise<RaidParticipant> {
    return await prisma.raidParticipant.update({
      where: { id: participantId },
      data: {
        total_listen_duration: 0,
        listen_start_time: null,
        last_check: null,
        is_listening: false
      }
    });
  }

  static async stopMonitoringParticipant(participantId: number): Promise<RaidParticipant> {
    return await prisma.raidParticipant.update({
      where: { id: participantId },
      data: {
        is_listening: false
      }
    });
  }

  // Statistics and cleanup methods
  static async getLeaderboard(limit: number = 10) {
    return await prisma.user.findMany({
      where: {
        tokens_balance: { gt: 0 }
      },
      orderBy: [
        { tokens_balance: 'desc' },
        { total_parties_participated: 'desc' }
      ],
      take: limit,
      select: {
        discord_id: true,
        spotify_display_name: true,
        discord_username: true,
        tokens_balance: true,
        total_parties_participated: true
      }
    });
  }

  static async getQualifiedCount(raidId: number | string): Promise<number> {
    return await prisma.raidParticipant.count({
      where: {
        raid_id: parseInt(raidId.toString()),
        qualified: true
      }
    });
  }

  static async getQualifiedParticipantCount(raidId: number | string): Promise<number> {
    return await prisma.raidParticipant.count({
      where: {
        raid_id: parseInt(raidId.toString()),
        qualified: true
      }
    });
  }

  static async getRaidWinners(raidId: number | string, limit: number = 10) {
    return await prisma.raidParticipant.findMany({
      where: {
        raid_id: parseInt(raidId.toString()),
        qualified: true
      },
      include: {
        user: {
          select: {
            spotify_display_name: true,
            discord_username: true
          }
        }
      },
      orderBy: { qualified_at: 'asc' },
      take: limit
    });
  }

  static async getLastRaidWinners() {
    const lastRaid = await this.getLastRaid();
    if (!lastRaid) return null;

    return await this.getRaidWinners(lastRaid.id);
  }

  static async cleanupInactiveParticipants() {
    const sixtySecondsAgo = new Date(Date.now() - 60 * 1000);
    
    return await prisma.raidParticipant.deleteMany({
      where: {
        is_listening: false,
        listen_start_time: null,
        created_at: { lt: sixtySecondsAgo },
        qualified: false,
        total_listen_duration: 0
      }
    });
  }

  static async getParticipantsWhoStoppedListening() {
    const sixtySecondsAgo = new Date(Date.now() - 60 * 1000);
    
    return await prisma.raidParticipant.findMany({
      where: {
        is_listening: false,
        listen_start_time: { not: null },
        last_check: { lt: sixtySecondsAgo },
        qualified: false,
        raid: {
          status: 'ACTIVE',
          expires_at: { gt: new Date() }
        }
      },
      include: {
        raid: {
          select: {
            id: true,
            track_id: true,
            streams_goal: true
          }
        }
      }
    });
  }

  // OAuth session methods
  static async createOAuthSession(sessionData: {
    state: string;
    discordId: string;
    platform: 'SPOTIFY' | 'AUDIUS';
    expiresAt: Date;
  }): Promise<OAuthSession> {
    try {
      // Delete any existing sessions for this Discord user to prevent duplicates
      await prisma.oAuthSession.deleteMany({
        where: {
          discord_id: sessionData.discordId,
          platform: 'SPOTIFY'
        }
      });

      const session = await prisma.oAuthSession.create({
        data: {
        state: sessionData.state,
        discord_id: sessionData.discordId,
        platform: sessionData.platform,
        expires_at: sessionData.expiresAt
      }
      });
      
      console.log(`📝 Created OAuth session for Discord user ${sessionData.discordId} with state ${sessionData.state.substring(0, 8)}...`);
      return session;
    } catch (error) {
      console.error('Error creating OAuth session:', error);
      throw error;
    }
  }

  static async getOAuthSession(state: string): Promise<OAuthSession | null> {
    try {
      const now = new Date();
      const session = await prisma.oAuthSession.findFirst({
        where: {
          state: state,
          expires_at: { gt: now }
        }
      });
      
      if (!session) {
        // Check if there's an expired session with this state
        const expiredSession = await prisma.oAuthSession.findFirst({
          where: { state: state }
        });
        
        if (expiredSession) {
          console.warn(`⏰ Found expired OAuth session for state ${state.substring(0, 8)}... (expired at ${expiredSession.expires_at})`);
        } else {
          console.warn(`🔍 No OAuth session found for state ${state.substring(0, 8)}...`);
        }
      }
      
      return session;
    } catch (error) {
      console.error('Error retrieving OAuth session:', error);
      return null;
    }
  }

  static async deleteOAuthSession(state: string) {
    try {
      const result = await prisma.oAuthSession.deleteMany({
        where: { state: state }
      });
      return result;
    } catch (error) {
      console.warn(`Failed to delete OAuth session ${state}:`, (error as Error).message);
      return null;
    }
  }

  static async cleanupExpiredSessions(): Promise<void> {
    await prisma.oAuthSession.deleteMany({
      where: {
        expires_at: { lt: new Date() }
      }
    });
  }

  // Session mapping methods for random session IDs
  static async createSessionMapping(sessionData: {
    sessionId: string;
    discordId: string;
    platform: 'SPOTIFY' | 'AUDIUS';
    expiresAt: Date;
  }): Promise<OAuthSession> {
    return await prisma.oAuthSession.create({
      data: {
        state: `session_${sessionData.sessionId}`, // Prefix to distinguish from OAuth states
        discord_id: sessionData.discordId,
        platform: 'SPOTIFY',
        expires_at: sessionData.expiresAt
      }
    });
  }

  static async getSessionMapping(sessionId: string): Promise<OAuthSession | null> {
    return await prisma.oAuthSession.findFirst({
      where: {
        state: `session_${sessionId}`,
        expires_at: { gt: new Date() }
      }
    });
  }

  static async deleteSessionMapping(sessionId: string): Promise<boolean> {
    try {
      const result = await prisma.oAuthSession.deleteMany({
        where: { state: `session_${sessionId}` }
      });
      return result.count > 0;
    } catch (error) {
      console.error('Error deleting session mapping:', error);
      return false;
    }
  }

  static async deleteRaidParticipant(participantId: number): Promise<RaidParticipant> {
    return await prisma.raidParticipant.delete({
      where: { id: participantId }
    });
  }

  END OF DEPRECATED RAID METHODS */

  // ============================================================================
  // STUB FUNCTIONS FOR BACKWARDS COMPATIBILITY
  // These throw errors if called - migrate to ListeningParty equivalents
  // ============================================================================

  static async getRaid(raidId: number | string): Promise<any> {
    throw new Error('DEPRECATED: getRaid - Use ListeningParty model instead');
  }

  static async createRaid(data: any): Promise<any> {
    throw new Error('DEPRECATED: createRaid - Use POST /api/listening-parties instead');
  }

  static async updateRaid(raidId: number | string, updates: any): Promise<any> {
    throw new Error('DEPRECATED: updateRaid - Use ListeningParty model instead');
  }

  static async getActiveRaids(): Promise<any[]> {
    const parties = await prisma.listeningParty.findMany({
      where: {
        status: 'ACTIVE',
        expires_at: { gt: new Date() }
      },
      include: {
        participants: {
          select: {
            discord_id: true,
            qualified_at: true
          }
        }
      },
      orderBy: {
        expires_at: 'asc'
      }
    });

    return parties.map(party => {
      const participants = party.participants ?? [];
      const qualifiedCount = participants.filter(participant => participant.qualified_at !== null).length;

      return {
        id: party.id,
        track_id: party.track_id,
        track_title: party.track_title,
        track_artist: party.track_artist,
        track_artwork_url: party.track_artwork_url,
        platform: party.platform,
        premium_only: false,
        required_listen_time: LISTENING_PARTY_CONSTANTS.QUALIFYING_THRESHOLD,
        streams_goal: party.max_participants,
        current_streams: participants.length,
        reward_amount: party.tokens_per_participant.toString(),
        token_mint: party.token_mint,
        status: party.status,
        expires_at: party.expires_at,
        claimed_count: party.claimed_count,
        qualified_count: qualifiedCount,
        server_id: party.server_id
      };
    });
  }

  static async getUserRaids(discordId: string): Promise<any[]> {
    throw new Error('DEPRECATED: getUserRaids - Use GET /api/listening-parties/user/:discordId instead');
  }

  static async getUserRaidHistory(discordId: string): Promise<any[]> {
    throw new Error('DEPRECATED: getUserRaidHistory - Use ListeningPartyParticipant instead');
  }

  static async completeRaid(raidId: number | string): Promise<any> {
    throw new Error('DEPRECATED: completeRaid - Use ListeningParty status updates instead');
  }

  static async addRaidParticipant(raidId: number | string, discordId: string, platformUserId?: string): Promise<any> {
    throw new Error('DEPRECATED: addRaidParticipant - Use POST /api/listening-parties/:id/participants instead');
  }

  static async updateRaidParticipant(raidId: number | string, discordId: string, updates: any): Promise<any> {
    throw new Error('DEPRECATED: updateRaidParticipant - Use POST /api/listening-parties/:id/heartbeat instead');
  }

  static async checkExistingParticipant(raidId: number | string, discordId: string): Promise<any> {
    throw new Error('DEPRECATED: checkExistingParticipant - Query ListeningPartyParticipant instead');
  }

  static async getParticipantCount(raidId: number | string): Promise<number> {
    throw new Error('DEPRECATED: getParticipantCount - Query ListeningPartyParticipant.count instead');
  }

  static async claimReward(raidId: number | string, discordId: string): Promise<any> {
    throw new Error('DEPRECATED: claimReward - Use POST /api/listening-parties/:id/claim-confirmed instead');
  }

  static async getQualifiedCount(raidId: number | string): Promise<number> {
    throw new Error('DEPRECATED: getQualifiedCount - Query ListeningPartyParticipant with qualified_at instead');
  }

  static async getQualifiedParticipantCount(raidId: number | string): Promise<number> {
    throw new Error('DEPRECATED: getQualifiedParticipantCount - Query ListeningPartyParticipant instead');
  }

  static async getRaidWinners(raidId: number | string, limit?: number): Promise<any[]> {
    throw new Error('DEPRECATED: getRaidWinners - Use getRecentWinners instead');
  }

  static async getAllActiveParticipants(): Promise<any[]> {
    throw new Error('DEPRECATED: getAllActiveParticipants - Query ListeningPartyParticipant with is_listening=true instead');
  }

  static async getActiveListeners(): Promise<any[]> {
    throw new Error('DEPRECATED: getActiveListeners - Query ListeningPartyParticipant instead');
  }

  static async getParticipantsWhoStoppedListening(): Promise<any[]> {
    throw new Error('DEPRECATED: getParticipantsWhoStoppedListening - Use ListeningPartyParticipant instead');
  }

  static async deleteRaidParticipant(participantId: number): Promise<any> {
    throw new Error('DEPRECATED: deleteRaidParticipant - Use ListeningPartyParticipant delete instead');
  }

  static async getLeaderboard(limit: number): Promise<any[]> {
    return this.getTopUsersByRaids(limit);
  }

  // OAuth session methods (these are still used)
  static async createOAuthSession(data: { state: string; discord_id: string; platform: string; expires_at: Date }): Promise<any> {
    return await prisma.oAuthSession.create({
      data: {
        state: data.state,
        discord_id: data.discord_id,
        platform: data.platform as any, // Cast to avoid enum type error
        expires_at: data.expires_at
      }
    });
  }

  static async getOAuthSession(state: string): Promise<any> {
    return await prisma.oAuthSession.findUnique({ where: { state } });
  }

  static async deleteOAuthSession(state: string): Promise<void> {
    await prisma.oAuthSession.delete({ where: { state } }).catch(() => {});
  }

  static async cleanupExpiredSessions(): Promise<void> {
    await prisma.oAuthSession.deleteMany({
      where: { expires_at: { lt: new Date() } }
    });
  }

  static async getSessionMapping(sessionId: string): Promise<any> {
    // Return null for now - this was for temporary session storage
    return null;
  }

  static async deleteSessionMapping(sessionId: string): Promise<boolean> {
    // No-op for now
    return true;
  }

  // ============================================================================
  // Wallet methods
  static async createWallet(walletData: {
    userId: string;
    publicKey: string;
    encryptedPrivateKey: string;
    isArtistWallet: boolean;
  }): Promise<Wallet> {
    return await prisma.wallet.create({
      data: {
        user: { connect: { id: walletData.userId } },
        public_key: walletData.publicKey,
        encrypted_private_key: walletData.encryptedPrivateKey,
        is_artist_wallet: walletData.isArtistWallet
      }
    });
  }

  static async getUserWallet(discordId: string): Promise<Wallet | null> {
    // First find the user by discord_id to get their UUID id
    const user = await prisma.user.findUnique({
      where: { discord_id: discordId }
    });
    
    if (!user) {
      return null;
    }
    
    // Then find wallet by user's UUID id
    return await prisma.wallet.findFirst({
      where: { user_id: user.id }
    });
  }

  static async getWalletByPublicKey(publicKey: string): Promise<Wallet | null> {
    return await prisma.wallet.findFirst({
      where: { public_key: publicKey }
    });
  }

  static async markWalletAsExported(publicKey: string): Promise<void> {
    await prisma.wallet.update({
      where: { public_key: publicKey },
      data: { exported_at: new Date() }
    });
  }

  static async deleteWallet(publicKey: string): Promise<void> {
    await prisma.wallet.delete({
      where: { public_key: publicKey }
    });
  }

  // Token methods
  static async getTokenByMint(mint: string): Promise<Token | null> {
    return await prisma.token.findFirst({
      where: { mint }
    });
  }

  static async getAllEnabledTokens(): Promise<Token[]> {
    return await prisma.token.findMany({
      where: { enabled: true },
      orderBy: { symbol: 'asc' }
    });
  }

  static async createToken(tokenData: {
    mint: string;
    symbol: string;
    decimals: number;
    logoUrl?: string;
    enabled?: boolean;
    defaultForRewards?: boolean;
  }): Promise<Token> {
    return await prisma.token.create({
      data: {
        mint: tokenData.mint,
        symbol: tokenData.symbol,
        decimals: tokenData.decimals,
        logo_url: tokenData.logoUrl,
        enabled: tokenData.enabled ?? true,
        default_for_rewards: tokenData.defaultForRewards ?? false
      }
    });
  }

  // Deposit methods
  static async createArtistDeposit(depositData: {
    artistDiscordId: string;
    tokenMint: string;
    amount: string;
    txSignature: string;
    status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  }): Promise<ArtistDeposit> {
    return await prisma.artistDeposit.create({
      data: {
        artist_discord_id: depositData.artistDiscordId,
        token_mint: depositData.tokenMint,
        amount: depositData.amount,
        tx_signature: depositData.txSignature,
        status: depositData.status
      }
    });
  }

  static async getDepositByTxSignature(txSignature: string): Promise<ArtistDeposit | null> {
    return await prisma.artistDeposit.findFirst({
      where: { tx_signature: txSignature }
    });
  }

  static async getUserDeposits(discordId: string): Promise<ArtistDeposit[]> {
    return await prisma.artistDeposit.findMany({
      where: { artist_discord_id: discordId },
      include: { token: true },
      orderBy: { created_at: 'desc' }
    });
  }

  static async getAllTokens(): Promise<Token[]> {
    return await prisma.token.findMany({
      orderBy: { symbol: 'asc' }
    });
  }

  static async updateToken(mint: string, updates: {
    enabled?: boolean;
    symbol?: string;
    decimals?: number;
    logo_url?: string;
    default_for_rewards?: boolean;
  }): Promise<Token> {
    return await prisma.token.update({
      where: { mint },
      data: updates
    });
  }

  // Withdrawal methods
  // REMOVED: Withdrawal operations - to be implemented later with proper security

  // Utility methods
  static async disconnect(): Promise<void> {
    await prisma.$disconnect();
  }

  // Rewards methods
  // DEPRECATED: rewardAccrual table no longer exists
  // static async getUserRecentRewards(discordId: string, limit: number = 5) {
  //   return await prisma.rewardAccrual.findMany({
  //     where: { user_discord_id: discordId },
  //     include: { token: true, raid: true },
  //     orderBy: { created_at: 'desc' },
  //     take: limit
  //   });
  // }

  // REMOVED: Action tokens for unsafe wallet operations - to be implemented later with proper security

  // Helper to update Discord username when missing
  static async ensureDiscordUsername(discordId: string, username: string): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { discord_id: discordId }
      });

      if (user && !user.discord_username) {
        await prisma.user.update({
          where: { discord_id: discordId },
          data: { discord_username: username }
        });
      }
    } catch (error) {
      console.warn('Failed to update Discord username:', error);
    }
  }

  // Leaderboard methods
  static async getTopUsersByRaids(limit: number = 10): Promise<any[]> {
    return await prisma.user.findMany({
      where: {
        total_parties_participated: { gt: 0 }
      },
      orderBy: [
        { total_parties_participated: 'desc' },
        { tokens_balance: 'desc' }
      ],
      take: limit
    });
  }

  // DEPRECATED: Use ListeningPartyParticipant instead
  static async getRecentWinners(limit: number = 10): Promise<any[]> {
    // return await prisma.raidParticipant.findMany({
    //   where: {
    //     qualified: true,
    //     qualified_at: { not: null }
    //   },
    //   include: {
    //     user: true,
    //     raid: true
    //   },
    //   orderBy: { qualified_at: 'desc' },
    //   take: limit
    // });

    // Return recent listening party participants instead
    return await prisma.listeningPartyParticipant.findMany({
      where: {
        qualified_at: { not: null }
      },
      include: {
        listening_party: true
      },
      orderBy: { qualified_at: 'desc' },
      take: limit
    });
  }

  static async getUserRankByRaids(discordId: string): Promise<any> {
    const user = await prisma.user.findUnique({
      where: { discord_id: discordId }
    });

    if (!user || user.total_parties_participated === 0) {
      return null;
    }

    const usersWithMoreRaids = await prisma.user.count({
      where: {
        total_parties_participated: { gt: user.total_parties_participated }
      }
    });

    const totalUsers = await prisma.user.count({
      where: {
        total_parties_participated: { gt: 0 }
      }
    });

    return {
      user,
      rank: usersWithMoreRaids + 1,
      totalUsers
    };
  }

  // Raw query method for backwards compatibility during transition
  static async query(sql: string, params: unknown[] = []): Promise<unknown> {
    console.warn('Raw SQL query used - consider migrating to Prisma:', sql);
    return await prisma.$queryRawUnsafe(sql, ...params);
  }
}

export default PrismaDatabase;
export { prisma, PrismaDatabase };
