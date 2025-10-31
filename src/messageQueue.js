const config = require('./config');

class MessageQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.processingInterval = null;
    this.rateLimit = 25; // Messages per second (under Telegram's 30/sec limit)
    this.batchSize = 25; // Process 25 messages at a time
    this.delayBetweenBatches = 1000; // 1 second delay between batches
  }

  // Store bot instance for sending messages
  setBot(botInstance) {
    this.botInstance = botInstance;
  }

  // Add message to queue
  addMessage(chatId, message, options = {}) {
    const queueItem = {
      id: Date.now() + Math.random(), // Unique ID
      chatId,
      message,
      options,
      timestamp: new Date(),
      retries: 0,
      maxRetries: 3
    };
    
    this.queue.push(queueItem);
    console.log(`📝 Added message to queue. Queue size: ${this.queue.length}`);
    
    // Start processing if not already running
    if (!this.isProcessing) {
      this.startProcessing();
    }
  }

  // Start processing the queue
  startProcessing() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    console.log('🚀 Starting message queue processing');
    
    this.processingInterval = setInterval(() => {
      this.processBatch();
    }, this.delayBetweenBatches);
  }

  // Stop processing the queue
  stopProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    this.isProcessing = false;
    console.log('⏹️ Stopped message queue processing');
  }

  // Process a batch of messages
  async processBatch() {
    if (this.queue.length === 0) {
      console.log('✅ Queue empty, stopping processing');
      this.stopProcessing();
      return;
    }

    const batch = this.queue.splice(0, this.batchSize);
    console.log(`📤 Processing batch of ${batch.length} messages`);

    // Process messages in parallel with rate limiting
    const promises = batch.map(item => this.sendMessageWithRetry(item));
    await Promise.allSettled(promises);
  }

  // Send message with retry logic
  async sendMessageWithRetry(queueItem) {
    try {
      if (!this.botInstance) {
        throw new Error('Bot instance not set. Call messageQueue.setBot() first.');
      }
      
      await this.botInstance.sendMessage(queueItem.chatId, queueItem.message, queueItem.options);
      
      console.log(`✅ Message sent to ${queueItem.chatId}`);
    } catch (error) {
      console.error(`❌ Failed to send message to ${queueItem.chatId}:`, error.message);
      
      // Retry logic
      if (queueItem.retries < queueItem.maxRetries) {
        queueItem.retries++;
        console.log(`🔄 Retrying message ${queueItem.id} (attempt ${queueItem.retries})`);
        
        // Add back to queue with delay
        setTimeout(() => {
          this.queue.unshift(queueItem);
        }, 5000 * queueItem.retries); // Exponential backoff
      } else {
        console.error(`💀 Message ${queueItem.id} failed after ${queueItem.maxRetries} retries`);
      }
    }
  }

  // Get queue status
  getStatus() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      rateLimit: this.rateLimit,
      batchSize: this.batchSize
    };
  }

  // Clear the queue (emergency use)
  clearQueue() {
    const clearedCount = this.queue.length;
    this.queue = [];
    console.log(`🧹 Cleared ${clearedCount} messages from queue`);
  }

  // Add multiple messages for daily blast
  addDailyBlastMessages(userList, messageTemplate) {
    console.log(`📢 Adding ${userList.length} daily messages to queue`);
    
    userList.forEach(user => {
      const personalizedMessage = this.personalizeMessage(messageTemplate, user);
      this.addMessage(user.chat_id, personalizedMessage);
    });
  }

  // Personalize message for each user
  personalizeMessage(template, user) {
    return template
      .replace('{user_name}', user.display_name || 'User')
      .replace('{difficulty_level}', user.difficulty_level || 1);
  }
}

module.exports = new MessageQueue();
