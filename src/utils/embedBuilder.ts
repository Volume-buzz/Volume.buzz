import { 
  EmbedBuilder as DiscordEmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  Client,
  User as DiscordUser
} from 'discord.js';
import { Raid, DatabaseUser } from '../types';

// Types for track data (from Spotify API)
interface TrackData {
  id: string;
  title: string;
  duration?: number | string;
  genre?: string;
  permalink?: string;
  playCount?: number;
  artwork?: {
    _480x480?: string;
    _150x150?: string;
    _1000x1000?: string;
    _2000?: string;
    _640?: string;
  };
  user: {
    name: string;
    handle: string;
    verified?: boolean;
  };
  // Enhanced Spotify-specific metadata
  album?: string;
  releaseDate?: string;
  explicit?: boolean;
  isPlayable?: boolean;
  linkedTrackId?: string;
}

interface RaidWithTrack extends Raid {
  token_mint?: string;
  reward_per_completion?: number;
}

interface WinnerData {
  discord_id: string;
  spotify_display_name?: string;
  discord_username?: string;
  total_listen_duration: number;
  qualified_at: Date;
  claimed_reward: boolean;
}

class EmbedBuilderUtils {

  static createLeaderboardEmbed(users: any[], client: Client): DiscordEmbedBuilder {
    const embed = new DiscordEmbedBuilder()
      .setTitle('🏆 Raid Token Leaderboard')
      .setDescription('Top raiders by token count')
      .setColor(0xFFD700)
      .setTimestamp();

    if (users.length === 0) {
      embed.setDescription('No users on the leaderboard yet. Join some raids to get started!');
      return embed;
    }

    let description = '';
    users.forEach((user, index) => {
      const rank = index + 1;
      const emoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
      const discordUser = client.users.cache.get(user.discord_id);
      let displayName = 'Unknown User';
      
      if (discordUser) {
        displayName = discordUser.displayName || discordUser.username;
      } else {
        // Fallback to platform-specific names
        displayName = user.spotify_display_name || user.discord_username || 'Unknown User';
      }
      
      description += `${emoji} **${displayName}** - ${user.tokens_balance} tokens (${user.total_raids_participated} raids)\n`;
    });

    embed.setDescription(description);
    embed.setFooter({ text: 'Updated every 5 minutes' });

    return embed;
  }

  static createWinnersEmbed(raid: Raid, winners: WinnerData[], client: Client): DiscordEmbedBuilder {
    const embed = new DiscordEmbedBuilder()
      .setTitle('🏆 Last Raid Winners')
      .setColor(0xFFD700)
      .setTimestamp();

    // Add raid info
    const raidCompletedAt = new Date(raid.completed_at!);
    const timeAgo = Math.floor((Date.now() - raidCompletedAt.getTime()) / (1000 * 60));
    
    embed.setDescription(
      `**${raid.track_title}** by ${raid.track_artist}\n` +
      `Completed ${timeAgo < 60 ? `${timeAgo}m ago` : `${Math.floor(timeAgo / 60)}h ${timeAgo % 60}m ago`}\n` +
      `**${winners.length}/${raid.streams_goal}** qualified participants\n\n` +
      `**🎯 Winners (ranked by completion time):**`
    );

    // Add winners list
    let winnersText = '';
    winners.forEach((winner, index) => {
      const rank = index + 1;
      const emoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
      
      const discordUser = client.users.cache.get(winner.discord_id);
      let displayName = 'Unknown User';
      
      if (discordUser) {
        displayName = discordUser.displayName || discordUser.username;
      } else {
        // Fallback to platform-specific names
        displayName = winner.spotify_display_name || winner.discord_username || 'Unknown User';
      }
      
      const listenDuration = winner.total_listen_duration;
      const claimed = winner.claimed_reward ? '✅' : '❌';
      
      winnersText += `${emoji} **${displayName}** - ${listenDuration}s ${claimed}\n`;
    });

    embed.addFields({
      name: '🎵 Qualification Results',
      value: winnersText,
      inline: false
    });

    // Add reward info
    const totalRewards = winners.filter(w => w.claimed_reward).length;
    embed.addFields(
      {
        name: '💰 Reward Pool',
        value: `${raid.reward_amount} tokens each`,
        inline: true
      },
      {
        name: '🎁 Claimed',
        value: `${totalRewards}/${winners.length}`,
        inline: true
      }
    );

    // Show first finisher if available
    if (raid.first_finisher_handle) {
      embed.addFields({
        name: '⚡ First to Complete',
        value: `**${raid.first_finisher_handle}** 🎉`,
        inline: true
      });
    }

    embed.setFooter({ text: `Raid ID: ${raid.id} | ✅ = Claimed Rewards` });

    return embed;
  }

