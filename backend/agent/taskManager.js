const Task = require('../models/Task');
const TaskStep = require('../models/TaskStep');

/**
 * Creates a new task session in the database.
 */
async function createTask(goal, priority = 'MEDIUM', conversationId = null) {
  const task = await Task.create({
    goal,
    priority,
    conversationId,
    status: 'PENDING',
    startedAt: new Date()
  });
  return task;
}

/**
 * Retrieves a task by its MongoDB ID.
 */
async function getTask(taskId) {
  return await Task.findById(taskId);
}

/**
 * Retrieves all steps associated with a task.
 */
async function getTaskSteps(taskId) {
  return await TaskStep.find({ taskId }).sort({ stepIndex: 1 });
}

/**
 * Set the task status.
 */
async function updateTaskStatus(taskId, status, extraFields = {}) {
  const updateData = { status, ...extraFields };
  if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED') {
    updateData.completedAt = new Date();
  }
  return await Task.findByIdAndUpdate(taskId, updateData, { new: true });
}

/**
 * Persists the plan steps to the database.
 */
async function createPlanSteps(taskId, stepsArray) {
  // Clear any existing pending steps
  await TaskStep.deleteMany({ taskId });

  const inserts = stepsArray.map((step, idx) => ({
    taskId,
    stepIndex: idx,
    description: step.description || step,
    action: step.action || { tool: '', args: {} },
    status: 'PENDING'
  }));

  return await TaskStep.insertMany(inserts);
}

/**
 * Updates a specific step's observation, status, and verification details.
 */
async function updateStep(stepId, updateFields) {
  return await TaskStep.findByIdAndUpdate(stepId, updateFields, { new: true });
}

module.exports = {
  createTask,
  getTask,
  getTaskSteps,
  updateTaskStatus,
  createPlanSteps,
  updateStep
};
