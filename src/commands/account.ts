import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction,
  EmbedBuilder as DiscordEmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import PrismaDatabase from '../database/prisma';
import EmbedBuilder from '../utils/embedBuilder';
import { Command } from '../types';

const accountCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('account')
    .setDescription('👤 View your account information and raid statistics'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const user = await PrismaDatabase.getUser(interaction.user.id);
      
      if (!user) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Account Not Found',
          'You haven\'t connected your Spotify account yet!\n\nUse `/login` to connect your account and start earning tokens.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const hasSpotify = user.spotify_user_id !== null;

      if (!hasSpotify) {
        const embed = EmbedBuilder.createErrorEmbed(
          'No Account Connected',
          'You haven\'t connected your Spotify account yet!\n\nUse `/login` to connect your Spotify account and start earning tokens.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Build account status description
      const premiumStatus = user.spotify_is_premium ? '👑 Premium' : '🆓 Free';
      let description = `👤 **Discord:** ${interaction.user.displayName}\n\n` +
        `**🔗 Connected Account:**\n` +
        `✅ **Spotify** - ${user.spotify_display_name} (${premiumStatus})\n` +
        `   └ ${user.spotify_email}\n`;

      const embed = new DiscordEmbedBuilder()
        .setTitle('👤 Your Account')
        .setDescription(description)
        .setColor(0x1DB954)
        .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
        .addFields(
          {
            name: '🏆 Raid Statistics',
            value: `**Participated:** ${user.total_raids_participated} raids\n` +
              `**Claimed:** ${user.total_rewards_claimed} rewards\n` +
              `**Token Balance:** ${user.tokens_balance} tokens`,
            inline: false
          },
          {
            name: '👑 User Role',
            value: user.role === 'SUPER_ADMIN' ? '🔧 Super Admin' :
                   user.role === 'ARTIST' ? '🎤 Artist' : '🎧 Fan',
            inline: true
          },
          {
            name: '📊 Success Rate',
            value: user.total_raids_participated > 0 
              ? `${Math.round((user.total_rewards_claimed / user.total_raids_participated) * 100)}%`
              : 'No raids yet',
            inline: true
          },
          {
            name: '🎶 Spotify Features',
            value: user.spotify_is_premium 
              ? '👑 Premium - Enhanced tracking + embedded player'
              : '🆓 Free - Basic tracking via Currently Playing API',
            inline: false
          }
        )
        .setTimestamp()
        .setFooter({
          text: `Member since ${user.createdAt.toLocaleDateString()}`,
          iconURL: interaction.user.displayAvatarURL()
        });

      // Add Spotify profile picture if available
      if (user.spotify_is_premium) {
        embed.setThumbnail('https://cdn.discordapp.com/attachments/123/456/spotify-premium-icon.png');
      }

      // Create action buttons
      const buttons = [];

      buttons.push(
        new ButtonBuilder()
          .setCustomId('quick_wallet')
          .setLabel('💳 View Wallet')
          .setStyle(ButtonStyle.Primary)
      );

      buttons.push(
        new ButtonBuilder()
          .setCustomId('logout_spotify')
          .setLabel('🚪 Disconnect Spotify')
          .setStyle(ButtonStyle.Danger)
      );

      const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);

      await interaction.editReply({ 
        embeds: [embed],
        components: [buttonRow]
      });

    } catch (error) {
      console.error('Error in account command:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Account Error',
        'There was an error retrieving your account information. Please try again.'
      );
      
      await interaction.editReply({ embeds: [embed] });
    }
  }
};

export default accountCommand;
