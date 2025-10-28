const cron = require('node-cron');
const database = require('./database');
const deepseekService = require('./services/deepseek');
const config = require('./config');

class Scheduler {
  constructor(telegramBot) {
    this.bot = telegramBot;
    this.setupDailyMessages();
  }

  setupDailyMessages() {
    // Schedule daily messages at 9:00 AM ICT (2:00 AM UTC)
    cron.schedule(config.DAILY_MESSAGE_CRON, async () => {
      console.log('📅 Daily message scheduler triggered');
      await this.sendDailyMessages();
    }, {
      timezone: config.TIMEZONE
    });

    console.log('⏰ Daily message scheduler set for 9:00 AM ICT');
  }

  async sendDailyMessages() {
    try {
      // Get all users with active subscriptions
      const activeUsers = await this.getActiveUsers();
      
      console.log(`📤 Sending daily messages to ${activeUsers.length} users`);

      for (const user of activeUsers) {
        try {
          await this.sendDailyMessageToUser(user);
          // Add delay between messages to avoid rate limiting
          await this.delay(1000);
        } catch (error) {
          console.error(`❌ Error sending message to user ${user.telegram_user_id}:`, error);
        }
      }
    } catch (error) {
      console.error('❌ Error in sendDailyMessages:', error);
    }
  }

  async getActiveUsers() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT u.*, s.expires_at 
        FROM users u
        JOIN subscriptions s ON u.telegram_user_id = s.telegram_user_id
        WHERE s.status = 'active' AND s.expires_at > datetime('now')
      `;
      
      database.db.all(query, [], (err, rows) => {
        if (err) {
          console.error('❌ Error getting active users:', err);
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  async sendDailyMessageToUser(user) {
    try {
      // Generate sentence based on user's difficulty level
      const sentenceData = await deepseekService.generateThaiSentence(user.difficulty_level);
      
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

      const message = `🇹🇭 Daily Thai Lesson

📝 Thai Sentence:
${sentenceData.thai_text}

Try typing the sentence back in Thai!${wordBreakdown}

Practice writing the Thai sentence!`;

      await this.bot.bot.sendMessage(user.telegram_user_id, message);
      
      console.log(`✅ Daily message sent to user ${user.telegram_user_id}`);
    } catch (error) {
      console.error(`❌ Error sending daily message to user ${user.telegram_user_id}:`, error);
    }
  }

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

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = Scheduler;
