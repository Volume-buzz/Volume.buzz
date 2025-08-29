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

      const response = await fetch(`${this.baseUrl}/price/v3?ids=${encodeURIComponent(mintAddress)}`);
      
      if (!response.ok) {
        throw new Error(`Jupiter Price API error: ${response.status}`);
      }

      const data: Record<string, TokenPriceData> = await response.json();
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

      const response = await fetch(`${this.baseUrl}/price/v3?ids=${mintAddresses.join(',')}`);
      
      if (!response.ok) {
        throw new Error(`Jupiter Price API error: ${response.status}`);
      }

      const data: Record<string, TokenPriceData> = await response.json();
      
      // Cache individual prices
      Object.entries(data).forEach(([mint, priceData]) => {
        if (priceData && priceData.usdPrice) {
          this.setCachedData(`price_${mint}`, priceData.usdPrice);
        }
      });

      return data;
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

  private setCachedData<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// Export singleton instance
export default new JupiterApiService();
