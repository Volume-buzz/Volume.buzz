import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parties = await prisma.listeningParty.findMany({
      where: {
        artist_discord_id: session.discordId,
      },
      include: {
        participants: {
          select: {
            qualified_at: true,
            claimed_at: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    const response = parties.map((party) => {
      const qualifiedCount = party.participants.filter((p) => p.qualified_at).length;

      return {
        id: party.id,
        track: {
          id: party.track_id,
          title: party.track_title,
          artist: party.track_artist,
          artwork: party.track_artwork_url,
        },
        platform: party.platform,
        status: party.status,
        reward: {
          token_mint: party.token_mint,
          tokens_per_participant: party.tokens_per_participant.toString(),
        },
        capacity: {
          max: party.max_participants,
          claimed: party.claimed_count,
          participants: party.participants.length,
          qualified: qualifiedCount,
        },
        timing: {
          created_at: party.created_at,
          expires_at: party.expires_at,
          duration_minutes: party.duration_minutes,
        },
      };
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error('Failed to fetch listening parties:', error);
    return NextResponse.json({ error: 'Failed to fetch parties' }, { status: 500 });
  }
}
