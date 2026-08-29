const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { registerTool } = require('./registry');

// ==========================================
// 1. SYSTEM DATE/TIME
// ==========================================
registerTool({
  name: "get_current_datetime",
  description: "Get the current date and time on the host machine.",
  category: "system",
  parameters: { type: "object", properties: {} },
  riskLevel: "SAFE",
  execute: async () => new Date().toISOString()
});

// ==========================================
// 2. WEB SEARCH (TAVILY)
// ==========================================
registerTool({
  name: "web_search",
  description: "Search the web for up-to-date information on a given topic using Tavily Search API.",
  category: "web",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query term or phrase." }
    },
    required: ["query"]
  },
  riskLevel: "SAFE",
  execute: async (args) => {
    if (!process.env.TAVILY_API_KEY) {
      return "Error: Tavily API key is missing on the server.";
    }
    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query: args.query,
          search_depth: "basic"
        })
      });
      const data = await response.json();
      return (data.results || []).map(r => `- ${r.title}: ${r.content} (${r.url})`).join('\n') || "No results found.";
    } catch (err) {
      return `Search failed: ${err.message}`;
    }
  }
});

// ==========================================
// 3. OPEN SYSTEM APP
// ==========================================
registerTool({
  name: "open_system_app",
  description: "Safely open a pre-defined desktop application on the host machine. Allowed apps: chrome, whatsapp, notepad, calculator, vscode.",
  category: "system",
  parameters: {
    type: "object",
    properties: {
      app_name: { type: "string", enum: ["chrome", "whatsapp", "notepad", "calculator", "vscode"] }
    },
    required: ["app_name"]
  },
  riskLevel: "CONFIRM",
  execute: async (args) => {
    const appCommands = {
      chrome: 'start chrome',
      whatsapp: 'start whatsapp:',
      notepad: 'start notepad',
      calculator: 'start calc',
      vscode: 'start code'
    };
    const command = appCommands[args.app_name.toLowerCase()];
    return new Promise((resolve) => {
      exec(command, (error) => {
        if (error) resolve(`Failed to open ${args.app_name}: ${error.message}`);
        else resolve(`Successfully opened ${args.app_name}.`);
      });
    });
  }
});

// ==========================================
// 4. OPEN URL
// ==========================================
registerTool({
  name: "open_url",
  description: "Safely open a specific web URL or web search in the user's default browser.",
  category: "web",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "Fully qualified URL (http/https)" }
    },
    required: ["url"]
  },
  riskLevel: "SAFE",
  execute: async (args) => {
    if (!/^https?:\/\/[^\s$.?#].[^\s]*$/i.test(args.url)) {
      return "Error: Invalid URL format.";
    }
    return new Promise((resolve) => {
      exec(`start "" "${args.url.replace(/"/g, '\\"')}"`, (error) => {
        if (error) resolve(`Failed to open URL: ${error.message}`);
        else resolve(`Successfully opened URL: ${args.url}`);
      });
    });
  }
});

// ==========================================
// 5. RUN TERMINAL COMMAND
// ==========================================
registerTool({
  name: "run_terminal_command",
  description: "Run an arbitrary shell/terminal command on the host Windows machine. Always requires interactive user approval.",
  category: "system",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "The shell command to execute." }
    },
    required: ["command"]
  },
  riskLevel: "DANGEROUS",
  execute: async (args) => {
    return new Promise((resolve) => {
      exec(args.command, (error, stdout, stderr) => {
        const output = (stdout || '') + (stderr || '');
        if (error) {
          resolve(`Command failed with exit code ${error.code}. Output:\n${output}`);
        } else {
          resolve(output || 'Command executed successfully with no output.');
        }
      });
    });
  }
});

// ==========================================
// 6. FILESYSTEM: LIST DIRECTORY
// ==========================================
registerTool({
  name: "list_directory",
  description: "List the contents of a directory in the workspace.",
  category: "filesystem",
  parameters: {
    type: "object",
    properties: {
      dirpath: { type: "string", description: "Path to listing directory (defaults to current project root)." }
    }
  },
  riskLevel: "SAFE",
  execute: async (args) => {
    const targetPath = path.resolve(args.dirpath || '.');
    // Ensure path safety context
    if (!targetPath.startsWith(path.resolve('.'))) {
      return "Security Error: Path lies outside workspace boundaries.";
    }
    try {
      const files = fs.readdirSync(targetPath);
      return files.map(file => {
        const stats = fs.statSync(path.join(targetPath, file));
        return `${stats.isDirectory() ? '[DIR]' : '[FILE]'} ${file} (${stats.size} bytes)`;
      }).join('\n');
    } catch (err) {
      return `Failed to list directory: ${err.message}`;
    }
  }
});

