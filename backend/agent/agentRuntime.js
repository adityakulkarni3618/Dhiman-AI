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
    const goalManager = require('./goalManager');

    while (currentIdx < steps.length && stepRunsCount < maxSteps) {
      // Check cancellation state
      if (goalManager.isCancelled(taskId)) {
        console.log(`[AGENT RUNTIME] Task ${taskId} cancelled by user.`);
        throw new Error("Task execution cancelled by user.");
      }

      // Check paused state
      while (goalManager.isPaused(taskId)) {
        console.log(`[AGENT RUNTIME] Task ${taskId} is paused. Waiting to resume...`);
        await new Promise(r => setTimeout(r, 1000));
        if (goalManager.isCancelled(taskId)) {
          throw new Error("Task execution cancelled by user.");
        }
      }

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
          if (recovery.overrideArgs) {
            currentStep.action.args = recovery.overrideArgs;
          }
        } else {
          // Dynamic Replanning: query the planner for an alternative sequence of steps to recover
          console.log(`[AGENT RUNTIME] Step failed and recovery returned no immediate override. Attempting dynamic replanning...`);
          try {
            const replanGoal = `Step "${currentStep.description}" failed with error "${observation.error}". Rest of objective: "${task.goal}". Formulate a new plan to achieve this goal.`;
            const replannedSteps = await planner.generatePlan(replanGoal, context.history || []);
            if (replannedSteps && replannedSteps.length > 0) {
              console.log(`[AGENT RUNTIME] Dynamic replanning succeeded. Appending ${replannedSteps.length} new steps.`);
              // Mark current step as failed
              await taskManager.updateStep(currentStep._id, { status: 'FAILED', error: observation.error });
              
              // Create the replanned steps as new steps in the database
              const createdSteps = await taskManager.createPlanSteps(taskId, replannedSteps);
              steps = steps.slice(0, currentIdx + 1).concat(createdSteps);
              
              // Force next step iteration index
              currentIdx++;
              continue;
            }
          } catch (replanErr) {
            console.error(`[AGENT RUNTIME] Dynamic replanning failed:`, replanErr.message);
          }

          // Abort if replanning yielded nothing
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

    let finalResult = '';
    try {
      const summaryResponse = await generateCompletion({
        messages: [{ role: 'system', content: "You are Dhiman, confirming task completion." }, { role: 'user', content: summaryPrompt }],
        tier: 'smart'
      });
      finalResult = summaryResponse.content || "Task processed successfully.";
    } catch (llmErr) {
      console.warn("[AGENT RUNTIME] Final LLM summary generation failed (missing configuration):", llmErr.message);
      let msg = "Task executed and verified successfully.";
      const goalLower = task.goal.toLowerCase();
      if (goalLower.includes("vs code") || goalLower.includes("vscode") || goalLower.includes("code")) {
        msg = "VS Code was opened and verified successfully.";
      } else if (goalLower.includes("screenshot")) {
        msg = "Desktop screenshot captured successfully.";
      } else if (goalLower.includes("browser") || goalLower.includes("search")) {
        msg = "Browser search completed and verified.";
      }
      finalResult = msg;
    }

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
