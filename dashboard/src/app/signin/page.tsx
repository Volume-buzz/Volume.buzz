"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import Prism from "@/components/ui/prism";
import { cn } from "@/lib/utils";

export default function SignIn() {
  const formRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative min-h-screen w-screen overflow-hidden bg-black flex items-center justify-center p-4">
      {/* Prism Background */}
      <div className="absolute inset-0 -z-10">
        <Prism
          animationType="hover"
          timeScale={0.2}
          height={3.8}
          baseWidth={5.2}
          scale={3.2}
          hueShift={1.2}
          colorFrequency={0.8}
          noise={0.2}
          glow={1.6}
          bloom={1.4}
          transparent={true}
          hoverStrength={1.5}
          inertia={0.08}
        />
      </div>

      {/* Gradient Overlays */}
      <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-black/70 pointer-events-none" />
      
      {/* Back Button */}
      <Link 
        href="/"
        className="absolute top-6 left-6 z-10 flex items-center gap-2 text-white/70 hover:text-white transition-colors duration-200"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        <span className="text-sm font-light">Back</span>
      </Link>

      {/* Sign In Form */}
      <div ref={formRef} className="relative w-full max-w-md">
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-white/10 backdrop-blur-sm border border-white/20 p-2">
              <Image 
                src="/logo.png" 
                alt="Spotify Discord Bot"
                width={24}
                height={24}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="text-white/90 text-lg font-light tracking-tight">
              Spotify Discord Bot
            </div>
          </div>

          {/* Heading */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-extralight text-white mb-2">
              Welcome back
            </h1>
            <p className="text-white/60 font-light text-sm">
              Connect your Spotify account to continue earning crypto rewards
            </p>
          </div>

          {/* Sign In Options */}
          <div className="space-y-4">
            {/* Spotify Sign In Button */}
            <button
              className={cn(
                "w-full rounded-2xl border border-green-500/20 bg-green-500/10 px-6 py-4 text-center backdrop-blur-sm transition-all duration-300",
                "hover:bg-green-500/20 hover:border-green-400/30",
                "focus:outline-none focus:ring-2 focus:ring-green-400/30",
                "flex items-center justify-center gap-3"
              )}
            >
              <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.062 14.455c-.163.264-.457.327-.721.163-1.981-1.211-4.477-1.487-7.417-.818-.285.065-.57-.106-.635-.391-.065-.285.106-.57.391-.635 3.231-.736 6.019-.415 8.218.942.264.164.327.458.164.72zm1.032-2.296c-.204.327-.637.435-.964.23-2.266-1.394-5.722-1.8-8.401-.985-.348.106-.716-.09-.822-.438-.106-.348.09-.716.438-.822 3.06-.93 6.923-.481 9.515 1.151.327.204.435.637.234.964zm.089-2.391c-2.715-1.612-7.196-1.762-9.785-.975-.414.126-.852-.106-.978-.52-.126-.414.106-.852.52-.978 2.96-.9 7.917-.725 11.087 1.127.391.228.52.728.292 1.119-.228.391-.728.52-1.119.292z"/>
              </svg>
              <span className="text-green-300 font-light">Continue with Spotify</span>
            </button>

            {/* Discord Info */}
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded bg-[#5865F2]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-3 h-3 text-[#5865F2]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.195.372.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-white/80 text-sm font-light mb-1">
                    Already connected to Discord?
                  </p>
                  <p className="text-white/50 text-xs font-light leading-relaxed">
                    Use the <code className="bg-white/10 px-2 py-1 rounded text-green-300">/login</code> command in your Discord server to get started.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-white/5">
            <p className="text-center text-xs text-white/40 font-light leading-relaxed">
              New to our Discord bot?{" "}
              <Link href="/signup" className="text-green-400 hover:text-green-300 transition-colors">
                Get started here
              </Link>
            </p>
          </div>
        </div>

        {/* Security Note */}
        <div className="mt-6 text-center">
          <p className="text-xs text-white/30 font-light">
            🔒 Your credentials are never stored. We only use temporary session tokens.
          </p>
        </div>
      </div>
    </div>
  );
}