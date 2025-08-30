/**
 * Enhanced Security Service for Wallet Operations
 * Provides additional security layers beyond basic encryption
 */

import * as crypto from 'crypto';
import { PublicKey } from '@solana/web3.js';
import config from '../config/environment';

interface SecurityCheck {
  isValid: boolean;
  reason?: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

interface TransactionSecurityContext {
  userDiscordId: string;
  recipientAddress: string;
  amount: number;
  tokenMint?: string;
  userAgent?: string;
  ipAddress?: string;
}

class SecurityService {
  private readonly MAX_TRANSACTION_AMOUNT_SOL = 100; // Max SOL per transaction
  private readonly MAX_DAILY_TRANSACTIONS = 50; // Max transactions per user per day
  private readonly SUSPICIOUS_ADDRESSES = new Set<string>(); // Known suspicious addresses

  constructor() {
    // Initialize known suspicious addresses from config or external source
    this.loadSuspiciousAddresses();
  }

  /**
   * Comprehensive security check for wallet operations
   */
  async validateWalletOperation(context: TransactionSecurityContext): Promise<SecurityCheck> {
    try {
      // Check recipient address validity
      const addressCheck = this.validateAddress(context.recipientAddress);
      if (!addressCheck.isValid) return addressCheck;

      // Check transaction amount limits
      const amountCheck = this.validateTransactionAmount(context.amount, context.tokenMint);
      if (!amountCheck.isValid) return amountCheck;

      // Check for suspicious recipients
      const suspiciousCheck = this.checkSuspiciousActivity(context);
      if (!suspiciousCheck.isValid) return suspiciousCheck;

      // Check daily transaction limits
      const dailyLimitCheck = await this.checkDailyLimits(context.userDiscordId);
      if (!dailyLimitCheck.isValid) return dailyLimitCheck;

      return {
        isValid: true,
        riskLevel: 'LOW'
      };

    } catch (error: any) {
      return {
        isValid: false,
        reason: `Security validation failed: ${error.message}`,
        riskLevel: 'CRITICAL'
      };
    }
  }

  /**
   * Validate Solana address format and safety
   */
  private validateAddress(address: string): SecurityCheck {
    try {
      // Check basic format
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
        return {
          isValid: false,
          reason: 'Invalid Solana address format',
          riskLevel: 'HIGH'
        };
      }

      // Validate with Solana SDK
      new PublicKey(address);

      // Check against known suspicious addresses
      if (this.SUSPICIOUS_ADDRESSES.has(address)) {
        return {
          isValid: false,
          reason: 'Address flagged as suspicious',
          riskLevel: 'CRITICAL'
        };
      }

      return {
        isValid: true,
        riskLevel: 'LOW'
      };

    } catch (error) {
      return {
        isValid: false,
        reason: 'Invalid address format',
        riskLevel: 'HIGH'
      };
    }
  }

  /**
   * Validate transaction amount against limits
   */
  private validateTransactionAmount(amount: number, tokenMint?: string): SecurityCheck {
    // For SOL transfers
    if (!tokenMint || tokenMint === 'SOL') {
      if (amount > this.MAX_TRANSACTION_AMOUNT_SOL) {
        return {
          isValid: false,
          reason: `Amount exceeds maximum limit of ${this.MAX_TRANSACTION_AMOUNT_SOL} SOL`,
          riskLevel: 'HIGH'
        };
      }
    }

    // Basic sanity checks
    if (amount <= 0) {
      return {
        isValid: false,
        reason: 'Amount must be positive',
        riskLevel: 'MEDIUM'
      };
    }

    if (amount > 1000000) { // Arbitrary large number check
      return {
        isValid: false,
        reason: 'Amount suspiciously large',
        riskLevel: 'HIGH'
      };
    }

    return {
      isValid: true,
      riskLevel: 'LOW'
    };
  }

  /**
   * Check for suspicious activity patterns
   */
  private checkSuspiciousActivity(context: TransactionSecurityContext): SecurityCheck {
    // Check for round-trip patterns (sending to same address repeatedly)
    // Check for unusual amounts
    // Check for known scam patterns
    
    // For now, basic checks
    if (context.amount === 0) {
      return {
        isValid: false,
        reason: 'Zero amount transfers not allowed',
        riskLevel: 'MEDIUM'
      };
    }

    return {
      isValid: true,
      riskLevel: 'LOW'
    };
  }

  /**
   * Check daily transaction limits per user
   */
  private async checkDailyLimits(userDiscordId: string): Promise<SecurityCheck> {
    // This would require database tracking of daily transactions
    // For now, return basic validation
    return {
      isValid: true,
      riskLevel: 'LOW'
    };
  }

  /**
   * Generate secure audit log entry
   */
  generateAuditLog(
    action: string,
    userDiscordId: string,
    details: Record<string, any>,
    result: 'SUCCESS' | 'FAILURE'
  ): string {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      action,
      userDiscordId: this.hashUserId(userDiscordId), // Hash for privacy
      details: this.sanitizeLogData(details),
      result,
      sessionId: this.generateSessionId()
    };

    return JSON.stringify(logEntry);
  }

  /**
   * Hash user ID for privacy in logs
   */
  private hashUserId(discordId: string): string {
    return crypto.createHash('sha256').update(discordId + config.security.jwtSecret).digest('hex').substring(0, 16);
  }

  /**
   * Sanitize log data to remove sensitive information
   */
  private sanitizeLogData(data: Record<string, any>): Record<string, any> {
    const sanitized = { ...data };
    
    // Remove sensitive fields
    delete sanitized.privateKey;
    delete sanitized.encryptedPrivateKey;
    delete sanitized.signature; // Keep only transaction signatures, not cryptographic signatures
    
    // Truncate addresses for privacy
    if (sanitized.address) {
      sanitized.address = `${sanitized.address.substring(0, 8)}...${sanitized.address.substring(-8)}`;
    }

    return sanitized;
  }

  /**
   * Generate session ID for audit trails
   */
  private generateSessionId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Load suspicious addresses from external source
   */
  private loadSuspiciousAddresses(): void {
    // In a real implementation, this would load from:
    // - External security feeds
    // - Blockchain analysis APIs
    // - Internal blacklist database
    
    // For now, add some example suspicious patterns
    this.SUSPICIOUS_ADDRESSES.add('11111111111111111111111111111111'); // Invalid address
  }

  /**
   * Rate limiting check for wallet operations
   */
  async checkRateLimit(userDiscordId: string, operation: string): Promise<SecurityCheck> {
    // This would implement rate limiting per user per operation
    // For now, basic implementation
    return {
      isValid: true,
      riskLevel: 'LOW'
    };
  }

  /**
   * Validate encryption key strength
   */
  static validateEncryptionKey(key: string): boolean {
    try {
      const keyBuffer = Buffer.from(key, 'base64');
      return keyBuffer.length === 32; // 256 bits
    } catch {
      return false;
    }
  }
}

export default SecurityService;
export { SecurityCheck, TransactionSecurityContext };