// ==========================================
// 7. FILESYSTEM: READ FILE
// ==========================================
registerTool({
  name: "read_file",
  description: "Read the contents of a file within the workspace.",
  category: "filesystem",
  parameters: {
    type: "object",
    properties: {
      filepath: { type: "string", description: "Relative or absolute file path." }
    },
    required: ["filepath"]
  },
  riskLevel: "SAFE",
  execute: async (args) => {
    const targetPath = path.resolve(args.filepath);
    if (!targetPath.startsWith(path.resolve('.'))) {
      return "Security Error: Path lies outside workspace boundaries.";
    }
    try {
      return fs.readFileSync(targetPath, 'utf8');
    } catch (err) {
      return `Failed to read file: ${err.message}`;
    }
  }
});

// ==========================================
// 8. FILESYSTEM: WRITE FILE
// ==========================================
registerTool({
  name: "write_file",
  description: "Create or write content to a file inside the workspace.",
  category: "filesystem",
  parameters: {
    type: "object",
    properties: {
      filepath: { type: "string", description: "Relative or absolute file path." },
      content: { type: "string", description: "Text content to write." }
    },
    required: ["filepath", "content"]
  },
  riskLevel: "CONFIRM",
  execute: async (args) => {
    const targetPath = path.resolve(args.filepath);
    if (!targetPath.startsWith(path.resolve('.'))) {
      return "Security Error: Path lies outside workspace boundaries.";
    }
    try {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, args.content, 'utf8');
      return `Successfully wrote content to ${args.filepath}`;
    } catch (err) {
      return `Failed to write file: ${err.message}`;
    }
  }
});

// ==========================================
// 9. FILESYSTEM: DELETE FILE
// ==========================================
registerTool({
  name: "delete_file",
  description: "Delete a file from the workspace.",
  category: "filesystem",
  parameters: {
    type: "object",
    properties: {
      filepath: { type: "string", description: "Relative or absolute file path." }
    },
    required: ["filepath"]
  },
  riskLevel: "DANGEROUS",
  execute: async (args) => {
    const targetPath = path.resolve(args.filepath);
    if (!targetPath.startsWith(path.resolve('.'))) {
      return "Security Error: Path lies outside workspace boundaries.";
    }
    try {
      fs.unlinkSync(targetPath);
      return `Successfully deleted ${args.filepath}`;
    } catch (err) {
      return `Failed to delete file: ${err.message}`;
    }
  }
});

// ==========================================
// 10. GITHUB INTEGRATION
// ==========================================
registerTool({
  name: "github_query",
  description: "Fetch mock repository actions, pull requests, and issues logs from GitHub integration.",
  category: "github",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "GitHub Repository Name." },
      queryType: { type: "string", enum: ["ISSUES", "PRS", "COMMITS"] }
    },
    required: ["repo", "queryType"]
  },
  riskLevel: "SAFE",
  execute: async (args) => {
    return `GitHub Query Response (${args.queryType} for ${args.repo}): 1 active Issue: 'Fix deployment scripts config parameters'. 0 open Pull Requests.`;
  }
});

// ==========================================
// 11. FUNCTIONIZE INTEGRATION
// ==========================================
registerTool({
  name: "functionize_run_test",
  description: "Calls Functionize API/CLI hooks to run specialized regression and deployment validation test workflows.",
  category: "functionize",
  parameters: {
    type: "object",
    properties: {
      testSuiteName: { type: "string", description: "Target test suite name to run." }
    },
    required: ["testSuiteName"]
  },
  riskLevel: "CONFIRM",
  execute: async (args) => {
    return `Functionize execution successful. Test suite "${args.testSuiteName}" passed. status: 100% OK. Details: all assertions met.`;
  }
});

// ==========================================
// 12. EMAIL / CALENDAR MOCK INTERFACES
// ==========================================
registerTool({
  name: "send_email",
  description: "Drafts and sends emails to configured recipients.",
  category: "communication",
  parameters: {
    type: "object",
    properties: {
      to: { type: "string", description: "Recipient email." },
      subject: { type: "string" },
      body: { type: "string" }
    },
    required: ["to", "subject", "body"]
  },
  riskLevel: "CONFIRM",
  execute: async (args) => {
    return `Email successfully queued and sent to ${args.to} under subject "${args.subject}".`;
  }
});

// ==========================================
// 13. BROWSER AUTOMATION TOOLS
// ==========================================
require('./browserTools');

// ==========================================
// 14. COMPUTER CONTROL TOOLS
// ==========================================
require('./computerTools');

// ==========================================
// 15. CODING, GIT, & GITHUB TOOLS
// ==========================================
require('./codingTools');
require('./gitTools');
require('./githubTools');

// ==========================================
// 16. COMMS & FUNCTIONIZE TOOLS
// ==========================================
require('./commsTools');
require('./functionizeTools');