  static createRaidEmbed(raid: RaidWithTrack, track: TrackData, isActive: boolean = true): DiscordEmbedBuilder {
    const progress = Math.min((raid.current_streams / raid.streams_goal) * 100, 100);
    const progressBar = this.createProgressBar(progress);
    
    const isCryptoRaid = raid.token_mint && raid.token_mint !== 'SOL';
    const raidTitle = isCryptoRaid ? 
      `💎 🎶 CRYPTO RAID ${isActive ? 'ACTIVE' : 'COMPLETED'}` : 
      `🎯 🎶 SPOTIFY RAID ${isActive ? 'ACTIVE' : 'COMPLETED'}`;
    
    const embed = new DiscordEmbedBuilder()
      .setTitle(raidTitle)
      .setColor(isActive ? (isCryptoRaid ? 0xFFD700 : 0x1DB954) : 0xFF6B6B)
      .setTimestamp(raid.created_at);

    // Add GIF for active raids (smaller, as thumbnail instead of large image)
    if (isActive) {
      embed.setThumbnail('https://i.imgur.com/zcTJeGH.gif');
    }

    // Main description with enhanced track info
    const duration = track.duration ? 
      (typeof track.duration === 'string' ? track.duration : 
       Math.floor(track.duration / 60) + ':' + (track.duration % 60).toString().padStart(2, '0')) : 
      'Unknown';
    
    // Build Spotify track URL
    const trackUrl = `https://open.spotify.com/track/${raid.track_id}`;
    
    // Enhanced description with clickable track link
    const artistInfo = track.user.verified ? `✅ ${track.user.name}` : track.user.name;
    const playCountText = track.playCount ? ` | **${track.playCount.toLocaleString()}** plays` : '';
    
    // Spotify metadata display
    const explicitTag = track.explicit ? ' 🔞' : '';
    const albumInfo = track.album ? ` | 💿 **Album:** ${track.album}` : '';
    const relinkingInfo = track.linkedTrackId ? '\n🔄 *Alternative version may play in some regions*' : '';
    const playabilityWarning = track.isPlayable === false ? '\n⚠️ *May not be available in all regions*' : '';
    
    const metadataLine = `🎨 **Genre:** ${track.genre || 'Music'} | ⏱️ **Duration:** ${duration}${explicitTag}${albumInfo}${playCountText}${relinkingInfo}${playabilityWarning}`;
    
    embed.setDescription(
      `## 🎵 **[${track.title}](${trackUrl})**\n\n` +
      `🎤 **Artist:** ${artistInfo} (@${track.user.handle})\n` +
      `${metadataLine}\n` +
      `🎧 **Platform:** Spotify${raid.premium_only ? ' 👑 (Premium Required)' : ''}\n\n` +
      `💰 **Reward:** ${raid.reward_amount} ${raid.token_mint || 'SOL'} tokens each\n` +
      `⏰ **Listen for:** ${raid.required_listen_time} seconds to qualify`
    );

    // Use larger artwork as main image if available
    if (track.artwork) {
      const artworkUrl = track.artwork._1000x1000 || track.artwork._480x480 || track.artwork._150x150;
      if (artworkUrl) {
        embed.setImage(artworkUrl);
      }
    }

    embed.addFields(
      {
        name: '📊 Raid Progress',
        value: `${progressBar}\n**${raid.current_streams}/${raid.streams_goal}** streams (**${Math.floor(progress)}%** complete)`,
        inline: false
      },
      {
        name: '🏆 Reward Pool',
        value: raid.token_mint && raid.token_mint !== 'SOL' ? 
          `**${raid.reward_per_completion || raid.reward_amount}** crypto tokens per participant\n💎 *Real ${raid.token_mint.substring(0, 8)}... tokens*` :
          `**${raid.reward_amount}** tokens per participant`,
        inline: true
      },
      {
        name: '⏱️ Listen Requirement',
        value: `**${process.env.MINIMUM_LISTEN_TIME || 30}** seconds minimum`,
        inline: true
      },
      {
        name: '⏰ Raid Duration',
        value: `**${raid.duration_minutes}** minutes`,
        inline: true
      }
    );

    if (isActive) {
      const timeLeft = this.getTimeRemaining(raid.expires_at);
      embed.addFields({
        name: '⏳ Time Remaining',
        value: `**${timeLeft}**`,
        inline: true
      });
    }

    embed.setFooter({ 
      text: isActive ? `Raid ID: ${raid.id} | Listen for ${process.env.MINIMUM_LISTEN_TIME || 30}+ seconds to qualify!` : `Raid ID: ${raid.id} | Completed`
    });

    return embed;
  }

  static createRaidCompletionEmbed(
    raid: Raid, 
    track: TrackData, 
    firstFinisher: string | null, 
    totalQualified: number, 
    totalTokensDistributed: number
  ): DiscordEmbedBuilder {
    const embed = new DiscordEmbedBuilder()
      .setTitle('✅ RAID COMPLETED!')
      .setColor(0x00FF00)
      .setImage('https://i.imgur.com/N6HhP5R.gif')
      .setTimestamp();

    // Main description
    embed.setDescription(
      `## **${track.title}**\n` +
      `**Artist:** ${track.user.name} (@${track.user.handle})\n\n` +
      `🎉 **Raid successfully completed!**`
    );

    // Add fields
    const fields = [
      {
        name: '🏁 First Finisher',
        value: firstFinisher ? `🥇 **${firstFinisher}**` : 'No finishers',
        inline: true
      },
      {
        name: '👥 Qualified Users',
        value: `**${totalQualified}**`,
        inline: true
      },
      {
        name: '💰 Tokens Distributed',
        value: `**${totalTokensDistributed}** tokens`,
        inline: true
      }
    ];

    embed.addFields(fields);

    embed.setFooter({ 
      text: `Raid ID: ${raid.id} | Congratulations to all participants!`
    });

    return embed;
  }

