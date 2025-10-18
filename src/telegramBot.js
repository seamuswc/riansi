const TelegramBot = require('node-telegram-bot-api');
const database = require('./database');
const config = require('./config');
const deepseekService = require('./services/deepseek');

class TelegramBotHandler {
  constructor() {
    this.bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });
    this.setupEventHandlers();
    console.log('🤖 Thai Learning Bot started');
  }

  setupEventHandlers() {
    // Handle callback queries (button clicks) - HIGHEST PRIORITY
    this.bot.on('callback_query', (callbackQuery) => this.handleCallbackQuery(callbackQuery));
    
    // Handle successful payments
    this.bot.on('pre_checkout_query', (preCheckoutQuery) => this.handlePreCheckoutQuery(preCheckoutQuery));
    this.bot.on('successful_payment', (msg) => this.handleSuccessfulPayment(msg));
    
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
💰 Subscribe with TON cryptocurrency for 30 days of lessons.

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
• Reply with your translation
• Get graded feedback instantly

💰 Subscription: 1 TON for 30 days
🎯 Difficulty: 5 levels (Beginner to Expert)

🎮 Use the buttons below to navigate!`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🏠 Main Menu', callback_data: 'back_to_main' }]
        ]
      }
    };

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
          await this.handleSubscribe(chatId, userId);
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
      statusMessage += `Your daily lessons continue at 9:00 AM ICT.`;

      // Create keyboard based on subscription status
      let keyboard;
      if (subscription && subscription.status === 'active') {
        keyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚫 Unsubscribe', callback_data: 'unsubscribe' }],
              [{ text: '🏠 Main Menu', callback_data: 'back_to_main' }]
            ]
          }
        };
      } else {
        keyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🏠 Main Menu', callback_data: 'back_to_main' }]
            ]
          }
        };
      }

      await this.bot.sendMessage(chatId, statusMessage, keyboard);
    } catch (error) {
      console.error('❌ Error in handleStatus:', error);
      await this.bot.sendMessage(chatId, '❌ Sorry, something went wrong. Please try again.');
    }
  }

  async handleSubscribe(chatId, userId) {
    try {
      const tonAmount = Math.floor(config.TON_AMOUNT * 1000000000); // Convert to nanoTON
      const paymentReference = `thai-bot-${userId}-${Date.now()}`;
      
      console.log(`💎 Creating Telegram invoice for user ${userId}`);
      
      // Create Telegram invoice using Payments API
      const invoice = {
        title: "Thai Learning Bot Subscription",
        description: "30 days of daily Thai lessons with AI-generated content",
        payload: paymentReference,
        provider_token: "TON", // TON payment provider
        currency: "TON",
        prices: [
          { label: "Subscription", amount: tonAmount }
        ],
        start_parameter: paymentReference
      };

      await this.bot.sendInvoice(chatId, invoice);
      
      console.log(`✅ Invoice sent to user ${userId}`);
    } catch (error) {
      console.error('❌ Error in handleSubscribe:', error);
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

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
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
          ]
        }
      };

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

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏠 Main Menu', callback_data: 'back_to_main' }]
          ]
        }
      };

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
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💎 Subscribe Again', callback_data: 'subscribe' }],
            [{ text: '🏠 Main Menu', callback_data: 'back_to_main' }]
          ]
        }
      };
      
      await this.bot.sendMessage(chatId, message, keyboard);
    } catch (error) {
      console.error('❌ Error in handleUnsubscribe:', error);
      await this.bot.sendMessage(chatId, '❌ Sorry, something went wrong. Please try again.');
    }
  }

  // Handle pre-checkout query (before payment)
  async handlePreCheckoutQuery(preCheckoutQuery) {
    try {
      console.log('💳 Pre-checkout query received:', preCheckoutQuery);
      
      // Always approve the payment
      await this.bot.answerPreCheckoutQuery(preCheckoutQuery.id, true);
      
      console.log('✅ Pre-checkout query approved');
    } catch (error) {
      console.error('❌ Error in handlePreCheckoutQuery:', error);
      await this.bot.answerPreCheckoutQuery(preCheckoutQuery.id, false, 'Payment verification failed');
    }
  }

  // Handle successful payment
  async handleSuccessfulPayment(msg) {
    try {
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const payment = msg.successful_payment;
      
      console.log('💰 Successful payment received:', payment);
      
      // Extract payment reference from payload
      const paymentReference = payment.invoice_payload;
      
      // Process the payment success
      await this.handlePaymentSuccess(chatId, userId, paymentReference);
      
    } catch (error) {
      console.error('❌ Error in handleSuccessfulPayment:', error);
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
💰 Subscribe with TON cryptocurrency for 30 days of lessons.

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
🎯 Daily lessons will be sent at 9:00 AM ICT

Here's your first lesson:`;

      await this.bot.sendMessage(chatId, successMessage);
      
      // Send immediate sentence
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
        wordBreakdown = '\n\n📚 **Word Breakdown:**\n';
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

📝 **Thai Sentence:**
${sentenceData.thai_text}

🎯 **Your task:** Try typing the sentence back in Thai!${wordBreakdown}

Practice writing the Thai sentence!`;

      await this.bot.sendMessage(chatId, message);
      
      console.log(`✅ Immediate sentence sent to user ${userId}`);
    } catch (error) {
      console.error('❌ Error in sendImmediateSentence:', error);
    }
  }

  // Generate sentence using DeepSeek API
  async generateSentence(difficultyLevel) {
    try {
      const deepseekService = require('./services/deepseek');
      return await deepseekService.generateThaiSentence(difficultyLevel);
    } catch (error) {
      console.error('❌ Error generating sentence:', error);
      // Fallback sentence
      const fallbackSentences = {
        1: { thai_text: 'สวัสดี', english_translation: 'Hello', word_breakdown: ['สวัสดี'] },
        2: { thai_text: 'ฉันชื่อจอห์น', english_translation: 'My name is John', word_breakdown: ['ฉัน', 'ชื่อ', 'จอห์น'] },
        3: { thai_text: 'วันนี้อากาศดีมาก', english_translation: 'The weather is very nice today', word_breakdown: ['วันนี้', 'อากาศ', 'ดี', 'มาก'] },
        4: { thai_text: 'ฉันชอบอ่านหนังสือในห้องสมุด', english_translation: 'I like reading books in the library', word_breakdown: ['ฉัน', 'ชอบ', 'อ่าน', 'หนังสือ', 'ใน', 'ห้องสมุด'] },
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
