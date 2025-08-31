/**
 * Jupiter API Service for token pricing and metadata
 * https://lite-api.jup.ag/
 */

interface TokenSearchResult {
  id: string;
  name: string;
  symbol: string;
  icon?: string;
  decimals: number;
  usdPrice?: number;
  isVerified?: boolean;
  holderCount?: number;
  organicScore?: number;
  organicScoreLabel?: string;
}

interface TokenPriceData {
  usdPrice: number;
  blockId?: number;
  decimals?: number;
  priceChange24h?: number;
  [key: string]: any;
}

interface TokenMetadata {
  id: string;
  name: string;
  symbol: string;
  icon?: string;
  decimals: number;
  usdPrice?: number;
  isVerified?: boolean;
  holderCount?: number;
  organicScore?: number;
  organicScoreLabel?: string;
}

interface UserToken {
  mint: string;
  amount: number;
}

interface TokenBreakdown {
  mint: string;
  amount: number;
  priceUSD: number;
  valueUSD: number;
  valueSOL: number;
}

interface WithdrawalEligibility {
  canWithdraw: boolean;
  totalValueSOL: number;
  breakdown: TokenBreakdown[];
  requiredSOL?: number;
  shortfallSOL?: number;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  customTtl?: number; // Custom TTL in milliseconds
}

class JupiterApiService {
  private baseUrl: string;
  private cache: Map<string, CacheEntry<any>>;
  private cacheTimeout: number;

  constructor() {
    this.baseUrl = 'https://lite-api.jup.ag';
    this.cache = new Map();
    this.cacheTimeout = 60000; // 1 minute cache
  }

  /**
   * Search for token information by mint address, symbol, or name
   * @param query - Token mint address, symbol, or name
   * @returns Array of token information
   */
  async searchToken(query: string): Promise<TokenSearchResult[]> {
    try {
      const cacheKey = `search_${query}`;
      const cached = this.getCachedData<TokenSearchResult[]>(cacheKey);
      if (cached) return cached;

      const response = await fetch(`${this.baseUrl}/tokens/v2/search?query=${encodeURIComponent(query)}`);
      
      if (!response.ok) {
        throw new Error(`Jupiter API error: ${response.status}`);
      }

      const data: TokenSearchResult[] = await response.json();
      this.setCachedData(cacheKey, data);
      
      return data;
    } catch (error) {
      console.error('Error searching token with Jupiter API:', error);
      return [];
    }
  }

  /**
   * Get token price by mint address
   * @param mintAddress - Token mint address
   * @returns Token price in USD or null
   */
  async getTokenPrice(mintAddress: string): Promise<number | null> {
    try {
      const cacheKey = `price_${mintAddress}`;
      const cached = this.getCachedData<number>(cacheKey);
      if (cached) return cached;

      // Special handling for SOL native token
      if (mintAddress === 'So11111111111111111111111111111111111111112') {
        // Use CoinGecko for SOL price as fallback
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
        if (response.ok) {
          const data = await response.json();
          const solPrice = data.solana?.usd;
          if (solPrice) {
            this.setCachedData(cacheKey, solPrice);
            return solPrice;
          }
        }
        // Fallback fixed price if API fails
        return 150; // Approximate SOL price
      }

      // Use Jupiter Price API for other tokens
      const response = await fetch(`${this.baseUrl}?ids=${encodeURIComponent(mintAddress)}`);
      
      if (!response.ok) {
        console.warn(`Jupiter Price API error for ${mintAddress}: ${response.status}`);
        return null;
      }

      const data: Record<string, { usdPrice: number; blockId: number; decimals: number; priceChange24h?: number }> = await response.json();
      const tokenData = data[mintAddress];
      
      if (tokenData && tokenData.usdPrice) {
        this.setCachedData(cacheKey, tokenData.usdPrice);
        return tokenData.usdPrice;
      }

      return null;
    } catch (error) {
      console.error(`Error getting token price for ${mintAddress}:`, error);
      return null;
    }
  }

  /**
   * Get multiple token prices at once
   * @param mintAddresses - Array of mint addresses
   * @returns Object with mint addresses as keys and prices as values
   */
  async getTokenPrices(mintAddresses: string[]): Promise<Record<string, TokenPriceData>> {
    try {
      if (!mintAddresses || mintAddresses.length === 0) return {};

      // Jupiter v3 API supports max 50 tokens per request
      const batchSize = 50;
      const results: Record<string, TokenPriceData> = {};

      for (let i = 0; i < mintAddresses.length; i += batchSize) {
        const batch = mintAddresses.slice(i, i + batchSize);
        const idsParam = batch.map(addr => encodeURIComponent(addr)).join(',');
        
        const response = await fetch(`${this.baseUrl}?ids=${idsParam}`);
        
        if (!response.ok) {
          console.warn(`Jupiter Price API v3 batch error: ${response.status}`);
          continue;
        }

        // V3 API structure: { [mint]: { usdPrice, blockId, decimals, priceChange24h } }
        const data: Record<string, { usdPrice: number; blockId: number; decimals: number; priceChange24h?: number }> = await response.json();
        
        // Convert v3 format to our TokenPriceData format
        Object.entries(data).forEach(([mint, v3Data]) => {
          if (v3Data && v3Data.usdPrice) {
            const tokenPriceData: TokenPriceData = {
              usdPrice: v3Data.usdPrice,
              blockId: v3Data.blockId,
              decimals: v3Data.decimals,
              priceChange24h: v3Data.priceChange24h
            };
            results[mint] = tokenPriceData;
            this.setCachedData(`price_${mint}`, v3Data.usdPrice, 30);
          }
        });
      }

      return results;
    } catch (error) {
      console.error('Error getting multiple token prices:', error);
      return {};
    }
  }

