"use client";

import React, { useRef, useState, useEffect } from "react";
import { TextureButton } from "@/components/ui/texture-button";
import { Play, Pause, SkipBack, SkipForward, Mic, MicOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { LyricsService, ParsedLyric } from "@/services/lyricsService";

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
  
  // Lyrics state
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState<ParsedLyric[]>([]);
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1);

  const isControlled = !src;

  // Fetch lyrics when track changes
  useEffect(() => {
    if (title && artist && album && durationMs) {
      const fetchLyrics = async () => {
        setIsLoadingLyrics(true);
        try {
          const lyricsData = await LyricsService.getLyrics(
            title,
            artist,
            album,
            Math.floor(durationMs / 1000)
          );
          
          if (lyricsData && lyricsData.syncedLyrics) {
            const parsedLyrics = LyricsService.parseSyncedLyrics(lyricsData.syncedLyrics);
            setLyrics(parsedLyrics);
          } else {
            setLyrics([]);
          }
        } catch (error) {
          console.error('Failed to fetch lyrics:', error);
          setLyrics([]);
        } finally {
          setIsLoadingLyrics(false);
        }
      };

      fetchLyrics();
    }
  }, [title, artist, album, durationMs]);

  // Update current lyric index based on playback time
  useEffect(() => {
    if (lyrics.length > 0) {
      const currentTimeSeconds = isControlled 
        ? (progressMs || 0) / 1000 
        : (localCurrentTime || 0) / 1000;
      
      const index = LyricsService.getCurrentLyricIndex(lyrics, currentTimeSeconds);
      setCurrentLyricIndex(index);
    }
  }, [lyrics, progressMs, localCurrentTime, isControlled]);

  const handleLyricsToggle = () => {
    setShowLyrics(!showLyrics);
  };

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

  const visibleLyrics = lyrics.length > 0 && currentLyricIndex >= 0 
    ? LyricsService.getVisibleLyrics(lyrics, currentLyricIndex, 5)
    : [];

  return (
    <AnimatePresence>
      <motion.div
        className={cn(
          "relative flex mx-auto rounded-3xl overflow-hidden w-full",
          showLyrics ? "max-w-[600px] px-3 py-3" : "max-w-[280px] px-2 py-2",
          className
        )}
        initial={{ opacity: 0, filter: "blur(10px)" }}
        animate={{ opacity: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, filter: "blur(10px)" }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        layout
      >
        {src && (
          <audio
            ref={audioRef}
            onTimeUpdate={handleLocalTimeUpdate}
            src={src}
            className="hidden"
          />
        )}

        <div className="flex flex-col gap-2 w-full">
          {/* Image and Lyrics Container */}
          <div className="relative w-full">
            {showLyrics ? (
              <div className="flex gap-4 items-start">
                {/* Small Album Cover */}
                {cover ? (
                  <motion.div
                    className="relative overflow-hidden rounded-xl bg-white/10 shadow-lg flex-shrink-0"
                    style={{ width: '100px', height: '100px' }}
                    initial={{ scale: 1 }}
                    animate={{ scale: 0.9 }}
                    transition={{ duration: 0.3 }}
                  >
                    <motion.img
                      src={cover}
                      alt={album || "Album cover"}
                      className="object-cover w-full h-full"
                      animate={isPlaying ? {
                        scale: [1, 1.05, 1],
                      } : { scale: 1 }}
                      transition={isPlaying ? {
                        duration: 3,
                        repeat: Infinity,
                        ease: "easeInOut"
                      } : {}}
                    />
                  </motion.div>
                ) : (
                  <div className="rounded-xl bg-white/10 grid place-items-center flex-shrink-0" style={{ width: '100px', height: '100px' }}>
                    <div className="text-white/60 text-xs">No artwork</div>
                  </div>
                )}

                {/* Lyrics Display */}
                <motion.div
                  className="flex-1 overflow-hidden"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="h-24 overflow-hidden relative flex items-center justify-center">
                    {isLoadingLyrics ? (
                      <div className="flex items-center gap-2 text-white/60">
                        <motion.div
                          className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        />
                        <span className="text-sm">Loading lyrics...</span>
                      </div>
                    ) : lyrics.length > 0 && currentLyricIndex >= 0 ? (
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={currentLyricIndex}
                          className="text-center w-full px-2"
                          initial={{ y: 20, opacity: 0, scale: 0.9 }}
                          animate={{ y: 0, opacity: 1, scale: 1 }}
                          exit={{ y: -20, opacity: 0, scale: 0.9 }}
                          transition={{ 
                            duration: 0.4, 
                            ease: "easeOut",
                            type: "spring",
                            stiffness: 300,
                            damping: 25
                          }}
                        >
                          <motion.div
                            className="text-white font-semibold text-lg leading-relaxed break-words"
                            style={{ 
                              wordBreak: 'break-word',
                              overflowWrap: 'break-word',
                              hyphens: 'auto',
                              textAlign: 'center'
                            }}
                            animate={{
                              scale: [1, 1.02, 1],
                            }}
                            transition={{
                              duration: 2,
                              repeat: Infinity,
                              ease: "easeInOut"
                            }}
                          >
                            {lyrics[currentLyricIndex]?.text}
                          </motion.div>
                        </motion.div>
                      </AnimatePresence>
                    ) : (
                      <div className="text-white/60 text-base text-center">
                        {title ? 'No lyrics found for this track' : 'No track selected'}
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            ) : (
              /* Full Size Album Cover */
              cover ? (
                <motion.div
                  className="relative overflow-hidden rounded-2xl w-full bg-white/10 mx-auto shadow-2xl"
                  style={{ aspectRatio: '1 / 1' }}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  layout
                >
                  <motion.img
                    src={cover}
                    alt={album || "Album cover"}
                    className="object-cover w-full h-full"
                    animate={isPlaying ? {
                      scale: [1, 1.05, 1],
                    } : { scale: 1 }}
                    transition={isPlaying ? {
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut"
                    } : {}}
                  />
                </motion.div>
              ) : (
                <div className="rounded-2xl w-full bg-white/10 grid place-items-center mx-auto" style={{ aspectRatio: '1 / 1' }}>
                  <div className="text-white/60 text-sm">No artwork</div>
                </div>
              )
            )}
          </div>
          
          <div className="min-w-0 text-center">
            <motion.div
              className="text-white font-semibold truncate text-lg"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              {title || "No track selected"}
            </motion.div>
            {(artist || album) && (
              <motion.div
                className="text-sm text-white/70 truncate mt-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                {artist}
                {artist && album ? " • " : ""}
                {album}
              </motion.div>
            )}
            {deviceName && (
              <div className="text-xs text-white/50 truncate mt-1">
                {deviceName}
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

          <div className="flex items-center gap-2 justify-center">
            <motion.button
              onClick={isControlled ? onPrev : undefined}
              disabled={controlsDisabled}
              className={cn(
                "text-white hover:bg-white/10 h-8 w-8 rounded-full flex items-center justify-center transition-all hover:scale-110",
                controlsDisabled && "opacity-60 cursor-not-allowed"
              )}
              aria-label="Previous"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              <SkipBack className="h-4 w-4" />
            </motion.button>
            
            <motion.button
              onClick={isControlled ? onTogglePlay : handleLocalToggle}
              disabled={controlsDisabled}
              className={cn(
                "text-black bg-white hover:bg-white/90 h-10 w-10 rounded-full flex items-center justify-center transition-all shadow-lg hover:shadow-xl mx-2",
                controlsDisabled && "opacity-60 cursor-not-allowed"
              )}
              aria-label={isControlled ? (isPlaying ? "Pause" : "Play") : (localIsPlaying ? "Pause" : "Play")}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              {isControlled ? (
                isPlaying ? (
                  <Pause className="h-5 w-5" fill="currentColor" />
                ) : (
                  <Play className="h-5 w-5 ml-0.5" fill="currentColor" />
                )
              ) : localIsPlaying ? (
                <Pause className="h-5 w-5" fill="currentColor" />
              ) : (
                <Play className="h-5 w-5 ml-0.5" fill="currentColor" />
              )}
            </motion.button>

            <motion.button
              onClick={isControlled ? onNext : undefined}
              disabled={controlsDisabled}
              className={cn(
                "text-white hover:bg-white/10 h-8 w-8 rounded-full flex items-center justify-center transition-all hover:scale-110",
                controlsDisabled && "opacity-60 cursor-not-allowed"
              )}
              aria-label="Next"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              <SkipForward className="h-4 w-4" />
            </motion.button>
          </div>
          
          {onTransfer && (
            <div className="flex items-center justify-center gap-3">
              <TextureButton
                onClick={onTransfer}
                disabled={controlsDisabled}
                variant="secondary"
                size="sm"
                className="w-auto"
              >
                Transfer Here
              </TextureButton>
              
              {/* Lyrics Toggle Button */}
              <motion.button
                onClick={handleLyricsToggle}
                disabled={controlsDisabled || isLoadingLyrics}
                className={cn(
                  "text-white hover:bg-white/10 h-8 w-8 rounded-full flex items-center justify-center transition-all hover:scale-110",
                  controlsDisabled && "opacity-60 cursor-not-allowed",
                  showLyrics && "bg-white/20",
                  lyrics.length === 0 && !isLoadingLyrics && "opacity-40"
                )}
                aria-label="Toggle Lyrics"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                {isLoadingLyrics ? (
                  <motion.div
                    className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  />
                ) : showLyrics ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </motion.button>
            </div>
          )}

          {/* Lyrics Toggle Button for when no transfer button */}
          {!onTransfer && (
            <div className="flex items-center justify-center">
              <motion.button
                onClick={handleLyricsToggle}
                disabled={controlsDisabled || isLoadingLyrics}
                className={cn(
                  "text-white hover:bg-white/10 h-8 w-8 rounded-full flex items-center justify-center transition-all hover:scale-110",
                  controlsDisabled && "opacity-60 cursor-not-allowed",
                  showLyrics && "bg-white/20",
                  lyrics.length === 0 && !isLoadingLyrics && "opacity-40"
                )}
                aria-label="Toggle Lyrics"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                {isLoadingLyrics ? (
                  <motion.div
                    className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  />
                ) : showLyrics ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </motion.button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AudioPlayer;
