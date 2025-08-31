import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import EmbedBuilder from '../utils/embedBuilder';
import PrismaDatabase from '../database/prisma';

export default {
  data: new SlashCommandBuilder()
    .setName('winner')
    .setDescription('View the last 10 raid winners and your ranking'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: false });

    try {
      // Get last 10 winners from recent raids
      const recentWinners = await PrismaDatabase.getRecentWinners(10);
      
      // Get user's personal ranking
      const userRank = await PrismaDatabase.getUserRankByRaids(interaction.user.id);

      if (recentWinners.length === 0) {
        const embed = EmbedBuilder.createInfoEmbed(
          'No Recent Winners',
          'No raids have been completed recently. Join an active raid to become a winner!'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      let winnersDescription = '**🏆 Last 10 Raid Winners:**\n\n';
      
      for (let i = 0; i < recentWinners.length; i++) {
        const winner = recentWinners[i];
        const rank = i + 1;
        const emoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅';
        
        // Try to get Discord user to get current username if not stored
        let displayName = winner.user.discord_username || 'Unknown';
        if (displayName === 'Unknown') {
          try {
            const discordUser = await interaction.client.users.fetch(winner.user.discord_id);
            displayName = discordUser.username;
          } catch {
            displayName = 'Unknown User';
          }
        }
        
        const completedAt = new Date(winner.qualified_at);
        const timeAgo = Math.floor((Date.now() - completedAt.getTime()) / (1000 * 60));
        const timeDisplay = timeAgo < 60 ? `${timeAgo}m ago` : `${Math.floor(timeAgo / 60)}h ago`;
        
        winnersDescription += `${emoji} **${displayName}**\n`;
        winnersDescription += `   🎵 ${winner.raid.track_title} by ${winner.raid.track_artist}\n`;
        winnersDescription += `   💰 ${winner.raid.reward_amount} tokens • ${timeDisplay}\n\n`;
      }

      const embed = EmbedBuilder.createSuccessEmbed(
        '🏆 Recent Winners',
        winnersDescription
      );

      // Add user's personal ranking if they have participated
      if (userRank) {
        let rankText = '';
        if (userRank.rank <= 10) {
          rankText = `🎉 **You're in the top 10!** Rank #${userRank.rank}`;
        } else {
          rankText = `📊 **Your Rank:** #${userRank.rank} out of ${userRank.totalUsers} raiders`;
        }
        
        const userDiscordName = userRank.user.discord_username || interaction.user.username;
        
        embed.addFields({
          name: '📈 Your Stats',
          value: `**${userDiscordName}**\n` +
                 `${rankText}\n` +
                 `🎯 **${userRank.user.total_raids_participated}** raids completed\n` +
                 `💰 **${userRank.user.tokens_balance}** tokens earned`,
          inline: false
        });
      } else {
        embed.addFields({
          name: '🎯 Join the Action',
          value: 'You haven\'t completed any raids yet!\nJoin an active raid to earn your place on the leaderboard.',
          inline: false
        });
      }

      embed.setThumbnail('https://i.imgur.com/zKBVcSH.gif');
      embed.setFooter({ text: `Last Updated: ${new Date().toLocaleString()}` });

      await interaction.editReply({ embeds: [embed] });

    } catch (error: any) {
      console.error('Error fetching winners:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Winners Error',
        'Failed to fetch winners data. Please try again later.'
      );
      await interaction.editReply({ embeds: [embed] });
    }
  }
};