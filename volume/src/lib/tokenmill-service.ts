import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  Keypair,
} from '@solana/web3.js';
import {
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getMinimumBalanceForRentExemptMint,
  getAssociatedTokenAddress,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
} from '@metaplex-foundation/mpl-token-metadata';
import { RaidTokenMetadata, MintResult } from '@/types/raid';

export interface WalletAdapter {
  publicKey: PublicKey;
  signTransaction: (transaction: any) => Promise<any>;
  signAllTransactions: (transactions: any[]) => Promise<any[]>;
}

/**
 * TokenMill-style service using Metaplex Token Metadata with Privy signing
 * This creates tokens WITH metadata so they show properly in wallets
 */
export class TokenMillService {
  private connection: Connection;
  private useDevnet: boolean;

  constructor() {
    this.useDevnet = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'devnet';

    let rpcEndpoint: string;
    if (this.useDevnet) {
      rpcEndpoint = 'https://api.devnet.solana.com';
    } else {
      rpcEndpoint = process.env.NEXT_PUBLIC_HELIUS_API_KEY
        ? `https://rpc.helius.xyz/?api-key=${process.env.NEXT_PUBLIC_HELIUS_API_KEY}`
        : 'https://api.mainnet-beta.solana.com';
    }

    this.connection = new Connection(rpcEndpoint, 'confirmed');
    console.log('🔗 TokenMill Service initialized:', {
      network: this.useDevnet ? 'devnet' : 'mainnet',
      endpoint: rpcEndpoint.includes('helius') ? 'Helius RPC' : 'Public RPC'
    });
  }

  /**
   * Create raid token with Metaplex Token Metadata
   * This is the TokenMill-style one-call method that includes metadata
   */
  async createRaidToken(
    wallet: WalletAdapter,
    metadata: RaidTokenMetadata
  ): Promise<MintResult> {
    try {
      console.log('🚀 Creating token with Metaplex Token Metadata...', metadata);

      if (!wallet.publicKey) {
        throw new Error('Wallet not connected');
      }

      // Check balance
      const solBalance = await this.checkSolBalance(wallet.publicKey);
      if (!solBalance.hasEnough) {
        throw new Error(`Insufficient SOL balance: ${solBalance.balance.toFixed(4)} SOL`);
      }

      console.log('💎 Creating token with FULL metadata support...');

      // Step 1: Create mint account + metadata in ONE transaction
      const mintKeypair = Keypair.generate();
      const transaction = new Transaction();

      // Create mint account
      const rentExemptAmount = await getMinimumBalanceForRentExemptMint(this.connection);
      transaction.add(
        SystemProgram.createAccount({
          fromPubkey: wallet.publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: MINT_SIZE,
          lamports: rentExemptAmount,
          programId: TOKEN_PROGRAM_ID,
        })
      );

      // Initialize mint
      const decimals = 9; // Standard for SPL tokens
      transaction.add(
        createInitializeMintInstruction(
          mintKeypair.publicKey,
          decimals,
          wallet.publicKey, // mint authority
          wallet.publicKey // freeze authority
        )
      );

      // Create Metaplex metadata account
      const metadataAddress = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          mintKeypair.publicKey.toBuffer(),
        ],
        TOKEN_METADATA_PROGRAM_ID
      )[0];

      const metadataData = {
        name: metadata.name,
        symbol: metadata.symbol,
        uri: metadata.image || '', // URI for off-chain metadata (can be empty for now)
        sellerFeeBasisPoints: 0,
        creators: null,
        collection: null,
        uses: null,
      };

      transaction.add(
        createCreateMetadataAccountV3Instruction(
          {
            metadata: metadataAddress,
            mint: mintKeypair.publicKey,
            mintAuthority: wallet.publicKey,
            payer: wallet.publicKey,
            updateAuthority: wallet.publicKey,
          },
          {
            createMetadataAccountArgsV3: {
              data: metadataData,
              isMutable: true,
              collectionDetails: null,
            },
          }
        )
      );

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;

