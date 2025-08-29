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
    .setDescription('👤 View your connected music accounts and raid statistics'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const user = await PrismaDatabase.getUser(interaction.user.id);
      
      if (!user) {
        const embed = EmbedBuilder.createErrorEmbed(
          'No Account Found',
          'You haven\'t connected any music accounts yet!\n\nUse `/login` to connect your Audius and/or Spotify accounts.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const hasAudius = user.audius_user_id !== null;
      const hasSpotify = user.spotify_user_id !== null;

      if (!hasAudius && !hasSpotify) {
        const embed = EmbedBuilder.createInfoEmbed(
          'No Accounts Connected',
          'You haven\'t connected any music accounts yet!\n\nUse `/login` to connect your Audius and/or Spotify accounts.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Build account information
      let description = `👤 **Discord:** ${interaction.user.displayName}\n\n`;
      
      // Connected accounts section
      description += '**🔗 Connected Accounts:**\n';
      
      if (hasAudius) {
        description += `✅ **Audius** - @${user.audius_handle}\n` +
          `   └ ${user.audius_name}\n`;
      } else {
        description += `❌ **Audius** - Not connected\n`;
      }
      
      if (hasSpotify) {
        const premiumStatus = user.spotify_is_premium ? '👑 Premium' : '🆓 Free';
        description += `✅ **Spotify** - ${user.spotify_display_name} (${premiumStatus})\n` +
          `   └ ${user.spotify_email}\n`;
      } else {
        description += `❌ **Spotify** - Not connected\n`;
      }

      const embed = new DiscordEmbedBuilder()
        .setTitle('👤 Your Account')
        .setDescription(description)
        .setColor(0x8B5DFF)
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
          }
        )
        .setTimestamp()
        .setFooter({
          text: `Member since ${user.created_at.toLocaleDateString()}`,
          iconURL: interaction.user.displayAvatarURL()
        });

      // Add thumbnail based on connected platforms
      if (hasSpotify && user.spotify_is_premium) {
        embed.setThumbnail('https://cdn.discordapp.com/attachments/123/456/spotify-premium-icon.png');
      } else if (hasAudius) {
        embed.setThumbnail('https://cdn.discordapp.com/attachments/123/456/audius-icon.png');
      }

      // Create action buttons
      const buttons = [];

      if (!hasAudius || !hasSpotify) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId('connect_more_accounts')
            .setLabel(`🔗 Connect ${!hasAudius ? 'Audius' : 'Spotify'}`)
            .setStyle(ButtonStyle.Primary)
        );
      }

      buttons.push(
        new ButtonBuilder()
          .setCustomId('view_wallet_info')
          .setLabel('💰 Wallet Info')
          .setStyle(ButtonStyle.Secondary)
      );

      if (hasAudius || hasSpotify) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId('logout_options')
            .setLabel('🚪 Logout Options')
            .setStyle(ButtonStyle.Danger)
        );
      }

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

      await interaction.editReply({
        embeds: [embed],
        components: [row]
      });

    } catch (error: any) {
      console.error('Error in account command:', error);
      
      const errorEmbed = EmbedBuilder.createErrorEmbed(
        'Account Error',
        'There was an error loading your account information. Please try again.'
      );

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};

export default accountCommand;
