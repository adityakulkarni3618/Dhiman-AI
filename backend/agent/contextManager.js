const { getContext } = require('./entityResolver');

/**
 * Combines history, memory facts, task steps, and current details to build a context frame.
 */
function buildSystemContext(task, steps = [], memoryFacts = []) {
  const activeCtx = getContext();
  let context = `You are Dhiman, Aditya's production-grade autonomous personal AI assistant. 
Your objective is to accomplish the user's goals using planning, executing actions, observing results, and verifying the work.

CURRENT ACTIVE CONTEXT:
- Active Project: ${activeCtx.activeProject || 'None'}
- Active File: ${activeCtx.activeFile || 'None'}
- Active Application: ${activeCtx.activeApplication || 'None'}
- Active Browser Tab/URL: ${activeCtx.activeTab || 'None'}
- Active Error: ${activeCtx.activeError || 'None'}

CURRENT GOAL: "${task.goal}"
STATUS: ${task.status}

EXECUTION PLAN STATUS:`;

  if (steps.length > 0) {
    steps.forEach((s) => {
      context += `\n- Step ${s.stepIndex}: ${s.description} [Status: ${s.status}]`;
      if (s.observation) {
        context += `\n  Observation: ${s.observation.slice(0, 1000)}`;
      }
      if (s.error) {
        context += `\n  Error: ${s.error}`;
      }
    });
  } else {
    context += `\n(No plan steps generated yet. You need to plan first.)`;
  }

  if (memoryFacts.length > 0) {
    context += `\n\nLONG-TERM MEMORY FACT RETRIEVALS:\n`;
    memoryFacts.forEach((f, idx) => {
      context += `${idx + 1}. ${f.fact}\n`;
    });
  }

  return context;
}

module.exports = {
  buildSystemContext
};

