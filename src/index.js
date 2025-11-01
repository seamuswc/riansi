const express = require('express');
const path = require('path');
const TelegramBotHandler = require('./telegramBot');
const Scheduler = require('./scheduler');
const config = require('./config');
const nodemailer = require('nodemailer');

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
    // Parse JSON bodies and URL-encoded bodies
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // Trust proxy for IP address (if behind reverse proxy)
    this.app.set('trust proxy', true);
    
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

    // Contact form endpoint
    this.app.post('/api/contact', (req, res) => {
      this.handleContactForm(req, res);
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

  // Handle contact form submission
  async handleContactForm(req, res) {
    try {
      const { message } = req.body;
      
      if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Check if email is configured
      if (!config.CONTACT_EMAIL || !config.SMTP_USER || !config.SMTP_PASS) {
        console.error('❌ Email not configured - missing CONTACT_EMAIL, SMTP_USER, or SMTP_PASS');
        return res.status(500).json({ error: 'Contact form is not configured. Please contact the administrator.' });
      }

      // Create email transporter
      const transporter = nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_PORT === 465, // true for 465, false for other ports
        auth: {
          user: config.SMTP_USER,
          pass: config.SMTP_PASS
        }
      });

      // Email content
      const mailOptions = {
        from: `"Thai Learning Bot Contact Form" <${config.SMTP_FROM}>`,
        to: config.CONTACT_EMAIL,
        subject: `📝 Contact Form Submission - ${new Date().toLocaleString()}`,
        text: `New contact form submission from Thai Learning Bot website:\n\n${message}\n\n---\nSubmitted at: ${new Date().toISOString()}\nIP: ${req.ip || req.connection.remoteAddress}`,
        html: `
          <h2>New Contact Form Submission</h2>
          <p><strong>Message:</strong></p>
          <p style="white-space: pre-wrap; background: #f5f5f5; padding: 15px; border-radius: 5px;">${message.replace(/\n/g, '<br>')}</p>
          <hr>
          <p><small>Submitted at: ${new Date().toLocaleString()}<br>IP: ${req.ip || req.connection.remoteAddress}</small></p>
        `
      };

      // Send email
      await transporter.sendMail(mailOptions);
      
      console.log('📧 Contact form email sent successfully');
      
      res.json({ 
        status: 'success', 
        message: 'Message sent successfully' 
      });
      
    } catch (error) {
      console.error('❌ Contact form error:', error);
      res.status(500).json({ error: 'Failed to send message. Please try again later.' });
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
