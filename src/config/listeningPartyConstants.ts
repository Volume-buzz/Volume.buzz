/**
 * Listening Party Constants
 * Centralized configuration for listening verification thresholds
 */

export const LISTENING_PARTY_CONSTANTS = {
  /**
   * Heartbeat interval in seconds
   * How often we check if user is still listening
   */
  HEARTBEAT_INTERVAL: 3,

  /**
   * Heartbeat interval in milliseconds
   * For setInterval usage
   */
  HEARTBEAT_INTERVAL_MS: 3000,

  /**
   * Qualifying threshold in seconds
   * How long a user must listen to qualify for rewards
   */
  QUALIFYING_THRESHOLD: 30,

  /**
   * Maximum verification attempts
   * How many times to check if user started playing before giving up
   */
  MAX_VERIFICATION_ATTEMPTS: 4, // 10 seconds / 3 seconds = ~3-4 attempts

  /**
   * Progress update interval in milliseconds
   * How often to send DM updates to users
   */
  PROGRESS_UPDATE_INTERVAL_MS: 9000, // Every 3rd heartbeat
} as const;

export default LISTENING_PARTY_CONSTANTS;
