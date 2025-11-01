const axios = require('axios');

/**
 * Price Service - Fetches real-time cryptocurrency prices
 * Uses CoinGecko API (free, no API key required)
 * Prices are cached for 1 hour to respect free tier rate limits
 */
class PriceService {
  constructor() {
    this.cache = {
      price: null,
      timestamp: 0,
      cacheDuration: 3600000 // Cache for 1 hour (3600000ms) to respect free tier limits
    };
  }

  /**
   * Get TON price in USD from CoinGecko
   * @returns {Promise<number>} Price in USD
   */
  async getTonPriceUSD() {
    try {
      // Check cache first
      const now = Date.now();
      if (this.cache.price && (now - this.cache.timestamp) < this.cache.cacheDuration) {
        console.log(`📊 Using cached TON price: $${this.cache.price}`);
        return this.cache.price;
      }

      // Fetch from CoinGecko
      // TON coin ID in CoinGecko is "the-open-network"
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: {
          ids: 'the-open-network',
          vs_currencies: 'usd'
        },
        timeout: 5000 // 5 second timeout
      });

      const price = response.data['the-open-network']?.usd;
      
      if (!price) {
        console.warn('⚠️ Could not fetch TON price from CoinGecko');
        return null;
      }

      // Update cache
      this.cache.price = price;
      this.cache.timestamp = now;

      console.log(`📊 Fetched TON price: $${price.toFixed(2)}`);
      return price;

    } catch (error) {
      console.error('❌ Error fetching TON price:', error.message);
      // Return cached price if available, even if expired
      if (this.cache.price) {
        console.log(`📊 Using expired cached TON price: $${this.cache.price}`);
        return this.cache.price;
      }
      return null;
    }
  }

  /**
   * Calculate USD value for a given TON amount
   * @param {number} tonAmount - Amount in TON
   * @returns {Promise<string>} Formatted USD value string (e.g., "$2.50")
   */
  async getTonValueUSD(tonAmount) {
    const price = await this.getTonPriceUSD();
    
    if (!price) {
      return null; // Couldn't fetch price
    }

    const usdValue = tonAmount * price;
    return `≈ $${usdValue.toFixed(2)}`;
  }

  /**
   * Format price message with real-time USD conversion
   * @param {number} tonAmount - Amount in TON
   * @param {number} usdtAmount - Amount in USDT (defaults to 1.0)
   * @returns {Promise<string>} Formatted message
   */
  async formatPriceMessage(tonAmount, usdtAmount = 1.0) {
    const tonUSD = await this.getTonValueUSD(tonAmount);
    
    if (tonUSD) {
      return `💰 Cost: ${tonAmount} TON (${tonUSD}) or ${usdtAmount} USDT (≈ $${usdtAmount.toFixed(2)})`;
    } else {
      // Fallback if price fetch fails
      return `💰 Cost: ${tonAmount} TON or ${usdtAmount} USDT (≈ $${usdtAmount.toFixed(2)})`;
    }
  }
}

// Export singleton instance
module.exports = new PriceService();

