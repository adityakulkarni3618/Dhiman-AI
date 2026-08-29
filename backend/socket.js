const db = require('./db');
const ai = require('./services/ai');
const config = require('./config');
const taskManager = require('./agent/taskManager');
const { runTask } = require('./agent/agentRuntime');
const Approval = require('./models/Approval');

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
        
        // 1. Classify Intent via AssistantRouter
        const { classifyIntent, handleChatResponse } = require('./agent/assistantRouter');
        const intent = await classifyIntent(userInput, recentMessages);
        console.log(`[ASSISTANT ROUTER] Classified query intent as: "${intent}" for request: "${userInput}"`);

        if (intent === 'CHAT') {
          const chatReply = await handleChatResponse(userInput, recentMessages);
          await db.saveMessage(activeConversationId, 'assistant', { content: chatReply });
          socket.emit('state-change', { state: 'speaking' });
          socket.emit('dhiman-reply', { text: chatReply, conversationId: activeConversationId });
          return;
        }

        // 2. Create a task session via GoalManager
        const goalManager = require('./agent/goalManager');
        const goalObj = await goalManager.createGoal(userInput, { priority: 'MEDIUM', conversationId: activeConversationId });
        const task = await taskManager.getTask(goalObj.goalId);
        
        // 2. Setup interactive socket approval callback
        const requestApproval = async (toolName, args) => {
          return new Promise(async (resolve) => {
            const approvalId = Math.random().toString(36).substring(2, 9);
            const approvalObj = await Approval.create({
              taskId: task._id,
              actionType: toolName,
              commandOrAction: args.command || args.filepath || JSON.stringify(args),
              status: 'PENDING'
            });

            console.log(`[SOCKET TOOL APPROVAL] Requesting approval for "${toolName}" (ID: ${approvalId})`);
            socket.emit('request-command-approval', {
              id: approvalId,
              command: `${toolName}: ${JSON.stringify(args)}`
            });

            const handler = (response) => {
              if (response && response.id === approvalId) {
                socket.off('command-approval-response', handler);
                approvalObj.status = response.approved ? 'APPROVED' : 'REJECTED';
                approvalObj.save().then(() => {
                  resolve(response.approved);
                });
              }
            };
            socket.on('command-approval-response', handler);
          });
        };

        // 3. Execute Task Runtime
        const resultText = await runTask(task._id.toString(), {
          history: recentMessages,
          requestApproval,
          onUpdate: (update) => {
            // Stream updates to frontend UI
            socket.emit('task-update', {
              taskId: task._id.toString(),
              ...update
            });
            if (update.status) {
              let state = 'thinking';
              if (update.status === 'COMPLETED') state = 'speaking';
              if (update.status === 'FAILED') state = 'idle';
              socket.emit('state-change', { state });
            }
            if (update.tool) {
              socket.emit('tool-status', {
                status: 'running',
                name: update.tool,
                args: update.args || {}
              });
            }
          }
        });

        // Format user-facing responses using execution evidence
        const TaskStep = require('./models/TaskStep');
        const updatedTask = await require('./models/Task').findById(task._id);
        const steps = await TaskStep.find({ taskId: task._id }).sort({ stepIndex: 1 });
        
        const { formatResponse } = require('./agent/responseFormatter');
        const naturalReply = formatResponse(updatedTask, steps);

        // Save assistant response to DB
        await db.saveMessage(activeConversationId, 'assistant', {
          content: naturalReply
        });

        socket.emit('state-change', { state: 'speaking' });
        socket.emit('dhiman-reply', { text: naturalReply, conversationId: activeConversationId });

      } catch (error) {
        console.error("❌ Socket agent execution failed:", error);
        socket.emit('state-change', { state: 'idle' });
        socket.emit('dhiman-reply', { 
          text: `⚠️ Dhiman Core Execution Failure:\n\n${error.message}` 
        });
      }
    });

    socket.on('disconnect', () => {
      console.log('🔌 Neural Link Severed');
    });
  });
}

module.exports = registerSocketHandlers;
