const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');

// Initialize OpenAI client if API key is provided
let openai = null;
if (config.openaiApiKey) {
  openai = new OpenAI({ apiKey: config.openaiApiKey });
}

// Initialize Anthropic client if API key is provided
let anthropic = null;
if (config.anthropicApiKey) {
  anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
}

/**
 * Generate embedding using OpenAI text-embedding-3-small
 */
async function getEmbedding(text) {
  if (!openai) {
    throw new Error("OpenAI API Key is missing. Embeddings cannot be generated.");
  }
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text
  });
  return response.data?.[0]?.embedding;
}

/**
 * Generate Chat Completion via OpenRouter or direct fallback
 */
async function generateChatCompletion({ messages, tools }) {
  if (!config.openrouterApiKey) {
    throw new Error("Missing OpenRouter API Key.");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.openrouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Dhiman Sovereign"
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: messages,
      tools: tools
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || `HTTP Request failed with status ${response.status}`);
  }

  return payload.choices[0].message;
}

/**
 * Extract persistent memory facts from recent conversation messages
 */
async function extractDurableFacts(messages) {
  const conversationText = messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n');

  const prompt = `Extract up to 8 distinct durable facts about the user, their identity, preferences, goals, habits, and ongoing context from the conversation below. Return each fact as a single short sentence with no numbering or filler.

Conversation:
${conversationText}`;

  // If Anthropic API Key is available, use it directly (corrected model name to claude-3-5-sonnet-latest)
  if (config.anthropicApiKey && anthropic) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-latest',
        max_tokens: 512,
        messages: [
          { role: 'system', content: 'You are Dhiman, a memory curator. Extract concise persistent facts about the user.' },
          { role: 'user', content: prompt }
        ]
      });
      const text = response?.content?.[0]?.text || response?.content || '';
      return text
        .split(/\r?\n/)
        .map((line) => line.replace(/^[-*\d\.\)\s]+/, '').trim())
        .filter((line) => line.length > 10);
    } catch (err) {
      console.warn("Direct Anthropic memory extraction failed, falling back to OpenRouter:", err.message);
    }
  }

  // Fallback to OpenRouter (using Gemini or Claude model via OpenRouter)
  if (config.openrouterApiKey) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.openrouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Dhiman Sovereign Curation"
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: 'system', content: 'You are Dhiman, a memory curator. Extract concise persistent facts about the user.' },
          { role: 'user', content: prompt }
        ]
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error?.message || `HTTP Request failed with status ${response.status}`);
    }

    const text = payload.choices[0].message.content || '';
    return text
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-*\d\.\)\s]+/, '').trim())
      .filter((line) => line.length > 10);
  }

  throw new Error("No API clients available for memory extraction.");
}

module.exports = {
  getEmbedding,
  generateChatCompletion,
  extractDurableFacts
};
