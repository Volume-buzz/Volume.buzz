import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction
} from 'discord.js';
import EmbedBuilder from '../utils/embedBuilder';
import { Command } from '../types';

const withdrawCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('withdraw')
    .setDescription('💸 Withdraw your tokens to an external wallet'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      const embed = EmbedBuilder.createInfoEmbed(
        '🚧 Feature Coming Soon',
        `**Wallet withdrawals will be implemented later!**\n\n` +
        `🔐 **Why it's disabled:**\n` +
        `• Enhanced security measures being implemented\n` +
        `• Advanced fraud protection systems\n` +
        `• Multi-signature verification process\n` +
        `• Compliance and audit requirements\n\n` +
        `**For now, you can:**\n` +
        `✅ View your wallet with \`/wallet\`\n` +
        `✅ Participate in raids to earn tokens\n` +
        `✅ Check balances and transaction history\n\n` +
        `**Coming Soon:**\n` +
        `🚀 Secure withdrawal system\n` +
        `🚀 Multi-factor authentication\n` +
        `🚀 Advanced security features`
      );

      embed.setFooter({ text: 'Stay tuned for updates! 🎵' });

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } catch (error: any) {
      console.error('Error in withdraw command:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Command Error',
        `Something went wrong: ${error.message}`
      );
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};

export default withdrawCommand;