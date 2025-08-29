import * as crypto from 'crypto';
import config from '../config/environment';

interface EncryptedData {
  iv: string;
  tag: string;
  encrypted: string;
}

class EncryptionService {
  private masterKey: Buffer;

  constructor() {
    if (!config.security.encryptionKey) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }
    this.masterKey = Buffer.from(config.security.encryptionKey, 'base64');
    if (this.masterKey.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be a 32-byte key encoded as base64');
    }
  }

  /**
   * Encrypt private key data using AES-256-GCM with a random IV
   * @param plaintext - The private key to encrypt
   * @returns Encrypted data with IV, tag, and ciphertext
   */
  encrypt(plaintext: string): EncryptedData {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher('aes-256-gcm', this.masterKey);
      cipher.setAAD(Buffer.from('wallet-encryption'));
      
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      return {
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        encrypted: encrypted
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${(error as Error).message}`);
    }
  }

  /**
   * Decrypt private key data
   * @param encryptedData - Object with iv, tag, and encrypted properties
   * @returns Decrypted private key
   */
  decrypt(encryptedData: EncryptedData): string {
    try {
      const { iv, tag, encrypted } = encryptedData;
      const decipher = crypto.createDecipher('aes-256-gcm', this.masterKey);
      decipher.setAAD(Buffer.from('wallet-encryption'));
      decipher.setAuthTag(Buffer.from(tag, 'hex'));
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${(error as Error).message}`);
    }
  }

  /**
   * Generate a cryptographically secure random key
   * @param length - Key length in bytes (default: 32)
   * @returns Base64 encoded key
   */
  static generateKey(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64');
  }
}

export default EncryptionService;