  static createRaidCompletionAnnouncement(
    raid: Raid, 
    track: TrackData, 
    firstFinisher: string | null, 
    totalQualified: number, 
    totalTokensDistributed: number
  ): DiscordEmbedBuilder {
    const embed = new DiscordEmbedBuilder()
      .setTitle('✅ RAID COMPLETED!')
      .setColor(0x00FF00)
      .setImage('https://i.imgur.com/N6HhP5R.gif')
      .setTimestamp();

    // Main description
    embed.setDescription(
      `## **${track.title}**\n` +
      `**Artist:** ${track.user.name} (@${track.user.handle})\n\n` +
      `🎉 **Raid successfully completed!** 🎉\n\n` +
      `**Qualified participants can now claim their rewards!**`
    );

    // Add fields
    const fields = [
      {
        name: '🏁 First Finisher',
        value: firstFinisher ? `🥇 **${firstFinisher}**` : 'No finishers',
        inline: true
      },
      {
        name: '👥 Qualified Users',
        value: `**${totalQualified}**`,
        inline: true
      },
      {
        name: '💰 Total Tokens',
        value: `**${totalTokensDistributed}** tokens`,
        inline: true
      }
    ];

    embed.addFields(fields);

    embed.setFooter({ 
      text: `Raid ID: ${raid.id} | Click "Claim Rewards" to get your tokens!`
    });

    return embed;
  }

  static createProgressBar(percentage: number, length: number = 10): string {
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;
    return '🟩'.repeat(filled) + '⬜'.repeat(empty) + ` (${Math.floor(percentage)}%)`;
  }

  static getTimeRemaining(expiresAt: Date): string {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diff = expiry.getTime() - now.getTime();

    if (diff <= 0) return 'Expired';

    const totalMinutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  static createRaidButtons(
    raidId: number, 
    isActive: boolean = true, 
    canClaim: boolean = false, 
    trackUrl: string | null = null
  ): ActionRowBuilder<ButtonBuilder> {
    const buttons: ButtonBuilder[] = [];
    
    // Listen button - always show if we have a track URL
    if (trackUrl) {
      buttons.push(
        new ButtonBuilder()
          .setURL(trackUrl)
          .setLabel('Listen')
          .setStyle(ButtonStyle.Link)
          .setEmoji('🎵')
      );
    }

    // Verify button (renamed from Join Raid) - only show for active raids
    if (isActive) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`join_raid_${raidId}`)
          .setLabel('Verify')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('✅')
      );
    }

    // Claim button - always show, disabled for active raids, enabled when completed
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`claim_reward_${raidId}`)
        .setLabel('Claim Rewards')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🎁')
        .setDisabled(isActive) // Disabled for active raids, enabled when completed
    );

    return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
  }

  static createCompletionButtons(raidId: number, trackUrl: string | null = null): ActionRowBuilder<ButtonBuilder> {
    const buttons: ButtonBuilder[] = [];
    
    // Listen button - always show if we have a track URL
    if (trackUrl) {
      buttons.push(
        new ButtonBuilder()
          .setURL(trackUrl)
          .setLabel('Listen')
          .setStyle(ButtonStyle.Link)
          .setEmoji('🎵')
      );
    }
    
    // Claim button for completed raids
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`claim_reward_${raidId}`)
        .setLabel('Claim Rewards')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🎁')
    );

    return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
  }




  static createErrorEmbed(title: string, description: string): DiscordEmbedBuilder {
    return new DiscordEmbedBuilder()
      .setTitle(`❌ ${title}`)
      .setDescription(description)
      .setColor(0xFF0000)
      .setTimestamp();
  }

  static createSuccessEmbed(title: string, description: string): DiscordEmbedBuilder {
    return new DiscordEmbedBuilder()
      .setTitle(`✅ ${title}`)
      .setDescription(description)
      .setColor(0x00FF00)
      .setTimestamp();
  }

  static createInfoEmbed(title: string, description: string): DiscordEmbedBuilder {
    return new DiscordEmbedBuilder()
      .setTitle(`ℹ️ ${title}`)
      .setDescription(description)
      .setColor(0x3498DB)
      .setTimestamp();
  }

  // Backward compatibility methods
  static createJoinRaidButton(raidId: number, disabled: boolean = false): ActionRowBuilder<ButtonBuilder> {
    return this.createRaidButtons(raidId, true, false);
  }

  static createClaimRewardButton(raidId: number, disabled: boolean = false): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`claim_reward_${raidId}`)
          .setLabel('Claim Rewards')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🏆')
          .setDisabled(disabled)
      );
  }
}

export default EmbedBuilderUtils;
