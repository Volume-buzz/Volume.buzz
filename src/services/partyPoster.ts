/**
 * Party Poster Service
 * Handles posting listening party embeds to Discord channels
 */

import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from 'discord.js';
import { prisma } from '../database/prisma';

export class PartyPosterService {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Post a listening party to a Discord channel
   */
  async postPartyToChannel(partyId: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Fetch party details
      const party = await prisma.listeningParty.findUnique({
        where: { id: partyId },
      });

      if (!party) {
        return { success: false, error: 'Party not found' };
      }

      if (!party.channel_id || !party.server_id) {
        return { success: false, error: 'No channel specified for this party' };
      }

      // Get the guild and channel
      const guild = this.client.guilds.cache.get(party.server_id);
      if (!guild) {
        return { success: false, error: 'Bot not in specified server' };
      }

      const channel = guild.channels.cache.get(party.channel_id) as TextChannel;
      if (!channel) {
        return { success: false, error: 'Channel not found' };
      }

      if (!channel.isTextBased()) {
        return { success: false, error: 'Channel is not a text channel' };
      }

      // Calculate time remaining
      const now = new Date();
      const expiresAt = new Date(party.expires_at);
      const minutesRemaining = Math.floor((expiresAt.getTime() - now.getTime()) / 60000);

      // Build embed
      const embed = new EmbedBuilder()
        .setColor(0x7c3aed)
        .setTitle('🎵 New Listening Party!')
        .setDescription(`**${party.track_title}**\nby ${party.track_artist}`)
        .addFields(
          {
            name: 'Reward',
            value: `${party.tokens_per_participant.toString()} tokens`,
            inline: true,
          },
          {
            name: 'Participants',
            value: `0/${party.max_participants}`,
            inline: true,
          },
          {
            name: 'Time Remaining',
            value: minutesRemaining > 60 ? `${Math.floor(minutesRemaining / 60)}h ${minutesRemaining % 60}m` : `${minutesRemaining}m`,
            inline: true,
          }
        )
        .setFooter({ text: 'Click Listen to start tracking your progress!' })
        .setTimestamp();

      // Add artwork if available
      if (party.track_artwork_url) {
        embed.setThumbnail(party.track_artwork_url);
      }

      // Build buttons
      const trackUrl =
        party.platform === 'AUDIUS'
          ? `https://audius.co/tracks/${party.track_id}`
          : `https://open.spotify.com/track/${party.track_id}`;

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel('🎵 Play')
          .setStyle(ButtonStyle.Link)
          .setURL(trackUrl),
        new ButtonBuilder()
          .setCustomId(`listen_${party.id}`)
          .setLabel('👂 Listen')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`claim_${party.id}`)
          .setLabel('🎁 Claim')
          .setStyle(ButtonStyle.Success)
      );

      // Send message
      const message = await channel.send({
        embeds: [embed],
        components: [row],
      });

      // Update party with message ID
      await prisma.listeningParty.update({
        where: { id: partyId },
        data: {
          message_id: message.id,
        },
      });

      console.log(`✅ Posted party ${partyId} to channel ${channel.name} in ${guild.name}`);

      return {
        success: true,
        messageId: message.id,
      };
    } catch (error: any) {
      console.error('Error posting party to channel:', error);
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Update a party message with current stats
   */
  async updatePartyMessage(partyId: string): Promise<boolean> {
    try {
      const party = await prisma.listeningParty.findUnique({
        where: { id: partyId },
        include: {
          participants: {
            where: {
              qualified_at: { not: null },
            },
          },
        },
      });

      if (!party || !party.message_id || !party.channel_id || !party.server_id) {
        return false;
      }

      const guild = this.client.guilds.cache.get(party.server_id);
      if (!guild) return false;

      const channel = guild.channels.cache.get(party.channel_id) as TextChannel;
      if (!channel) return false;

      const message = await channel.messages.fetch(party.message_id);
      if (!message) return false;

      // Update embed with new participant count
      const embed = message.embeds[0];
      if (!embed) return false;

      const newEmbed = EmbedBuilder.from(embed);
      newEmbed.spliceFields(1, 1, {
        name: 'Participants',
        value: `${party.participants.length}/${party.max_participants}`,
        inline: true,
      });

      await message.edit({ embeds: [newEmbed] });

      return true;
    } catch (error) {
      console.error('Error updating party message:', error);
      return false;
    }
  }
}

export default PartyPosterService;
