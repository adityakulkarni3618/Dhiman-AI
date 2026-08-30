const { getTool } = require('../tools/registry');

/**
 * Checks if a tool execution requires interactive user approval.
 * @param {string} toolName
 * @param {Object} args
 * @returns {string} One of: 'ALLOW', 'CONFIRM', 'BLOCK'
 */
function checkPermission(toolName, args = {}) {
  const tool = getTool(toolName);
  if (!tool) {
    return 'ALLOW'; // Default to allow unknown/custom logic, or handle gracefully
  }

  if (tool.riskLevel === 'BLOCKED') {
    return 'BLOCK';
  }

  // Handle specific command blocks inside run_terminal_command
  if (toolName === 'run_terminal_command' && args.command) {
    const cmd = args.command.toLowerCase();
    
    // Dangerous patterns
    const dangerousRegex = /\b(rm\s+-rf|format|mkfs|dd\b|shutdown|reboot|del\s+\/s\s+\/q|del\s+\/f|rd\s+\/s\s+\/q|rmdir\s+\/s\s+\/q)\b/;
    if (dangerousRegex.test(cmd)) {
      console.warn(`[SECURITY POLICY] Command "${args.command}" blocked due to destructive signature.`);
      return 'BLOCK';
    }

    // Guard against prompt injections trying to bypass safety rules or delete the main project
    if (cmd.includes("ignore") && cmd.includes("safety")) {
      return 'BLOCK';
    }
  }

  if (tool.riskLevel === 'DANGEROUS' || tool.riskLevel === 'CONFIRM') {
    return 'CONFIRM';
  }

  return 'ALLOW';
}

module.exports = {
  checkPermission
};

