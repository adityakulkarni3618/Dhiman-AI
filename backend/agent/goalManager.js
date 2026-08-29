const Task = require('../models/Task');
const taskManager = require('./taskManager');

/**
 * Manages runtime states, interruptions, and cancellation tokens for active goals.
 */
class GoalManager {
  constructor() {
    this.activeGoals = new Map();
  }

  async createGoal(request, options = {}) {
    const priority = options.priority || 'MEDIUM';
    const conversationId = options.conversationId || null;
    const task = await taskManager.createTask(request, priority, conversationId);
    
    const goal = {
      goalId: task._id.toString(),
      originalRequest: request,
      normalizedGoal: request,
      status: 'PENDING',
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    };
    
    this.activeGoals.set(goal.goalId, { status: 'PENDING', cancelled: false, paused: false });
    return goal;
  }

  async updateGoalStatus(goalId, status, extra = {}) {
    const state = this.activeGoals.get(goalId) || { cancelled: false, paused: false };
    state.status = status;
    if (status === 'CANCELLED') state.cancelled = true;
    if (status === 'PAUSED') state.paused = true;
    if (status === 'RUNNING') state.paused = false;
    this.activeGoals.set(goalId, state);
    
    await taskManager.updateTaskStatus(goalId, status, extra);
  }

  isCancelled(goalId) {
    const state = this.activeGoals.get(goalId);
    return state ? state.cancelled : false;
  }

  isPaused(goalId) {
    const state = this.activeGoals.get(goalId);
    return state ? state.paused : false;
  }

  cancelGoal(goalId) {
    const state = this.activeGoals.get(goalId);
    if (state) {
      state.cancelled = true;
      state.status = 'CANCELLED';
      this.activeGoals.set(goalId, state);
    }
    taskManager.updateTaskStatus(goalId, 'CANCELLED');
  }

  pauseGoal(goalId) {
    const state = this.activeGoals.get(goalId);
    if (state) {
      state.paused = true;
      state.status = 'PAUSED';
      this.activeGoals.set(goalId, state);
    }
    taskManager.updateTaskStatus(goalId, 'PAUSED');
  }

  resumeGoal(goalId) {
    const state = this.activeGoals.get(goalId);
    if (state) {
      state.paused = false;
      state.status = 'RUNNING';
      this.activeGoals.set(goalId, state);
    }
    taskManager.updateTaskStatus(goalId, 'RUNNING');
  }
}

module.exports = new GoalManager();
