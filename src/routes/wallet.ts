/**
 * Wallet management routes
 */

import { Router, type Router as RouterType, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import PrismaDatabase from '../database/prisma';
import WalletService from '../services/wallet';

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
    const discordId = (req as any).sessionUser.discordId as string;
    const wallet = await PrismaDatabase.getUserWallet(discordId);

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

// Placeholder routes - implement as needed
router.get('/balance/:discordId', (req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});

router.post('/create', (req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});

// REMOVED: Unsafe wallet operations (export/transfer) - to be implemented later with proper security

export default router;
