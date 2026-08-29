const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { registerTool } = require('./registry');

// ==========================================
// 1. CODING_GREP_SEARCH
// ==========================================
registerTool({
  name: "coding_grep_search",
  description: "Search workspace files for matching query terms.",
  category: "coding",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query text." }
    },
    required: ["query"]
  },
  riskLevel: "SAFE",
  execute: async (args) => {
    // Native recursive search via node
    const filesList = [];
    function searchDir(dir) {
      const list = fs.readdirSync(dir);
      list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
          if (file !== 'node_modules' && file !== '.git') {
            searchDir(fullPath);
          }
        } else {
          filesList.push(fullPath);
        }
      });
    }
    try {
      searchDir(path.resolve('.'));
      const matches = [];
      filesList.forEach(file => {
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes(args.query)) {
          matches.push(path.relative(path.resolve('.'), file));
        }
      });
      return matches.length > 0 ? `Matches found in files:\n${matches.join('\n')}` : "No matches found.";
    } catch (err) {
      return `Search failed: ${err.message}`;
    }
  }
});

// ==========================================
// 2. CODING_PATCH_FILE
// ==========================================
registerTool({
  name: "coding_patch_file",
  description: "Replaces a specific block of text in a file with modified code content.",
  category: "coding",
  parameters: {
    type: "object",
    properties: {
      filepath: { type: "string" },
      targetText: { type: "string", description: "The EXACT text block to replace." },
      replacementText: { type: "string", description: "The new content to drop in." }
    },
    required: ["filepath", "targetText", "replacementText"]
  },
  riskLevel: "CONFIRM",
  execute: async (args) => {
    const fullPath = path.resolve(args.filepath);
    if (!fullPath.startsWith(path.resolve('.'))) {
      return "Security Error: Path lies outside workspace.";
    }
    if (!fs.existsSync(fullPath)) {
      return `Error: File not found at "${args.filepath}"`;
    }
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (!content.includes(args.targetText)) {
        return `Error: Could not locate the exact target text block in "${args.filepath}" for patching.`;
      }
      const updated = content.replace(args.targetText, args.replacementText);
      fs.writeFileSync(fullPath, updated, 'utf8');
      return `Successfully patched file: ${args.filepath}`;
    } catch (err) {
      return `Patch failed: ${err.message}`;
    }
  }
});

// ==========================================
// 3. CODING_RUN_TESTS
// ==========================================
registerTool({
  name: "coding_run_tests",
  description: "Runs the project unit test suite using npm test commands.",
  category: "coding",
  parameters: { type: "object", properties: {} },
  riskLevel: "CONFIRM",
  execute: async () => {
    return new Promise((resolve) => {
      exec("npm test", (error, stdout, stderr) => {
        resolve(`Test Output:\n${stdout || ''}\n${stderr || ''}`);
      });
    });
  }
});

// ==========================================
// 4. CODING_RUN_BUILD
// ==========================================
registerTool({
  name: "coding_run_build",
  description: "Compiles the active project workspace layout using npm run build commands.",
  category: "coding",
  parameters: { type: "object", properties: {} },
  riskLevel: "CONFIRM",
  execute: async () => {
    return new Promise((resolve) => {
      exec("npm run build", (error, stdout, stderr) => {
        resolve(`Build Output:\n${stdout || ''}\n${stderr || ''}`);
      });
    });
  }
});
