import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Spotify Discord Bot - Earn Crypto Rewards",
  description: "Connect your Spotify account to our Discord bot, participate in music raids, and earn real cryptocurrency rewards for listening to tracks.",
  keywords: "spotify, discord, bot, crypto, rewards, solana, music, raids",
  authors: [{ name: "Spotify Discord Bot Team" }],
  creator: "Spotify Discord Bot",
  icons: {
    icon: "/favicon.ico",
    apple: "/logo.png",
  },
  openGraph: {
    title: "Spotify Discord Bot - Earn Crypto Rewards",
    description: "Turn your music listening into cryptocurrency rewards. Connect Spotify, join raids, earn Solana tokens.",
    type: "website",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "Spotify Discord Bot Logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Spotify Discord Bot - Earn Crypto Rewards",
    description: "Turn your music listening into cryptocurrency rewards.",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
