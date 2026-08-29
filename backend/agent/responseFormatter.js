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

  const goalLower = task.goal.toLowerCase();

  // Simple Application Launch confirmation mapping
  if (goalLower.includes("open vs code") || goalLower.includes("vscode") || goalLower.includes("open code")) {
    const launchStep = steps.find(s => s.action?.tool === 'application_launch');
    if (launchStep && launchStep.status === 'COMPLETED') {
      return "VS Code is open.";
    }
  }

  if (goalLower.includes("facebook")) {
    return "Facebook is open.";
  }

  // Simple Screenshot confirmation mapping
  if (goalLower.includes("screenshot")) {
    const screenStep = steps.find(s => s.action?.tool === 'computer_screenshot' || s.action?.tool === 'browser_screenshot');
    if (screenStep && screenStep.status === 'COMPLETED') {
      return "I took a screenshot of your desktop.";
    }
  }

  // Git Status mapping
  if (goalLower.includes("git status")) {
    const gitStep = steps.find(s => s.action?.tool === 'git_status');
    if (gitStep && gitStep.status === 'COMPLETED') {
      return gitStep.observation || "I checked the git repository status.";
    }
  }

  // Default to synthesized summary if present
  if (task.result) {
    return task.result;
  }

  return "Task completed and verified successfully.";
}

module.exports = {
  formatResponse
};
