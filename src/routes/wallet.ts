/**
 * Wallet management routes
 */

import { Router, type Router as RouterType, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import PrismaDatabase from '../database/prisma';
import WalletService from '../services/wallet';
import SecurityService from '../services/security';

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
        exported_at: created.exportedAt || null
      });
    }

    const service = new WalletService();
    const balances = await service.getWalletBalances(wallet.public_key);
    const history = await service.getTransactionHistory(wallet.public_key, 10);

    return res.json({
      public_key: wallet.public_key,
      balances,
      history,
      exported_at: wallet.exported_at || null
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

// Start export flow (sends/returns a short confirmation code)
router.post('/export/start', requireAuth, async (req: Request, res: Response) => {
  try {
    const discordId = (req as any).sessionUser.discordId as string;
    const code = Math.random().toString(36).slice(-6).toUpperCase();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await PrismaDatabase.createActionToken({ userDiscordId: discordId, action: 'EXPORT_WALLET', code, expiresAt });

    // TODO: deliver via DM; for now, return masked in production and full in dev
    const isProd = process.env.NODE_ENV === 'production';
    const payload = isProd ? { delivered: true } : { delivered: true, code };
    return res.json(payload);
  } catch (err) {
    console.error('export/start error', err);
    return res.status(500).json({ error: 'Failed to initiate export' });
  }
});

// Confirm export and return encrypted key
router.post('/export/confirm', requireAuth, async (req: Request, res: Response) => {
  try {
    const discordId = (req as any).sessionUser.discordId as string;
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: 'Code required' });

    const ok = await PrismaDatabase.validateAndConsumeActionToken({ userDiscordId: discordId, action: 'EXPORT_WALLET', code });
    if (!ok) return res.status(403).json({ error: 'Invalid or expired code' });

    const service = new WalletService();
    const encrypted = await service.getPrivateKey(discordId);

    const security = new SecurityService();
    const audit = security.generateAuditLog('EXPORT_WALLET', discordId, { length: encrypted.length }, 'SUCCESS');
    console.log('AUDIT', audit);

    return res.json({ encrypted });
  } catch (err: any) {
    console.error('export/confirm error', err);
    return res.status(500).json({ error: 'Failed to export key' });
  }
});

// Start SOL transfer (requires confirmation)
router.post('/transfer/start', requireAuth, async (req: Request, res: Response) => {
  try {
    const discordId = (req as any).sessionUser.discordId as string;
    const { toAddress, amount } = req.body || {};
    if (!toAddress || typeof amount !== 'number') {
      return res.status(400).json({ error: 'toAddress and amount are required' });
    }

    // Pre-validate with security
    const security = new SecurityService();
    const check = await security.validateWalletOperation({ userDiscordId: discordId, recipientAddress: toAddress, amount });
    if (!check.isValid) return res.status(400).json({ error: check.reason || 'Security validation failed' });

    const code = Math.random().toString(36).slice(-6).toUpperCase();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await PrismaDatabase.createActionToken({ userDiscordId: discordId, action: 'TRANSFER_SOL', code, expiresAt });

    const isProd = process.env.NODE_ENV === 'production';
    const payload = isProd ? { delivered: true } : { delivered: true, code };
    return res.json(payload);
  } catch (err) {
    console.error('transfer/start error', err);
    return res.status(500).json({ error: 'Failed to initiate transfer' });
  }
});

// Confirm SOL transfer
router.post('/transfer/confirm', requireAuth, async (req: Request, res: Response) => {
  try {
    const discordId = (req as any).sessionUser.discordId as string;
    const { code, toAddress, amount } = req.body || {};
    if (!code || !toAddress || typeof amount !== 'number') {
      return res.status(400).json({ error: 'code, toAddress and amount are required' });
    }

    const ok = await PrismaDatabase.validateAndConsumeActionToken({ userDiscordId: discordId, action: 'TRANSFER_SOL', code });
    if (!ok) return res.status(403).json({ error: 'Invalid or expired code' });

    const service = new WalletService();
    const result = await service.transferSOL({ fromDiscordId: discordId, toAddress, amount });
    if (!result.success) return res.status(400).json({ error: result.error || 'Transfer failed' });

    return res.json({ signature: result.signature });
  } catch (err) {
    console.error('transfer/confirm error', err);
    return res.status(500).json({ error: 'Failed to confirm transfer' });
  }
});

export default router;
