import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction
} from 'discord.js';
import EmbedBuilder from '../utils/embedBuilder';
import { Command } from '../types';

const depositCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('deposit')
    .setDescription('💳 View deposit information for your wallet'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      const embed = EmbedBuilder.createInfoEmbed(
        '🚧 Feature Coming Soon',
        `**Wallet deposits will be implemented later!**\n\n` +
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
        `🚀 Secure deposit system\n` +
        `🚀 Multi-factor authentication\n` +
        `🚀 Advanced security features`
      );

      embed.setFooter({ text: 'Stay tuned for updates! 🎵' });

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } catch (error: any) {
      console.error('Error in deposit command:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Command Error',
        `Something went wrong: ${error.message}`
      );
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};

export default depositCommand;