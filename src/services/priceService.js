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
   * Calculate TON amount needed for $1 USD
   * @param {number} usdAmount - USD amount (defaults to 1.0)
   * @returns {Promise<number>} TON amount needed
   */
  async getTonAmountForUSD(usdAmount = 1.0) {
    const price = await this.getTonPriceUSD();
    
    if (!price) {
      return null; // Couldn't fetch price
    }

    // Calculate: if 1 TON = $X, then $1 = 1/X TON
    const tonAmount = usdAmount / price;
    return tonAmount;
  }

  /**
   * Telegram Stars (XTR) count for a USD list price, aligned with TON-based ~$1 subscribe.
   * Uses TON/USD from CoinGecko and STARS_PER_TON_HEURISTIC (Stars ≈ value of 1 TON in-app).
   * Uses config SUBSCRIPTION_STARS_FIXED (default 60; override with env SUBSCRIPTION_STARS).
   * @param {number} usdAmount
   * @returns {Promise<number>}
   */
  async getStarsForUsd(usdAmount = 1) {
    const config = require('../config');
    if (config.SUBSCRIPTION_STARS_FIXED != null) {
      return config.SUBSCRIPTION_STARS_FIXED;
    }

    const tonUsd = await this.getTonPriceUSD();
    const starsPerTon = config.STARS_PER_TON_HEURISTIC;
    const tonPrice = tonUsd || config.SUBSCRIPTION_STARS_TON_FALLBACK_USD;
    if (!tonUsd) {
      console.warn('⚠️ Stars pricing: using TON USD fallback for ~$1 Star count');
    }

    const tonsNeeded = usdAmount / tonPrice;
    return Math.max(1, Math.round(tonsNeeded * starsPerTon));
  }

  /**
   * Format price message with real-time USD conversion
   * @param {number} tonAmount - Amount in TON
   * @param {number} usdtAmount - Amount in USDT (defaults to 1.0)
   * @returns {Promise<string>} Formatted message
   */
  async formatPriceMessage(tonAmount, usdtAmount = 1.0) {
    // Both are $1 USD equivalent
    return `💰 Cost: ${tonAmount.toFixed(4)} TON (≈ $1.00) or ${usdtAmount} USDT`;
  }
}

// Export singleton instance
module.exports = new PriceService();

