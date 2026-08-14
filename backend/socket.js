const db = require('./db');
const ai = require('./services/ai');
const config = require('./config');

// Tools specifications compatible with OpenRouter (OpenAI-compatible) API
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

const { exec } = require('child_process');

function executeOpenSystemApp(appName) {
  console.log(`[SOCKET TOOL CALL] open_system_app -> App: "${appName}"`);
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
        console.error(`[SOCKET TOOL ERROR] Failed to launch ${appName}:`, error.message);
        resolve(`Failed to open ${appName}: ${error.message}`);
      } else {
        console.log(`[SOCKET TOOL RESULT] Successfully launched ${appName}`);
        resolve(`Successfully opened ${appName}.`);
      }
    });
  });
}

function executeOpenUrl(targetUrl) {
  console.log(`[SOCKET TOOL CALL] open_url -> URL: "${targetUrl}"`);
  if (!/^https?:\/\/[^\s$.?#].[^\s]*$/i.test(targetUrl)) {
    return "Error: Invalid URL format. URL must start with http:// or https:// and be well-formed.";
  }

  const escapedUrl = targetUrl.replace(/"/g, '\\"');
  return new Promise((resolve) => {
    exec(`start "" "${escapedUrl}"`, (error) => {
      if (error) {
        console.error(`[SOCKET TOOL ERROR] Failed to open URL:`, error.message);
        resolve(`Failed to open URL: ${error.message}`);
      } else {
        console.log(`[SOCKET TOOL RESULT] Successfully opened URL`);
        resolve(`Successfully opened URL: ${targetUrl}`);
      }
    });
  });
}

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log('⚡ Dhiman Neural Link Securely Established');

    socket.on('solve-doubt', async (data) => {
      const userInput = typeof data === 'string' ? data : data.message;
      const conversationId = typeof data === 'object' ? data.conversationId : null;

      console.log(`📡 Inbound Query: "${userInput}" in conversation "${conversationId}"`);
      socket.emit('state-change', { state: 'thinking' });

      try {
        const activeConversationId = await db.getOrCreateConversation(conversationId, userInput);
        await db.saveMessage(activeConversationId, 'user', userInput);

        const recentMessages = await db.getRecentMessages(activeConversationId, 12);
        
        let memoryFacts = [];
        try {
          const queryEmbedding = await ai.getEmbedding(userInput);
          if (queryEmbedding) {
            memoryFacts = await db.fetchRelevantMemoryFacts(queryEmbedding, 4);
          }
        } catch (embError) {
          console.warn('Memory search skipped: failed to generate query embedding', embError.message);
        }

        let systemPrompt = "You are Dhiman, a knowledgeable, supportive, and highly capable AI assistant for Aditya. You can help him with anything he asks, including technical concepts, general knowledge, daily planning, coding, and creative tasks. Adapt your tone and response style to match the topic he introduces, and answer clearly and helpfully.";
        if (memoryFacts.length > 0) {
          systemPrompt += "\n\nLong-term memory context:\n" + memoryFacts.map((fact, index) => `${index + 1}. ${fact.fact}`).join('\n');
        }

        // Format history for OpenRouter (Gemini) tool calling loop
        const apiMessages = [
          { role: "system", content: systemPrompt },
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

        let loopGuard = 0;
        let keepProcessing = true;
        let finalResponseText = '';

        while (keepProcessing && loopGuard < 5) {
          loopGuard++;
          console.log(`[SOCKET OPENROUTER LOOP] Requesting completions (Turn ${loopGuard})...`);

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

              console.log(`[SOCKET OPENROUTER LOOP] Executing tool: "${toolName}" with arguments: ${JSON.stringify(toolArgs)}`);
              socket.emit('tool-status', { status: 'running', name: toolName, args: toolArgs });

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
                const command = toolArgs.command;
                resultText = await new Promise((resolve) => {
                  const approvalId = Math.random().toString(36).substring(2, 9);
                  console.log(`[SOCKET TOOL APPROVAL] Requesting approval for command: "${command}" (ID: ${approvalId})`);
                  
                  socket.emit('request-command-approval', { command, id: approvalId });
                  
                  // Setup temporary listener
                  const responseHandler = (response) => {
                    if (response && response.id === approvalId) {
                      socket.off('command-approval-response', responseHandler);
                      if (response.approved) {
                        console.log(`[SOCKET TOOL APPROVAL] Command APPROVED: "${command}"`);
                        exec(command, (error, stdout, stderr) => {
                          const output = (stdout || '') + (stderr || '');
                          if (error) {
                            resolve(`Command failed with exit code ${error.code}. Output:\n${output}`);
                          } else {
                            resolve(output || 'Command executed successfully with no output.');
                          }
                        });
                      } else {
                        console.log(`[SOCKET TOOL APPROVAL] Command DENIED: "${command}"`);
                        resolve('Error: Execution denied by user.');
                      }
                    }
                  };
                  socket.on('command-approval-response', responseHandler);
                });
              } else {
                resultText = `Error: Unknown tool "${toolName}"`;
              }

              socket.emit('tool-status', { status: 'completed', name: toolName, result: resultText });

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
            keepProcessing = false;
            finalResponseText = modelMessage.content || '';

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
