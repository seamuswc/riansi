const express = require('express');
const path = require('path');
const TelegramBotHandler = require('./telegramBot');
const Scheduler = require('./scheduler');
const config = require('./config');

class ThaiLearningBot {
  constructor() {
    this.app = express();
    this.telegramBot = new TelegramBotHandler();
    
    // Set bot instance for message queue so it can send messages
    const messageQueue = require('./messageQueue');
    messageQueue.setBot(this.telegramBot.bot);
    
    this.scheduler = new Scheduler(this.telegramBot);
    this.setupExpress();
  }

  setupExpress() {
    // Parse JSON bodies
    this.app.use(express.json());
    
    // Serve static landing page
    this.app.use(express.static(path.join(__dirname, '..', 'public')));
    
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

    // Root endpoint serves landing page
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    });

    // Payment webhook endpoint
    this.app.post('/webhook/payment', (req, res) => {
      this.handlePaymentWebhook(req, res);
    });

    // Base/Ethereum payment redirect endpoint (Telegram doesn't support ethereum:// protocol)
    // Use HTML meta redirect to attempt opening wallet
    this.app.get('/pay/base', (req, res) => {
      const { address, amount, ref } = req.query;
      
      if (!address || !amount) {
        return res.status(400).send('Missing required parameters');
      }
      
      // Create EIP-681 format deep link
      const ethereumLink = `ethereum:${address}@8453/transfer?value=${amount}`;
      
      // Send HTML page with meta redirect and JavaScript fallback
      // This attempts to open the wallet on mobile devices
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Opening Wallet...</title>
          <meta http-equiv="refresh" content="0;url=${ethereumLink}">
        </head>
        <body>
          <p>Opening your wallet...</p>
          <p>If it doesn't open automatically, <a href="${ethereumLink}">click here</a></p>
          <script>
            window.location.href = "${ethereumLink}";
          </script>
        </body>
        </html>
      `);
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
