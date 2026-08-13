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

// Tools specification compatible with Claude Tool Use API
const tools = [
  {
    name: "get_current_datetime",
    description: "Get the current date and time in ISO format.",
    input_schema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "web_search",
    description: "Search the web for up-to-date information on a given topic using Tavily Search API.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query term or phrase."
        }
      },
      required: ["query"]
    }
  }
];

// Tool execution helper functions
function getCurrentDateTime() {
  const dt = new Date().toISOString();
  console.log(`[TOOL CALL] get_current_datetime -> ${dt}`);
  return dt;
}

async function executeWebSearch(query) {
  console.log(`[TOOL CALL] web_search -> Query: "${query}"`);
  if (!process.env.TAVILY_API_KEY) {
    console.error("[TOOL ERROR] Tavily API Key is missing.");
    return "Search failed: Tavily API key is missing on the server.";
  }
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: query,
        search_depth: "basic",
        include_answer: false
      })
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const results = (data.results || []).map(r => `- ${r.title}: ${r.content} (${r.url})`).join('\n');
    const output = results || "No relevant search results found.";
    console.log(`[TOOL RESULT] web_search -> Returned ${data.results?.length || 0} results.`);
    return output;
  } catch (error) {
    console.error("[TOOL ERROR] Web search execution failed:", error.message);
    return `Search failed: ${error.message}`;
  }
}

// 1. Send chat completion (legacy/direct HTTP option)
app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationId } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Invalid request: message is required and must be a string.' });
    }

    const { anthropic } = require('./services/ai');
    if (!anthropic) {
      throw new Error("Anthropic client is not initialized. Please verify ANTHROPIC_API_KEY in your .env.");
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

    // Build system instructions
    let systemContent = 'You are Dhiman, a knowledgeable AI assistant for Aditya. Answer clearly and use long-term memory context when available.';
    if (memoryFacts.length > 0) {
      systemContent += '\n\nLong-term memory context:\n' + memoryFacts.map((fact, index) => `${index + 1}. ${fact.fact}`).join('\n');
    }

    // Format conversation history for Claude Messages API (roles must alternate, no system role allowed)
    const claudeMessages = [];
    for (const msg of recentMessages) {
      if (msg.role === 'system') continue;
      claudeMessages.push({
        role: msg.role,
        content: msg.content
      });
    }

    let loopCount = 0;
    let keepRunning = true;
    let finalResponseText = '';

    while (keepRunning && loopCount < 5) {
      loopCount++;
      console.log(`[CLAUDE LOOP] Requesting Claude completions (Turn ${loopCount})...`);

      const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-latest",
        max_tokens: 1024,
        system: systemContent,
        messages: claudeMessages,
        tools: tools
      });

      // Add assistant response to the active query history
      claudeMessages.push({
        role: "assistant",
        content: response.content
      });

      // Save assistant response to DB
      await db.saveMessage(activeConversationId, 'assistant', response.content);

      // Check if Claude requested a tool use
      const toolCalls = response.content.filter(block => block.type === 'tool_use');

      if (toolCalls.length > 0) {
        const toolResultBlocks = [];

        for (const toolCall of toolCalls) {
          const { id: toolUseId, name: toolName, input: toolInput } = toolCall;
          console.log(`[CLAUDE LOOP] Executing tool: "${toolName}" with arguments: ${JSON.stringify(toolInput)}`);

          let resultText = '';
          if (toolName === 'get_current_datetime') {
            resultText = getCurrentDateTime();
          } else if (toolName === 'web_search') {
            resultText = await executeWebSearch(toolInput.query);
          } else {
            resultText = `Error: Unknown tool "${toolName}"`;
          }

          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: toolUseId,
            content: resultText
          });
        }

        // Add tool results as a user response message to history
        claudeMessages.push({
          role: "user",
          content: toolResultBlocks
        });

        // Save tool result message to DB
        await db.saveMessage(activeConversationId, 'user', toolResultBlocks);

      } else {
        keepRunning = false;
        const textBlock = response.content.find(block => block.type === 'text');
        finalResponseText = textBlock ? textBlock.text : '';
      }
    }

    return res.json({ reply: finalResponseText, conversationId: activeConversationId });
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