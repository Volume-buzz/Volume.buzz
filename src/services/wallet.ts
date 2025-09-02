/**
 * Wallet Service for Solana blockchain integration
 * Handles wallet creation, token management, and balances
 */

import { 
  Keypair, 
  PublicKey, 
  Connection, 
  Transaction, 
  TransactionInstruction,
  sendAndConfirmTransaction,
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
// Note: Install @solana/spl-token for full token functionality
// Run: npm install @solana/spl-token@^0.4.8
// Then uncomment: import { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import config from '../config/environment';
import PrismaDatabase from '../database/prisma';
import EncryptionService from './encryption';
import SecurityService, { TransactionSecurityContext } from './security';
import { Wallet, TokenBalance, WalletBalance } from '../types';

interface CreateWalletData {
  userId: string; // Changed to use User's UUID id
  publicKey: string;
  encryptedPrivateKey: string;
  isArtistWallet: boolean;
}

interface TransferResult {
  signature: string;
  success: boolean;
  error?: string;
}

interface TransferRequest {
  fromDiscordId: string;
  toAddress: string;
  amount: number;
  tokenMint?: string; // If not provided, transfers SOL
}

class WalletService {
  private connection: Connection;
  private encryptionService: EncryptionService;
  private securityService: SecurityService;

  constructor() {
    this.connection = new Connection(config.solana.rpcUrl, 'confirmed');
    this.encryptionService = new EncryptionService();
    this.securityService = new SecurityService();
  }

  /**
   * Create or get existing wallet for a user
   */
  async createOrGetWallet(discordId: string, isArtistWallet: boolean = false): Promise<Wallet> {
    try {
      // Check if user already has a wallet
      const existingWallet = await PrismaDatabase.getUserWallet(discordId);
      if (existingWallet) {
        return {
          id: 0, // Using string ID now
          userId: 0, // Legacy field
          publicKey: existingWallet.public_key,
          encryptedPrivateKey: existingWallet.encrypted_private_key,
          isArtistWallet: existingWallet.is_artist_wallet,
          createdAt: existingWallet.created_at,
          exportedAt: existingWallet.exported_at || undefined
        };
      }

      // Ensure user exists in database before creating wallet
      let user = await PrismaDatabase.getUser(discordId);
      if (!user) {
        console.log(`👤 Creating user record for ${discordId} before wallet creation`);
        user = await PrismaDatabase.createUser({
          discordId,
          spotifyUserId: '',
          spotifyDisplayName: '',
          spotifyEmail: '',
          tokensBalance: 0
        });
      }

      // Create new wallet
      const keypair = Keypair.generate();
      // Store as base58 string (standard format for Solana private keys)
      const privateKeyBase58 = Buffer.from(keypair.secretKey).toString('base64');
      const encryptedPrivateKey = this.encryptionService.encrypt(privateKeyBase58);

      // Validate encryption result before storing
      if (!encryptedPrivateKey || typeof encryptedPrivateKey !== 'object') {
        throw new Error('Failed to encrypt private key - encryption service returned invalid data');
      }

      // Ensure the encrypted data is properly serialized as JSON string
      const encryptedDataString = JSON.stringify(encryptedPrivateKey);
      
      // Validate the serialized string to prevent "[object Object]" corruption
      if (!encryptedDataString || encryptedDataString === 'null' || encryptedDataString.includes('[object Object]')) {
        throw new Error('Failed to serialize encrypted private key - data corruption detected');
      }

      if (!user.id) {
        throw new Error('User ID is required to create wallet');
      }

      const walletData: CreateWalletData = {
        userId: user.id, // Use the User's UUID id instead of discord_id
        publicKey: keypair.publicKey.toString(),
        encryptedPrivateKey: encryptedDataString,
        isArtistWallet
      };

      const createdWallet = await PrismaDatabase.createWallet(walletData);
      
      console.log(`💳 Created new Solana wallet for user ${discordId}: ${keypair.publicKey.toString()}`);

      return {
        id: 0,
        userId: 0,
        publicKey: createdWallet.public_key,
        encryptedPrivateKey: createdWallet.encrypted_private_key,
        isArtistWallet: createdWallet.is_artist_wallet,
        createdAt: createdWallet.created_at,
        exportedAt: createdWallet.exported_at || undefined
      };
    } catch (error: any) {
      throw new Error(`Failed to create or get wallet: ${error.message}`);
    }
  }

  /**
   * Get wallet balances (SOL + SPL tokens)
   */
  async getWalletBalances(publicKey: string): Promise<WalletBalance> {
    try {
      const pubKey = new PublicKey(publicKey);

      // Get SOL balance
      const solBalance = await this.connection.getBalance(pubKey);
      const solAmount = solBalance / 1e9; // Convert lamports to SOL

      // Get token accounts with parsed data
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(pubKey, {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') // SPL Token Program
      });

      const tokens: TokenBalance[] = [];
      
      console.log(`🔍 Found ${tokenAccounts.value.length} token accounts for wallet ${publicKey}`);
      
      for (const tokenAccount of tokenAccounts.value) {
        try {
          // Get the mint address from the parsed account data
          const mintAddress = tokenAccount.account.data.parsed.info.mint;
          const tokenAmount = tokenAccount.account.data.parsed.info.tokenAmount;
          
          console.log(`🪙 Processing token account: ${tokenAccount.pubkey.toString()} with mint: ${mintAddress}`);
          
          if (tokenAmount.uiAmount && tokenAmount.uiAmount > 0) {
            // Try to get token info from our database
            const tokenData = await PrismaDatabase.getTokenByMint(mintAddress);
            
            console.log(`💰 Found token: ${tokenData?.symbol || 'UNKNOWN'} with balance: ${tokenAmount.uiAmount}`);
            
            tokens.push({
              mint: mintAddress,
              symbol: tokenData?.symbol || 'UNKNOWN',
              amount: tokenAmount.uiAmount,
              decimals: tokenAmount.decimals,
              uiAmount: tokenAmount.uiAmount
            });
          }
        } catch (tokenError) {
          console.warn(`Failed to process token account ${tokenAccount.pubkey.toString()}:`, tokenError);
        }
      }

      return {
        sol: solAmount,
        tokens
      };
    } catch (error: any) {
      throw new Error(`Failed to get wallet balances: ${error.message}`);
    }
  }

  /**
   * Export wallet private key (encrypted)
   */
  async getPrivateKey(discordId: string): Promise<string> {
    try {
      const wallet = await PrismaDatabase.getUserWallet(discordId);
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      if (!wallet.encrypted_private_key) {
        throw new Error('Private key not found in wallet record');
      }

      // Handle different formats of encrypted data
      let encryptedData = wallet.encrypted_private_key;
      
      // Debug the encrypted data format
      console.log(`🔐 Debug private key export for ${discordId}:`);
      console.log(`   Type: ${typeof encryptedData}`);
      console.log(`   Value: ${JSON.stringify(encryptedData)}`);
      
      // Additional validation for corrupted data
      if (typeof encryptedData === 'string' && (encryptedData === 'null' || encryptedData === 'undefined')) {
        throw new Error('Wallet private key is corrupted (null/undefined). Use the `/regenerate-wallet` command to fix this issue.');
      }
      
      if (!encryptedData) {
        throw new Error('Encrypted private key is null or undefined');
      }

      // Check for corrupted "[object Object]" string
      if (encryptedData === "[object Object]" || (typeof encryptedData === 'string' && encryptedData.includes('[object Object]'))) {
        throw new Error('Wallet private key is corrupted. Use the `/regenerate-wallet` command to fix this issue.');
      }

      // Convert to proper format for decryption
      if (typeof encryptedData === 'string') {
        try {
          encryptedData = JSON.parse(encryptedData);
        } catch (parseError) {
          console.log('   Failed to parse as JSON, treating as raw encrypted string');
          // If it's not JSON, it might be an old format - try to use directly
        }
      }

      const decryptedKey = this.encryptionService.decrypt(encryptedData as any);
      
      // Convert back to proper format for wallet import
      // If it's still in the old array format, convert it
      let finalKey = decryptedKey;
      try {
        const parsed = JSON.parse(decryptedKey);
        if (Array.isArray(parsed)) {
          // Old format: convert byte array to base58
          finalKey = Buffer.from(parsed).toString('base64');
        }
      } catch {
        // Not JSON, assume it's already in correct format
      }
      
      // Mark as exported
      await PrismaDatabase.markWalletAsExported(wallet.public_key);
      
      return finalKey;
    } catch (error: any) {
      throw new Error(`Failed to get private key: ${error.message}`);
    }
  }

  /**
   * Get wallet by public key
   */
  async getWalletByPublicKey(publicKey: string): Promise<Wallet | null> {
    try {
      const wallet = await PrismaDatabase.getWalletByPublicKey(publicKey);
      if (!wallet) return null;

      return {
        id: 0,
        userId: 0,
        publicKey: wallet.public_key,
        encryptedPrivateKey: wallet.encrypted_private_key,
        isArtistWallet: wallet.is_artist_wallet,
        createdAt: wallet.created_at,
        exportedAt: wallet.exported_at || undefined
      };
    } catch (error: any) {
      throw new Error(`Failed to get wallet: ${error.message}`);
    }
  }

  /**
   * Transfer SOL to another address
   * @param request - Transfer request with sender Discord ID, recipient, and amount
   * @returns Transfer result with signature
   */
  async transferSOL(request: TransferRequest): Promise<TransferResult> {
    try {
      const { fromDiscordId, toAddress, amount } = request;
      
      // Enhanced security validation
      const securityContext: TransactionSecurityContext = {
        userDiscordId: fromDiscordId,
        recipientAddress: toAddress,
        amount: amount
      };

      const securityCheck = await this.securityService.validateWalletOperation(securityContext);
      if (!securityCheck.isValid) {
        throw new Error(`Security validation failed: ${securityCheck.reason}`);
      }

      // Rate limiting check
      const rateLimitCheck = await this.securityService.checkRateLimit(fromDiscordId, 'SOL_TRANSFER');
      if (!rateLimitCheck.isValid) {
        throw new Error(`Rate limit exceeded: ${rateLimitCheck.reason}`);
      }
      
      // Get sender's wallet and private key
      const senderKeypair = await this.getKeypairForSigning(fromDiscordId);
      
      // Validate recipient address
      let recipientPubkey: PublicKey;
      try {
        recipientPubkey = new PublicKey(toAddress);
      } catch {
        throw new Error('Invalid recipient address');
      }

      // Convert SOL to lamports
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      
      // Check sender balance
      const senderBalance = await this.connection.getBalance(senderKeypair.publicKey);
      const requiredLamports = lamports + 5000; // Include transaction fee
      
      if (senderBalance < requiredLamports) {
        throw new Error(`Insufficient balance. Required: ${requiredLamports / LAMPORTS_PER_SOL} SOL, Available: ${senderBalance / LAMPORTS_PER_SOL} SOL`);
      }

      // Create transfer instruction
      const transferInstruction = SystemProgram.transfer({
        fromPubkey: senderKeypair.publicKey,
        toPubkey: recipientPubkey,
        lamports: lamports
      });

      // Create and send transaction
      const transaction = new Transaction().add(transferInstruction);
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [senderKeypair],
        { commitment: 'confirmed' }
      );

      console.log(`✅ SOL transfer successful: ${amount} SOL from ${senderKeypair.publicKey.toString()} to ${toAddress} | Signature: ${signature}`);

      return {
        signature,
        success: true
      };

    } catch (error: any) {
      console.error('SOL transfer failed:', error);
      return {
        signature: '',
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Transfer SPL tokens to another address
   * @param request - Transfer request with token mint
   * @returns Transfer result with signature
   * Note: Requires @solana/spl-token package installation
   */
  async transferToken(request: TransferRequest): Promise<TransferResult> {
    return {
      signature: '',
      success: false,
      error: 'Token transfers require @solana/spl-token package. Run: npm install @solana/spl-token@^0.4.8'
    };
    
    /* Uncomment after installing @solana/spl-token:
    
    try {
      const { fromDiscordId, toAddress, amount, tokenMint } = request;
      
      if (!tokenMint) {
        throw new Error('Token mint address is required for token transfers');
      }

      // Enhanced security validation
      const securityContext: TransactionSecurityContext = {
        userDiscordId: fromDiscordId,
        recipientAddress: toAddress,
        amount: amount,
        tokenMint: tokenMint
      };

      const securityCheck = await this.securityService.validateWalletOperation(securityContext);
      if (!securityCheck.isValid) {
        throw new Error(`Security validation failed: ${securityCheck.reason}`);
      }

      // Implementation continues...
      // (Full implementation available after package installation)
      
      return {
        signature: '',
        success: false,
        error: 'Install @solana/spl-token to enable token transfers'
      };

    } catch (error: any) {
      console.error('Token transfer failed:', error);
      return {
        signature: '',
        success: false,
        error: error.message
      };
    }
    */
  }

  /**
   * Get a keypair from encrypted private key for signing
   * @param discordId - User's Discord ID
   * @returns Solana Keypair for signing transactions
   */
  async getKeypairForSigning(discordId: string): Promise<Keypair> {
    try {
      const privateKeyString = await this.getPrivateKey(discordId);
      
      // Handle both old and new formats
      try {
        const parsed = JSON.parse(privateKeyString);
        if (Array.isArray(parsed)) {
          // Old format: byte array
          return Keypair.fromSecretKey(new Uint8Array(parsed));
        }
      } catch {
        // New format: base64 string
        return Keypair.fromSecretKey(Buffer.from(privateKeyString, 'base64'));
      }
      
      // Fallback: try as base64
      return Keypair.fromSecretKey(Buffer.from(privateKeyString, 'base64'));
    } catch (error: any) {
      throw new Error(`Failed to get keypair for signing: ${error.message}`);
    }
  }

  /**
   * Validate that a transaction is safe to sign
   * @param transaction - Transaction to validate
   * @param expectedSigner - Expected signer public key
   * @returns true if safe, throws error if not
   */
  private validateTransaction(transaction: Transaction, expectedSigner: PublicKey): boolean {
    // Check that the transaction only contains expected instructions
    for (const instruction of transaction.instructions) {
      // Allow only specific safe program IDs
      const allowedPrograms = [
        SystemProgram.programId.toString(),
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' // SPL Token Program
      ];
      
      if (!allowedPrograms.includes(instruction.programId.toString())) {
        throw new Error(`Unsafe program detected: ${instruction.programId.toString()}`);
      }
    }

    // Ensure the expected signer is included
    const signerKeys = transaction.signatures.map(sig => sig.publicKey?.toString()).filter(Boolean);
    if (!signerKeys.includes(expectedSigner.toString())) {
      throw new Error('Expected signer not found in transaction');
    }

    return true;
  }

  /**
   * Get transaction history for a wallet
   * @param publicKey - Wallet public key
   * @param limit - Number of transactions to fetch
   * @returns Array of transaction signatures
   */
  async getTransactionHistory(publicKey: string, limit: number = 10): Promise<string[]> {
    try {
      const pubKey = new PublicKey(publicKey);
      const signatures = await this.connection.getSignaturesForAddress(pubKey, { limit });
      return signatures.map(sig => sig.signature);
    } catch (error: any) {
      console.error('Error getting transaction history:', error);
      return [];
    }
  }
}

export default WalletService;
