const registry = {};

/**
 * Register a tool into the global registry.
 * @param {Object} toolConfig
 * @param {string} toolConfig.name
 * @param {string} toolConfig.description
 * @param {string} toolConfig.category
 * @param {Object} toolConfig.parameters
 * @param {string} toolConfig.riskLevel - 'SAFE', 'CONFIRM', 'DANGEROUS', 'BLOCKED'
 * @param {Function} toolConfig.execute
 */
function registerTool(toolConfig) {
  if (!toolConfig.name) {
    throw new Error("Tool name is required for registration.");
  }
  registry[toolConfig.name] = {
    ...toolConfig,
    requiresApproval: ['CONFIRM', 'DANGEROUS'].includes(toolConfig.riskLevel)
  };
}

/**
 * Get all registered tools.
 */
function getAllTools() {
  return Object.values(registry);
}

/**
 * Get a tool by name.
 */
function getTool(name) {
  return registry[name];
}

/**
 * Formats registered tools into the format required for LLM tool calling (OpenAI structure).
 */
function getLLMToolDefinitions() {
  return Object.values(registry)
    .filter(t => t.riskLevel !== 'BLOCKED')
    .map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));
}

/**
 * Filter tool definitions based on user objective keywords.
 */
function getLLMToolDefinitionsFiltered(goal = '') {
  const query = goal.toLowerCase();
  const allTools = Object.values(registry).filter(t => t.riskLevel !== 'BLOCKED');

  let categories = new Set(['system', 'filesystem', 'web']); // Default baseline categories

  if (/\b(git|github|pr|commit|push|repo|checkout|branch|merge)\b/.test(query)) {
    categories.add('github');
    categories.add('coding');
  }
  if (/\b(mail|email|send|message|subject|draft)\b/.test(query)) {
    categories.add('communication');
  }
  if (/\b(browser|google|page|web|search|website|url|click|type)\b/.test(query)) {
    categories.add('browser');
    categories.add('web');
  }
  if (/\b(screen|window|mouse|keyboard|click|type|notepad|calc|chrome|code|app)\b/.test(query)) {
    categories.add('computer');
    categories.add('system');
  }
  if (/\b(test|functionize|regression|assert)\b/.test(query)) {
    categories.add('functionize');
    categories.add('browser');
  }

  // Filter tools belonging to the matched categories
  const filtered = allTools.filter(t => categories.has(t.category) || t.category === 'system');
  
  // Fallback to all tools if none matched
  const finalTools = filtered.length > 0 ? filtered : allTools;

  return finalTools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  }));
}

module.exports = {
  registerTool,
  getAllTools,
  getTool,
  getLLMToolDefinitions,
  getLLMToolDefinitionsFiltered
};
