/**
 * Wallet management routes
 */

import { Router, type Router as RouterType, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate, commonSchemas } from '../middleware/validation';
import PrismaDatabase, { prisma } from '../database/prisma';
import CachedDatabase from '../services/cachedDatabase';
import WalletService from '../services/wallet';
import Joi from 'joi';

const router: RouterType = Router();

router.get('/status', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'wallet-routes',
    timestamp: new Date().toISOString() 
  });
});

// Get current user's wallet summary and balances
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const discordId = req.sessionUser!.discordId;
    const wallet = await CachedDatabase.getUserWallet(discordId);

    if (!wallet) {
      // Lazily create a wallet for the user (non-artist)
      const service = new WalletService();
      const created = await service.createOrGetWallet(discordId, false);
      return res.json({
        public_key: created.publicKey,
        balances: { sol: 0, tokens: [] },
        exported_at: null
      });
    }

    const service = new WalletService();
    const balances = await service.getWalletBalances(wallet.public_key);
    const history = await service.getTransactionHistory(wallet.public_key, 10);

    return res.json({
      public_key: wallet.public_key,
      balances,
      history,
              exported_at: null
    });
  } catch (err) {
    console.error('wallet/me error', err);
    return res.status(500).json({ error: 'Failed to load wallet' });
  }
});

/**
 * POST /api/wallet/link
 * Link a Discord user to their Privy wallet
 */
router.post(
  '/link',
  validate({
    body: Joi.object({
      discord_id: commonSchemas.discordId,
      privy_user_id: Joi.string().required(),
      privy_wallet_address: Joi.string().required(),
      audius_user_id: Joi.string().optional(),
    }),
  }),
  async (req: Request, res: Response) => {
    try {
      const { discord_id, privy_user_id, privy_wallet_address, audius_user_id } = req.body;

      // Check if user exists
      let user = await PrismaDatabase.getUser(discord_id);

      if (!user) {
        // Create user if doesn't exist
        user = await PrismaDatabase.createUser({
          discordId: discord_id,
        });
      }

      // Update user with Privy info
      await prisma.user.update({
        where: { discord_id },
        data: {
          privy_user_id,
          privy_wallet_address,
          audius_user_id: audius_user_id || user.audius_user_id,
        },
      });

      return res.json({
        success: true,
        message: 'Wallet linked successfully',
        discord_id,
        wallet_address: privy_wallet_address,
      });
    } catch (err) {
      console.error('wallet/link error', err);
      return res.status(500).json({ error: 'Failed to link wallet' });
    }
  }
);

/**
 * POST /api/wallet/unlink
 * Unlink a Discord user's Privy wallet association
 */
router.post(
  '/unlink',
  validate({
    body: Joi.object({
      discord_id: commonSchemas.discordId,
    }),
  }),
  async (req: Request, res: Response) => {
    try {
      const { discord_id } = req.body;

      const user = await PrismaDatabase.getUser(discord_id);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!user.privy_wallet_address && !user.privy_user_id) {
        return res.status(200).json({
          success: true,
          message: 'Wallet already disconnected',
        });
      }

      await prisma.user.update({
        where: { discord_id },
        data: {
          privy_user_id: null,
          privy_wallet_address: null,
        },
      });

      return res.json({
        success: true,
        message: 'Wallet disconnected successfully',
      });
    } catch (err) {
      console.error('wallet/unlink error', err);
      return res.status(500).json({ error: 'Failed to disconnect wallet' });
    }
  }
);

/**
 * GET /api/wallet/status/:discordId
 * Check if a user has a wallet connected
 */
router.get(
  '/status/:discordId',
  validate({
    params: Joi.object({
      discordId: commonSchemas.discordId,
    }),
  }),
  async (req: Request, res: Response) => {
    try {
      const { discordId } = req.params;

      const user = await PrismaDatabase.getUser(discordId);

      if (!user || !user.privy_wallet_address) {
        return res.json({
          connected: false,
          wallet_address: null,
        });
      }

      return res.json({
        connected: true,
        wallet_address: user.privy_wallet_address,
        privy_user_id: user.privy_user_id,
      });
    } catch (err) {
      console.error('wallet/status error', err);
      return res.status(500).json({ error: 'Failed to check wallet status' });
    }
  }
);

/**
 * GET /api/wallet/balance/:discordId
 * Get wallet balance for a Discord user
 */
router.get(
  '/balance/:discordId',
  validate({
    params: Joi.object({
      discordId: commonSchemas.discordId,
    }),
  }),
  async (req: Request, res: Response) => {
    try {
      const { discordId } = req.params;

      const user = await PrismaDatabase.getUser(discordId);

      if (!user || !user.privy_wallet_address) {
        return res.status(404).json({ error: 'Wallet not connected' });
      }

      const service = new WalletService();
      const balances = await service.getWalletBalances(user.privy_wallet_address);

      return res.json({
        wallet_address: user.privy_wallet_address,
        balances,
      });
    } catch (err) {
      console.error('wallet/balance error', err);
      return res.status(500).json({ error: 'Failed to get wallet balance' });
    }
  }
);

/**
 * GET /api/wallet/connect-url
 * Generate a URL for wallet connection via Privy
 */
router.get('/connect-url', async (req: Request, res: Response) => {
  try {
    const { discord_id, redirect_uri } = req.query;

    if (!discord_id) {
      return res.status(400).json({ error: 'discord_id is required' });
    }

    // Generate unique state for OAuth
    const state = `${discord_id}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Store state in database for verification
    await prisma.oAuthSession.create({
      data: {
        state,
        discord_id: discord_id as string,
        platform: 'SPOTIFY', // Using existing Platform enum, will use for wallet connection
        expires_at: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      },
    });

    // Construct wallet connection URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const connectUrl = `${baseUrl}/wallet-connect?state=${state}`;

    if (redirect_uri) {
      return res.json({
        connect_url: `${connectUrl}&redirect_uri=${encodeURIComponent(redirect_uri as string)}`,
        state,
      });
    }

    return res.json({
      connect_url: connectUrl,
      state,
    });
  } catch (err) {
    console.error('wallet/connect-url error', err);
    return res.status(500).json({ error: 'Failed to generate connect URL' });
  }
});

// REMOVED: Unsafe wallet operations (export/transfer) - to be implemented later with proper security

export default router;
