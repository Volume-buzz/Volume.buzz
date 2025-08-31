/**
 * Spotify-specific types and interfaces
 */

export interface SpotifyUser {
  id: string;
  display_name: string;
  email: string;
  country: string;
  product: 'premium' | 'free';
  images: Array<{
    url: string;
    height: number;
    width: number;
  }>;
  followers: {
    total: number;
  };
  external_urls: {
    spotify: string;
  };
}

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  href: string;
  external_urls: {
    spotify: string;
  };
  duration_ms: number;
  explicit: boolean;
  popularity: number;
  preview_url: string | null;
  track_number: number;
  type: 'track';
  is_local: boolean;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  available_markets: string[];
  disc_number: number;
  external_ids: {
    isrc?: string;
    ean?: string;
    upc?: string;
  };
  is_playable?: boolean;
  linked_from?: {
    external_urls: {
      spotify: string;
    };
    href: string;
    id: string;
    type: string;
    uri: string;
  };
  restrictions?: {
    reason: 'market' | 'product' | 'explicit';
  };
}

export interface SpotifyArtist {
  id: string;
  name: string;
  href: string;
  external_urls: {
    spotify: string;
  };
  uri: string;
  type: 'artist';
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  album_type: 'album' | 'single' | 'compilation';
  total_tracks: number;
  href: string;
  external_urls: {
    spotify: string;
  };
  uri: string;
  type: 'album';
  release_date: string;
  release_date_precision: 'year' | 'month' | 'day';
  artists: SpotifyArtist[];
  images: Array<{
    url: string;
    height: number;
    width: number;
  }>;
  available_markets: string[];
}

export interface SpotifyCurrentlyPlaying {
  device: {
    id: string | null;
    is_active: boolean;
    is_private_session: boolean;
    is_restricted: boolean;
    name: string;
    type: string;
    volume_percent: number | null;
    supports_volume: boolean;
  };
  repeat_state: 'off' | 'track' | 'context';
  shuffle_state: boolean;
  context: {
    type: string;
    href: string;
    external_urls: {
      spotify: string;
    };
    uri: string;
  } | null;
  timestamp: number;
  progress_ms: number | null;
  is_playing: boolean;
  item: SpotifyTrack | null;
  currently_playing_type: 'track' | 'episode' | 'ad' | 'unknown';
  actions: {
    interrupting_playback?: boolean;
    pausing?: boolean;
    resuming?: boolean;
    seeking?: boolean;
    skipping_next?: boolean;
    skipping_prev?: boolean;
    toggling_repeat_context?: boolean;
    toggling_shuffle?: boolean;
    toggling_repeat_track?: boolean;
    transferring_playback?: boolean;
  };
}

export interface SpotifyAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: 'Bearer';
  scope: string;
}

export interface SpotifyPlaybackState {
  device: SpotifyDevice;
  repeat_state: 'off' | 'track' | 'context';
  shuffle_state: boolean;
  context: SpotifyContext | null;
  timestamp: number;
  progress_ms: number;
  is_playing: boolean;
  item: SpotifyTrack | null;
  currently_playing_type: 'track' | 'episode' | 'ad' | 'unknown';
  actions: SpotifyActions;
}

export interface SpotifyDevice {
  id: string | null;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number | null;
  supports_volume: boolean;
}

export interface SpotifyContext {
  type: string;
  href: string;
  external_urls: {
    spotify: string;
  };
  uri: string;
}

export interface SpotifyActions {
  interrupting_playback?: boolean;
  pausing?: boolean;
  resuming?: boolean;
  seeking?: boolean;
  skipping_next?: boolean;
  skipping_prev?: boolean;
  toggling_repeat_context?: boolean;
  toggling_shuffle?: boolean;
  toggling_repeat_track?: boolean;
  transferring_playback?: boolean;
}

export interface SpotifySearchResults {
  tracks: {
    href: string;
    items: SpotifyTrack[];
    limit: number;
    next: string | null;
    offset: number;
    previous: string | null;
    total: number;
  };
}

// Platform type (Spotify only)
export type Platform = 'SPOTIFY';

export interface PlatformTrack {
  id: string;
  title: string;
  artist: string;
  url: string;
  artwork_url?: string;
  duration_ms?: number;
  platform: Platform;
  // Spotify specific
  spotify_uri?: string;
  preview_url?: string;
}

export interface PlatformUser {
  id: string;
  name: string;
  display_name?: string;
  platform: Platform;
  is_premium?: boolean;
  profile_picture?: string;
}

export interface TrackingSession {
  userId: string;
  raidId: number;
  trackId: string;
  platform: Platform;
  startTime: Date;
  totalListenTime: number;
  isListening: boolean;
  lastCheck: Date;
  requiredTime: number;
  isPremium?: boolean; // For Spotify users
}

export interface EnhancedSpotifyMetadata {
  track: SpotifyTrack;
  originalTrackId: string;
  linkedTrackId?: string;
  isPlayable: boolean;
  market?: string;
  fetchedAt: Date;
  albumArtwork: {
    large?: string; // 640x640
    medium?: string; // 300x300
    small?: string; // 64x64
  };
  formattedDuration: string;
  artistNames: string;
  albumInfo: {
    name: string;
    releaseDate: string;
    type: string;
  };
}

export interface SpotifyRateLimitInfo {
  retryAfter?: number;
  remaining?: number;
  resetTime?: number;
}
