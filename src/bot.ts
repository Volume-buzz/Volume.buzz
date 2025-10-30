import { 
  Client, 
  GatewayIntentBits, 
  Collection, 
  REST, 
  Routes,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  User as DiscordUser,
  Guild,
  EmbedBuilder as DiscordEmbedBuilder
} from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

// Import types
import { Command } from './types';

// Services
import OAuthServer from './services/oauthServer';
// import RaidMonitor from './services/raidMonitor'; // DEPRECATED
import ListeningTracker from './services/listeningTracker';
import PartyPosterService from './services/partyPoster';
import PrismaDatabase, { prisma } from './database/prisma';
import EmbedBuilder from './utils/embedBuilder';
import WalletService from './services/wallet';
import SpotifyAuthService from './services/spotify/SpotifyAuthService';
import SpotifyApiService from './services/spotify/SpotifyApiService';
import config from './config/environment';

class SpotifyBot {
  public client: Client;
  private oauthServer: OAuthServer;
  // private raidMonitor: RaidMonitor; // DEPRECATED - Using ListeningTracker instead
  private listeningTracker: ListeningTracker;
  public partyPoster: PartyPosterService;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers
      ]
    });

    // Initialize commands collection
    this.client.commands = new Collection<string, Command>();

    this.oauthServer = new OAuthServer(this);
    // this.raidMonitor = new RaidMonitor(this.client); // DEPRECATED - Using ListeningTracker instead
    this.listeningTracker = new ListeningTracker(this.client);
    this.partyPoster = new PartyPosterService(this.client);

    this.setupEventHandlers();
    this.loadCommands();
  }

  private setupEventHandlers(): void {
    this.client.once('ready', async () => {
      console.log('🤖 Discord bot is ready!');
      console.log(`📱 Logged in as ${this.client.user?.tag}`);
      console.log(`🏠 Serving ${this.client.guilds.cache.size} guild(s)`);

      // Initialize admins from environment
      await PrismaDatabase.initializeAdmins();

      // Sync all current guilds to database
      console.log('🔄 Syncing guilds to database...');
      for (const [, guild] of this.client.guilds.cache) {
        await this.syncGuildToDatabase(guild);
      }

      // Start services
      this.oauthServer.start();
      // this.raidMonitor.start(); // DEPRECATED - Using ListeningTracker instead

      console.log('🎵 Listening Party Bot fully operational!');
    });

    this.client.on('error', (error: Error) => {
      console.error('Discord client error:', error);
    });

    this.client.on('warn', (warning: string) => {
      console.warn('Discord client warning:', warning);
    });

    this.client.on('interactionCreate', async (interaction) => {
      if (interaction.isChatInputCommand()) {
        await this.handleCommand(interaction);
      } else if (interaction.isButton()) {
        await this.handleButton(interaction);
      }
    });

    // Guild events - track servers for analytics
    this.client.on('guildCreate', async (guild: Guild) => {
      console.log(`🏠 Bot joined new server: ${guild.name} (${guild.id})`);
      await this.syncGuildToDatabase(guild);
    });

    this.client.on('guildUpdate', async (_oldGuild: Guild, newGuild: Guild) => {
      await this.syncGuildToDatabase(newGuild);
    });

    this.client.on('guildDelete', async (guild: Guild) => {
      console.log(`👋 Bot removed from server: ${guild.name} (${guild.id})`);
      // Mark bot as not installed for this server
      await this.updateGuildBotStatus(guild.id, false);
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Received SIGINT, shutting down gracefully...');
      this.shutdown();
    });

    process.on('SIGTERM', () => {
      console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
      this.shutdown();
    });
  }

  private loadCommands(): void {
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => {
      const ext = path.extname(file);
      return (ext === '.ts' || ext === '.js') && !file.endsWith('.d.ts');
    });

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      try {
        // Use require for now to maintain compatibility during migration
        const command = require(filePath);
        const commandData = command.default || command;
        
        if ('data' in commandData && 'execute' in commandData) {
          this.client.commands.set(commandData.data.name, commandData);
          console.log(`📝 Loaded command: ${commandData.data.name}`);
        } else {
          console.warn(`⚠️  The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
      } catch (error) {
        console.error(`❌ Error loading command ${file}:`, error);
      }
    }
  }

  private async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const command = this.client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`❌ No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error executing command ${interaction.commandName}:`, error);
      
      const errorEmbed = EmbedBuilder.createErrorEmbed(
        'Command Error',
        'There was an error executing this command. Please try again.'
      );

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ embeds: [errorEmbed] });
        } else {
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
      } catch (replyError) {
        console.error('Error sending error reply:', replyError);
      }
    }
  }

  private async handleButton(interaction: ButtonInteraction): Promise<void> {
    const customId = interaction.customId;

    try {
      // NEW: Listening party buttons
      if (customId.startsWith('listen_')) {
        await this.handleListenButton(interaction);
      } else if (customId.startsWith('claim_')) {
        await this.handleClaimButton(interaction);
      } else if (customId === 'disconnect_wallet') {
        await this.handleDisconnectWallet(interaction);
      // OLD: Raid buttons (for backwards compatibility)
      } else if (customId.startsWith('join_raid_')) {
        await this.handleJoinRaid(interaction);
      } else if (customId.startsWith('claim_reward_')) {
        await this.handleClaimReward(interaction);
      } else if (customId === 'logout_account') {
        await this.handleLogout(interaction);
      } else if (customId === 'login_audius') {
        await this.handleAudiusLogin(interaction);
      } else if (customId === 'logout_audius') {
        await this.handleAudiusLogout(interaction);
      } else if (customId === 'export_private_key') {
        await this.handleExportPrivateKey(interaction);
      } else if (customId === 'view_transactions') {
        await this.handleViewTransactions(interaction);
      } else if (customId === 'quick_account') {
        await this.handleQuickAccount(interaction);
      } else if (customId === 'quick_wallet') {
        await this.handleQuickWallet(interaction);
      } else if (customId === 'view_wallet_info') {
        await this.handleViewWalletInfo(interaction);
      } else if (customId.startsWith('spotify_queue_')) {
        await this.handleSpotifyQueue(interaction);
      } else {
        console.warn(`Unknown button interaction: ${customId}`);
      }
    } catch (error) {
      console.error(`Error handling button ${customId}:`, error);
      
      const errorEmbed = EmbedBuilder.createErrorEmbed(
        'Button Error',
        'There was an error processing your request. Please try again.'
      );

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ embeds: [errorEmbed] });
        } else {
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
      } catch (replyError) {
        console.error('Error sending error reply:', replyError);
      }
    }
  }

  // ===== NEW LISTENING PARTY BUTTON HANDLERS =====

  private async handleDisconnectWallet(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const discordId = interaction.user.id;

    try {
      const axios = (await import('axios')).default;
      const API_BASE = config.api.publicUrl || 'http://localhost:3001';

      // Call the unlink API
      await axios.post(`${API_BASE}/api/wallet/unlink`, {
        discord_id: discordId,
      });

      const embed = new DiscordEmbedBuilder()
        .setColor(0x10b981)
        .setTitle('🔓 Wallet Disconnected')
        .setDescription('Your wallet has been successfully disconnected.\n\nYou can reconnect anytime using `/wallet`.')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
      console.error('Error disconnecting wallet:', error);

      const embed = EmbedBuilder.createErrorEmbed(
        'Error',
        'Failed to disconnect wallet. Please try again later.'
      );
      await interaction.editReply({ embeds: [embed] });
    }
  }

  private async handleListenButton(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const partyId = interaction.customId.replace('listen_', '');
    const discordId = interaction.user.id;

    try {
      // Get user to check Audius account
      const user = await PrismaDatabase.getUser(discordId);
      if (!user || !user.audius_user_id) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Audius Account Required',
          'You need to connect your Audius account first.\n\nPlease visit the dashboard to link your Audius account.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Fetch party details
      const axios = (await import('axios')).default;
      const API_BASE = config.api.publicUrl || 'http://localhost:3001';

      const partyRes = await axios.get(`${API_BASE}/api/listening-parties/${partyId}`);
      const party = partyRes.data;

      if (!party) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Party Not Found',
          'This listening party no longer exists.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Check if party is active
      if (party.status !== 'ACTIVE' || new Date(party.timing.expires_at) < new Date()) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Party Inactive',
          'This listening party has ended or is no longer active.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Join party
      await axios.post(`${API_BASE}/api/listening-parties/${partyId}/participants`, {
        discord_id: discordId,
        discord_handle: interaction.user.username,
      });

      // Start tracking
      const result = await this.listeningTracker.startTracking(
        partyId,
        discordId,
        user.audius_user_id,
        party.track.id,
        party.track.title
      );

      if (!result.success) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Tracking Error',
          result.message
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const embed = new DiscordEmbedBuilder()
        .setColor(0x10b981)
        .setTitle('✅ Listening Tracking Started!')
        .setDescription(`**${party.track.title}** by ${party.track.artist}\n\nWe're now tracking your listening progress. Make sure you:\n\n1. Click **"Play"** to open the track on Audius\n2. Play the track for at least 30 seconds\n3. Check your DMs for progress updates!`)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
      console.error('Error handling listen button:', error);

      const errorMessage = error.response?.data?.error || error.message || 'Unknown error occurred';
      const embed = EmbedBuilder.createErrorEmbed(
        'Error',
        `Failed to start listening: ${errorMessage}`
      );
      await interaction.editReply({ embeds: [embed] });
    }
  }

  private async handleClaimButton(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const partyId = interaction.customId.replace('claim_', '');
    const discordId = interaction.user.id;

    try {
      const axios = (await import('axios')).default;
      const API_BASE = config.api.publicUrl || 'http://localhost:3001';

      // Check wallet status
      const walletRes = await axios.get(`${API_BASE}/api/wallet/status/${discordId}`);

      if (!walletRes.data.connected) {
        const connectRes = await axios.get(`${API_BASE}/api/wallet/connect-url?discord_id=${discordId}`);

        const embed = new DiscordEmbedBuilder()
          .setColor(0xf59e0b)
          .setTitle('🔗 Wallet Required')
          .setDescription('You need to connect a wallet before claiming rewards.\n\nClick the link below to connect your Solana wallet:')
          .addFields({
            name: 'Connect Wallet',
            value: `[Click here to connect](${connectRes.data.connect_url})`,
            inline: false,
          })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Fetch party and check qualification
      const partyRes = await axios.get(`${API_BASE}/api/listening-parties/${partyId}`);
      const party = partyRes.data;

      const participant = party.participants.find((p: any) => p.discord_id === discordId);

      if (!participant) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Not a Participant',
          'You are not a participant in this listening party.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (!participant.qualified_at) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Not Qualified',
          `You need to listen for at least 30 seconds to qualify.\n\nCurrent listening time: ${participant.listening_duration || 0}s / 30s`
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (participant.claimed_at) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Already Claimed',
          'You have already claimed rewards for this party!'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Generate claim URL
      const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const claimUrl = `${APP_URL}/claim/${partyId}?discordId=${discordId}`;

      const embed = new DiscordEmbedBuilder()
        .setColor(0x10b981)
        .setTitle('🎁 Claim Your Rewards')
        .setDescription(`You're qualified to claim ${party.reward.tokens_per_participant} tokens!\n\nClick the link below to claim:`)
        .addFields({
          name: 'Claim Link',
          value: `[Click here to claim your rewards](${claimUrl})`,
          inline: false,
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
      console.error('Error handling claim button:', error);

      const errorMessage = error.response?.data?.error || error.message || 'Unknown error occurred';
      const embed = EmbedBuilder.createErrorEmbed(
        'Error',
        `Failed to process claim: ${errorMessage}`
      );
      await interaction.editReply({ embeds: [embed] });
    }
  }

  // ===== OLD RAID HANDLERS (FOR BACKWARDS COMPATIBILITY) =====

  private async handleJoinRaid(interaction: ButtonInteraction): Promise<any> {
    await interaction.deferReply({ ephemeral: true });

    const raidId = parseInt(interaction.customId.split('_')[2]);
    const userId = interaction.user.id;

    // SECURITY FIX: Validate raidId is a positive integer
    if (!raidId || raidId <= 0) {
      const embed = EmbedBuilder.createErrorEmbed(
        'Invalid Raid',
        'Invalid raid identifier.'
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Get raid info first to check platform requirements
    const raid = await PrismaDatabase.getRaid(raidId);
    if (!raid) {
      const embed = EmbedBuilder.createErrorEmbed(
        'Raid Not Found',
        'This raid no longer exists or has been removed.'
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Check if user has the required platform account
    const user = await PrismaDatabase.getUser(userId);
    if (!user) {
      const embed = EmbedBuilder.createErrorEmbed(
        'Account Not Found',
        'You need to connect your music account first!\n\nUse `/login` to connect your account and start earning tokens.'
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Spotify authentication check (all raids are Spotify-only now)
    if (!user.spotify_user_id) {
      const embed = EmbedBuilder.createErrorEmbed(
        'Spotify Account Required',
        'You need to connect your Spotify account first.\n\nUse `/login` to connect your Spotify account.'
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Check premium requirement for premium-only raids
    if (raid.premium_only && !user.spotify_is_premium) {
      const embed = EmbedBuilder.createErrorEmbed(
        'Spotify Premium Required',
        '🔒 **This raid requires Spotify Premium**\n\n' +
        'Premium-only raids offer enhanced tracking with embedded players.\n\n' +
        'Upgrade to Spotify Premium or wait for non-premium raids!'
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Continue with existing raid validation logic
    if (!raid) {
      const embed = EmbedBuilder.createErrorEmbed(
        'Raid Not Found',
        'This raid no longer exists or has been removed.'
      );
      
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // SECURITY FIX: Verify raid is in the same guild as the interaction
    if (raid.guild_id !== interaction.guild?.id) {
      const embed = EmbedBuilder.createErrorEmbed(
        'Access Denied',
        'You can only join raids in this server.'
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (raid.status !== 'ACTIVE' || (raid.expires_at && new Date(raid.expires_at) <= new Date())) {
      const embed = EmbedBuilder.createErrorEmbed(
        'Raid Inactive',
        'This raid has ended or expired. You can no longer join it.'
      );
      
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Check if user is already a participant
    const existingParticipant = await PrismaDatabase.checkExistingParticipant(raidId, userId);

    if (existingParticipant) {
      const embed = EmbedBuilder.createErrorEmbed(
        'Already Joined',
        'You are already participating in this raid!'
      );
      
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Check if raid is at capacity
    const currentCount = await PrismaDatabase.getParticipantCount(raidId);
    
    if (currentCount >= raid.streams_goal) {
      const embed = EmbedBuilder.createErrorEmbed(
        'Raid Full',
        `This raid is at capacity (${raid.streams_goal}/${raid.streams_goal} seats filled).\n\nInactive participants will be removed after 60 seconds of not listening. Try again in a moment!`
      );
      
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Add user as participant with Spotify user ID
    const platformUserId = user.spotify_user_id;
    await PrismaDatabase.addRaidParticipant(raidId, userId, platformUserId || undefined);

    // Update user's raid participation count
    await PrismaDatabase.updateUserRaidParticipation(userId);

    // Start platform-specific tracking
    // await this.raidMonitor.addParticipant(userId, raidId, platformUserId || undefined); // DEPRECATED

    // Spotify-only messages
    const platformIcon = '🎶';
    const platformName = 'Spotify';
    
    let trackingMessage = `🎧 **Raid Joined!**\nStart playing the track on **${platformName}** now! Your progress will be tracked once you begin listening.\n\n⏱️ **You have 20 seconds to start listening, or you'll be removed from the raid.**`;
    
    if (raid.premium_only && user.spotify_is_premium) {
      trackingMessage += '\n\n👑 **Premium Mode:** Enhanced tracking with embedded player available!';
    }

    const embed = EmbedBuilder.createSuccessEmbed(
      'Raid Joined!',
      `You've successfully joined the ${platformName} raid!\n\n` +
      `${platformIcon} **Track:** ${raid.track_title}\n` +
      `⏰ **Listen for at least ${raid.required_listen_time} seconds to qualify**\n` +
      `💰 **Reward:** ${raid.reward_amount} tokens\n` +
      `🎵 **Platform:** ${platformName}${raid.premium_only ? ' (Premium)' : ''}\n\n` +
      `${trackingMessage}\n\n` +
      `I'll send you DMs to track your progress!`
    );

    // Create action buttons for Spotify raids (always available since Spotify-only)
    const actionRows: any[] = [];
    const buttons: ButtonBuilder[] = [];

    // Open in Spotify button (for all users)
    buttons.push(
      new ButtonBuilder()
        .setLabel('Open in Spotify')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://open.spotify.com/track/${raid.track_id}`)
        .setEmoji('🎶')
    );

    // Premium-only features
    if (user.spotify_is_premium) {
      // Add to Queue button
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`spotify_queue_${raidId}_${userId}`)
          .setLabel('Add to Queue')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('➕')
      );

      // Open Player button (if premium-only raid)
      if (raid.premium_only) {
        buttons.push(
          new ButtonBuilder()
            .setLabel('Open Player')
            .setStyle(ButtonStyle.Link)
            .setURL(`${process.env.BASE_URL || 'http://localhost:3000'}/player/${userId}/${raidId}/${raid.track_id}`)
            .setEmoji('🎮')
        );
      }
    }

    if (buttons.length > 0) {
      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
      actionRows.push(actionRow);
    }

    const replyOptions: any = { embeds: [embed] };
    if (actionRows.length > 0) {
      replyOptions.components = actionRows;
    }

    await interaction.editReply(replyOptions);
  }

  private async handleClaimReward(interaction: ButtonInteraction): Promise<any> {
    await interaction.deferReply({ ephemeral: true });

    const raidId = parseInt(interaction.customId.split('_')[2]);
    const userId = interaction.user.id;

    // SECURITY FIX: Validate raidId is a positive integer
    if (!raidId || raidId <= 0) {
      const embed = EmbedBuilder.createErrorEmbed(
        'Invalid Raid',
        'Invalid raid identifier.'
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Check if user is linked to Spotify
    const user = await PrismaDatabase.getUser(userId);
    if (!user || !user.spotify_user_id) {
      const embed = EmbedBuilder.createErrorEmbed(
        'Account Not Linked',
        'You need to link your Spotify account to claim rewards!\n\nUse `/login` to connect your account.'
      );
      
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Check if raid exists
    const raid = await PrismaDatabase.getRaid(raidId);
    if (!raid) {
      const embed = EmbedBuilder.createErrorEmbed(
        'Raid Not Found',
        'This raid no longer exists.'
      );
      
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // SECURITY FIX: Verify raid is in the same guild as the interaction
    if (raid.guild_id !== interaction.guild?.id) {
      const embed = EmbedBuilder.createErrorEmbed(
        'Access Denied',
        'You can only claim rewards for raids in this server.'
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Check if user participated and is qualified
    const participantData = await PrismaDatabase.checkExistingParticipant(raidId, userId);

    if (!participantData) {
      const embed = EmbedBuilder.createErrorEmbed(
        'Not Eligible',
        'You did not participate in this raid.'
      );
      
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (!participantData.qualified) {
      const embed = EmbedBuilder.createErrorEmbed(
        'Not Qualified',
        `You didn't listen for long enough to qualify for rewards.\n\n` +
        `**Required:** ${config.bot.minimumListenTime} seconds\n` +
        `**Your time:** ${participantData.total_listen_duration || 0} seconds`
      );
      
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (participantData.claimed_reward) {
      const embed = EmbedBuilder.createErrorEmbed(
        'Already Claimed',
        'You have already claimed your reward for this raid.'
      );
      
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Use the new crypto reward claiming service
    try {
      const RewardClaimingService = require('./services/rewardClaiming').default;
      const claimingService = new RewardClaimingService();
      
      const claimResult = await claimingService.claimReward(userId, raidId);

      const embed = EmbedBuilder.createSuccessEmbed(
        'Crypto Reward Claimed!',
        `🎉 **${claimResult.amount} ${claimResult.tokenMint.substring(0, 8)}... tokens** transferred to your wallet!\n\n` +
        `**Raid:** ${raid.track_title}\n` +
        `**Listen time:** ${participantData.total_listen_duration} seconds\n` +
        `**Transaction:** \`${claimResult.transactionHash}\`\n\n` +
        `Use \`/wallet\` to view your updated balance!`
      );

      await interaction.editReply({ embeds: [embed] });

      console.log(`💰 ${user.spotify_display_name} claimed ${claimResult.amount} ${claimResult.tokenMint} tokens from raid ${raidId} - TX: ${claimResult.transactionHash}`);
      
    } catch (claimError: any) {
      console.error('Error claiming crypto reward:', claimError);
      
      const errorEmbed = EmbedBuilder.createErrorEmbed(
        'Claim Failed',
        `Failed to transfer tokens: ${claimError.message}\n\nPlease try again or contact support.`
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }




  private async handleLogout(interaction: ButtonInteraction): Promise<any> {
    await interaction.deferReply({ ephemeral: true });

    try {
      // Get user data before deletion for confirmation message
      const user = await PrismaDatabase.getUser(interaction.user.id);
      
      if (!user || !user.spotify_user_id) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Not Logged In',
          'You don\'t have a Spotify account connected to logout from.'
        );
        await interaction.editReply({ embeds: [embed] });
      return;
      }

      // Delete user from database
      await PrismaDatabase.deleteUser(interaction.user.id);

      // Send confirmation
      const embed = EmbedBuilder.createSuccessEmbed(
        'Successfully Logged Out',
        `Your Spotify account **@${user.spotify_display_name}** has been disconnected from Discord.\n\n` +
        `**Note:** Your raid tokens (${user.tokens_balance || 0}) have been reset.\n\n` +
        `Use \`/login\` anytime to connect a new Spotify account.`
      );

      await interaction.editReply({ embeds: [embed] });

      console.log(`🚪 User ${interaction.user.tag} (${interaction.user.id}) logged out from Spotify account @${user.spotify_display_name}`);

    } catch (error) {
      console.error('Error handling logout:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Logout Error',
        'There was an error logging you out. Please try again or contact support.'
      );
      
      await interaction.editReply({ embeds: [embed] });
    }
  }

  private async handleAudiusLogin(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      if (!config.audius.apiKey) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Audius Not Configured',
          'Audius integration is unavailable because the API key has not been configured. Please contact an administrator.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const authUrl = await this.oauthServer.generateAuthUrl(interaction.user.id, 'AUDIUS');
      
      const embed = EmbedBuilder.createSuccessEmbed(
        'Audius Login',
        `🎧 **Click the link below to connect your Audius account:**\n\n` +
        `[🔐 **Connect Audius Account**](${authUrl})\n\n` +
        `**What happens next:**\n` +
        `1. You'll be redirected to Audius\n` +
        `2. Authorize Volume to view your profile\n` +
        `3. We\'ll link your Discord and Audius accounts\n` +
        `4. A confirmation DM will be sent once complete\n` +
        `5. Start joining raids with your Audius identity!\n\n` +
        `*This link expires in 10 minutes.*`
      );

      await interaction.editReply({ embeds: [embed] });
      
      console.log(`🔗 Generated Audius OAuth URL for ${interaction.user.tag}`);
    } catch (error) {
      console.error('Error generating Audius auth URL:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Login Error',
        'Failed to generate Audius login URL. Please try again.'
      );
      
      await interaction.editReply({ embeds: [embed] });
    }
  }

  private async handleSpotifyQueue(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const parts = interaction.customId.split('_');
      const raidId = parseInt(parts[2]);
      const userId = parts[3];

      // Security check: only the user who clicked can add to their queue
      if (userId !== interaction.user.id) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Access Denied',
          'You can only add tracks to your own queue.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Get raid info
      const raid = await PrismaDatabase.getRaid(raidId);
      if (!raid || raid.platform !== 'SPOTIFY') {
        const embed = EmbedBuilder.createErrorEmbed(
          'Invalid Raid',
          'This raid is not available or is not a Spotify raid.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Check user premium status
      const user = await PrismaDatabase.getUser(userId);
      if (!user?.spotify_is_premium) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Premium Required',
          'Adding tracks to queue requires Spotify Premium.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Initialize Spotify API service
      const spotifyAuthService = new SpotifyAuthService({
        clientId: config.spotify.clientId!,
        clientSecret: config.spotify.clientSecret!,
        redirectUri: config.spotify.redirectUri!
      });
      
      const spotifyApiService = new SpotifyApiService(spotifyAuthService);

      // Add track to queue
      const spotifyUri = `spotify:track:${raid.track_id}`;
      const success = await spotifyApiService.addToQueue(userId, spotifyUri);

      if (success) {
        const embed = EmbedBuilder.createSuccessEmbed(
          'Added to Queue!',
          `🎶 **${raid.track_title}** by ${raid.track_artist}\n\n` +
          `➕ Track added to your Spotify queue!\n` +
          `🎧 Start playing it now to begin earning raid progress.`
        );
        await interaction.editReply({ embeds: [embed] });
      } else {
        const embed = EmbedBuilder.createErrorEmbed(
          'Queue Error',
          'Failed to add track to your Spotify queue. Make sure Spotify is open and try again.'
        );
        await interaction.editReply({ embeds: [embed] });
      }

    } catch (error) {
      console.error('Error handling Spotify queue:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Queue Error',
        'There was an error adding the track to your queue. Please try again.'
      );
      await interaction.editReply({ embeds: [embed] });
    }
  }


  private async handleAudiusLogout(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const user = await PrismaDatabase.getUser(interaction.user.id);
      
      if (!user || !user.audius_user_id) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Not Connected',
          'You don\'t have an Audius account connected.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      await PrismaDatabase.deleteUser(interaction.user.id);

      const embed = EmbedBuilder.createSuccessEmbed(
        'Audius Disconnected',
        `🎧 **Audius account disconnected**\n\n` +
        `Your account **${user.audius_name || user.audius_handle}** has been disconnected.\n\n` +
        `Use \`/login\` anytime to reconnect.`
      );

      await interaction.editReply({ embeds: [embed] });
      
      console.log(`🚪 ${interaction.user.tag} disconnected Audius (${user.audius_handle || user.audius_name})`);
    } catch (error) {
      console.error('Error handling Audius logout:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Logout Error',
        'There was an error disconnecting your Audius account. Please try again.'
      );
      
      await interaction.editReply({ embeds: [embed] });
    }
  }

  private async handleLogoutBoth(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const user = await PrismaDatabase.getUser(interaction.user.id);
      
      if (!user || (!user.spotify_user_id && !user.audius_user_id)) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Not Connected',
          'You don\'t have any accounts connected.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      await PrismaDatabase.deleteUser(interaction.user.id);

      const embed = EmbedBuilder.createSuccessEmbed(
        'All Accounts Disconnected',
        `🚪 **All music accounts disconnected**\n\n` +
        `${user.spotify_user_id ? `🎶 Spotify: ${user.spotify_display_name}\n` : ''}` +
        `\n**Your raid history and tokens remain saved.**\n\n` +
        `Use \`/login\` to reconnect your accounts anytime.`
      );

      await interaction.editReply({ embeds: [embed] });
      
      console.log(`🚪 ${interaction.user.tag} logged out from all platforms`);
    } catch (error) {
      console.error('Error handling logout from both platforms:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Logout Error',
        'There was an error logging you out from both platforms. Please try again.'
      );
      
      await interaction.editReply({ embeds: [embed] });
    }
  }

  public async sendUserProgressDM(discordUser: DiscordUser, raid: any, listenTime: number, isListening: boolean): Promise<void> {
    try {
      const requiredTime = raid.required_listen_time || config.bot.minimumListenTime;
      const progressPercentage = Math.min((listenTime / requiredTime) * 100, 100);
      const progressBar = EmbedBuilder.createProgressBar(progressPercentage, 15); // Longer progress bar
      
      const platformIcon = '🎶';
      const platformName = 'Spotify';
      const platformColor = 0x1DB954;

      // Enhanced track data (Spotify only)
      let enhancedTrackData: any = null;

      const trackUrl = `https://open.spotify.com/track/${raid.track_id}`;

      const timeLeft = Math.max(0, requiredTime - listenTime);
      const minutesLeft = Math.floor(timeLeft / 60);
      const secondsLeft = timeLeft % 60;
      const timeLeftStr = minutesLeft > 0 ? `${minutesLeft}m ${secondsLeft}s` : `${secondsLeft}s`;
      
      let description: string;
      let color = platformColor;
      
      if (!isListening) {
        const trackLink = trackUrl ? `**[${raid.track_title}](${trackUrl})**` : `**${raid.track_title}**`;
        description = `❌ **Not currently listening to the raid track**\n\n` +
          `🎵 Please start playing ${trackLink} by **${raid.track_artist}** on ${platformName}!\n\n` +
          `⏰ **${timeLeftStr}** remaining to qualify`;
        color = 0xFF6B6B;
      } else if (listenTime >= requiredTime) {
        const trackLink = trackUrl ? `**[${raid.track_title}](${trackUrl})**` : `**${raid.track_title}**`;
        description = `🏆 **RAID QUALIFICATION COMPLETE!**\n\n` +
          `🎉 You've successfully listened to ${trackLink} for **${listenTime}** seconds!\n\n` +
          `💎 **Claim your ${raid.reward_amount} ${raid.token_mint || 'SOL'} tokens in the raid channel!**`;
        color = 0x00FF00;
      } else {
        const trackLink = trackUrl ? `**[${raid.track_title}](${trackUrl})**` : `**${raid.track_title}**`;
        description = `🎶 **Currently vibing to ${trackLink}**\n` +
          `🎤 by **${raid.track_artist}**\n\n` +
          `⏱️ **${timeLeftStr}** remaining to earn **${raid.reward_amount} ${raid.token_mint || 'SOL'}** tokens!`;
      }

      const embed = new DiscordEmbedBuilder()
        .setTitle(listenTime >= requiredTime ? `🏆 ${platformName} Raid Complete!` : `${platformIcon} ${platformName} Raid Progress`)
        .setDescription(description)
        .setColor(color);

      // Add enhanced artwork
      if (enhancedTrackData?.artwork) {
        embed.setThumbnail(enhancedTrackData.artwork);
      } else if (raid.track_artwork_url) {
        embed.setThumbnail(raid.track_artwork_url);
      }

      embed.addFields(
        {
          name: '📊 Your Listening Progress',
          value: `${progressBar}\n**${listenTime}**/${requiredTime} seconds (**${Math.floor(progressPercentage)}%** complete)`,
          inline: false
        },
        {
          name: listenTime >= requiredTime ? '🎉 Status' : '⏳ Time Remaining',
          value: listenTime >= requiredTime ? 
            '✅ **QUALIFIED!** Go claim your rewards!' :
            `⏳ **${timeLeftStr}** left to qualify`,
          inline: true
        },
        {
          name: '💰 Reward',
          value: `**${raid.reward_amount}** ${raid.token_mint || 'SOL'} tokens`,
          inline: true
        },
        {
          name: '🎵 Platform',
          value: `${platformName}${raid.premium_only ? ' (Premium)' : ''}`,
          inline: true
        }
      )
      .setTimestamp()
      .setFooter({ 
        text: listenTime >= requiredTime ? 
          `Raid ID: ${raid.id} | 🎉 Claim rewards in Discord!` : 
          `Raid ID: ${raid.id} | 🔄 Updates every 2 seconds`
      });

      // Add completion celebration if qualified
      if (listenTime >= requiredTime) {
        embed.setImage('https://i.imgur.com/N6HhP5R.gif');
      }

      const dmChannel = await discordUser.createDM();
      await dmChannel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Failed to send progress DM:', error);
    }
  }




  /**
   * Get Spotify services from raid monitor
   * DEPRECATED: RaidMonitor no longer used
   */
  public getSpotifyServices() {
    // return this.raidMonitor.getSpotifyServices(); // DEPRECATED
    return null; // RaidMonitor is deprecated
  }

  private async deployCommands(): Promise<void> {
    const commands: any[] = [];
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => {
      const ext = path.extname(file);
      return (ext === '.ts' || ext === '.js') && !file.endsWith('.d.ts');
    });

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      try {
        const command = require(filePath);
        const commandData = command.default || command;
        if ('data' in commandData) {
          commands.push(commandData.data.toJSON());
        }
      } catch (error) {
        console.error(`Error loading command ${file} for deployment:`, error);
      }
    }

    const rest = new REST().setToken(config.discord.token);

    try {
      console.log(`🔄 Started refreshing ${commands.length} application (/) commands.`);

      // Deploy commands to specific guild for faster updates or globally
      const routeOptions = config.discord.guildId 
        ? Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId)
        : Routes.applicationCommands(config.discord.clientId);

      const data = await rest.put(routeOptions, { body: commands }) as any[];

      console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
      console.error('Error deploying commands:', error);
    }
  }

  public async start(): Promise<void> {
    try {
      // Test database connection
      await PrismaDatabase.query('SELECT 1');
      console.log('✅ Database connected successfully');

      // Deploy commands
      await this.deployCommands();

      // Login to Discord
      await this.client.login(config.discord.token);
      
    } catch (error) {
      console.error('❌ Error starting bot:', error);
      process.exit(1);
    }
  }

  private async handleExportPrivateKey(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const walletService = new WalletService();
      const privateKey = await walletService.getPrivateKey(interaction.user.id);

      const embed = EmbedBuilder.createInfoEmbed(
        '🔐 Private Key Export',
        `**⚠️ KEEP THIS SAFE! ⚠️**\n\n` +
        `Your wallet private key:\n` +
        `\`\`\`\n${privateKey}\n\`\`\`\n\n` +
        `**Security Warning:**\n` +
        `🚨 Never share this with anyone\n` +
        `🚨 Anyone with this key controls your wallet\n` +
        `🚨 Store it in a secure location\n\n` +
        `**How to use:**\n` +
        `1. Import into Phantom, Solflare, or other Solana wallet\n` +
        `2. This gives you full control of your tokens\n` +
        `3. You can send/receive outside the bot\n\n` +
        `*This message will auto-delete in 5 minutes for security*`
      );

      const message = await interaction.editReply({ embeds: [embed] });
      
      // Auto-delete the message after 5 minutes for security
      setTimeout(async () => {
        try {
          if (message.deletable) {
            await message.delete();
          }
        } catch (deleteError) {
          console.warn('Failed to auto-delete private key message:', deleteError);
        }
      }, 5 * 60 * 1000);

      console.log(`🔐 Private key exported for user ${interaction.user.tag}`);

    } catch (error: any) {
      console.error('Error exporting private key:', error);
      
      // Check if it's a corruption error and provide helpful guidance
      const isCorruptionError = error.message.includes('corrupted') || error.message.includes('[object Object]');
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Export Failed',
        isCorruptionError 
          ? `${error.message}\n\n**How to fix:**\n1. Use the \`/regenerate-wallet\` command\n2. This will create a new wallet with working exports\n\n⚠️ **Warning:** Transfer any tokens from your current wallet first!`
          : `Failed to export private key: ${error.message}`
      );
      
      await interaction.editReply({ embeds: [embed] });
    }
  }

  private async handleViewTransactions(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const walletService = new WalletService();
      const wallet = await walletService.createOrGetWallet(interaction.user.id, false);
      
      const embed = EmbedBuilder.createInfoEmbed(
        '📋 Wallet Transactions',
        `**View your transaction history:**\n\n` +
        `🔗 **Solscan:** [View on Solscan](https://solscan.io/account/${wallet.publicKey})\n` +
        `🔗 **Solana Explorer:** [View on Explorer](https://explorer.solana.com/address/${wallet.publicKey})\n\n` +
        `**Wallet Address:**\n\`${wallet.publicKey}\`\n\n` +
        `*Click the links above to view all transactions, token transfers, and account activity*`
      );

      await interaction.editReply({ embeds: [embed] });

      console.log(`📋 Transaction history viewed for user ${interaction.user.tag}`);

    } catch (error: any) {
      console.error('Error showing transactions:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Transactions Error',
        `Failed to load transaction information: ${error.message}`
      );
      
      await interaction.editReply({ embeds: [embed] });
    }
  }

  private async handleQuickAccount(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      // Get user data
      const user = await PrismaDatabase.getUser(interaction.user.id);
      const isAdmin = await PrismaDatabase.isAdmin(interaction.user.id);

      if (!user) {
        const embed = EmbedBuilder.createErrorEmbed(
          'No Account Found',
          'No account data found. Use `/login` to connect your accounts.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Get wallet info
      const walletService = new WalletService();
      const wallet = await walletService.createOrGetWallet(interaction.user.id, isAdmin);
      const balances = await walletService.getWalletBalances(wallet.publicKey);

      const role = isAdmin ? '👑 Super Admin' : user.role === 'ARTIST' ? '🎨 Artist' : '👤 Fan';

      const embed = EmbedBuilder.createInfoEmbed(
        '👤 Your Account Overview',
        `**Discord:** ${interaction.user.tag}\n` +
        `**Role:** ${role}\n\n` +
        `**Connected Platforms:**\n` +
        `🎶 **Spotify:** ${user.spotify_display_name || '❌ Not connected'} ${user.spotify_is_premium ? '👑' : user.spotify_display_name ? '🆓' : ''}\n\n` +
        `**Party Statistics:**\n` +
        `🎯 **Parties Participated:** ${user.total_parties_participated}\n` +
        `🏆 **Rewards Claimed:** ${user.total_rewards_claimed}\n` +
        `💰 **Token Balance:** ${user.tokens_balance}\n\n` +
        `**Crypto Wallet:**\n` +
        `📍 **Address:** \`${wallet.publicKey.substring(0, 8)}...${wallet.publicKey.substring(-4)}\`\n` +
        `💎 **SOL:** ${balances.sol.toFixed(4)} SOL\n` +
        `🪙 **Tokens:** ${balances.tokens.length} different tokens`
      );

      // Add action buttons
      const buttons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('view_wallet_info')
            .setLabel('💰 Full Wallet Details')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('view_transactions')
            .setLabel('📋 View Transactions')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.editReply({ embeds: [embed], components: [buttons] });

    } catch (error: any) {
      console.error('Error showing quick account:', error);
      const embed = EmbedBuilder.createErrorEmbed('Account Error', `Failed to load account: ${error.message}`);
      await interaction.editReply({ embeds: [embed] });
    }
  }

  private async handleQuickWallet(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const walletService = new WalletService();
      const jupiterApi = require('./services/jupiterApi').default;

      // Get or create user wallet
      const isAdmin = await PrismaDatabase.isAdmin(interaction.user.id);
      const cryptoWallet = await walletService.createOrGetWallet(interaction.user.id, isAdmin);
      const balances = await walletService.getWalletBalances(cryptoWallet.publicKey);

      // Calculate total SOL equivalent
      const solPrice = await jupiterApi.getTokenPrice('So11111111111111111111111111111111111111112');
      let totalSOLEquivalent = balances.sol;
      
      const tokenDetails: string[] = [];
      
      for (const token of balances.tokens) {
        const tokenPrice = await jupiterApi.getTokenPrice(token.mint);
        if (tokenPrice && solPrice) {
          const tokenValueSOL = (token.amount * tokenPrice) / solPrice;
          totalSOLEquivalent += tokenValueSOL;
        }
        tokenDetails.push(`**${token.symbol}:** ${token.amount.toFixed(2)}`);
      }

      const role = isAdmin ? '👑 Super Admin' : '👤 Fan';

      const embed = EmbedBuilder.createSuccessEmbed(
        '💰 Quick Wallet View',
        `**Address:** \`${cryptoWallet.publicKey}\`\n\n` +
        `**💳 Token Balances**\n` +
        `**SOL:** ${balances.sol.toFixed(4)} SOL\n` +
        `${tokenDetails.length > 0 ? tokenDetails.join('\n') : 'No SPL tokens found'}\n\n` +
        `**💎 Total Value:** ${totalSOLEquivalent.toFixed(4)} SOL equivalent\n` +
        `**🔑 Wallet Type:** ${role} Wallet\n` +
        `**📤 Withdrawal:** ${totalSOLEquivalent >= 1.0 ? '✅ Eligible' : `❌ Need ${(1.0 - totalSOLEquivalent).toFixed(4)} SOL more`}`
      );

      // Add action buttons
      const buttons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('export_private_key')
            .setLabel('🔐 Export Private Key')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('view_transactions')
            .setLabel('📋 View Transactions')
            .setStyle(ButtonStyle.Primary)
        );

      if (totalSOLEquivalent >= 1.0) {
        buttons.addComponents(
          new ButtonBuilder()
            .setURL(`https://discord.com/channels/@me`)
            .setLabel('💸 Use /withdraw')
            .setStyle(ButtonStyle.Link)
        );
      }

      await interaction.editReply({ embeds: [embed], components: [buttons] });

    } catch (error: any) {
      console.error('Error showing quick wallet:', error);
      const embed = EmbedBuilder.createErrorEmbed('Wallet Error', `Failed to load wallet: ${error.message}`);
      await interaction.editReply({ embeds: [embed] });
    }
  }

  private async handleViewWalletInfo(interaction: ButtonInteraction): Promise<void> {
    // Enhanced wallet view with full details
    await this.handleQuickWallet(interaction);
  }

  /**
   * Get OAuth server instance for API server
   */
  getOAuthServer(): OAuthServer {
    return this.oauthServer;
  }

  /**
   * Sync a Discord guild to the database for analytics
   */
  private async syncGuildToDatabase(guild: Guild): Promise<void> {
    try {
      // Get all admin members in the guild
      const members = await guild.members.fetch();
      const admins = members.filter(member =>
        member.permissions.has('Administrator') || member.permissions.has('ManageGuild')
      );

      // Upsert records for each admin
      for (const [, member] of admins) {
        await prisma.artistDiscordServer.upsert({
          where: {
            artist_discord_id_server_id: {
              artist_discord_id: member.user.id,
              server_id: guild.id,
            },
          },
          update: {
            server_name: guild.name,
            bot_installed: true,
            updated_at: new Date(),
          },
          create: {
            artist_discord_id: member.user.id,
            server_id: guild.id,
            server_name: guild.name,
            bot_installed: true,
          },
        });
      }

      console.log(`✅ Synced guild ${guild.name} with ${admins.size} admins to database`);
    } catch (error) {
      console.error(`❌ Error syncing guild ${guild.id} to database:`, error);
    }
  }

  /**
   * Update bot installation status for a guild
   */
  private async updateGuildBotStatus(guildId: string, botInstalled: boolean): Promise<void> {
    try {
      await prisma.artistDiscordServer.updateMany({
        where: { server_id: guildId },
        data: {
          bot_installed: botInstalled,
          updated_at: new Date(),
        },
      });
      console.log(`✅ Updated bot status for guild ${guildId}: ${botInstalled}`);
    } catch (error) {
      console.error(`❌ Error updating guild bot status:`, error);
    }
  }

  public async shutdown(): Promise<void> {
    console.log('🔄 Shutting down services...');

    try {
      // this.raidMonitor.stop(); // DEPRECATED
      this.oauthServer.stop();
      await PrismaDatabase.disconnect();
      this.client.destroy();

      console.log('✅ Shutdown complete');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }

    process.exit(0);
  }
}

// Extend the Discord Client type to include commands
declare module 'discord.js' {
  export interface Client {
    commands: Collection<string, Command>;
  }
}

// Start the bot if this file is run directly
if (require.main === module) {
  const bot = new SpotifyBot();
  bot.start();
}

export default SpotifyBot;
