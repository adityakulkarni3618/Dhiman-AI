const db = require('./db');
const ai = require('./services/ai');
const { anthropic } = require('./services/ai');

// Tools specifications compatible with Claude Tool Use API
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
  console.log(`[SOCKET TOOL CALL] get_current_datetime -> ${dt}`);
  return dt;
}

async function executeWebSearch(query) {
  console.log(`[SOCKET TOOL CALL] web_search -> Query: "${query}"`);
  if (!process.env.TAVILY_API_KEY) {
    console.error("[SOCKET TOOL ERROR] Tavily API Key is missing.");
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
    console.log(`[SOCKET TOOL RESULT] web_search -> Returned ${data.results?.length || 0} results.`);
    return output;
  } catch (error) {
    console.error("[SOCKET TOOL ERROR] Web search execution failed:", error.message);
    return `Search failed: ${error.message}`;
  }
}

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log('⚡ Dhiman Neural Link Securely Established');

    socket.on('solve-doubt', async (data) => {
      // Standardize input format (handling either raw string or object)
      const userInput = typeof data === 'string' ? data : data.message;
      const conversationId = typeof data === 'object' ? data.conversationId : null;

      console.log(`📡 Inbound Query: "${userInput}" in conversation "${conversationId}"`);
      socket.emit('state-change', { state: 'thinking' });

      try {
        if (!anthropic) {
          throw new Error("Anthropic client is not initialized. Please configure ANTHROPIC_API_KEY in your .env vault.");
        }

        // 1. Get or create database conversation reference
        const activeConversationId = await db.getOrCreateConversation(conversationId, userInput);
        
        // 2. Save incoming user message
        await db.saveMessage(activeConversationId, 'user', userInput);

        // 3. Fetch history and memories
        const recentMessages = await db.getRecentMessages(activeConversationId, 12);
        
        // Get query embedding and fetch memory facts
        let memoryFacts = [];
        try {
          const queryEmbedding = await ai.getEmbedding(userInput);
          if (queryEmbedding) {
            memoryFacts = await db.fetchRelevantMemoryFacts(queryEmbedding, 4);
          }
        } catch (embError) {
          console.warn('Memory search skipped: failed to generate query embedding', embError.message);
        }

        // 4. Build system instructions
        let systemPrompt = "You are Dhiman, a knowledgeable, supportive, and highly capable AI assistant for Aditya. You can help him with anything he asks, including technical concepts, general knowledge, daily planning, coding, and creative tasks. Adapt your tone and response style to match the topic he introduces, and answer clearly and helpfully.";
        if (memoryFacts.length > 0) {
          systemPrompt += "\n\nLong-term memory context:\n" + memoryFacts.map((fact, index) => `${index + 1}. ${fact.fact}`).join('\n');
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

        let loopGuard = 0;
        let keepProcessing = true;
        let finalResponseText = '';

        while (keepProcessing && loopGuard < 5) {
          loopGuard++;
          console.log(`[SOCKET CLAUDE LOOP] Requesting Claude completions (Turn ${loopGuard})...`);

          const response = await anthropic.messages.create({
            model: "claude-3-5-sonnet-latest",
            max_tokens: 1024,
            system: systemPrompt,
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
              console.log(`[SOCKET CLAUDE LOOP] Executing tool: "${toolName}" with arguments: ${JSON.stringify(toolInput)}`);

              // Emit tool-status 'running' event to frontend to log in console
              socket.emit('tool-status', { status: 'running', name: toolName, args: toolInput });

              let resultText = '';
              if (toolName === 'get_current_datetime') {
                resultText = getCurrentDateTime();
              } else if (toolName === 'web_search') {
                resultText = await executeWebSearch(toolInput.query);
              } else {
                resultText = `Error: Unknown tool "${toolName}"`;
              }

              // Emit tool-status 'completed' event to frontend
              socket.emit('tool-status', { status: 'completed', name: toolName, result: resultText });

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
            keepProcessing = false;
            const textBlock = response.content.find(block => block.type === 'text');
            finalResponseText = textBlock ? textBlock.text : '';

            socket.emit('state-change', { state: 'speaking' });
            socket.emit('dhiman-reply', { text: finalResponseText, conversationId: activeConversationId });
          }
        }

      } catch (error) {
        console.error("❌ Detailed Pipeline Processing Failure:", error);
        socket.emit('state-change', { state: 'idle' });
        socket.emit('dhiman-reply', { 
          text: `⚠️ Dhiman Core Pipeline Failure:\n\n${error.message || "Network handshake interruption."}\n\nCheck your configuration parameters and network connection.` 
        });
      }
    });

    socket.on('disconnect', () => {
      console.log('🔌 Neural Link Severed');
    });
  });
}

module.exports = registerSocketHandlers;
