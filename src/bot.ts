import { 
  Client, 
  GatewayIntentBits, 
  Collection, 
  REST, 
  Routes,
  ChatInputCommandInteraction,
  ButtonInteraction,
  User as DiscordUser,
  Guild
} from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

// Import types
import { Command } from './types';

// Services
import OAuthServer from './services/oauthServer';
import RaidMonitor from './services/raidMonitor';
import PrismaDatabase from './database/prisma';
import EmbedBuilder from './utils/embedBuilder';
import config from './config/environment';

class AudiusBot {
  public client: Client;
  private oauthServer: OAuthServer;
  private raidMonitor: RaidMonitor;

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
    
    this.oauthServer = new (OAuthServer as any)(this);
    this.raidMonitor = new RaidMonitor(this.client);

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
      
      // Start services
      this.oauthServer.start();
      this.raidMonitor.start();
      
      console.log('🎵 Audius Discord Bot fully operational!');
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
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));

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
      if (customId.startsWith('join_raid_')) {
        await this.handleJoinRaid(interaction);
      } else if (customId.startsWith('claim_reward_')) {
        await this.handleClaimReward(interaction);
      } else if (customId.startsWith('followers_')) {
        await this.handleFollowers(interaction);
      } else if (customId.startsWith('following_')) {
        await this.handleFollowing(interaction);
      } else if (customId.startsWith('wallets_')) {
        await this.handleWallets(interaction);
      } else if (customId === 'logout_account') {
        await this.handleLogout(interaction);
      } else if (customId === 'login_audius') {
        await this.handleAudiusLogin(interaction);
      } else if (customId === 'login_spotify') {
        await this.handleSpotifyLogin(interaction);
      } else if (customId === 'logout_audius') {
        await this.handleAudiusLogout(interaction);
      } else if (customId === 'logout_spotify') {
        await this.handleSpotifyLogout(interaction);
      } else if (customId === 'logout_both') {
        await this.handleLogoutBoth(interaction);
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

    // Platform-specific authentication checks
    if (raid.platform === 'SPOTIFY') {
      if (!user.spotify_user_id) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Spotify Account Required',
          'This is a Spotify raid! You need to connect your Spotify account first.\n\nUse `/login` to connect your Spotify account.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Check premium requirement for Spotify raids
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
    } else if (raid.platform === 'AUDIUS') {
      if (!user.audius_user_id) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Audius Account Required',
          'This is an Audius raid! You need to connect your Audius account first.\n\nUse `/login` to connect your Audius account.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }
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

    // Add user as participant with platform-specific user ID
    const platformUserId = raid.platform === 'SPOTIFY' ? user.spotify_user_id : user.audius_user_id;
    await PrismaDatabase.addRaidParticipant(raidId, userId, platformUserId);

    // Update user's raid participation count
    await PrismaDatabase.updateUserRaidParticipation(userId);

    // Start platform-specific tracking
    await this.raidMonitor.addParticipant(userId, raidId, platformUserId);

    // Platform-specific messages
    const platformIcon = raid.platform === 'SPOTIFY' ? '🎶' : '🎵';
    const platformName = raid.platform === 'SPOTIFY' ? 'Spotify' : 'Audius';
    
    let trackingMessage = `🎧 **Raid Joined!**\nStart playing the track on **${platformName}** now! Your progress will be tracked once you begin listening.\n\n⏱️ **You have 20 seconds to start listening, or you'll be removed from the raid.**`;
    
    if (raid.platform === 'SPOTIFY' && raid.premium_only && user.spotify_is_premium) {
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

    await interaction.editReply({ embeds: [embed] });
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

    // Check if user is linked to Audius
    const user = await PrismaDatabase.getUser(userId);
    if (!user || !user.audius_user_id) {
      const embed = EmbedBuilder.createErrorEmbed(
        'Account Not Linked',
        'You need to link your Audius account to claim rewards!\n\nUse `/login` to connect your account.'
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

      console.log(`💰 ${user.audius_handle} claimed ${claimResult.amount} ${claimResult.tokenMint} tokens from raid ${raidId} - TX: ${claimResult.transactionHash}`);
      
    } catch (claimError: any) {
      console.error('Error claiming crypto reward:', claimError);
      
      const errorEmbed = EmbedBuilder.createErrorEmbed(
        'Claim Failed',
        `Failed to transfer tokens: ${claimError.message}\n\nPlease try again or contact support.`
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  private async handleFollowers(interaction: ButtonInteraction): Promise<any> {
    await interaction.deferReply({ ephemeral: true });

    const audiusUserId = interaction.customId.split('_')[1];
    const AudiusService = require('./services/audiusService');

    try {
      const followers = await AudiusService.getFollowers(audiusUserId, 10);
      
      if (!followers || followers.length === 0) {
        await interaction.editReply({
          embeds: [EmbedBuilder.createInfoEmbed('No Followers', 'This user has no followers yet.')]
        });
        return;
      }

      const embed = {
        title: '👥 Recent Followers',
        color: 0x8B5DFF,
        description: `Showing ${followers.length} recent followers:`,
        fields: followers.map((follower: any, index: number) => ({
          name: `${index + 1}. ${follower.name}`,
          value: `@${follower.handle} • ${follower.followerCount} followers`,
          inline: false
        })),
        timestamp: new Date().toISOString()
      };

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error fetching followers:', error);
      await interaction.editReply({
        embeds: [EmbedBuilder.createErrorEmbed('Error', 'Failed to fetch followers. Please try again.')]
      });
    }
  }

  private async handleFollowing(interaction: ButtonInteraction): Promise<any> {
    await interaction.deferReply({ ephemeral: true });

    const audiusUserId = interaction.customId.split('_')[1];
    const AudiusService = require('./services/audiusService');

    try {
      const following = await AudiusService.getFollowing(audiusUserId, 10);
      
      if (!following || following.length === 0) {
        await interaction.editReply({
          embeds: [EmbedBuilder.createInfoEmbed('Not Following Anyone', 'This user is not following anyone yet.')]
        });
        return;
      }

      const embed = {
        title: '👤 Following',
        color: 0x8B5DFF,
        description: `Showing ${following.length} accounts being followed:`,
        fields: following.map((user: any, index: number) => ({
          name: `${index + 1}. ${user.name}`,
          value: `@${user.handle} • ${user.followerCount} followers`,
          inline: false
        })),
        timestamp: new Date().toISOString()
      };

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error fetching following:', error);
      await interaction.editReply({
        embeds: [EmbedBuilder.createErrorEmbed('Error', 'Failed to fetch following list. Please try again.')]
      });
    }
  }

  private async handleWallets(interaction: ButtonInteraction): Promise<any> {
    await interaction.deferReply({ ephemeral: true });

    const audiusUserId = interaction.customId.split('_')[1];
    
    // SECURITY FIX: Only allow viewing own wallet data
    const requestingUser = await PrismaDatabase.getUser(interaction.user.id);
    if (!requestingUser || requestingUser.audius_user_id !== audiusUserId) {
      const embed = EmbedBuilder.createErrorEmbed(
        'Access Denied',
        'You can only view your own wallet information.'
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const WalletService = require('./services/wallet');
    const AudiusService = require('./services/audiusService');
    const jupiterApi = require('./services/jupiterApi');

    try {
      const walletService = new WalletService();
      
      // Get Discord bot crypto wallet
      const cryptoWallet = await walletService.createOrGetWallet(interaction.user.id, false);
      const balances = await walletService.getWalletBalances(cryptoWallet.publicKey);
      
      // Get Audius connected wallets
      let audiusWallets = null;
      try {
        audiusWallets = await AudiusService.getConnectedWallets(audiusUserId);
      } catch (audiusError: any) {
        console.warn('Error fetching Audius wallets:', audiusError.message);
      }

      // Calculate total SOL equivalent
      const solPrice = await jupiterApi.getTokenPrice('So11111111111111111111111111111111111111112');
      let totalSOLEquivalent = balances.sol;
      
      for (const token of balances.tokens) {
        const tokenPrice = await jupiterApi.getTokenPrice(token.mint);
        if (tokenPrice && solPrice) {
          const tokenValueSOL = (token.amount * tokenPrice) / solPrice;
          totalSOLEquivalent += tokenValueSOL;
        }
      }

      const embed = {
        title: '💰 Your Wallets',
        color: 0x8B5DFF,
        fields: [
          {
            name: '🤖 Discord Bot Crypto Wallet',
            value: `**Address:** \`${cryptoWallet.publicKey}\`\n**Balance:** ${totalSOLEquivalent.toFixed(4)} SOL equivalent\n**Tokens:** ${balances.tokens.length} different tokens\n\n*Use \`/wallet\` for detailed balance*`,
            inline: false
          }
        ],
        timestamp: new Date().toISOString()
      };

      // Add Audius connected wallets if available
      if (audiusWallets) {
        if (audiusWallets.ercWallets && audiusWallets.ercWallets.length > 0) {
          embed.fields.push({
            name: '🔷 Audius Connected - Ethereum',
            value: audiusWallets.ercWallets.map((wallet: string) => `\`${wallet.slice(0, 6)}...${wallet.slice(-4)}\``).join('\n'),
            inline: true
          });
        }

        if (audiusWallets.splWallets && audiusWallets.splWallets.length > 0) {
          embed.fields.push({
            name: '🟡 Audius Connected - Solana',
            value: audiusWallets.splWallets.map((wallet: string) => `\`${wallet.slice(0, 6)}...${wallet.slice(-4)}\``).join('\n'),
            inline: true
          });
        }
      }

      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error fetching wallets:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Error Loading Wallets',
        'There was an error loading wallet data. Please try again.'
      );
      
      await interaction.editReply({ embeds: [embed] });
    }
  }

  private async handleLogout(interaction: ButtonInteraction): Promise<any> {
    await interaction.deferReply({ ephemeral: true });

    try {
      // Get user data before deletion for confirmation message
      const user = await PrismaDatabase.getUser(interaction.user.id);
      
      if (!user || !user.audius_user_id) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Not Logged In',
          'You don\'t have an Audius account connected to logout from.'
        );
        await interaction.editReply({ embeds: [embed] });
      return;
      }

      // Delete user from database
      await PrismaDatabase.deleteUser(interaction.user.id);

      // Send confirmation
      const embed = EmbedBuilder.createSuccessEmbed(
        'Successfully Logged Out',
        `Your Audius account **@${user.audius_handle}** has been disconnected from Discord.\n\n` +
        `**Note:** Your raid tokens (${user.tokens_balance || 0}) have been reset.\n\n` +
        `Use \`/login\` anytime to connect a new Audius account.`
      );

      await interaction.editReply({ embeds: [embed] });

      console.log(`🚪 User ${interaction.user.tag} (${interaction.user.id}) logged out from Audius account @${user.audius_handle}`);

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
      const authUrl = this.oauthServer.generateAuthUrl(interaction.user.id, 'AUDIUS');
      
      const embed = EmbedBuilder.createSuccessEmbed(
        'Audius Login',
        `🎵 **Click the link below to connect your Audius account:**\n\n` +
        `[🔐 **Connect Audius Account**](${authUrl})\n\n` +
        `**What happens next:**\n` +
        `1. You'll be redirected to Audius\n` +
        `2. Authorize the Discord bot\n` +
        `3. You'll be redirected back (you can close that tab)\n` +
        `4. Start participating in Audius raids!\n\n` +
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

  private async handleSpotifyLogin(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const authUrl = this.oauthServer.generateAuthUrl(interaction.user.id, 'SPOTIFY');
      
      const embed = EmbedBuilder.createSuccessEmbed(
        'Spotify Login',
        `🎶 **Click the link below to connect your Spotify account:**\n\n` +
        `[🔐 **Connect Spotify Account**](${authUrl})\n\n` +
        `**What happens next:**\n` +
        `1. You'll be redirected to Spotify\n` +
        `2. Authorize the Discord bot\n` +
        `3. We'll detect if you have Premium\n` +
        `4. You'll be redirected back (you can close that tab)\n` +
        `5. Start participating in Spotify raids!\n\n` +
        `**Premium vs Free:**\n` +
        `👑 **Premium** - Access to all raids + enhanced tracking\n` +
        `🆓 **Free** - Access to most raids (some premium-only excluded)\n\n` +
        `*This link expires in 10 minutes.*`
      );

      await interaction.editReply({ embeds: [embed] });
      
      console.log(`🔗 Generated Spotify OAuth URL for ${interaction.user.tag}`);
    } catch (error) {
      console.error('Error generating Spotify auth URL:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Login Error',
        'Failed to generate Spotify login URL. Please try again.'
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
        `🎵 **Audius account disconnected**\n\n` +
        `Your account **@${user.audius_handle}** has been disconnected.\n` +
        `${user.spotify_user_id ? '\n✅ Your Spotify account remains connected.' : ''}\n\n` +
        `Use \`/login\` to reconnect if needed.`
      );

      await interaction.editReply({ embeds: [embed] });
      
      console.log(`🚪 ${interaction.user.tag} logged out from Audius (@${user.audius_handle})`);
    } catch (error) {
      console.error('Error handling Audius logout:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Logout Error',
        'There was an error logging you out from Audius. Please try again.'
      );
      
      await interaction.editReply({ embeds: [embed] });
    }
  }

  private async handleSpotifyLogout(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const user = await PrismaDatabase.getUser(interaction.user.id);
      
      if (!user || !user.spotify_user_id) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Not Connected',
          'You don\'t have a Spotify account connected.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      await PrismaDatabase.deleteSpotifyAccount(interaction.user.id);

      const embed = EmbedBuilder.createSuccessEmbed(
        'Spotify Disconnected',
        `🎶 **Spotify account disconnected**\n\n` +
        `Your account **${user.spotify_display_name}** has been disconnected.\n` +
        `${user.audius_user_id ? '\n✅ Your Audius account remains connected.' : ''}\n\n` +
        `Use \`/login\` to reconnect if needed.`
      );

      await interaction.editReply({ embeds: [embed] });
      
      console.log(`🚪 ${interaction.user.tag} logged out from Spotify (${user.spotify_display_name})`);
    } catch (error) {
      console.error('Error handling Spotify logout:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Logout Error',
        'There was an error logging you out from Spotify. Please try again.'
      );
      
      await interaction.editReply({ embeds: [embed] });
    }
  }

  private async handleLogoutBoth(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const user = await PrismaDatabase.getUser(interaction.user.id);
      
      if (!user || (!user.audius_user_id && !user.spotify_user_id)) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Not Connected',
          'You don\'t have any accounts connected.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      await PrismaDatabase.deleteAllAccounts(interaction.user.id);

      const embed = EmbedBuilder.createSuccessEmbed(
        'All Accounts Disconnected',
        `🚪 **All music accounts disconnected**\n\n` +
        `${user.audius_user_id ? `🎵 Audius: @${user.audius_handle}\n` : ''}` +
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
      const progressBar = EmbedBuilder.createProgressBar(progressPercentage, 10);
      
      const platformIcon = raid.platform === 'SPOTIFY' ? '🎶' : '🎵';
      const platformName = raid.platform === 'SPOTIFY' ? 'Spotify' : 'Audius';
      const platformColor = raid.platform === 'SPOTIFY' ? 0x1DB954 : 0x8B5DFF;
      
      let description: string;
      let color = platformColor;
      
      if (!isListening) {
        description = `❌ **Not currently playing anything**\n\nPlease start playing **${raid.track_title}** on ${platformName} to continue earning!`;
        color = 0xFF6B6B;
      } else if (listenTime >= requiredTime) {
        description = `✅ **Qualified!** Wait for the raid to finish and claim your rewards!\n\n🎉 You've listened for **${listenTime}** seconds (**${Math.floor(progressPercentage)}%** complete)`;
        color = 0x00FF00;
      } else {
        description = `${platformIcon} **Currently listening to ${raid.track_title}** on ${platformName}\n\nListen time: **${listenTime}**/${requiredTime} seconds`;
      }

      const embed = {
        title: `🎯 ${platformName} Raid Progress: ${raid.track_title}`,
        description: description,
        color: color,
        fields: [
          {
            name: '📊 Progress Bar',
            value: `${progressBar}`,
            inline: false
          },
          {
            name: '💰 Potential Reward',
            value: `${raid.reward_amount} tokens`,
            inline: true
          },
          {
            name: '⏱️ Required Time',
            value: `${requiredTime} seconds`,
            inline: true
          },
          {
            name: '🎵 Platform',
            value: `${platformName}${raid.premium_only ? ' (Premium)' : ''}`,
            inline: true
          }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: `Raid ID: ${raid.id} | Updates every 10 seconds`
        }
      };

      const dmChannel = await discordUser.createDM();
      await dmChannel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Failed to send progress DM:', error);
    }
  }

  public async sendOAuthSuccessDM(discordUser: DiscordUser, audiusUser: any): Promise<void> {
    try {
      const embed = EmbedBuilder.createSuccessEmbed(
        'Account Connected!',
        `🎉 **Welcome to Audius Discord Bot!**\n\n` +
        `Your Audius account has been successfully linked:\n` +
        `**🎵 ${audiusUser.name}** (@${audiusUser.handle})\n\n` +
        `**What's next?**\n` +
        `🎯 Join music raids to earn tokens\n` +
        `🎧 Listen to tracks and get rewarded\n` +
        `🏆 Climb the leaderboard\n\n` +
        `**Available Commands:**\n` +
        `• \`/account\` - View your profile & tokens\n` +
        `• \`/leaderboard\` - See top raiders\n` +
        `• \`/search\` - Find tracks for raids\n\n` +
        `Ready to raid? 🚀`
      );

      const dmChannel = await discordUser.createDM();
      await dmChannel.send({ embeds: [embed] });
      
      console.log(`📨 Sent OAuth success DM to ${discordUser.tag} (${audiusUser.handle})`);
    } catch (error) {
      console.error('Failed to send OAuth success DM:', error);
    }
  }

  private async deployCommands(): Promise<void> {
    const commands: any[] = [];
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));

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

  public async shutdown(): Promise<void> {
    console.log('🔄 Shutting down services...');
    
    try {
      this.raidMonitor.stop();
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
  const bot = new AudiusBot();
  bot.start();
}

export default AudiusBot;
