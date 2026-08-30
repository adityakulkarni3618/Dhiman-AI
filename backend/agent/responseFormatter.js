/**
 * Translates structured task execution histories and verifier outcomes into natural summaries.
 */
function formatResponse(task, steps = []) {
  if (task.status === 'FAILED') {
    const failedStep = steps.find(s => s.status === 'FAILED');
    if (failedStep) {
      return `I couldn't complete that because: ${failedStep.error || 'an unexpected error occurred'}.`;
    }
    return `I encountered an error trying to execute that task: ${task.error || 'unknown error'}.`;
  }

  if (task.status === 'CANCELLED') {
    return `The task execution was cancelled.`;
  }

  // Always prefer the LLM-synthesized result if available
  if (task.result) {
    return task.result;
  }

  return "Task completed and verified successfully.";
}

module.exports = {
  formatResponse
};

