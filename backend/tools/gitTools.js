const { exec } = require('child_process');
const { registerTool } = require('./registry');

function runGitCmd(cmd) {
  return new Promise((resolve) => {
    exec(cmd, (error, stdout, stderr) => {
      resolve((stdout || '') + (stderr || ''));
    });
  });
}

// ==========================================
// 1. GIT_STATUS
// ==========================================
registerTool({
  name: "git_status",
  description: "Check the local git workspace status and changes.",
  category: "github",
  parameters: { type: "object", properties: {} },
  riskLevel: "SAFE",
  execute: async () => runGitCmd("git status")
});

// ==========================================
// 2. GIT_DIFF
// ==========================================
registerTool({
  name: "git_diff",
  description: "View local unstaged changes or differences against remote.",
  category: "github",
  parameters: { type: "object", properties: {} },
  riskLevel: "SAFE",
  execute: async () => runGitCmd("git diff")
});

// ==========================================
// 3. GIT_LOG
// ==========================================
registerTool({
  name: "git_log",
  description: "Inspect recent commit history logs.",
  category: "github",
  parameters: {
    type: "object",
    properties: {
      limit: { type: "number", default: 5 }
    }
  },
  riskLevel: "SAFE",
  execute: async (args) => runGitCmd(`git log -n ${args.limit || 5} --oneline`)
});

// ==========================================
// 4. GIT_COMMIT
// ==========================================
registerTool({
  name: "git_commit",
  description: "Stages changes and commits them with a structured message.",
  category: "github",
  parameters: {
    type: "object",
    properties: {
      message: { type: "string", description: "Structured commit message." }
    },
    required: ["message"]
  },
  riskLevel: "CONFIRM",
  execute: async (args) => {
    const escapedMessage = args.message.replace(/"/g, '\\"');
    return runGitCmd(`git add .; git commit -m "${escapedMessage}"`);
  }
});

// ==========================================
// 5. GIT_PUSH
// ==========================================
registerTool({
  name: "git_push",
  description: "Pushes local commits to the remote branch origin.",
  category: "github",
  parameters: {
    type: "object",
    properties: {
      branch: { type: "string", default: "main" }
    }
  },
  riskLevel: "CONFIRM",
  execute: async (args) => runGitCmd(`git push origin ${args.branch || 'main'}`)
});

// ==========================================
// 6. GIT_CHECKOUT
// ==========================================
registerTool({
  name: "git_checkout",
  description: "Switches current active branches or checks out files.",
  category: "github",
  parameters: {
    type: "object",
    properties: {
      branch: { type: "string" }
    },
    required: ["branch"]
  },
  riskLevel: "CONFIRM",
  execute: async (args) => runGitCmd(`git checkout ${args.branch}`)
});
