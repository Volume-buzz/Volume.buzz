"use client";

import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const formatMs = (ms: number = 0) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const CustomSlider = ({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (value: number) => void; // percent 0..100
  className?: string;
}) => {
  return (
    <motion.div
      className={cn(
        "relative w-full h-1 bg-white/20 rounded-full cursor-pointer",
        className
      )}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = (x / rect.width) * 100;
        onChange(Math.min(Math.max(percentage, 0), 100));
      }}
    >
      <motion.div
        className="absolute top-0 left-0 h-full bg-white rounded-full"
        style={{ width: `${value}%` }}
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      />
    </motion.div>
  );
};

type AudioPlayerProps = {
  // Local playback mode
  src?: string;
  // Shared display props
  cover?: string;
  title?: string;
  artist?: string;
  album?: string;
  deviceName?: string;
  className?: string;
  // Controlled (Spotify) mode
  isPlaying?: boolean;
  progressMs?: number;
  durationMs?: number;
  onTogglePlay?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onTransfer?: () => void;
  onSeekMs?: (ms: number) => void;
  controlsDisabled?: boolean;
};

const AudioPlayer = ({
  src,
  cover,
  title,
  artist,
  album,
  deviceName,
  className,
  isPlaying,
  progressMs,
  durationMs,
  onTogglePlay,
  onPrev,
  onNext,
  onTransfer,
  onSeekMs,
  controlsDisabled = false,
}: AudioPlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [localIsPlaying, setLocalIsPlaying] = useState(false);
  const [localProgressPercent, setLocalProgressPercent] = useState(0);
  const [localCurrentTime, setLocalCurrentTime] = useState(0);
  const [localDuration, setLocalDuration] = useState(0);

  const isControlled = !src;

  const handleLocalToggle = () => {
    if (audioRef.current) {
      if (localIsPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setLocalIsPlaying(!localIsPlaying);
    }
  };

  const handleLocalTimeUpdate = () => {
    if (audioRef.current) {
      const percent =
        (audioRef.current.currentTime / audioRef.current.duration) * 100;
      setLocalProgressPercent(isFinite(percent) ? percent : 0);
      setLocalCurrentTime(audioRef.current.currentTime * 1000);
      setLocalDuration(audioRef.current.duration * 1000);
    }
  };

  const handleLocalSeek = (percent: number) => {
    if (audioRef.current && audioRef.current.duration) {
      const time = (percent / 100) * audioRef.current.duration;
      if (isFinite(time)) {
        audioRef.current.currentTime = time;
        setLocalProgressPercent(percent);
      }
    }
  };

  const percent = isControlled
    ? Math.min(
        100,
        Math.max(
          0,
          durationMs && durationMs > 0
            ? ((progressMs || 0) / durationMs) * 100
            : 0
        )
      )
    : localProgressPercent;

  const currentLabel = isControlled
    ? formatMs(progressMs || 0)
    : formatMs(localCurrentTime || 0);
  const durationLabel = isControlled
    ? formatMs(durationMs || 0)
    : formatMs(localDuration || 0);

  return (
    <AnimatePresence>
      <motion.div
        className={cn(
          "relative flex flex-col mx-auto rounded-3xl overflow-hidden bg-[#11111198] shadow-[0_0_20px_rgba(0,0,0,0.2)] backdrop-blur-sm p-3 w-full",
          className
        )}
        initial={{ opacity: 0, filter: "blur(10px)" }}
        animate={{ opacity: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, filter: "blur(10px)" }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
      >
        {src && (
          <audio
            ref={audioRef}
            onTimeUpdate={handleLocalTimeUpdate}
            src={src}
            className="hidden"
          />
        )}

        <div className="flex flex-col gap-2">
          {cover ? (
            <div className="overflow-hidden rounded-[12px] h-[120px] w-full bg-white/10">
              <img
                src={cover}
                alt={album || "Album cover"}
                className="object-cover w-full h-full"
              />
            </div>
          ) : (
            <div className="rounded-[12px] h-[120px] w-full bg-white/10 grid place-items-center">
              <div className="text-white/60 text-sm">No artwork</div>
            </div>
          )}
          <div className="min-w-0 text-center mt-1">
            <div className="text-white font-semibold truncate text-base">
              {title || "No track selected"}
            </div>
            {(artist || album) && (
              <div className="text-xs text-white/70 truncate">
                {artist}
                {artist && album ? " • " : ""}
                {album}
              </div>
            )}
            {deviceName && (
              <div className="text-[10px] text-white/60 truncate">
                Device: {deviceName}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <CustomSlider
              value={percent}
              onChange={(p) => {
                if (isControlled) {
                  if (onSeekMs && (durationMs || 0) > 0) {
                    onSeekMs(((durationMs || 0) * p) / 100);
                  }
                } else {
                  handleLocalSeek(p);
                }
              }}
            />
            <div className="flex items-center justify-between text-xs text-white/70">
              <span>{currentLabel}</span>
              <span>{durationLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 justify-center mt-1">
            <button
              onClick={isControlled ? onPrev : undefined}
              disabled={controlsDisabled}
              className={cn(
                "text-white hover:bg-white/10 h-9 w-9 rounded-full flex items-center justify-center transition-colors",
                controlsDisabled && "opacity-60 cursor-not-allowed"
              )}
              aria-label="Previous"
            >
              <SkipBack className="h-5 w-5" />
            </button>
            <button
              onClick={isControlled ? onTogglePlay : handleLocalToggle}
              disabled={controlsDisabled}
              className={cn(
                "text-white hover:bg-white/10 h-9 w-9 rounded-full flex items-center justify-center transition-colors",
                controlsDisabled && "opacity-60 cursor-not-allowed"
              )}
              aria-label={isControlled ? (isPlaying ? "Pause" : "Play") : (localIsPlaying ? "Pause" : "Play")}
            >
              {isControlled ? (
                isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5" />
                )
              ) : localIsPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5" />
              )}
            </button>
            <button
              onClick={isControlled ? onNext : undefined}
              disabled={controlsDisabled}
              className={cn(
                "text-white hover:bg-white/10 h-9 w-9 rounded-full flex items-center justify-center transition-colors",
                controlsDisabled && "opacity-60 cursor-not-allowed"
              )}
              aria-label="Next"
            >
              <SkipForward className="h-5 w-5" />
            </button>
          </div>
          {onTransfer && (
            <div className="flex items-center justify-center mt-1">
              <button
                onClick={onTransfer}
                disabled={controlsDisabled}
                className={cn(
                  "px-3 py-2 rounded-md border border-white/20 text-white hover:bg-white/10 text-sm transition-colors",
                  controlsDisabled && "opacity-60 cursor-not-allowed"
                )}
              >
                Transfer Here
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AudioPlayer;
