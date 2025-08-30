import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction,
  EmbedBuilder as DiscordEmbedBuilder 
} from 'discord.js';
import PrismaDatabase from '../database/prisma';
import EmbedBuilder from '../utils/embedBuilder';
import { Command } from '../types';

const tokensCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('tokens')
    .setDescription('🪙 List all configured tokens (Admins only)'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      // Check admin permissions
      const isAdmin = await PrismaDatabase.isAdmin(interaction.user.id);
      if (!isAdmin) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Permission Denied',
          'Only admins can view token configurations.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const tokens = await PrismaDatabase.getAllEnabledTokens();
      const allTokens = await PrismaDatabase.getAllTokens();

      const enabledList = tokens.map(token => 
        `✅ **${token.symbol}**\n\`${token.mint}\``
      ).join('\n\n') || 'No enabled tokens';

      const disabledTokens = allTokens.filter(token => !token.enabled);
      const disabledList = disabledTokens.map(token => 
        `❌ **${token.symbol}**\n\`${token.mint}\``
      ).join('\n\n') || 'No disabled tokens';

      const embed = EmbedBuilder.createInfoEmbed(
        '🪙 Token Configurations',
        `**Enabled Tokens (${tokens.length})**\n${enabledList}\n\n` +
        `**Disabled Tokens (${disabledTokens.length})**\n${disabledList}\n\n` +
        `*Tokens are automatically detected when deposited to admin wallets*\n` +
        `*Use \`/deposit\` to view your admin wallet address*`
      );

      await interaction.editReply({ embeds: [embed] });

    } catch (error: any) {
      console.error('Error listing tokens:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Token List Failed',
        `Failed to list tokens: ${error.message}\n\nPlease try again or contact support.`
      );
      
      await interaction.editReply({ embeds: [embed] });
    }
  }
};

export default tokensCommand;
