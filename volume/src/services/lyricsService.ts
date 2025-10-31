interface LyricsResponse {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string;
  syncedLyrics: string;
}

interface LyricsError {
  code: number;
  name: string;
  message: string;
}

export interface ParsedLyric {
  time: number; // in seconds
  text: string;
}

export class LyricsService {
  private static readonly BASE_URL = 'https://lrclib.net/api';
  
  static async getLyrics(
    trackName: string,
    artistName: string,
    albumName: string,
    duration: number
  ): Promise<LyricsResponse | null> {
    try {
      const params = new URLSearchParams({
        track_name: trackName,
        artist_name: artistName,
        album_name: albumName,
        duration: duration.toString()
      });

      console.log('Fetching lyrics for:', { trackName, artistName, albumName, duration });
      console.log('API URL:', `${this.BASE_URL}/get?${params}`);

      const response = await fetch(`${this.BASE_URL}/get?${params}`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Volume Dashboard v1.0.0 (https://github.com/volume-bot/dashboard)',
          'Accept': 'application/json',
        }
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);

      if (!response.ok) {
        if (response.status === 404) {
          console.log('Lyrics not found for track:', trackName);
          return null;
        }
        const errorText = await response.text();
        console.error('API Error:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const data: LyricsResponse = await response.json();
      console.log('Successfully fetched lyrics:', data);
      return data;
    } catch (error) {
      console.error('Error fetching lyrics:', error);
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        console.error('This might be a CORS issue or network problem');
      }
      return null;
    }
  }

  static parseSyncedLyrics(syncedLyrics: string): ParsedLyric[] {
    if (!syncedLyrics) return [];

    const lines = syncedLyrics.split('\n');
    const parsed: ParsedLyric[] = [];

    for (const line of lines) {
      const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2})\]\s*(.*)/);
      if (match) {
        const [, minutes, seconds, centiseconds, text] = match;
        const timeInSeconds = 
          parseInt(minutes) * 60 + 
          parseInt(seconds) + 
          parseInt(centiseconds) / 100;
        
        if (text.trim()) {
          parsed.push({
            time: timeInSeconds,
            text: text.trim()
          });
        }
      }
    }

    return parsed.sort((a, b) => a.time - b.time);
  }

  static getCurrentLyricIndex(lyrics: ParsedLyric[], currentTime: number): number {
    if (!lyrics.length) return -1;

    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (currentTime >= lyrics[i].time) {
        return i;
      }
    }
    return -1;
  }

  static getVisibleLyrics(
    lyrics: ParsedLyric[], 
    currentIndex: number, 
    visibleCount: number = 5
  ): { lyric: ParsedLyric; index: number; isCurrent: boolean }[] {
    if (!lyrics.length || currentIndex === -1) return [];

    const startIndex = Math.max(0, currentIndex - 1);
    const endIndex = Math.min(lyrics.length - 1, startIndex + visibleCount - 1);
    
    const visible = [];
    for (let i = startIndex; i <= endIndex; i++) {
      visible.push({
        lyric: lyrics[i],
        index: i,
        isCurrent: i === currentIndex
      });
    }
    
    return visible;
  }
}
