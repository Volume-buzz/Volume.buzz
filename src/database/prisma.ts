import { PrismaClient, User, Raid, RaidParticipant, Admin, OAuthSession } from '@prisma/client';
import { DatabaseUser, Raid as RaidType, RaidParticipant as RaidParticipantType, UserRole } from '../types';

// Initialize Prisma client with proper configuration
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  errorFormat: 'pretty'
});

// Include types for complex queries
type UserWithWallet = User & {
  wallets?: any[];
};

type RaidWithParticipants = Raid & {
  participants: Array<RaidParticipant & {
    user: Pick<User, 'audius_handle' | 'audius_name'>;
  }>;
};

type ParticipantWithRaidAndUser = RaidParticipant & {
  raid: Pick<Raid, 'id' | 'track_id' | 'track_title' | 'reward_amount'> | null;
  user: Pick<User, 'audius_user_id' | 'audius_handle'> | null;
};

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
    audiusUserId: string;
    audiusHandle: string;
    audiusName: string;
    tokensBalance?: number;
  }): Promise<User> {
    return await prisma.user.upsert({
      where: { discord_id: userData.discordId },
      update: {
        audius_user_id: userData.audiusUserId,
        audius_handle: userData.audiusHandle,
        audius_name: userData.audiusName,
        last_updated: new Date()
      },
      create: {
        discord_id: userData.discordId,
        audius_user_id: userData.audiusUserId,
        audius_handle: userData.audiusHandle,
        audius_name: userData.audiusName,
        tokens_balance: userData.tokensBalance || 0
      }
    });
  }

  static async updateUserTokens(discordId: string, tokens: number): Promise<User> {
    return await prisma.user.update({
      where: { discord_id: discordId },
      data: {
        tokens_balance: { increment: tokens },
        total_rewards_claimed: { increment: 1 },
        last_updated: new Date()
      }
    });
  }

  static async deleteUser(discordId: string): Promise<User> {
    // Instead of deleting the user (which would break foreign key constraints),
    // we clear their Audius account data while preserving their raid history
    return await prisma.user.update({
      where: { discord_id: discordId },
      data: {
        audius_user_id: null,
        audius_handle: null,
        audius_name: null,
        last_updated: new Date()
      }
    });
  }

  static async updateUserRaidParticipation(discordId: string): Promise<User> {
    return await prisma.user.update({
      where: { discord_id: discordId },
      data: {
        total_raids_participated: { increment: 1 }
      }
    });
  }

  // Admin methods
  static async isAdmin(discordId: string): Promise<boolean> {
    const admin = await prisma.admin.findUnique({
      where: { discord_id: discordId }
    });
    return admin !== null;
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

  static async initializeAdmins(): Promise<void> {
    try {
      const adminIds = process.env.ADMIN_DISCORD_ID;
      if (adminIds) {
        const ids = adminIds.split(',').map(id => id.trim()).filter(id => id);
        
        for (const discordId of ids) {
          await this.addAdmin(discordId);
          console.log(`✅ Admin initialized: ${discordId}`);
        }
        
        console.log(`🔐 Initialized ${ids.length} admin(s)`);
      }
    } catch (error) {
      console.error('Error initializing admins:', error);
    }
  }

  // Raid methods
  static async createRaid(raidData: {
    trackId: string;
    trackUrl: string;
    trackTitle: string;
    trackArtist: string;
    trackArtworkUrl?: string;
    streamsGoal: number;
    rewardAmount: number;
    rewardTokenMint?: string;
    channelId: string;
    guildId: string;
    creatorId: string;
    durationMinutes: number;
  }): Promise<Raid> {
    const expiresAt = new Date(Date.now() + raidData.durationMinutes * 60 * 1000);
    
    return await prisma.raid.create({
      data: {
        track_id: raidData.trackId,
        track_url: raidData.trackUrl,
        track_title: raidData.trackTitle,
        track_artist: raidData.trackArtist,
        track_artwork_url: raidData.trackArtworkUrl,
        streams_goal: raidData.streamsGoal,
        reward_amount: raidData.rewardAmount,
        // reward_token_mint field removed as it doesn't exist in current schema
        channel_id: raidData.channelId,
        guild_id: raidData.guildId,
        creator_id: raidData.creatorId,
        duration_minutes: raidData.durationMinutes,
        expires_at: expiresAt
      }
    });
  }

  static async getActiveRaids(): Promise<Raid[]> {
    return await prisma.raid.findMany({
      where: {
        status: 'ACTIVE',
        expires_at: { gt: new Date() }
      }
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
                audius_handle: true,
                audius_name: true
              }
            }
          }
        }
      }
    });
  }

  // Participant methods
  static async addRaidParticipant(raidId: number | string, discordId: string, audiusUserId: string): Promise<RaidParticipant> {
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
        audius_user_id: audiusUserId,
        listen_start_time: new Date(),
        last_check: new Date(),
        is_listening: true,
        total_listen_duration: 0
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
            audius_user_id: true,
            audius_handle: true
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
            audius_handle: true,
            audius_name: true
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
            audius_user_id: true,
            audius_handle: true
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
            audius_user_id: true,
            audius_handle: true
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
            audius_user_id: true
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
    const updateData: any = {
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
        { total_raids_participated: 'desc' }
      ],
      take: limit,
      select: {
        discord_id: true,
        audius_handle: true,
        audius_name: true,
        tokens_balance: true,
        total_raids_participated: true
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
            audius_handle: true,
            audius_name: true
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
  static async createOAuthSession(state: string, discordId: string): Promise<OAuthSession> {
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    
    return await prisma.oAuthSession.create({
      data: {
        state: state,
        discord_id: discordId,
        expires_at: expiresAt
      }
    });
  }

  static async getOAuthSession(state: string): Promise<OAuthSession | null> {
    return await prisma.oAuthSession.findFirst({
      where: {
        state: state,
        expires_at: { gt: new Date() }
      }
    });
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

  // Utility methods
  static async disconnect(): Promise<void> {
    await prisma.$disconnect();
  }

  // Raw query method for backwards compatibility during transition
  static async query(sql: string, params: any[] = []): Promise<any> {
    console.warn('Raw SQL query used - consider migrating to Prisma:', sql);
    return await prisma.$queryRawUnsafe(sql, ...params);
  }
}

export default PrismaDatabase;
export { prisma, PrismaDatabase };
