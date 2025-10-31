import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/core/theme-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Volume - Discord Bot Dashboard",
  description: "Advanced Discord bot with moderation, music, and utility features",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="https://cdn.hugeicons.com/font/hgi-stroke-rounded.css" crossOrigin="anonymous" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#6E00FF" />
        <meta name="msapplication-navbutton-color" content="#6E00FF" />
        <meta name="apple-mobile-web-app-title" content="Volume" />
      </head>
      <body
        className={`${inter.variable} font-sans antialiased`}
      >
        <div className="min-h-screen w-full relative">
          {/* Orchid Depths Background */}
          <div
            className="absolute inset-0 z-0"
            style={{
              background: "radial-gradient(125% 125% at 50% 10%, #000000 40%, #350136 100%)",
            }}
          />
          {/* Top Fade Grid Overlay */}
          <div
            className="absolute inset-0 z-0 pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(226,232,240,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(226,232,240,0.08) 1px, transparent 1px)",
              backgroundSize: "20px 30px",
              WebkitMaskImage:
                "radial-gradient(ellipse 70% 60% at 50% 0%, #000 60%, transparent 100%)",
              maskImage:
                "radial-gradient(ellipse 70% 60% at 50% 0%, #000 60%, transparent 100%)",
            }}
          />
          {/* Content */}
          <div className="relative z-10">
            <ThemeProvider
              attribute="class"
              defaultTheme="dark"
              enableSystem
              disableTransitionOnChange
            >
              {children}
            </ThemeProvider>
          </div>
        </div>
      </body>
    </html>
  );
}
