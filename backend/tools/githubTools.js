const config = require('../config');
const { registerTool } = require('./registry');

async function callGitHubAPI(endpoint, method = 'GET', body = null) {
  if (!config.githubToken) {
    throw new Error("GitHub integration token missing. Please configure GITHUB_TOKEN in your environment.");
  }
  
  const headers = {
    "Authorization": `token ${config.githubToken}`,
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "Dhiman-AI"
  };

  const response = await fetch(`https://api.github.com/${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const errorDetails = await response.text();
    throw new Error(`GitHub API request failed: ${response.status} - ${errorDetails}`);
  }

  return await response.json();
}

// ==========================================
// 1. GITHUB_GET_ISSUES
// ==========================================
registerTool({
  name: "github_get_issues",
  description: "Retrieve a list of active issues in the target repository.",
  category: "github",
  parameters: {
    type: "object",
    properties: {
      repoOwner: { type: "string" },
      repoName: { type: "string" }
    },
    required: ["repoOwner", "repoName"]
  },
  riskLevel: "SAFE",
  execute: async (args) => {
    try {
      const data = await callGitHubAPI(`repos/${args.repoOwner}/${args.repoName}/issues`);
      return (data || []).map(i => `#${i.number}: ${i.title} (State: ${i.state})`).join('\n') || "No issues found.";
    } catch (err) {
      return `Failed to fetch issues: ${err.message}`;
    }
  }
});

// ==========================================
// 2. GITHUB_GET_PRS
// ==========================================
registerTool({
  name: "github_get_prs",
  description: "Retrieve pull requests in the target repository.",
  category: "github",
  parameters: {
    type: "object",
    properties: {
      repoOwner: { type: "string" },
      repoName: { type: "string" }
    },
    required: ["repoOwner", "repoName"]
  },
  riskLevel: "SAFE",
  execute: async (args) => {
    try {
      const data = await callGitHubAPI(`repos/${args.repoOwner}/${args.repoName}/pulls`);
      return (data || []).map(p => `#${p.number}: ${p.title} (Author: ${p.user?.login})`).join('\n') || "No pull requests found.";
    } catch (err) {
      return `Failed to fetch PRs: ${err.message}`;
    }
  }
});

// ==========================================
// 3. GITHUB_CREATE_ISSUE
// ==========================================
registerTool({
  name: "github_create_issue",
  description: "Creates a new issue inside the specified repository.",
  category: "github",
  parameters: {
    type: "object",
    properties: {
      repoOwner: { type: "string" },
      repoName: { type: "string" },
      title: { type: "string" },
      body: { type: "string" }
    },
    required: ["repoOwner", "repoName", "title"]
  },
  riskLevel: "CONFIRM",
  execute: async (args) => {
    try {
      const body = { title: args.title, body: args.body || '' };
      const data = await callGitHubAPI(`repos/${args.repoOwner}/${args.repoName}/issues`, 'POST', body);
      return `Successfully created issue #${data.number}: ${data.title} (Link: ${data.html_url})`;
    } catch (err) {
      return `Failed to create issue: ${err.message}`;
    }
  }
});
