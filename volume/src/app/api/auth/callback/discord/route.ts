import { NextRequest, NextResponse } from 'next/server';
import { DiscordAuth } from '@/lib/discord-auth';
import { prisma } from '@/lib/prisma';
import { SignJWT } from 'jose';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      console.error('Discord OAuth error:', error);
      return NextResponse.redirect(`${process.env.APP_URL}/login?error=discord_error`);
    }

    if (!code || !state) {
      console.error('Missing code or state in Discord callback');
      return NextResponse.redirect(`${process.env.APP_URL}/login?error=missing_params`);
    }

    // Exchange code for tokens
    const tokens = await DiscordAuth.exchangeCodeForTokens(code);
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    
    // Get Discord user info
    const discordUser = await DiscordAuth.getDiscordUser(tokens.access_token);
    
    // Find or create user in database
    let user = await prisma.user.findUnique({
      where: { discord_id: discordUser.id },
    });

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: {
          discord_id: discordUser.id,
          name: discordUser.username,
          email: discordUser.email,
          emailVerified: discordUser.verified,
          image: DiscordAuth.getAvatarUrl(discordUser),
          discord_username: discordUser.username,
          tokens_balance: 0,
          total_parties_participated: 0,
          total_rewards_claimed: 0,
          discord_access_token: tokens.access_token,
          discord_refresh_token: tokens.refresh_token,
          discord_token_expires_at: tokenExpiresAt,
        },
      });
    } else {
      // Update existing user
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: discordUser.username,
          email: discordUser.email,
          emailVerified: discordUser.verified,
          image: DiscordAuth.getAvatarUrl(discordUser),
          discord_username: discordUser.username,
          discord_access_token: tokens.access_token,
          discord_refresh_token: tokens.refresh_token,
          discord_token_expires_at: tokenExpiresAt,
        },
      });
    }

    // Create session JWT
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const token = await new SignJWT({ 
      userId: user.id, 
      discordId: user.discord_id,
      email: user.email,
      name: user.name,
      image: user.image,
      discordAccessToken: tokens.access_token,
      discordRefreshToken: tokens.refresh_token,
      discordTokenExpiresAt: tokenExpiresAt.toISOString(),
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret);

    console.log(`✅ Discord authentication successful for user ${discordUser.username} (${discordUser.id})`);
    console.log(`🖼️ Discord user image: ${user.image}`);
    
    // Create response and set session cookie
    const response = NextResponse.redirect(`${process.env.APP_URL}/dashboard`);
    response.cookies.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;

  } catch (error) {
    console.error('Discord OAuth callback error:', error);
    return NextResponse.redirect(`${process.env.APP_URL}/login?error=callback_error`);
  }
}
