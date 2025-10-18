#!/usr/bin/env node

// Safe bot testing script - doesn't start polling
const TelegramBotHandler = require('./src/telegramBot');
const database = require('./src/database');

async function testBot() {
  try {
    console.log('🧪 Testing bot initialization (no polling)...');
    
    // Initialize database
    await database.init();
    console.log('✅ Database initialized');
    
    // Create bot WITHOUT polling to avoid conflicts
    const bot = new TelegramBotHandler({ polling: false });
    console.log('✅ Bot created successfully (no polling)');
    
    // Test bot methods without starting polling
    console.log('✅ Bot is ready for testing');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testBot();
