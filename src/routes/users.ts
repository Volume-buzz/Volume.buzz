import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import PrismaDatabase from '../database/prisma';

const router: Router = Router();

// GET /api/users/me
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const discordId = (req as any).sessionUser.discordId as string;
    const user = await PrismaDatabase.getUser(discordId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Minimal wallet summary
    const wallet = await PrismaDatabase.getUserWallet(discordId);

    return res.json({
      discord_id: user.discord_id,
      role: user.role,
      spotify_is_premium: user.spotify_is_premium,
      name: user.name,
      image: user.image,
      balances: {
        tokens_balance: user.tokens_balance
      },
      wallet: wallet
        ? {
            public_key: wallet.public_key,
            exported_at: wallet.exported_at
          }
        : null
    });
  } catch (err) {
    console.error('users/me error', err);
    return res.status(500).json({ error: 'Failed to load user profile' });
  }
});

export default router;
