/**
 * Decides whether to retry or modify strategy when a tool action fails.
 */
function handleFailure(step, errorMsg, attemptCount = 1) {
  console.log(`[RECOVERY] Evaluating failure for step ${step.stepIndex} ("${step.description}"). Attempt: ${attemptCount}. Error: ${errorMsg}`);
  
  if (attemptCount >= 3) {
    return {
      action: 'ABORT',
      reason: 'Maximum attempts reached without resolution.'
    };
  }

  // Check error type
  const err = errorMsg.toLowerCase();
  
  if (err.includes('timeout')) {
    return {
      action: 'RETRY',
      overrideArgs: { ...step.action.args, timeout: (step.action.args?.timeout || 30000) * 1.5 }
    };
  }

  if (err.includes('permission denied') || err.includes('security error')) {
    return {
      action: 'ASK_USER',
      reason: 'Security permissions blocked the execution.'
    };
  }

  // Return generic retry or alternate path
  return {
    action: 'RETRY',
    reason: 'Transient failure, attempting retry.'
  };
}

module.exports = {
  handleFailure
};
