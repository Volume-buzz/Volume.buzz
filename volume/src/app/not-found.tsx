"use client";

import React from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { CanvasRevealEffect } from "@/components/forms/auth-form";

export default function NotFound() {
  return (
    <div className="flex w-full flex-col min-h-screen bg-black relative">
      {/* Background Effect */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0">
          <CanvasRevealEffect
            animationSpeed={2}
            containerClassName="bg-black"
            colors={[
              [255, 255, 255],
              [255, 255, 255],
            ]}
            dotSize={4}
            reverse={false}
          />
        </div>
        
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(0,0,0,0.8)_0%,_transparent_100%)]" />
        <div className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-black to-transparent" />
      </div>
      
      {/* Content Layer */}
      <div className="relative z-10 flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-center space-y-6"
          >
            {/* 404 Icon */}
            <motion.div 
              className="flex justify-center"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                <span className="text-3xl font-bold text-white">404</span>
              </div>
            </motion.div>

            {/* Error Message */}
            <div className="space-y-2">
              <h1 className="text-3xl font-bold leading-tight tracking-tight text-white">
                Page Not Found
              </h1>
              <p className="text-lg text-white/70 font-light max-w-sm mx-auto">
                The page you&apos;re looking for doesn&apos;t exist or has been moved.
              </p>
            </div>

            {/* Action Buttons */}
            <motion.div 
              className="space-y-3 pt-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              <Link 
                href="/"
                className="block w-full rounded-full bg-white/10 text-white border border-white/20 font-medium py-3 hover:bg-white/20 transition-colors text-center"
              >
                Go Home
              </Link>
              <Link 
                href="/login"
                className="block w-full rounded-full bg-[#5865F2] text-white font-medium py-3 hover:bg-[#4752C4] transition-colors text-center"
              >
                Access Dashboard
              </Link>
            </motion.div>

            {/* Bot Branding */}
            <motion.div 
              className="flex items-center justify-center gap-2 pt-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
            >
              <div className="w-4 h-4 rounded-full bg-[#5865F2]"></div>
              <span className="text-sm text-white/60">Volume Discord Bot</span>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
