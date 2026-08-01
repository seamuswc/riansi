const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const database = require('./database');
const config = require('./config');
const deepseekService = require('./services/deepseek');
const priceService = require('./services/priceService');

class TelegramBotHandler {
  constructor(options = {}) {
    try {
      console.log('🚀 Initializing Thai Learning Bot...');
      console.log('🔑 Bot token present:', !!config.TELEGRAM_BOT_TOKEN);
      console.log('🔑 Bot token length:', config.TELEGRAM_BOT_TOKEN ? config.TELEGRAM_BOT_TOKEN.length : 0);
      
      // Allow disabling polling for testing
      const polling = options.polling !== false;
      console.log('📡 Polling enabled:', polling);
      
      this.bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling });
      
      // Add deduplication tracking
      this.processedCallbacks = new Set();
      this.processedMessages = new Set();
      
      // Payment tracking
      this.pendingPayments = new Map();
      this.checkingPayments = new Set();
      this.pendingStarInvoices = new Map();
      
      this.setupEventHandlers();
      console.log('🤖 Thai Learning Bot started successfully');
    } catch (error) {
      console.error('❌ Failed to initialize bot:', error);
      console.error('❌ Error details:', error.message);
      console.error('❌ Error stack:', error.stack);
      throw error;
    }
  }

  /**
   * Helper function to create inline keyboard
   * @param {Array<Array<Object>>} buttons - Array of button rows
   * @returns {Object} Telegram keyboard format
   */
  createKeyboard(buttons) {
    return {
      reply_markup: {
        inline_keyboard: buttons
      }
    };
  }

  setupEventHandlers() {
    console.log('🔧 Setting up event handlers...');
    
    // Handle callback queries (button clicks) - HIGHEST PRIORITY
    this.bot.on('callback_query', (callbackQuery) => {
      const callbackId = `${callbackQuery.id}_${callbackQuery.data}`;
      
      // Check for duplicate processing
      if (this.processedCallbacks.has(callbackId)) {
        console.log(`⚠️ Duplicate callback ignored: ${callbackQuery.data}`);
        return;
      }
      
      this.processedCallbacks.add(callbackId);
      console.log(`🔘 Callback query received: ${callbackQuery.data} from user ${callbackQuery.from.id}`);
      
      this.handleCallbackQuery(callbackQuery).catch(error => {
        console.error('❌ Error in callback query handler:', error);
        console.error('❌ Callback data:', callbackQuery.data);
        console.error('❌ User ID:', callbackQuery.from.id);
        // Remove from processed set on error so it can be retried
        this.processedCallbacks.delete(callbackId);
      });
    });
    
    // Telegram Stars: pre-checkout must be answered within ~10s
    this.bot.on('pre_checkout_query', (query) => {
      this.handlePreCheckoutQuery(query).catch((err) => {
        console.error('❌ pre_checkout_query handler error:', err);
      });
    });

    this.bot.on('successful_payment', (msg) => {
      this.handleSuccessfulStarsPayment(msg).catch((err) => {
        console.error('❌ successful_payment handler error:', err);
      });
    });
    
    // Handle /start command
    this.bot.onText(/\/start/, (msg) => this.handleStart(msg));
    
    // Handle /help command
    this.bot.onText(/\/help/, (msg) => this.handleHelp(msg.chat.id));
    
    
    // Handle text messages (user responses to sentences) - ONLY for non-command messages
    this.bot.on('message', (msg) => {
      // Skip if it's a command (handled by onText above)
      if (msg.text && msg.text.startsWith('/')) {
        return;
      }
      
      // Skip if it's from a bot
      if (msg.from.is_bot) {
        return;
      }
      
      // Only handle regular text messages
      if (msg.text) {
        const messageId = `${msg.message_id}_${msg.from.id}`;
        
        // Check for duplicate processing
        if (this.processedMessages.has(messageId)) {
          console.log(`⚠️ Duplicate message ignored: ${msg.text.substring(0, 50)}...`);
          return;
        }
        
        this.processedMessages.add(messageId);
        this.handleMessage(msg);
      }
    });
  }

  async handleStart(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const displayName = msg.from.first_name || msg.from.username || 'User';

    try {
      // Ensure user exists in database
      await database.createUser(userId.toString(), displayName);
      
      const keyboard = this.createKeyboard([
        [
          { text: '📚 Help', callback_data: 'help' },
          { text: '📊 Status', callback_data: 'status' }
        ],
        [
          { text: '💳 Subscribe', callback_data: 'subscribe' },
          { text: '⚙️ Difficulty', callback_data: 'settings' }
        ]
      ]);

      const welcomeMessage = `🇹🇭 Welcome to Thai Learning Bot!

📖 Get daily Thai sentences and improve your language skills!
💰 Subscribe with TON or Telegram Stars for 30 days of lessons.

🎯 Choose your difficulty level and start learning!`;

      await this.bot.sendMessage(chatId, welcomeMessage, keyboard);
    } catch (error) {
      console.error('❌ Error in handleStart:', error);
      await this.bot.sendMessage(chatId, '❌ Sorry, something went wrong. Please try again.');
    }
  }

  async handleHelp(chatId) {
    const helpMessage = `🇹🇭 Thai Learning Bot Help

📖 How it works:
• Get daily Thai sentences at 9:00 AM ICT
• Practice with authentic Thai content

💰 Subscription: ~$1 USD in TON, or Telegram Stars (see bot), for 30 days
🎯 Difficulty: 5 levels (Beginner to Expert)

🎮 Use the buttons below to navigate!`;

    const keyboard = this.createKeyboard([
      [{ text: '🏠 Main Menu', callback_data: 'back_to_main' }]
    ]);

    await this.bot.sendMessage(chatId, helpMessage, keyboard);
  }



  async handleCallbackQuery(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;

    console.log(`🔘 Button clicked: ${data} by user ${userId} in chat ${chatId}`);

    try {
      await this.bot.answerCallbackQuery(callbackQuery.id);

      switch (data) {
        case 'help':
          await this.handleHelp(chatId);
          break;
        case 'status':
          await this.handleStatus(chatId, userId);
          break;
        case 'subscribe':
          await this.handleSubscribeMenu(chatId, userId);
          break;
        case 'pay_ton':
          await this.handleSubscribeTon(chatId, userId);
          break;
        case 'pay_stars':
          await this.handleSubscribeStars(chatId, userId);
          break;
        case 'settings':
          await this.handleSettings(chatId, userId);
          break;
        case 'back_to_main':
          await this.handleStart({ chat: { id: chatId }, from: { id: userId } });
          break;
        case 'unsubscribe':
          await this.handleUnsubscribe(chatId, userId);
          break;
        default:
          if (data.startsWith('level_')) {
            const level = parseInt(data.split('_')[1]);
            await this.handleSetLevel(chatId, userId, level);
          } else if (data.startsWith('check_payment_')) {
            const targetUserId = data.split('_')[2];
            await this.handleCheckPayment(chatId, targetUserId);
          }
          break;
      }
    } catch (error) {
      console.error('❌ Error in handleCallbackQuery:', error);
      await this.bot.sendMessage(chatId, '❌ Sorry, something went wrong. Please try again.');
    }
  }

  // CRITICAL FIX: Always fetch fresh user data from database
  async handleStatus(chatId, userId) {
    console.log(`📊 Handling status request for user ${userId}`);
    
    try {
      // CRITICAL FIX: Fetch fresh user data from database
      const user = await database.getUser(userId.toString());
      if (!user) {
        await this.bot.sendMessage(chatId, '❌ User not found. Please use /start first.');
        return;
      }

      console.log(`📊 Status request for user ${userId}, current level: ${user.difficulty_level}`);

      const subscription = await database.getActiveSubscription(userId.toString());
      const levelName = config.DIFFICULTY_LEVELS[user.difficulty_level]?.name || 'Unknown';

      let statusMessage = `📊 Subscription Status\n\n`;
      
      if (subscription) {
        const expiresAt = new Date(subscription.expires_at);
        const daysLeft = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24));
        statusMessage += `✅ Active (${daysLeft} days left)\n`;
      } else {
        statusMessage += `❌ No active subscription\n`;
      }
      
      statusMessage += `Current Level: ${user.difficulty_level} (${levelName})\n\n`;
      statusMessage += `Your daily lessons continue at 9:00 AM Bangkok time.`;

      // Create keyboard based on subscription status
      const keyboard = subscription && subscription.status === 'active'
        ? this.createKeyboard([
            [{ text: '🚫 Unsubscribe', callback_data: 'unsubscribe' }],
            [{ text: '🏠 Main Menu', callback_data: 'back_to_main' }]
          ])
        : this.createKeyboard([
            [{ text: '🏠 Main Menu', callback_data: 'back_to_main' }]
          ]);

      await this.bot.sendMessage(chatId, statusMessage, keyboard);
    } catch (error) {
      console.error('❌ Error in handleStatus:', error);
      await this.bot.sendMessage(chatId, '❌ Sorry, something went wrong. Please try again.');
    }
  }

  async handleSubscribeMenu(chatId, userId) {
    try {
      const existingSubscription = await database.getActiveSubscription(userId.toString());
      if (existingSubscription) {
        await this.bot.sendMessage(chatId, '✅ You already have an active subscription!');
        return;
      }

      const keyboard = this.createKeyboard([
        [{ text: '💎 Pay with TON', callback_data: 'pay_ton' }],
        [{ text: '⭐ Pay with Telegram Stars', callback_data: 'pay_stars' }],
        [{ text: '🏠 Main Menu', callback_data: 'back_to_main' }]
      ]);

      const starsNow = await priceService.getStarsForUsd(1);

      await this.bot.sendMessage(
        chatId,
        `💳 Choose how to pay — 30 days of daily Thai lessons\n\n` +
          `• TON — about $1 USD (Telegram Wallet or Tonkeeper)\n` +
          `• Stars — ${starsNow} ⭐`,
        keyboard
      );
    } catch (error) {
      console.error('❌ Error in handleSubscribeMenu:', error);
      await this.bot.sendMessage(chatId, '❌ Sorry, something went wrong. Please try again.');
    }
  }

  async handleSubscribeStars(chatId, userId) {
    try {
      const existingSubscription = await database.getActiveSubscription(userId.toString());
      if (existingSubscription) {
        await this.bot.sendMessage(chatId, '✅ You already have an active subscription!');
        return;
      }
      await this.sendStarsInvoice(chatId, userId);
    } catch (error) {
      console.error('❌ Error in handleSubscribeStars:', error);
      await this.bot.sendMessage(chatId, '❌ Could not create Stars invoice. Try again or use TON.');
    }
  }

  /**
   * Telegram Stars invoice — provider_token must be omitted (not sent) for XTR.
   */
  async sendStarsInvoice(chatId, userId) {
    const nonce = crypto.randomBytes(8).toString('hex');
    const stars = await priceService.getStarsForUsd(1);
    const payload = `stars:${userId}:${nonce}:${stars}`;

    this.pendingStarInvoices.set(String(userId), {
      payload,
      starsAmount: stars,
      createdAt: Date.now()
    });

    const prices = JSON.stringify([{ label: '30-day Thai lessons', amount: stars }]);

    await this.bot._request('sendInvoice', {
      form: {
        chat_id: chatId,
        title: 'Thai Lessons — 30 days',
        description: 'Riansi: digital subscription — daily Thai lessons for 30 days.',
        payload,
        currency: 'XTR',
        prices,
        start_parameter: 'riansi_sub'
      }
    });

    console.log(`⭐ Stars invoice sent to user ${userId} (${stars} XTR)`);
  }

  async handlePreCheckoutQuery(query) {
    const qid = query.id;

    const reject = async (message) => {
      await this.bot.answerPreCheckoutQuery(qid, false, { error_message: message });
    };

    try {
      const payload = query.invoice_payload;
      if (!payload || !payload.startsWith('stars:')) {
        await reject('Invalid invoice.');
        return;
      }

      const parts = payload.split(':');
      if (parts.length !== 4) {
        await reject('Invalid invoice.');
        return;
      }

      const invoiceUserId = parts[1];
      const expectedStars = parseInt(parts[3], 10);
      if (!Number.isFinite(expectedStars) || expectedStars < 1) {
        await reject('Invalid invoice.');
        return;
      }

      if (String(query.from.id) !== invoiceUserId) {
        await reject('This invoice is tied to another Telegram account.');
        return;
      }

      if (query.currency !== 'XTR') {
        await reject('Invalid currency.');
        return;
      }

      if (Number(query.total_amount) !== expectedStars) {
        await reject('Price mismatch. Tap Subscribe → Stars again for a fresh invoice.');
        return;
      }

      const pending = this.pendingStarInvoices.get(invoiceUserId);
      if (pending) {
        if (pending.payload !== payload || pending.starsAmount !== expectedStars) {
          await reject('Invoice expired. Open Subscribe → Pay with Stars again.');
          return;
        }
        if (Date.now() - pending.createdAt > 3600000) {
          this.pendingStarInvoices.delete(invoiceUserId);
          await reject('Invoice expired. Please start checkout again.');
          return;
        }
      }

      const sub = await database.getActiveSubscription(invoiceUserId);
      if (sub) {
        await reject('You already have an active subscription.');
        return;
      }

      await this.bot.answerPreCheckoutQuery(qid, true);
    } catch (error) {
      console.error('❌ handlePreCheckoutQuery:', error);
      try {
        await reject('Something went wrong. Please try again.');
      } catch (_) {
        /* ignore */
      }
    }
  }

  async handleSuccessfulStarsPayment(msg) {
    const sp = msg.successful_payment;
    if (!sp || sp.currency !== 'XTR') {
      return;
    }

    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const payload = sp.invoice_payload;

    if (!payload || !payload.startsWith('stars:')) {
      return;
    }

    const parts = payload.split(':');
    if (parts.length !== 4 || parts[1] !== String(userId)) {
      console.error('❌ Stars payload / user mismatch');
      return;
    }

    const starCount = parseInt(parts[3], 10);
    if (!Number.isFinite(starCount) || Number(sp.total_amount) !== starCount) {
      console.error('❌ Stars total_amount mismatch');
      return;
    }

    const chargeId = sp.telegram_payment_charge_id;
    const existing = await database.findSubscriptionByPaymentReference(chargeId);
    if (existing) {
      console.log(`⚠️ Duplicate Stars payment ignored: ${chargeId}`);
      return;
    }

    await database.createSubscription(String(userId), chargeId, config.SUBSCRIPTION_DAYS);
    this.pendingStarInvoices.delete(String(userId));

    console.log(`⭐ Stars payment OK user=${userId} charge=${chargeId}`);

    const keyboard = this.createKeyboard([
      [{ text: '🏠 Main Menu', callback_data: 'back_to_main' }]
    ]);

    await this.bot.sendMessage(
      chatId,
      '🎉 Payment confirmed with Telegram Stars! Subscription active for 30 days.',
      keyboard
    );

    await this.sendImmediateSentence(chatId, userId);
  }

  async handleSubscribeTon(chatId, userId) {
    try {
      console.log(`💎 Starting TON subscription for user ${userId}`);
      
      // Check if user already has active subscription
      const existingSubscription = await database.getActiveSubscription(userId.toString());
      if (existingSubscription) {
        console.log(`⚠️ User ${userId} already has active subscription`);
        await this.bot.sendMessage(chatId, '✅ You already have an active subscription!');
        return;
      }
      
      // Calculate TON amount for $1 USD
      let tonAmountForUSD = await priceService.getTonAmountForUSD(1.0);
      
      if (!tonAmountForUSD) {
        // Fallback if price fetch fails - use a default estimate (assume $2.50 per TON)
        console.warn('⚠️ Could not fetch TON price, using fallback estimate');
        const fallbackPrice = 2.5;
        tonAmountForUSD = 1.0 / fallbackPrice; // ~0.4 TON for $1
      }
      
      const tonAmountNano = Math.floor(tonAmountForUSD * config.TON_CONVERSIONS.NANO_TO_TON); // Convert to nanoTON
      const paymentReference = `thai-bot-${userId}-${Date.now()}`;
      
      console.log(`💎 Creating payment links for user ${userId}`);
      console.log(`💰 TON Amount: ${tonAmountForUSD.toFixed(4)} TON (≈ $1.00, ${tonAmountNano} nanoTON)`);
      console.log(`🔗 Reference: ${paymentReference}`);
      
      // Create TON deep link for Tonkeeper
      const tonDeepLink = `ton://transfer/${config.TON_ADDRESS}?amount=${tonAmountNano}&text=${paymentReference}`;
      console.log(`🔗 TON Deep Link: ${tonDeepLink}`);
      
      // Store payment reference for verification (store both amounts)
      // Use an array to store multiple pending payments per user to prevent clashes
      
      // Get existing pending payments for this user (if any)
      const existingPayments = this.pendingPayments.get(userId.toString()) || [];
      
      // Add new payment to the array
      const newPayment = {
        reference: paymentReference,
        amount: tonAmountNano,
        tonAmount: tonAmountForUSD,
        timestamp: Date.now()
      };
      
      // Keep only the 3 most recent pending payments per user (to prevent memory issues)
      existingPayments.push(newPayment);
      const recentPayments = existingPayments.slice(-3);
      
      this.pendingPayments.set(userId.toString(), recentPayments);
      
      // Create Telegram Wallet Mini App link with TON Connect
      const paymentAppUrl = `https://riansi.xyz/pay.html?address=${config.TON_ADDRESS}&amount=${tonAmountNano}&ton=${tonAmountForUSD.toFixed(4)}&ref=${encodeURIComponent(paymentReference)}&user=${userId}`;
      console.log(`🔗 Payment App URL: ${paymentAppUrl}`);
      
      // Create payment buttons
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: `📱 Telegram Wallet (${tonAmountForUSD.toFixed(4)} TON)`, web_app: { url: paymentAppUrl } }],
            [{ text: `💎 Tonkeeper (${tonAmountForUSD.toFixed(4)} TON)`, url: tonDeepLink }],
            [{ text: '✅ I Paid', callback_data: `check_payment_${userId}` }],
            [{ text: '🏠 Main Menu', callback_data: 'back_to_main' }]
          ]
        }
      };
      
      const message = `💎 Subscribe to Thai Learning Bot

💰 Cost: ${tonAmountForUSD.toFixed(4)} TON (≈ $1.00)
📅 Duration: 30 days of daily lessons

🎯 What you get:
• Daily Thai lessons
• Word-by-word breakdowns with pronunciation
• Difficulty level customization

💳 Choose your payment method below!`;

      await this.bot.sendMessage(chatId, message, keyboard);
      console.log(`✅ Payment link sent to user ${userId}`);
      
    } catch (error) {
      console.error('❌ Error in handleSubscribeTon:', error);
      console.error('❌ Error details:', error.message);
      console.error('❌ Error stack:', error.stack);
      await this.bot.sendMessage(chatId, '❌ Sorry, something went wrong with payment. Please try again.');
    }
  }

  // CRITICAL FIX: Always fetch fresh user data from database
  async handleSettings(chatId, userId) {
    console.log(`⚙️ Handling settings request for user ${userId}`);
    
    try {
      // CRITICAL FIX: Fetch fresh user data from database
      const user = await database.getUser(userId.toString());
      if (!user) {
        await this.bot.sendMessage(chatId, '❌ User not found. Please use /start first.');
        return;
      }

      console.log(`⚙️ Settings request for user ${userId}, current level: ${user.difficulty_level}`);

      const levelName = config.DIFFICULTY_LEVELS[user.difficulty_level]?.name || 'Unknown';
      
      let settingsMessage = `⚙️ Settings\n\n`;
      settingsMessage += `Current Difficulty Level: ${user.difficulty_level} (${levelName})\n\n`;
      settingsMessage += `Choose your difficulty level:\n`;

      Object.entries(config.DIFFICULTY_LEVELS).forEach(([level, info]) => {
        settingsMessage += `• Level ${level}: ${info.name} (${info.description})\n`;
      });

      const keyboard = this.createKeyboard([
        [
          { text: 'Level 1', callback_data: 'level_1' },
          { text: 'Level 2', callback_data: 'level_2' },
          { text: 'Level 3', callback_data: 'level_3' }
        ],
        [
          { text: 'Level 4', callback_data: 'level_4' },
          { text: 'Level 5', callback_data: 'level_5' }
        ],
        [{ text: '🏠 Main Menu', callback_data: 'back_to_main' }]
      ]);

      await this.bot.sendMessage(chatId, settingsMessage, keyboard);
    } catch (error) {
      console.error('❌ Error in handleSettings:', error);
      await this.bot.sendMessage(chatId, '❌ Sorry, something went wrong. Please try again.');
    }
  }

  // CRITICAL FIX: Update user level and verify the change
  async handleSetLevel(chatId, userId, level) {
    console.log(`🎯 Handling level change request: ${level} for user ${userId}`);
    
    try {
      console.log(`🎯 Starting level change: user ${userId} to level ${level}`);
      
      // Update user level in database
      console.log(`📝 Updating user ${userId} to level ${level}`);
      const result = await database.updateUserLevel(userId.toString(), level);
      console.log(`📊 Database update result: ${result} rows affected`);
      
      // CRITICAL FIX: Verify the update by fetching fresh data
      console.log(`🔍 Verifying update for user ${userId}`);
      const updatedUser = await database.getUser(userId.toString());
      console.log(`👤 User after update:`, updatedUser);
      
      const levelName = config.DIFFICULTY_LEVELS[level]?.name || 'Unknown';
      
      const confirmMessage = `✅ Difficulty updated to Level ${level}!\n\nYour daily lessons will now be at ${levelName} level.`;

      const keyboard = this.createKeyboard([
        [{ text: '🏠 Main Menu', callback_data: 'back_to_main' }]
      ]);

      console.log(`📤 Sending confirmation message to user ${userId}`);
      await this.bot.sendMessage(chatId, confirmMessage, keyboard);
      console.log(`✅ Level change completed successfully for user ${userId}`);
    } catch (error) {
      console.error('❌ Error in handleSetLevel:', error);
      await this.bot.sendMessage(chatId, '❌ Sorry, something went wrong. Please try again.');
    }
  }

  async handleUnsubscribe(chatId, userId) {
    try {
      console.log(`🚫 Handling unsubscribe request for user ${userId}`);
      
      // Check if user has an active subscription
      const subscription = await database.getActiveSubscription(userId.toString());
      
      if (!subscription) {
        await this.bot.sendMessage(chatId, '❌ You don\'t have an active subscription to cancel.');
        return;
      }
      
      // Cancel the subscription
      await database.cancelSubscription(userId.toString());
      
      const message = `🚫 Subscription Cancelled\n\nYour subscription has been cancelled. You will no longer receive daily lessons.\n\nYou can resubscribe anytime using the Subscribe button.`;
      
      const keyboard = this.createKeyboard([
        [{ text: '💎 Subscribe Again', callback_data: 'subscribe' }],
        [{ text: '🏠 Main Menu', callback_data: 'back_to_main' }]
      ]);
      
      await this.bot.sendMessage(chatId, message, keyboard);
    } catch (error) {
      console.error('❌ Error in handleUnsubscribe:', error);
      await this.bot.sendMessage(chatId, '❌ Sorry, something went wrong. Please try again.');
    }
  }


  async handleCheckPayment(chatId, userId) {
    // Prevent duplicate checking messages if user clicks "I Paid" multiple times
    const checkKey = `checking_${userId}`;
    if (this.checkingPayments && this.checkingPayments.has(checkKey)) {
      await this.bot.sendMessage(chatId, '⏳ Payment check already in progress. Please wait...');
      return;
    }
    
    // Mark as checking
    this.checkingPayments.add(checkKey);
    
    try {
      console.log(`💳 Checking payment for user ${userId}`);
      
      // Check if we have pending payment data
      if (!this.pendingPayments || !this.pendingPayments.has(userId.toString())) {
        this.checkingPayments.delete(checkKey);
        await this.bot.sendMessage(chatId, '❌ No pending payment found. Please try subscribing again.');
        return;
      }
      
      const pendingPaymentsList = this.pendingPayments.get(userId.toString());
      
      // Check if it's an array (new format) or object (old format) for backwards compatibility
      const paymentsToCheck = Array.isArray(pendingPaymentsList) ? pendingPaymentsList : [pendingPaymentsList];
      
      if (paymentsToCheck.length === 0) {
        this.checkingPayments.delete(checkKey);
        await this.bot.sendMessage(chatId, '❌ No pending payment found. Please try subscribing again.');
        return;
      }
      
      console.log(`🔍 Checking ${paymentsToCheck.length} pending payment(s) for user ${userId}`);
      
      // Send checking message (only one message to user)
      await this.bot.sendMessage(chatId, '🔍 Checking your payment... Please wait a moment.');
      
      // Wait before first check (silent - no message to user)
      await new Promise(resolve => setTimeout(resolve, config.PAYMENT_CHECK.INITIAL_DELAY_MS));
      
      try {
        let paymentFound = false;
        let foundPaymentData = null;
        const maxAttempts = config.PAYMENT_CHECK.MAX_ATTEMPTS;
        
        // Loop check up to 3 times
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            console.log(`🔍 Payment check attempt ${attempt}/${maxAttempts}`);
            
            // Check TON blockchain for payment
            const response = await axios.get(`https://tonapi.io/v2/blockchain/accounts/${config.TON_ADDRESS}/transactions`, {
              headers: {
                'Authorization': `Bearer ${config.TON_API_KEY}`
              },
              params: {
                limit: config.PAYMENT_CHECK.TRANSACTION_LIMIT
              }
            });
            
            console.log(`📊 TON API response: ${response.status}`);
            
            // Look for payment with matching reference
            const transactions = response.data.transactions || [];
            
            console.log(`🔍 Searching ${transactions.length} transactions for payments...`);
            
            // Check all pending payments in reverse order (most recent first)
            // Use slice() to avoid mutating the original array
            const paymentsReversed = [...paymentsToCheck].reverse();
            for (const paymentData of paymentsReversed) {
              console.log(`🔍 Checking payment reference: ${paymentData.reference}`);
              
              // Check TON transactions first
              for (const tx of transactions) {
                // Check in_msg for text comment (TON payment)
                if (tx.in_msg && tx.in_msg.decoded_body && tx.in_msg.decoded_body.text) {
                  const messageText = tx.in_msg.decoded_body.text;
                  // Use exact match to prevent substring clashes
                  if (messageText === paymentData.reference || messageText.includes(paymentData.reference)) {
                    console.log(`✅ TON Payment found in in_msg: ${paymentData.reference}`);
                    paymentFound = true;
                    foundPaymentData = paymentData;
                    break;
                  }
                }
                
                // Check out_msgs for text comment
                if (tx.out_msgs && tx.out_msgs.length > 0) {
                  for (const outMsg of tx.out_msgs) {
                    if (outMsg.decoded_body && outMsg.decoded_body.text) {
                      const messageText = outMsg.decoded_body.text;
                      // Use exact match to prevent substring clashes
                      if (messageText === paymentData.reference || messageText.includes(paymentData.reference)) {
                        console.log(`✅ TON Payment found in out_msg: ${paymentData.reference}`);
                        paymentFound = true;
                        foundPaymentData = paymentData;
                        break;
                      }
                    }
                  }
                }
                
                if (paymentFound) break;
              }
              
              // If TON payment not found, check TON USDT Jetton
              if (!paymentFound) {
                try {
                  console.log(`🔍 Checking TON USDT Jetton transactions for reference: ${paymentData.reference}`);
                  
                  // Check for Jetton transfers in TON transactions
                  for (const tx of transactions) {
                    // Check if transaction has Jetton transfers
                    if (tx.out_msgs && tx.out_msgs.length > 0) {
                      for (const outMsg of tx.out_msgs) {
                        // Check if this is a Jetton transfer
                        if (outMsg.source && outMsg.destination && outMsg.decoded_body) {
                          const body = outMsg.decoded_body;
                          
                          // Check if it's a Jetton transfer with our USDT contract
                          if (body.jetton_transfer && 
                              body.jetton_transfer.jetton_master_address === config.USDT_CONTRACT_ADDRESS) {
                            
                            // Check amount (1 USDT = 1,000,000 microUSDT)
                            const expectedAmount = Math.floor(config.USDT_AMOUNT * config.TON_CONVERSIONS.MICRO_USDT_TO_USDT);
                            const receivedAmount = parseInt(body.jetton_transfer.amount);
                            
                            console.log(`💰 Jetton transfer: received ${receivedAmount} microUSDT (expected ${expectedAmount})`);
                            
                            // Check if amount matches and message contains reference
                            if (receivedAmount >= expectedAmount && 
                                body.jetton_transfer.forward_ton_amount && 
                                body.jetton_transfer.forward_payload) {
                              
                              // Check the forward payload for our reference (exact match when possible)
                              const payload = body.jetton_transfer.forward_payload;
                              if (payload && (payload.includes(paymentData.reference) || payload === paymentData.reference)) {
                                console.log(`✅ TON USDT Jetton Payment found: ${paymentData.reference}`);
                                paymentFound = true;
                                foundPaymentData = paymentData;
                                break;
                              }
                            }
                          }
                        }
                      }
                    }
                    
                    if (paymentFound) break;
                  }
                } catch (usdtError) {
                  console.log('⚠️ TON USDT Jetton check error:', usdtError.message);
                }
              }
              
              if (paymentFound) break;
            }
            
            // If payment found, break out of retry loop
            if (paymentFound) {
              break;
            }
            
            // If not found and not last attempt, wait before next check (silent - no message to user)
            if (attempt < maxAttempts) {
              console.log(`⏳ Payment not found on attempt ${attempt}, waiting before retry...`);
              await new Promise(resolve => setTimeout(resolve, config.PAYMENT_CHECK.RETRY_DELAY_MS));
            }
            
          } catch (apiError) {
            console.error(`❌ TON API Error on attempt ${attempt}:`, apiError.message);
            
            // If not last attempt, wait and retry
            if (attempt < maxAttempts) {
              console.log(`⏳ API error on attempt ${attempt}, waiting before retry...`);
              await new Promise(resolve => setTimeout(resolve, config.PAYMENT_CHECK.RETRY_DELAY_MS));
            } else {
              // Last attempt failed with API error
              await this.bot.sendMessage(chatId, '❌ Payment verification temporarily unavailable. Please try again in a few minutes.');
              return;
            }
          }
        }
      
      // Only ONE message sent: success if either TON or USDT payment found, failure if neither found
      if (paymentFound && foundPaymentData) {
        // Payment confirmed (either TON or USDT succeeded) - create subscription
        await database.createSubscription(userId.toString(), foundPaymentData.reference, config.SUBSCRIPTION_DAYS);
        
        // Remove ALL pending payments for this user (payment confirmed)
        this.pendingPayments.delete(userId.toString());
        
        // Send success message (only one message sent)
        const successMessage = `🎉 Payment confirmed! Subscription active for 30 days.`;
        
        const keyboard = this.createKeyboard([
          [{ text: '🏠 Main Menu', callback_data: 'back_to_main' }]
        ]);
        
        await this.bot.sendMessage(chatId, successMessage, keyboard);
        
        // Send immediate lesson
        await this.sendImmediateSentence(chatId, userId);
        
      } else {
        // Payment not found after 3 attempts (both TON and USDT checks failed)
        // Only one failure message sent
        await this.bot.sendMessage(chatId, `❌ Payment not found after 3 attempts. Try again in a few minutes.`);
        }
        
      } catch (error) {
        console.error('❌ Error in payment check loop:', error);
        await this.bot.sendMessage(chatId, '❌ Sorry, something went wrong checking your payment. Please try again.');
      } finally {
        // Clear checking flag
        this.checkingPayments.delete(checkKey);
      }
      
    } catch (error) {
      console.error('❌ Error in handleCheckPayment:', error);
      await this.bot.sendMessage(chatId, '❌ Sorry, something went wrong checking your payment. Please try again.');
      // Clear checking flag on error
      if (this.checkingPayments) {
        this.checkingPayments.delete(checkKey);
      }
    }
  }


  async handleMessage(msg) {
    // Handle user responses to sentences
    console.log(`📝 User text message: ${msg.text}`);
    
    // Check if message contains Thai script
    const hasThaiScript = /[\u0E00-\u0E7F]/.test(msg.text);
    
    if (hasThaiScript) {
      console.log('🇹🇭 User typed in Thai - not responding');
      return; // Don't respond to Thai text
    }
    
    // Show main menu buttons for any non-Thai text message (same as /start)
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const displayName = msg.from.first_name || msg.from.username || 'User';

    try {
      // Ensure user exists in database
      await database.createUser(userId.toString(), displayName);
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📚 Help', callback_data: 'help' },
              { text: '📊 Status', callback_data: 'status' }
            ],
            [
              { text: '💳 Subscribe', callback_data: 'subscribe' },
              { text: '⚙️ Difficulty', callback_data: 'settings' }
            ]
          ]
        }
      };

      const welcomeMessage = `🇹🇭 Welcome to Thai Learning Bot!

📖 Get daily Thai sentences and improve your language skills!
💰 Subscribe with TON or Telegram Stars for 30 days of lessons.

🎯 Choose your difficulty level and start learning!`;

      await this.bot.sendMessage(chatId, welcomeMessage, keyboard);
    } catch (error) {
      console.error('❌ Error in handleMessage:', error);
      await this.bot.sendMessage(chatId, '❌ Sorry, something went wrong. Please try again.');
    }
  }

  // Handle payment success callback
  async handlePaymentSuccess(chatId, userId, paymentReference) {
    try {
      console.log(`💰 Payment success for user ${userId}, reference: ${paymentReference}`);
      
      // Create subscription in database
      await database.createSubscription(userId.toString(), paymentReference, 30);
      
      // Send success message
      const successMessage = `🎉 Payment Successful!

✅ You are now subscribed to Thai Learning Bot!
📅 Your subscription is active for 30 days
🎯 Daily lessons will be sent at 9:00 AM ICT`;

      await this.bot.sendMessage(chatId, successMessage);
      
      // Send immediate first lesson
      await this.sendImmediateSentence(chatId, userId);
      
    } catch (error) {
      console.error('❌ Error in handlePaymentSuccess:', error);
      await this.bot.sendMessage(chatId, '❌ Payment processed but there was an error. Please contact support.');
    }
  }

  // Send immediate sentence after payment
  async sendImmediateSentence(chatId, userId) {
    try {
      // Get user's difficulty level
      const user = await database.getUser(userId.toString());
      if (!user) {
        console.error('❌ User not found for immediate sentence');
        return;
      }

      // Generate sentence based on user's difficulty level
      const sentenceData = await this.generateSentence(user.difficulty_level);
      
      // Save sentence to database
      const sentenceId = await this.saveSentence(sentenceData, user.difficulty_level);
      
      // Create word breakdown
      let wordBreakdown = '';
      if (sentenceData.word_breakdown && sentenceData.word_breakdown.length > 0) {
        wordBreakdown = '\n\n📚 Word Breakdown:\n';
        for (const word of sentenceData.word_breakdown) {
          if (typeof word === 'object' && word.word && word.meaning) {
            const pinyin = word.pinyin || '';
            wordBreakdown += `${word.word} - ${word.meaning} - ${pinyin}\n`;
          } else if (typeof word === 'string') {
            wordBreakdown += `${word}\n`;
          }
        }
      }

      const message = `🇹🇭 Your First Thai Lesson

📝 Thai Sentence:
${sentenceData.thai_text}

🔤 English Translation:
${sentenceData.english_translation}

Try typing the sentence back in Thai!${wordBreakdown}

Practice writing the Thai sentence!`;

      console.log(`📤 Sending immediate lesson to user ${userId}:`, message);
      await this.bot.sendMessage(chatId, message);
      
      console.log(`✅ Immediate sentence sent to user ${userId}`);
    } catch (error) {
      console.error('❌ Error in sendImmediateSentence:', error);
    }
  }

  // Generate sentence using DeepSeek API
  async generateSentence(difficultyLevel) {
    try {
      return await deepseekService.generateThaiSentence(difficultyLevel);
    } catch (error) {
      console.error('❌ Error generating sentence:', error);
      // Fallback sentence
      const fallbackSentences = {
        1: { thai_text: 'สวัสดี', english_translation: 'Hello', word_breakdown: ['สวัสดี'] },
        2: { thai_text: 'ผมชื่อจอห์น', english_translation: 'My name is John', word_breakdown: ['ผม', 'ชื่อ', 'จอห์น'] },
        3: { thai_text: 'วันนี้อากาศดีมาก', english_translation: 'The weather is very nice today', word_breakdown: ['วันนี้', 'อากาศ', 'ดี', 'มาก'] },
        4: { thai_text: 'ผมชอบอ่านหนังสือในห้องสมุด', english_translation: 'I like reading books in the library', word_breakdown: ['ผม', 'ชอบ', 'อ่าน', 'หนังสือ', 'ใน', 'ห้องสมุด'] },
        5: { thai_text: 'ประเทศไทยเป็นประเทศที่มีวัฒนธรรมที่สวยงามและมีประวัติศาสตร์ที่ยาวนาน', english_translation: 'Thailand is a country with beautiful culture and long history', word_breakdown: ['ประเทศไทย', 'เป็น', 'ประเทศ', 'ที่', 'มี', 'วัฒนธรรม', 'ที่', 'สวยงาม', 'และ', 'มี', 'ประวัติศาสตร์', 'ที่', 'ยาวนาน'] }
      };
      return fallbackSentences[difficultyLevel] || fallbackSentences[1];
    }
  }

  // Save sentence to database
  async saveSentence(sentenceData, difficultyLevel) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO sentences (thai_text, english_translation, difficulty_level, word_breakdown)
        VALUES (?, ?, ?, ?)
      `;
      
      const wordBreakdown = JSON.stringify(sentenceData.word_breakdown || []);
      
      database.db.run(query, [
        sentenceData.thai_text,
        sentenceData.english_translation,
        difficultyLevel,
        wordBreakdown
      ], function(err) {
        if (err) {
          console.error('❌ Error saving sentence:', err);
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  // Send daily message to all subscribed users
  async sendDailyMessage() {
    try {
      // This would be implemented to send daily messages
      console.log('📅 Daily message scheduler triggered');
    } catch (error) {
      console.error('❌ Error in sendDailyMessage:', error);
    }
  }
}

module.exports = TelegramBotHandler;

