const express = require('express');
const TelegramBotHandler = require('./telegramBot');
const Scheduler = require('./scheduler');
const config = require('./config');

class ThaiLearningBot {
  constructor() {
    this.app = express();
    this.telegramBot = new TelegramBotHandler();
    this.scheduler = new Scheduler(this.telegramBot);
    this.setupExpress();
  }

  setupExpress() {
    // Parse JSON bodies
    this.app.use(express.json());
    
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const messageQueue = require('./messageQueue');
      const queueStatus = messageQueue.getStatus();
      
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        timezone: config.TIMEZONE,
        messageQueue: queueStatus
      });
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        message: 'Thai Learning Bot API',
        version: '1.0.0',
        status: 'running'
      });
    });

    // Payment webhook endpoint
    this.app.post('/webhook/payment', (req, res) => {
      this.handlePaymentWebhook(req, res);
    });




    // Start server
    this.app.listen(config.PORT, () => {
      console.log(`🚀 Server running on port ${config.PORT}`);
      console.log(`🌍 Timezone: ${config.TIMEZONE}`);
      console.log(`📅 Daily messages scheduled for 9:00 AM ICT`);
    });
  }

  // Start background services
  startServices() {
    console.log('🚀 Background services started');
  }

  // Handle payment webhook
  async handlePaymentWebhook(req, res) {
    try {
      console.log('💰 Payment webhook received:', req.body);
      
      const { userId, chatId, paymentReference, amount, transactionHash } = req.body;
      
      if (!userId || !chatId || !paymentReference) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      // Trigger payment success
      await this.telegramBot.handlePaymentSuccess(chatId, userId, paymentReference);
      
      res.json({ 
        status: 'success', 
        message: 'Payment processed successfully' 
      });
      
    } catch (error) {
      console.error('❌ Payment webhook error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }


}

// Start the bot
const bot = new ThaiLearningBot();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Thai Learning Bot...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down Thai Learning Bot...');
  process.exit(0);
});
