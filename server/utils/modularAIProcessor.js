const whisper = require('openai-whisper');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Configuration
const SARVAM_API_KEY = 'sk_vdjmhd4o_cJhjgkayGjnGPgn8dpQMMFt6';
const SARVAM_API_URL = 'https://api.sarvam.ai/speech_synthesize';

class ModularAIProcessor {
  constructor() {
    this.isReady = false;
    this.ollamaUrl = 'http://localhost:11434';
  }

  async initialize() {
    try {
      // Test Ollama connection
      await this.testOllamaConnection();
      
      // Test Sarvam API
      await this.testSarvamAPI();
      
      this.isReady = true;
      console.log('Modular AI Processor initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize Modular AI Processor:', error);
      return false;
    }
  }

  async testOllamaConnection() {
    try {
      const response = await axios.get(`${this.ollamaUrl}/api/tags`);
      const models = response.data.models;
      const kimiModel = models.find(m => m.name.includes('kimi-k2.5'));
      
      if (!kimiModel) {
        throw new Error('Kimi K2.5 model not found in Ollama');
      }
      
      console.log('✅ Kimi K2.5 model found:', kimiModel.name);
      return true;
    } catch (error) {
      throw new Error(`Ollama connection failed: ${error.message}`);
    }
  }

  async testSarvamAPI() {
    try {
      const testResponse = await axios.post(SARVAM_API_URL, {
        input: "Hello world",
        target_language_code: "en-IN",
        speaker: "meera",
        model: "bulbul:v1"
      }, {
        headers: {
          'api-subscription-key': SARVAM_API_KEY,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ Sarvam API connection successful');
      return true;
    } catch (error) {
      throw new Error(`Sarvam API connection failed: ${error.message}`);
    }
  }

  async speechToText(audioBuffer) {
    try {
      // Save audio buffer to temporary file
      const tempFile = path.join(__dirname, '../temp_audio.wav');
      fs.writeFileSync(tempFile, audioBuffer);

      // Use Whisper for speech-to-text
      const whisperCommand = `python -m whisper "${tempFile}" --model tiny --language en`;
      const { stdout } = await execAsync(whisperCommand);
      
      // Clean up temp file
      fs.unlinkSync(tempFile);

      const transcript = stdout.trim();
      console.log('🎤 Speech to Text:', transcript);
      
      return transcript;
    } catch (error) {
      console.error('Speech-to-text failed:', error);
      throw error;
    }
  }

  async processWithKimi(text) {
    try {
      const response = await axios.post(`${this.ollamaUrl}/api/generate`, {
        model: 'kimi-k2.5:cloud',
        prompt: text,
        stream: false
      });

      const aiResponse = response.data.response;
      console.log('🧠 Kimi Response:', aiResponse);
      
      return aiResponse;
    } catch (error) {
      console.error('Kimi processing failed:', error);
      throw error;
    }
  }

  async textToSpeech(text) {
    try {
      const response = await axios.post(SARVAM_API_URL, {
        input: text,
        target_language_code: "en-IN",
        speaker: "meera",
        pitch: 0,
        pace: 1.0,
        loudness: 1.5,
        speech_sample_rate: 8000,
        enable_preprocessing: false,
        model: "bulbul:v1"
      }, {
        headers: {
          'api-subscription-key': SARVAM_API_KEY,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      });

      console.log('🗣️ Text to Speech completed');
      return response.data;
    } catch (error) {
      console.error('Text-to-speech failed:', error);
      throw error;
    }
  }

  async processAudio(audioBuffer) {
    if (!this.isReady) {
      throw new Error('Modular AI Processor not initialized');
    }

    try {
      console.log('🔄 Starting modular AI processing...');
      
      // Step 1: Speech to Text
      const transcript = await this.speechToText(audioBuffer);
      
      // Step 2: AI Processing
      const aiResponse = await this.processWithKimi(transcript);
      
      // Step 3: Text to Speech
      const audioResponse = await this.textToSpeech(aiResponse);
      
      console.log('✅ Modular AI processing completed');
      
      return {
        transcript,
        aiResponse,
        audioResponse
      };
    } catch (error) {
      console.error('Modular AI processing failed:', error);
      throw error;
    }
  }
}

module.exports = ModularAIProcessor;
