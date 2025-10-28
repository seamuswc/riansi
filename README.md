# Thai Learning Telegram Bot

A Telegram bot that helps users learn Thai language through daily sentences and authentic content.

## 🎯 Features

- **Daily Thai Sentences**: Get daily lessons at 9:00 AM ICT
- **TON Cryptocurrency Payments**: Subscribe with TON for 30 days
- **5 Difficulty Levels**: From Beginner to Expert
- **Authentic Content**: Practice with real Thai sentences

## 🏗️ Architecture

- **Platform**: Telegram Bot (node-telegram-bot-api)
- **Backend**: Node.js + Express.js
- **Database**: SQLite
- **AI**: DeepSeek API for sentence generation
- **Payments**: TON cryptocurrency
- **Scheduler**: node-cron for daily messages

## 🚀 Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Run the bot**:
   ```bash
   npm start
   ```

## 🔧 Configuration

### Environment Variables

```bash
# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token_here

# DeepSeek API
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# TON Configuration
TON_ADDRESS=your_ton_address_here
TON_AMOUNT=1.0
SUBSCRIPTION_DAYS=30

# Database
DATABASE_PATH=./data/bot.db

# Server
PORT=3000
NODE_ENV=development
TIMEZONE=Asia/Bangkok
```

## 🚀 Deployment

Deploy to your server:

```bash
./deploy.sh 68.183.185.81
```

## 🐛 Critical Fixes Applied

### 1. Difficulty Level Persistence ✅
- **Fixed**: Status and Difficulty buttons now fetch fresh data from database
- **Fixed**: Level changes persist correctly and display immediately
- **Fixed**: No more cached/stale user data issues

### 2. TON Payment Integration ✅
- **Fixed**: TON payment button opens wallet immediately
- **Fixed**: Payment details are pre-filled (amount, address, reference)
- **Fixed**: Proper TON URL format: `ton://ADDRESS/transfer?amount=AMOUNT&text=REFERENCE`

### 3. Database Consistency ✅
- **Fixed**: All user data fetched fresh from database
- **Fixed**: No caching of user difficulty levels
- **Fixed**: Status updates are immediate and accurate

## 📱 Bot Commands

- `/start` - Main menu with all options
- `/help` - Help and instructions

## 🎮 Button Functions

### Main Menu
- **📚 Help** - Show help information
- **📊 Status** - Show subscription status and current difficulty
- **💳 Subscribe** - Subscribe with TON payment
- **⚙️ Difficulty** - Change difficulty level

### Difficulty Levels
- **Level 1**: Beginner (1-3 words)
- **Level 2**: Elementary (4-6 words)
- **Level 3**: Intermediate (7-10 words)
- **Level 4**: Advanced (11-15 words)
- **Level 5**: Expert (16+ words)

## 🗄️ Database Schema

```sql
-- Users table
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id TEXT UNIQUE NOT NULL,
  display_name TEXT,
  difficulty_level INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Subscriptions table
CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  expires_at DATETIME,
  payment_reference TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sentences table
CREATE TABLE sentences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thai_text TEXT NOT NULL,
  english_translation TEXT,
  difficulty_level INTEGER,
  word_breakdown TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User progress table
CREATE TABLE user_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id TEXT NOT NULL,
  sentence_id INTEGER,
  user_response TEXT,
  grade INTEGER,
  is_correct BOOLEAN,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 🔍 Testing

### Test Difficulty Persistence
1. Start bot → Click "⚙️ Difficulty" → Should show current level
2. Click "Level 3" → Should confirm "Updated to Level 3"
3. Click "🏠 Main Menu" → Click "📊 Status" → Should show "Current Level: 3"
4. Click "⚙️ Difficulty" again → Should show "Current Level: 3"

### Test TON Payment
1. Click "💳 Subscribe" → Click "💎 Pay 1 TON"
2. Should show payment message with single "💎 Pay 1 TON" button
3. Click button → Should open TON wallet immediately with pre-filled details

## 📊 Health Check

```bash
curl http://68.183.185.81:3000/health
```

## 🛠️ Development

```bash
# Development mode with auto-restart
npm run dev

# Check logs
pm2 logs thai-learning-bot --lines 50
```

## 📝 Logs

Expected log patterns for successful operations:

### Difficulty Change
```
🔘 Button clicked: level_3 by user 1302731344 in chat 1302731344
🎯 Handling level change request: 3 for user 1302731344
📝 Updating user 1302731344 to level 3
Database: Updated 1 rows for user 1302731344 to level 3
✅ Level change completed successfully for user 1302731344
```

### Status Request
```
🔘 Button clicked: status by user 1302731344 in chat 1302731344
📊 Status request for user 1302731344, current level: 3
```

## 🎯 Success Criteria

✅ **Difficulty changes persist** and show correctly in Status/Difficulty  
✅ **TON payment opens wallet** immediately with pre-filled details  
✅ **All user data is fresh** from database, no caching issues  
✅ **Bot responds correctly** to all button interactions  
✅ **Database operations work** as expected with proper logging  

---

**The bot is now ready for deployment with all critical bugs fixed!**
