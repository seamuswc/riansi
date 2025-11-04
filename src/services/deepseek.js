const axios = require('axios');
const config = require('../config');
const database = require('../database');

class DeepSeekService {
  constructor() {
    this.apiKey = config.DEEPSEEK_API_KEY;
    this.apiUrl = config.DEEPSEEK_API_URL;
    this.sentenceCache = {}; // Cache for sentences by difficulty level
    this.lastCacheDate = null; // Track when cache was last updated
  }

  // Check if cache needs to be reset (8:00 AM ICT)
  shouldResetCache() {
    const now = new Date();
    const bangkokTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Bangkok"}));
    const currentHour = bangkokTime.getHours();
    const currentDate = bangkokTime.toDateString();
    
    // Reset cache at 8:00 AM ICT or if it's a new day after 8 AM
    const shouldReset = (currentHour >= 8 && this.lastCacheDate !== currentDate) || 
                       (this.lastCacheDate && this.lastCacheDate !== currentDate);
    
    if (shouldReset) {
      console.log('🔄 8:00 AM ICT detected, resetting sentence cache');
      this.sentenceCache = {};
      this.lastCacheDate = currentDate;
      return true;
    }
    return false;
  }

  // Get cached sentence or generate new one
  async generateThaiSentence(difficultyLevel, retryCount = 0) {
    // Check if cache needs reset
    this.shouldResetCache();
    
    // Return cached sentence if available
    if (this.sentenceCache[difficultyLevel]) {
      console.log(`📦 Using cached sentence for difficulty ${difficultyLevel}`);
      return this.sentenceCache[difficultyLevel];
    }
    
    console.log(`🔄 Generating new sentence for difficulty ${difficultyLevel}`);
    
    try {
      // Get recent sentences to avoid duplicates
      const recentSentences = await database.getRecentSentences(difficultyLevel, 30);
      const recentThaiTexts = recentSentences.map(s => s.thai_text).filter(Boolean);
      
      let avoidPrompt = '';
      if (recentThaiTexts.length > 0) {
        avoidPrompt = `\n\nCRITICAL: Do NOT generate any of these sentences that were recently used:\n${recentThaiTexts.slice(0, 10).map((text, i) => `${i + 1}. ${text}`).join('\n')}\n\nYou MUST create a completely different sentence with different words, topics, and structure. Do not repeat similar phrases or patterns.`;
      }
      
      const levelInfo = config.DIFFICULTY_LEVELS[difficultyLevel];
      const prompt = `Generate a Thai sentence for language learning at ${levelInfo.name} level (${levelInfo.description}). 
      The sentence should be:
      - In Thai script
      - Include English translation
      - Be appropriate for the difficulty level
      - Completely unique and different from previously generated sentences
      
      IMPORTANT LANGUAGE NOTE: When using "I" (first person singular), default to "ผม" (phom) - the male/polite form of "I", rather than "ฉัน" (chan). Use "ผม" unless the context specifically requires "ฉัน".
      
      For word_breakdown, provide an array of objects with:
      - word: the individual Thai word (break down into separate words, not phrases)
      - meaning: English meaning
      - pinyin: Thai romanization/pronunciation (MUST include this field with proper Thai romanization like "phom", "chop", "gin", etc.)
      
      IMPORTANT: Break down into individual words. For example:
      - "ดื่มกาแฟ" (drinking coffee) should be broken down as "ดื่ม" (drink) + "กาแฟ" (coffee)
      - "ไปโรงเรียน" (go to school) should be broken down as "ไป" (go) + "โรงเรียน" (school)
      - "สวัสดีครับ" (hello sir) should be broken down as "สวัสดี" (hello) + "ครับ" (sir)
      
      CRITICAL REQUIREMENTS:
      - Use a completely different topic, vocabulary, and sentence structure
      - Vary the topics: try different activities, places, foods, emotions, weather, etc.
      - Avoid repeating similar sentence patterns or word combinations
      - Be creative and diverse in your sentence generation${avoidPrompt}

      Format the response as JSON with fields: thai_text, english_translation, word_breakdown`;

      const response = await axios.post(this.apiUrl, {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.9, // Increased from 0.7 for more variation
        max_tokens: 1500
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const content = response.data.choices[0].message.content;
      console.log('🔍 DeepSeek raw response:', content);
      
      try {
        // Clean up the response - remove markdown code blocks
        let cleanContent = content.trim();
        if (cleanContent.startsWith('```json')) {
          cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        }
        if (cleanContent.startsWith('```')) {
          cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        
        console.log('🔍 Cleaned content length:', cleanContent.length);
        console.log('🔍 Cleaned content preview:', cleanContent.substring(0, 200) + '...');
        
        const parsed = JSON.parse(cleanContent);
        console.log('🔍 Parsed JSON successfully');
        console.log('🔍 Thai text:', parsed.thai_text);
        
        // Validate that we have actual Thai text
        if (!parsed.thai_text || parsed.thai_text.trim() === '' || parsed.thai_text.includes('```')) {
          throw new Error('Invalid Thai text in response');
        }
        
        // Check for duplicate sentences
        const isDuplicate = recentThaiTexts.some(recentText => 
          recentText.trim().toLowerCase() === parsed.thai_text.trim().toLowerCase()
        );
        
        if (isDuplicate) {
          console.log(`⚠️ Duplicate sentence detected: "${parsed.thai_text}"`);
          if (retryCount < 3) {
            console.log(`🔄 Retrying with different prompt (attempt ${retryCount + 1})...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return this.generateThaiSentence(difficultyLevel, retryCount + 1);
          } else {
            console.log(`⚠️ Max retries reached, using sentence despite duplicate check`);
          }
        }
        
        // Add pinyin if missing
        if (parsed.word_breakdown && Array.isArray(parsed.word_breakdown)) {
          parsed.word_breakdown.forEach(word => {
            if (!word.pinyin || word.pinyin.trim() === '') {
              // Simple pinyin fallback based on common Thai words
              const pinyinMap = {
                'ฉัน': 'chan',
                'ชอบ': 'chop', 
                'กิน': 'gin',
                'ข้าว': 'khao',
                'ผัด': 'phat',
                'วันนี้': 'wan ni',
                'กับ': 'kap',
                'ปลา': 'pla',
                'น้ำ': 'nam',
                'ดี': 'di',
                'มาก': 'mak',
                'สวัสดี': 'sawat di',
                'ครับ': 'khrap',
                'ค่ะ': 'kha'
              };
              word.pinyin = pinyinMap[word.word] || word.word.toLowerCase();
            }
          });
        }
        
        // Cache the generated sentence
        this.sentenceCache[difficultyLevel] = parsed;
        console.log(`💾 Cached sentence for difficulty ${difficultyLevel}`);
        
        return parsed;
      } catch (parseError) {
        console.error('❌ JSON parsing failed:', parseError.message);
        console.error('❌ Raw content:', content);
        
        throw new Error('Failed to parse AI response');
      }
    } catch (error) {
      console.error(`❌ DeepSeek API error (attempt ${retryCount + 1}):`, error.message);
      
      // Retry logic
      const maxRetries = 3;
      if (retryCount < maxRetries) {
        const baseDelay = 1000; // 1 second base delay
        const delay = baseDelay * Math.pow(2, retryCount); // Exponential backoff
        console.log(`🔄 Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.generateThaiSentence(difficultyLevel, retryCount + 1);
      }
      
      console.error('❌ All DeepSeek attempts failed');
      throw error;
    }
  }
}

module.exports = new DeepSeekService();