  /**
   * Get token metadata including name, symbol, decimals
   * @param mintAddress - Token mint address
   * @returns Token metadata or null
   */
  async getTokenMetadata(mintAddress: string): Promise<TokenMetadata | null> {
    try {
      const cacheKey = `metadata_${mintAddress}`;
      const cached = this.getCachedData<TokenMetadata>(cacheKey);
      if (cached) return cached;

      const searchResults = await this.searchToken(mintAddress);
      
      if (searchResults && searchResults.length > 0) {
        const token = searchResults.find(t => t.id === mintAddress) || searchResults[0];
        
        const metadata: TokenMetadata = {
          id: token.id,
          name: token.name,
          symbol: token.symbol,
          icon: token.icon,
          decimals: token.decimals,
          usdPrice: token.usdPrice,
          isVerified: token.isVerified,
          holderCount: token.holderCount,
          organicScore: token.organicScore,
          organicScoreLabel: token.organicScoreLabel
        };
        
        this.setCachedData(cacheKey, metadata);
        return metadata;
      }

      return null;
    } catch (error) {
      console.error(`Error getting token metadata for ${mintAddress}:`, error);
      return null;
    }
  }

  /**
   * Convert token amount to SOL equivalent
   * @param tokenMint - Token mint address
   * @param tokenAmount - Amount of tokens
   * @returns SOL equivalent value
   */
  async convertToSOL(tokenMint: string, tokenAmount: number): Promise<number> {
    try {
      // Get both token price and SOL price
      const [tokenPrice, solPrice] = await Promise.all([
        this.getTokenPrice(tokenMint),
        this.getTokenPrice('So11111111111111111111111111111111111111112') // SOL mint
      ]);

      if (!tokenPrice || !solPrice) {
        console.warn(`Could not get prices for conversion: token=${tokenPrice}, SOL=${solPrice}`);
        return 0;
      }

      const tokenValueUSD = tokenAmount * tokenPrice;
      const solEquivalent = tokenValueUSD / solPrice;

      return solEquivalent;
    } catch (error) {
      console.error('Error converting to SOL:', error);
      return 0;
    }
  }

  /**
   * Check if user has enough value to withdraw (≥1 SOL equivalent)
   * @param userTokens - Array of user's tokens with {mint, amount}
   * @returns Withdrawal eligibility information
   */
  async checkWithdrawalEligibility(userTokens: UserToken[]): Promise<WithdrawalEligibility> {
    try {
      if (!userTokens || userTokens.length === 0) {
        return { canWithdraw: false, totalValueSOL: 0, breakdown: [] };
      }

      // Get all unique mint addresses
      const mints = [...new Set(userTokens.map(t => t.mint))];
      
      // Add SOL mint for conversion
      const allMints = [...mints, 'So11111111111111111111111111111111111111112'];
      
      // Get all prices at once
      const prices = await this.getTokenPrices(allMints);
      const solPrice = prices['So11111111111111111111111111111111111111112']?.usdPrice;

      if (!solPrice) {
        console.warn('Could not get SOL price for withdrawal check');
        return { canWithdraw: false, totalValueSOL: 0, breakdown: [] };
      }

      let totalValueUSD = 0;
      const breakdown: TokenBreakdown[] = [];

      for (const token of userTokens) {
        const tokenData = prices[token.mint];
        const tokenPrice = tokenData?.usdPrice || 0;
        const tokenValueUSD = token.amount * tokenPrice;
        
        totalValueUSD += tokenValueUSD;
        
        breakdown.push({
          mint: token.mint,
          amount: token.amount,
          priceUSD: tokenPrice,
          valueUSD: tokenValueUSD,
          valueSOL: tokenValueUSD / solPrice
        });
      }

      const totalValueSOL = totalValueUSD / solPrice;
      const canWithdraw = totalValueSOL >= 1.0; // Minimum 1 SOL equivalent

      return {
        canWithdraw,
        totalValueSOL,
        breakdown,
        requiredSOL: 1.0,
        shortfallSOL: Math.max(0, 1.0 - totalValueSOL)
      };
    } catch (error) {
      console.error('Error checking withdrawal eligibility:', error);
      return { canWithdraw: false, totalValueSOL: 0, breakdown: [] };
    }
  }

  /**
   * Cache management
   */
  private getCachedData<T>(key: string): T | null {
    const cached = this.cache.get(key) as CacheEntry<T> | undefined;
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  private setCachedData<T>(key: string, data: T, customTtlSeconds?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      customTtl: customTtlSeconds ? customTtlSeconds * 1000 : undefined
    });
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// Export singleton instance
export default new JupiterApiService();
