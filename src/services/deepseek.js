const axios = require('axios');
const config = require('../config');

class DeepSeekService {
  constructor() {
    this.apiKey = config.DEEPSEEK_API_KEY;
    this.apiUrl = config.DEEPSEEK_API_URL;
  }

  async generateThaiSentence(difficultyLevel) {
    try {
      const levelInfo = config.DIFFICULTY_LEVELS[difficultyLevel];
      const prompt = `Generate a Thai sentence for language learning at ${levelInfo.name} level (${levelInfo.description}). 
      The sentence should be:
      - In Thai script
      - Include English translation
      - Be appropriate for the difficulty level
      
      
      For word_breakdown, provide an array of objects with:
      - word: the Thai word
      - meaning: English meaning
      - pinyin: Thai romanization/pronunciation (MUST include this field with proper Thai romanization like "chan", "chop", "gin", etc.)
      
      Try to not use similiar sentences over and over again.
      Use a variety of sentences to keep the learning experience interesting.

      Format the response as JSON with fields: thai_text, english_translation, word_breakdown`;

      const response = await axios.post(this.apiUrl, {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500
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
        
        const parsed = JSON.parse(cleanContent);
        
        // Validate that we have actual Thai text
        if (!parsed.thai_text || parsed.thai_text.trim() === '' || parsed.thai_text.includes('```')) {
          throw new Error('Invalid Thai text in response');
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
        
        return parsed;
      } catch (parseError) {
        console.error('❌ JSON parsing failed:', parseError.message);
        console.error('❌ Raw content:', content);
        
        // Try to extract Thai text manually
        const lines = content.split('\n');
        let thaiText = '';
        let englishText = 'Hello';
        
        for (const line of lines) {
          if (line.includes('thai_text') || line.includes('Thai')) {
            const match = line.match(/["']([^"']+)["']/);
            if (match && match[1] && !match[1].includes('```')) {
              thaiText = match[1];
            }
          }
          if (line.includes('english_translation') || line.includes('English')) {
            const match = line.match(/["']([^"']+)["']/);
            if (match && match[1]) {
              englishText = match[1];
            }
          }
        }
        
        // Fallback if extraction fails
        if (!thaiText) {
          throw new Error('Could not extract Thai text');
        }
        
        return {
          thai_text: thaiText,
          english_translation: englishText,
          word_breakdown: []
        };
      }
    } catch (error) {
      console.error('❌ DeepSeek API error:', error.message);
      
      // Fallback sentences for each difficulty level
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
}

module.exports = new DeepSeekService();
