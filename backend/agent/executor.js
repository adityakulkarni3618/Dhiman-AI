const { getTool } = require('../tools/registry');
const { checkPermission } = require('../security/permissionManager');

/**
 * Executes a single tool action.
 * @param {Object} action - { tool: string, args: Object }
 * @param {Object} context - Optional run context (e.g. taskId, socket instance for approval flow)
 * @returns {Promise<Object>} Observation result: { success: boolean, output: string, error: string }
 */
async function executeAction(action, context = {}) {
  const { tool: toolName, args } = action;

  if (!toolName) {
    return {
      success: true,
      output: "No tool specified. Processing cognitive step directly.",
      error: ""
    };
  }

  const tool = getTool(toolName);
  if (!tool) {
    return {
      success: false,
      output: "",
      error: `Error: Unknown or unregistered tool "${toolName}"`
    };
  }

  // Check permission
  const check = checkPermission(toolName, args);
  if (check === 'BLOCK') {
    return {
      success: false,
      output: "",
      error: `Security Error: Command or tool execution was BLOCKED by the security engine.`
    };
  }

  if (check === 'CONFIRM') {
    // If confirmation is required, ask the user. We must delegate this to the socket link or a database approval log.
    if (context.requestApproval) {
      console.log(`[EXECUTOR] Requesting user confirmation for tool "${toolName}"`);
      const approved = await context.requestApproval(toolName, args);
      if (!approved) {
        return {
          success: false,
          output: "",
          error: "Permission Denied: Execution rejected by user."
        };
      }
    } else {
      return {
        success: false,
        output: "",
        error: `Permission Error: Interactive approval required for "${toolName}" but no confirmation interface was attached.`
      };
    }
  }

  try {
    console.log(`[EXECUTOR] Executing tool "${toolName}" with args:`, JSON.stringify(args));
    const result = await tool.execute(args, context);
    
    // Normalize result structure
    let outputString = '';
    if (typeof result === 'object') {
      outputString = result.result || result.output || JSON.stringify(result);
    } else {
      outputString = String(result);
    }

    return {
      success: true,
      output: outputString,
      error: ""
    };
  } catch (error) {
    console.error(`[EXECUTOR ERROR] Tool execution failed for "${toolName}":`, error.message);
    return {
      success: false,
      output: "",
      error: `Execution Failure: ${error.message}`
    };
  }
}

module.exports = {
  executeAction
};
