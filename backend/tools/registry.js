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

module.exports = {
  registerTool,
  getAllTools,
  getTool,
  getLLMToolDefinitions
};
