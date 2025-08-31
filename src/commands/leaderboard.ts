import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import EmbedBuilder from '../utils/embedBuilder';
import PrismaDatabase from '../database/prisma';

export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the top raiders by completed raids'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: false });

    try {
      // Ensure current user's Discord username is stored
      await PrismaDatabase.ensureDiscordUsername(interaction.user.id, interaction.user.username);
      
      // Get top users by total_raids_participated
      const topUsers = await PrismaDatabase.getTopUsersByRaids(10);

      if (topUsers.length === 0) {
        const embed = EmbedBuilder.createInfoEmbed(
          'Leaderboard Empty',
          'No users have completed raids yet. Be the first to join a raid and earn your spot on the leaderboard!'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      let description = '';
      for (let i = 0; i < topUsers.length; i++) {
        const user = topUsers[i];
        const rank = i + 1;
        const emoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅';
        
        // Try to get Discord user to get current username if not stored
        let displayName = user.discord_username || 'Unknown';
        if (displayName === 'Unknown') {
          try {
            const discordUser = await interaction.client.users.fetch(user.discord_id);
            displayName = discordUser.username;
          } catch {
            displayName = 'Unknown User';
          }
        }
        
        description += `${emoji} **${rank}.** ${displayName}\n`;
        description += `   🎯 **${user.total_raids_participated}** raids completed\n`;
        description += `   💰 **${user.tokens_balance}** tokens earned\n\n`;
      }

      const embed = EmbedBuilder.createSuccessEmbed(
        '🏆 Raid Leaderboard',
        `**Top ${topUsers.length} Raiders by Completed Raids**\n\n${description}` +
        `🎊 **Ready to climb the ranks?** Join active raids to earn your spot!`
      );

      embed.setThumbnail('https://i.imgur.com/zKBVcSH.gif');
      embed.setFooter({ text: `Updated: ${new Date().toLocaleString()} | Total Raiders: ${topUsers.length}` });

      await interaction.editReply({ embeds: [embed] });

    } catch (error: any) {
      console.error('Error fetching leaderboard:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Leaderboard Error',
        'Failed to fetch leaderboard data. Please try again later.'
      );
      await interaction.editReply({ embeds: [embed] });
    }
  }
};