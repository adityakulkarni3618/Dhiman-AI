const { generateCompletion } = require('../services/llm/router');
const config = require('../config');

function sanitizeContent(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (typeof content === 'object') {
    return content.content || content.text || JSON.stringify(content);
  }
  return String(content);
}

/**
 * Classifies intent into CHAT or ACTION
 */
async function classifyIntent(userInput, history = []) {
  const clean = userInput.trim().toLowerCase();
  
  // Basic deterministic chat keywords
  if (/^(hello|hi|hey|good morning|good afternoon|good evening|thanks|thank you|ok|okay|bye|goodbye|who are you|what is your name|how are you)$/.test(clean)) {
    return 'CHAT';
  }

  if (/^(what is mongodb|what is react|explain what an ai agent is|what is a database|what is dhiman|explain tcp\/ip|explain tcpip)$/.test(clean)) {
    return 'CHAT';
  }

  // Use LLM classification if active
  if (config.openrouterApiKey || config.anthropicApiKey) {
    try {
      const messages = [
        { role: 'system', content: `You are the intent classifier for Dhiman-AI.
Classify the user's input into one of two categories:
- CHAT: Casual conversations, greetings, general questions, explanations of concepts (e.g. "What is React", "Explain B-Trees", "Who are you", "Explain TCP/IP").
- ACTION: Requests to perform computer automation, run commands, open/close/focus apps, capture screenshots, search the web, manage files, write code, commit to Git, set reminders/tasks/notes/calendar, send messages/emails.

IMPORTANT: If the user request is hybrid and contains BOTH a conversational question and a request for action (e.g., "Explain what Next.js is and open my Next.js project", "Search for the latest AI news and save the summary as a note"), you MUST classify it as ACTION.

Output ONLY the word CHAT or ACTION. Do not provide any markdown, spaces, or additional text.` },
        ...history.slice(-4).map(h => ({ role: h.role === 'user' ? 'user' : 'assistant', content: sanitizeContent(h.content) })),
        { role: 'user', content: userInput }
      ];
      const res = await generateCompletion({ messages, tier: 'smart' });
      const intent = (res.content || '').trim().toUpperCase();
      if (['CHAT', 'ACTION'].includes(intent)) {
        return intent;
      }
    } catch (err) {
      console.warn("[INTENT ROUTER] LLM classification failed, falling back to heuristics:", err.message);
    }
  }

  // Fallback heuristics: check key action verbs
  if (/\b(open|launch|close|screenshot|click|type|search|run|test|build|compile|git|commit|push|pull|github|calendar|email|schedule|task|monitor|delete|remove|patch|note|remind)\b/.test(clean)) {
    return 'ACTION';
  }

  return 'CHAT';
}

/**
 * Handles normal conversational responses
 */
async function handleChatResponse(userInput, history = []) {
  if (config.openrouterApiKey || config.anthropicApiKey) {
    try {
      let memoryFacts = [];
      try {
        const { getEmbedding } = require('../services/ai');
        const db = require('../db');
        const queryEmbedding = await getEmbedding(userInput);
        if (queryEmbedding) {
          memoryFacts = await db.fetchRelevantMemoryFacts(queryEmbedding, 4);
        }
      } catch (memErr) {
        console.warn("[INTENT ROUTER] Skipping long-term memory retrieval for chat response:", memErr.message);
      }

      let systemContent = "You are Dhiman, a highly capable personal AI assistant. Reply to the user's conversational message naturally and concisely.";
      if (memoryFacts && memoryFacts.length > 0) {
        systemContent += "\n\nRelevant user facts & preferences (from long-term memory):\n" + memoryFacts.map((f, i) => `- ${f.fact}`).join('\n');
      }

      const messages = [
        { role: 'system', content: systemContent },
        ...history.slice(-10).map(h => ({ role: h.role === 'user' ? 'user' : 'assistant', content: sanitizeContent(h.content) })),
        { role: 'user', content: userInput }
      ];
      const res = await generateCompletion({ messages, tier: 'smart' });
      return res.content || "Hello! How can I help you today?";
    } catch (err) {
      console.warn("[INTENT ROUTER] Conversational response completion failed:", err.message);
    }
  }

  // Local offline stubs for graceful degradation
  return "I'm currently unable to answer general questions because my language model is unavailable. My local computer and automation tools are still available.";
}

module.exports = {
  classifyIntent,
  handleChatResponse
};


