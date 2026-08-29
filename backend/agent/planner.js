const { generateCompletion } = require('../services/llm/router');
const { getLLMToolDefinitionsFiltered } = require('../tools/registry');

/**
 * Creates an initial execution plan based on the user's goal.
 * @param {string} goal - The user's request objective.
 * @param {Array} history - Previous messages for context.
 * @returns {Promise<Array>} A structured plan list.
 */
async function generatePlan(goal, history = []) {
  // 1. Identify capabilities needed
  let capabilities = ['SYSTEM', 'FILESYSTEM', 'WEB'];
  const clean = goal.toLowerCase();
  
  if (/\b(git|github|pr|commit|push|repo|checkout|branch)\b/.test(clean)) {
    capabilities.push('GIT', 'GITHUB', 'CODING');
  }
  if (/\b(mail|email|send|message)\b/.test(clean)) {
    capabilities.push('EMAIL');
  }
  if (/\b(browser|google|page|web|search|website|url)\b/.test(clean)) {
    capabilities.push('BROWSER', 'WEB');
  }
  if (/\b(screen|window|mouse|keyboard|click|type|notepad|calc|chrome|code|app)\b/.test(clean)) {
    capabilities.push('COMPUTER');
  }
  if (/\b(test|functionize|regression|assert)\b/.test(clean)) {
    capabilities.push('TESTING');
  }

  // Deduplicate capabilities
  capabilities = [...new Set(capabilities)];
  console.log(`[PLANNER] Selected capabilities for task:`, capabilities);

  // 2. Fetch tools corresponding to detected capabilities
  const { getLLMToolsForCapabilities } = require('../tools/registry');
  const tools = getLLMToolsForCapabilities(capabilities);
  
  const systemPrompt = `You are the lead planner for Dhiman, an autonomous personal assistant. 
Your job is to break down the user's high-level goal into a sequence of concrete steps.

For each step, specify:
1. A clear "description" explaining what this step does.
2. The "action" containing the "tool" name and its "args" object. If no tool is needed (e.g. final report), set "tool" to an empty string.

Available Tools for detected capabilities:
${JSON.stringify(tools, null, 2)}

You MUST output your response in JSON format matching the schema:
{
  "plan": [
    {
      "description": "Step description",
      "action": {
        "tool": "tool_name",
        "args": { ... }
      }
    }
  ]
}
Provide ONLY the JSON response without markdown wrapping.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6),
    { role: 'user', content: `Analyze this goal and create a plan: "${goal}"` }
  ];

  try {
    const response = await generateCompletion({ messages, tier: 'smart' });
    let text = response.content || '';
    
    // Clean markdown code blocks if any
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const parsed = JSON.parse(text);
    if (parsed && Array.isArray(parsed.plan)) {
      return parsed.plan;
    }
    
    // Fallback if structure is wrong
    return [{ description: goal, action: { tool: '', args: {} } }];
  } catch (error) {
    console.error("[PLANNER ERROR] Failed to generate plan, returning single-step fallback:", error.message);
    return [{ description: goal, action: { tool: '', args: {} } }];
  }
}

module.exports = {
  generatePlan
};
