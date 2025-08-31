// Express type augmentations for the Spotify Discord Bot

import { DatabaseUser } from './index';
import { User as DiscordUser } from 'discord.js';

declare global {
  namespace Express {
    interface Request {
      user?: DatabaseUser;
      discordUser?: DiscordUser;
    }
  }
}

export {};
