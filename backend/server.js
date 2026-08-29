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

// Initialize tools and routes
require('./tools/allTools');
app.use('/api/agent', require('./routes/agent'));
app.use('/api/voice', require('./routes/voice'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Register Socket.io events
registerSocketHandlers(io);

// HTTP Endpoints

// Tools specification compatible with OpenRouter (OpenAI-compatible) API
const tools = [
  {
    type: "function",
    function: {
      name: "get_current_datetime",
      description: "Get the current date and time in ISO format.",
      properties: {}
    }
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for up-to-date information on a given topic using Tavily Search API.",
      parameters: {
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
  },
  {
    type: "function",
    function: {
      name: "open_system_app",
      description: "Safely open a pre-defined desktop application on the host machine. Allowed apps: chrome, whatsapp, notepad, calculator, vscode.",
      parameters: {
        type: "object",
        properties: {
          app_name: {
            type: "string",
            description: "The name of the application to open. Must be one of: chrome, whatsapp, notepad, calculator, vscode.",
            enum: ["chrome", "whatsapp", "notepad", "calculator", "vscode"]
          }
        },
        required: ["app_name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "open_url",
      description: "Safely open a specific web URL or a web search URL in the user's default browser.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The fully qualified HTTP or HTTPS URL to open (e.g. 'https://www.google.com' or 'https://www.youtube.com')."
          }
        },
        required: ["url"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_terminal_command",
      description: "Run an arbitrary shell/terminal command on the host Windows machine. Always requires interactive user approval before running.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell/terminal command to execute (e.g. 'dir', 'ipconfig', 'git status', etc.)."
          }
        },
        required: ["command"]
      }
    }
  }
];

// OpenRouter API completions helper
async function callOpenRouter(messages) {
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

const { exec } = require('child_process');

function executeOpenSystemApp(appName) {
  console.log(`[TOOL CALL] open_system_app -> App: "${appName}"`);
  const appCommands = {
    chrome: 'start chrome',
    whatsapp: 'start whatsapp:',
    notepad: 'start notepad',
    calculator: 'start calc',
    vscode: 'start code'
  };

  const command = appCommands[appName.toLowerCase()];
  if (!command) {
    return `Error: Application "${appName}" is not in the allowed list of safe applications.`;
  }

  return new Promise((resolve) => {
    exec(command, (error) => {
      if (error) {
        console.error(`[TOOL ERROR] Failed to launch ${appName}:`, error.message);
        resolve(`Failed to open ${appName}: ${error.message}`);
      } else {
        console.log(`[TOOL RESULT] Successfully launched ${appName}`);
        resolve(`Successfully opened ${appName}.`);
      }
    });
  });
}

function executeOpenUrl(targetUrl) {
  console.log(`[TOOL CALL] open_url -> URL: "${targetUrl}"`);
  if (!/^https?:\/\/[^\s$.?#].[^\s]*$/i.test(targetUrl)) {
    return "Error: Invalid URL format. URL must start with http:// or https:// and be well-formed.";
  }

  const escapedUrl = targetUrl.replace(/"/g, '\\"');
  return new Promise((resolve) => {
    exec(`start "" "${escapedUrl}"`, (error) => {
      if (error) {
        console.error(`[TOOL ERROR] Failed to open URL:`, error.message);
        resolve(`Failed to open URL: ${error.message}`);
      } else {
        console.log(`[TOOL RESULT] Successfully opened URL`);
        resolve(`Successfully opened URL: ${targetUrl}`);
      }
    });
  });
}

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

    // Build system instructions
    let systemContent = 'You are Dhiman, a knowledgeable, supportive, and highly capable AI assistant for Aditya. You can help him with anything he asks, including technical concepts, general knowledge, daily planning, coding, and creative tasks. Answer clearly and use long-term memory context when available.';
    if (memoryFacts.length > 0) {
      systemContent += '\n\nLong-term memory context:\n' + memoryFacts.map((fact, index) => `${index + 1}. ${fact.fact}`).join('\n');
    }

    // Format history for OpenRouter (Gemini) tool calling loop
    const apiMessages = [
      { role: "system", content: systemContent },
      ...recentMessages.map((msg) => {
        if (msg.content && typeof msg.content === 'object') {
          if (msg.content.tool_calls) {
            return {
              role: msg.role,
              content: msg.content.content || null,
              tool_calls: msg.content.tool_calls
            };
          }
          if (msg.content.tool_use_id) {
            return {
              role: "tool",
              tool_call_id: msg.content.tool_use_id,
              name: msg.content.name,
              content: msg.content.content
            };
          }
          return { role: msg.role, content: JSON.stringify(msg.content) };
        }
        return { role: msg.role, content: msg.content };
      })
    ];

    let loopCount = 0;
    let keepRunning = true;
    let finalResponseText = '';

    while (keepRunning && loopCount < 5) {
      loopCount++;
      console.log(`[OPENROUTER LOOP] Requesting completions (Turn ${loopCount})...`);

      const modelMessage = await callOpenRouter(apiMessages);

      // Append assistant response to query array
      apiMessages.push(modelMessage);

      // Save assistant response to DB
      await db.saveMessage(activeConversationId, 'assistant', {
        content: modelMessage.content || '',
        tool_calls: modelMessage.tool_calls
      });

      if (modelMessage.tool_calls && modelMessage.tool_calls.length > 0) {
        for (const toolCall of modelMessage.tool_calls) {
          const { id: toolCallId, function: fn } = toolCall;
          const toolName = fn.name;
          const toolArgs = JSON.parse(fn.arguments || '{}');

          console.log(`[OPENROUTER LOOP] Executing tool: "${toolName}" with arguments: ${JSON.stringify(toolArgs)}`);

          let resultText = '';
          if (toolName === 'get_current_datetime') {
            resultText = getCurrentDateTime();
          } else if (toolName === 'web_search') {
            resultText = await executeWebSearch(toolArgs.query);
          } else if (toolName === 'open_system_app') {
            resultText = await executeOpenSystemApp(toolArgs.app_name);
          } else if (toolName === 'open_url') {
            resultText = await executeOpenUrl(toolArgs.url);
          } else if (toolName === 'run_terminal_command') {
            resultText = "Error: Running terminal commands requires interactive approval. Please use the WebSocket chat connection (the speech/live-link feature) to trigger and approve command execution.";
          } else {
            resultText = `Error: Unknown tool "${toolName}"`;
          }

          // Append tool response to query array
          apiMessages.push({
            role: "tool",
            tool_call_id: toolCallId,
            name: toolName,
            content: resultText
          });

          // Save tool result to DB
          await db.saveMessage(activeConversationId, 'tool', {
            tool_use_id: toolCallId,
            name: toolName,
            content: resultText
          });
        }
      } else {
        keepRunning = false;
        finalResponseText = modelMessage.content || '';
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