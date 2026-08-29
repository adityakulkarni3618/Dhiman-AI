const { generateCompletion } = require('../services/llm/router');
const config = require('../config');

/**
 * Classifies intent into CHAT or ACTION
 */
async function classifyIntent(userInput, history = []) {
  const clean = userInput.trim().toLowerCase();
  
  // Basic deterministic chat keywords
  if (/^(hello|hi|hey|good morning|good afternoon|good evening|thanks|thank you|ok|okay|bye|goodbye|who are you|what is your name)$/.test(clean)) {
    return 'CHAT';
  }

  if (/^(what is mongodb|what is react|explain what an ai agent is|what is a database|how are you|what is dhiman)$/.test(clean)) {
    return 'CHAT';
  }

  // Use LLM classification if active
  if (config.openrouterApiKey || config.anthropicApiKey) {
    try {
      const messages = [
        { role: 'system', content: `You are the intent classifier for Dhiman-AI.
Classify the user's input into one of two categories:
- CHAT: Casual conversations, simple greetings, general explanations (e.g. "What is React", "Explain B-Trees", "Who are you").
- ACTION: Requests to open/close apps, capture screenshots, search the web, inspect repositories, write code, execute git commits, or launch browser instances.

Output ONLY the word CHAT or ACTION. Do not provide any markdown, spaces, or additional text.` },
        ...history.slice(-4).map(h => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content })),
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
  if (/\b(open|launch|close|screenshot|click|type|search|run|test|build|compile|git|commit|push|pull|github|calendar|email|schedule|task|monitor|delete|remove|patch)\b/.test(clean)) {
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
      const messages = [
        { role: 'system', content: "You are Dhiman, a highly capable personal AI assistant. Reply to the user's conversational message naturally and concisely." },
        ...history.slice(-10).map(h => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content })),
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