      // Sign with mint keypair
      transaction.partialSign(mintKeypair);

      console.log('📝 Requesting wallet signature for mint + metadata creation...');
      const signedTransaction = await wallet.signTransaction(transaction);

      console.log('✅ Sending transaction to blockchain...');
      const signature = await this.connection.sendRawTransaction(
        signedTransaction.serialize(),
        {
          skipPreflight: true, // Skip simulation to avoid blockhash expiry issues
          maxRetries: 3,
        }
      );

      console.log('📡 Transaction sent:', signature);
      await this.connection.confirmTransaction(signature, 'confirmed');
      console.log('✅ Mint account + metadata created!');

      // Step 2: Create associated token account and mint initial supply
      console.log('🏗️ Creating token account and minting initial supply...');
      const associatedTokenAddress = await getAssociatedTokenAddress(
        mintKeypair.publicKey,
        wallet.publicKey
      );

      const mintTransaction = new Transaction();

      // Create ATA
      mintTransaction.add(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          associatedTokenAddress,
          wallet.publicKey,
          mintKeypair.publicKey
        )
      );

      // Mint initial supply
      const initialSupply = metadata.supply * Math.pow(10, decimals);
      mintTransaction.add(
        createMintToInstruction(
          mintKeypair.publicKey,
          associatedTokenAddress,
          wallet.publicKey,
          initialSupply
        )
      );

      const { blockhash: blockhash2 } = await this.connection.getLatestBlockhash();
      mintTransaction.recentBlockhash = blockhash2;
      mintTransaction.feePayer = wallet.publicKey;

      console.log('📝 Requesting wallet signature for minting...');
      const signedMintTransaction = await wallet.signTransaction(mintTransaction);

      const mintSignature = await this.connection.sendRawTransaction(
        signedMintTransaction.serialize(),
        {
          skipPreflight: true, // Skip simulation to avoid blockhash expiry issues
          maxRetries: 3,
        }
      );

      console.log('📡 Mint transaction sent:', mintSignature);
      await this.connection.confirmTransaction(mintSignature, 'confirmed');
      console.log('✅ Initial supply minted!');

      console.log('🎉 Token Created with Metadata!', {
        name: metadata.name,
        symbol: metadata.symbol,
        supply: metadata.supply,
        mintAddress: mintKeypair.publicKey.toBase58(),
        tokenAccount: associatedTokenAddress.toBase58(),
        metadataAccount: metadataAddress.toBase58(),
        creator: wallet.publicKey.toBase58(),
        transactions: [signature, mintSignature]
      });

      return {
        mintAddress: mintKeypair.publicKey.toBase58(),
        transactionSignature: mintSignature,
        tokenAccountAddress: associatedTokenAddress.toBase58(),
        success: true
      };

    } catch (error) {
      console.error('❌ Token creation failed:', error);
      return {
        mintAddress: '',
        transactionSignature: '',
        tokenAccountAddress: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Check SOL balance
   */
  async checkSolBalance(walletPublicKey: PublicKey): Promise<{
    hasEnough: boolean;
    balance: number;
    required: number;
    networkFee: number;
  }> {
    try {
      const balance = await this.connection.getBalance(walletPublicKey);
      const balanceSOL = balance / 1e9;
      const requiredSOL = 0.02; // Slightly higher for metadata operations
      const networkFee = 0.005;

      return {
        hasEnough: balanceSOL >= requiredSOL,
        balance: balanceSOL,
        required: requiredSOL,
        networkFee
      };
    } catch (error) {
      console.error('❌ Failed to check SOL balance:', error);
      return {
        hasEnough: false,
        balance: 0,
        required: 0.02,
        networkFee: 0.005
      };
    }
  }
}

// Export singleton instance
export const tokenMillService = new TokenMillService();
