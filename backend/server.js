const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const config = require('./config');
const db = require('./db');
const ai = require('./services/ai');
const registerSocketHandlers = require('./socket');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Register Socket.io events
registerSocketHandlers(io);

// HTTP Endpoints

// 1. Send chat completion (legacy/direct HTTP option)
app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationId } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Invalid request: message is required and must be a string.' });
    }

    const activeConversationId = await db.getOrCreateConversation(conversationId, message);
    await db.saveMessage(activeConversationId, 'user', message);

    const recentMessages = await db.getRecentMessages(activeConversationId, 12);
    
    // Get query embedding and query memory
    let memoryFacts = [];
    try {
      const queryEmbedding = await ai.getEmbedding(message);
      if (queryEmbedding) {
        memoryFacts = await db.fetchRelevantMemoryFacts(queryEmbedding, 4);
      }
    } catch (embErr) {
      console.warn("Skipping memory lookup on HTTP chat endpoint:", embErr.message);
    }

    const systemMessages = [
      { role: 'system', content: 'You are Dhiman, a knowledgeable AI assistant for Aditya. Answer clearly and use long-term memory context when available.' }
    ];

    if (memoryFacts.length > 0) {
      systemMessages.push({
        role: 'system',
        content: 'Long-term memory context:\n' + memoryFacts.map((fact, index) => `${index + 1}. ${fact.fact}`).join('\n')
      });
    }

    const conversationMessages = [
      ...systemMessages,
      ...recentMessages.map((msg) => ({ role: msg.role, content: msg.content }))
    ];

    const modelResponse = await ai.generateChatCompletion({
      messages: conversationMessages,
      tools: [] // No tools over standard HTTP to keep it low-latency and simple
    });

    const replyText = modelResponse.content || '';
    await db.saveMessage(activeConversationId, 'assistant', replyText);

    return res.json({ reply: replyText, conversationId: activeConversationId });
  } catch (error) {
    console.error('Chat endpoint error:', error);
    const status = error?.statusCode || 500;
    const message = error?.message || 'An unexpected error occurred while processing chat.';
    return res.status(status).json({ error: message });
  }
});

// 2. List all conversations
app.get('/api/conversations', async (req, res) => {
  try {
    const data = await db.listConversations();
    return res.json({ conversations: data || [] });
  } catch (error) {
    console.error('Conversations list error:', error);
    return res.status(500).json({ error: 'Unable to load conversations.' });
  }
});

// 3. Get messages for a conversation
app.get('/api/conversations/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const messages = await db.getRecentMessages(conversationId, 100);
    return res.json({ messages });
  } catch (error) {
    console.error('Conversation messages error:', error);
    return res.status(500).json({ error: 'Unable to load conversation messages.' });
  }
});

// 4. Extract memory facts from conversation
app.post('/api/memory/extract', async (req, res) => {
  try {
    const { conversationId } = req.body;
    if (!conversationId || typeof conversationId !== 'string') {
      return res.status(400).json({ error: 'Invalid request: conversationId is required.' });
    }

    const recentMessages = await db.getRecentMessages(conversationId, 20);
    if (recentMessages.length === 0) {
      return res.status(404).json({ error: 'No messages found for this conversation.' });
    }

    const facts = await ai.extractDurableFacts(recentMessages);
    const sourceMessageId = recentMessages[recentMessages.length - 1]?.id || null;

    const embeddings = [];
    for (const fact of facts) {
      try {
        const emb = await ai.getEmbedding(fact);
        embeddings.push(emb);
      } catch (embErr) {
        console.warn(`Could not generate embedding for fact: "${fact}"`, embErr.message);
        embeddings.push(null);
      }
    }

    const insertedFacts = await db.createMemoryFacts(facts, sourceMessageId, embeddings);
    return res.json({ inserted: insertedFacts.length, facts: insertedFacts.map((row) => row.fact) });
  } catch (error) {
    console.error('Memory extract error:', error);
    const status = error?.statusCode || 500;
    return res.status(status).json({ error: error?.message || 'Unable to extract memory.' });
  }
});

// 5. Get all stored memory facts
app.get('/api/memory', async (req, res) => {
  try {
    const facts = await db.listAllMemoryFacts();
    return res.json({ facts });
  } catch (error) {
    console.error('List memories error:', error);
    return res.status(500).json({ error: 'Unable to load memory facts.' });
  }
});

// 6. Delete a specific memory fact
app.delete('/api/memory/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.deleteMemoryFact(id);
    return res.json(result);
  } catch (error) {
    console.error('Delete memory error:', error);
    return res.status(500).json({ error: 'Unable to delete memory fact.' });
  }
});

// 7. Add a manual memory fact
app.post('/api/memory', async (req, res) => {
  try {
    const { fact } = req.body;
    if (!fact || typeof fact !== 'string' || fact.trim().length < 5) {
      return res.status(400).json({ error: 'Invalid request: fact content is too short.' });
    }

    const embedding = await ai.getEmbedding(fact);
    const result = await db.addManualMemoryFact(fact, embedding);
    return res.json(result);
  } catch (error) {
    console.error('Add memory error:', error);
    return res.status(500).json({ error: 'Unable to insert memory fact.' });
  }
});

// Bootstrap server on port 5005
server.listen(config.port, () => {
  console.log(`🚀 Lengthy Multi-Agent Dhiman Engine running smoothly on port ${config.port}`);
});