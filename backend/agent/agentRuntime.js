const taskManager = require('./taskManager');
const planner = require('./planner');
const executor = require('./executor');
const verifier = require('./verifier');
const recoveryManager = require('./recoveryManager');
const { generateCompletion } = require('../services/llm/router');

/**
 * Runs a task to completion using the planning/executing loop.
 * @param {string} taskId - Mongoose Task ID.
 * @param {Object} context - Execution context (contains socket or HTTP response callbacks, plus requestApproval method).
 */
async function runTask(taskId, context = {}) {
  const onUpdate = context.onUpdate || (() => {});
  
  try {
    console.log(`[AGENT RUNTIME] Starting execution loop for task: ${taskId}`);
    
    // 1. Get/Load task details
    let task = await taskManager.getTask(taskId);
    if (!task) throw new Error("Task not found.");

    await taskManager.updateTaskStatus(taskId, 'PLANNING');
    onUpdate({ status: 'PLANNING', message: "Analyzing goal and formulating execution plan..." });

    // 2. Generate plan if none exists
    let steps = await taskManager.getTaskSteps(taskId);
    if (steps.length === 0) {
      const planSteps = await planner.generatePlan(task.goal, context.history || []);
      steps = await taskManager.createPlanSteps(taskId, planSteps);
    }

    await taskManager.updateTaskStatus(taskId, 'RUNNING');
    onUpdate({ status: 'RUNNING', steps: steps.map(s => ({ description: s.description, status: s.status })) });

    // 3. Execution Loop
    let currentIdx = 0;
    const maxSteps = 15;
    let stepRunsCount = 0;

    while (currentIdx < steps.length && stepRunsCount < maxSteps) {
      stepRunsCount++;
      const currentStep = steps[currentIdx];

      if (currentStep.status === 'COMPLETED' || currentStep.status === 'SKIPPED') {
        currentIdx++;
        continue;
      }

      console.log(`[AGENT RUNTIME] Running Step ${currentStep.stepIndex}: "${currentStep.description}"`);
      onUpdate({
        status: 'RUNNING',
        currentStepIndex: currentIdx,
        message: `Executing: ${currentStep.description}`,
        tool: currentStep.action?.tool
      });

      await taskManager.updateStep(currentStep._id, { status: 'RUNNING' });

      // Run executor
      const observation = await executor.executeAction(currentStep.action, context);

      if (observation.success) {
        console.log(`[AGENT RUNTIME] Step ${currentStep.stepIndex} executed successfully. Starting verification...`);
        onUpdate({ status: 'VERIFYING', message: `Verifying step results...` });

        // Verify
        const verification = await verifier.verifyStep(currentStep, observation.output);
        
        await taskManager.updateStep(currentStep._id, {
          status: 'COMPLETED',
          observation: observation.output,
          verified: verification.verified,
          verificationDetails: verification.details
        });

        // Add tool to task registry
        if (currentStep.action?.tool) {
          await taskManager.updateTaskStatus(taskId, 'RUNNING', {
            $addToSet: { toolsUsed: currentStep.action.tool }
          });
        }

        currentIdx++;
      } else {
        console.warn(`[AGENT RUNTIME] Step ${currentStep.stepIndex} failed: ${observation.error}`);
        
        // Recovery
        const recovery = recoveryManager.handleFailure(currentStep, observation.error);
        if (recovery.action === 'RETRY') {
          console.log(`[AGENT RUNTIME] Recovery strategy: Retry step with args override.`);
          // Create temporary override argument list if needed
          if (recovery.overrideArgs) {
            currentStep.action.args = recovery.overrideArgs;
          }
          // Do not advance index so it retries
        } else {
          // Abort task or mark step failed
          await taskManager.updateStep(currentStep._id, {
            status: 'FAILED',
            error: observation.error
          });
          throw new Error(`Step execution failed: ${observation.error}`);
        }
      }

      // Refresh plan steps list status
      steps = await taskManager.getTaskSteps(taskId);
    }

    // 4. Goal Completion Verification
    console.log(`[AGENT RUNTIME] All plan steps processed. Synthesizing final result report.`);
    await taskManager.updateTaskStatus(taskId, 'VERIFYING');

    const summaryPrompt = `Goal: "${task.goal}"
Steps executed:
${steps.map(s => `- Step ${s.stepIndex}: ${s.description} (Status: ${s.status}, Verified: ${s.verified})\n  Observation: ${s.observation || s.error}`).join('\n')}

Review the above steps and observations. Write a final summary to Aditya confirming if the task was completed successfully, outlining what was changed, and what tools were used. Keep it concise.`;

    const summaryResponse = await generateCompletion({
      messages: [{ role: 'system', content: "You are Dhiman, confirming task completion." }, { role: 'user', content: summaryPrompt }],
      tier: 'smart'
    });

    const finalResult = summaryResponse.content || "Task processed successfully.";

    await taskManager.updateTaskStatus(taskId, 'COMPLETED', { result: finalResult });
    onUpdate({
      status: 'COMPLETED',
      result: finalResult,
      message: "Goal accomplished successfully."
    });

    return finalResult;
  } catch (error) {
    console.error(`[AGENT RUNTIME FAULT] Task ${taskId} failed:`, error.message);
    await taskManager.updateTaskStatus(taskId, 'FAILED', { error: error.message });
    onUpdate({
      status: 'FAILED',
      error: error.message,
      message: `Task execution failed: ${error.message}`
    });
    throw error;
  }
}

module.exports = {
  runTask
};
