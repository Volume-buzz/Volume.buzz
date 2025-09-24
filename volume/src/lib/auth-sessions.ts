// Simple in-memory storage for OAuth sessions
// Use globalThis to persist across Next.js module reloads in development

interface AuthSession {
  codeVerifier: string;
  timestamp: number;
}

class AuthSessionManager {
  private get sessions(): Map<string, AuthSession> {
    // Use globalThis to persist across Next.js hot reloads
    if (!globalThis.__authSessions) {
      globalThis.__authSessions = new Map<string, AuthSession>();
      console.log('🔄 Initialized new session storage');
    }
    return globalThis.__authSessions;
  }

  store(state: string, codeVerifier: string): void {
    this.sessions.set(state, {
      codeVerifier,
      timestamp: Date.now()
    });
    
    // Clean up old sessions (older than 10 minutes)
    this.cleanup();
    
    console.log('💾 Stored session for state:', state, 'total sessions:', this.sessions.size);
  }

  get(state: string): AuthSession | undefined {
    const session = this.sessions.get(state);
    console.log('🔍 Retrieved session for state:', state, 'found:', !!session, 'total sessions:', this.sessions.size);
    
    // Debug: list all stored states
    const allStates = Array.from(this.sessions.keys());
    console.log('📋 All stored states:', allStates);
    
    return session;
  }

  remove(state: string): void {
    const existed = this.sessions.has(state);
    this.sessions.delete(state);
    console.log('🗑️ Removed session for state:', state, 'existed:', existed);
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of this.sessions.entries()) {
      if (now - value.timestamp > 600000) { // 10 minutes
        this.sessions.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log('🧹 Cleaned up', cleaned, 'expired sessions');
    }
  }

  getStats(): { total: number; oldest: number } {
    const now = Date.now();
    let oldest = 0;
    
    for (const session of this.sessions.values()) {
      const age = now - session.timestamp;
      oldest = Math.max(oldest, age);
    }
    
    return {
      total: this.sessions.size,
      oldest: Math.floor(oldest / 1000) // seconds
    };
  }
}

// Extend globalThis to include our session storage
declare global {
  var __authSessions: Map<string, AuthSession> | undefined;
}

// Export singleton instance
export const authSessions = new AuthSessionManager();