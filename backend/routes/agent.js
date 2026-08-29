const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const TaskStep = require('../models/TaskStep');
const Approval = require('../models/Approval');
const taskManager = require('../agent/taskManager');
const { runTask } = require('../agent/agentRuntime');

// 1. Run agent task
router.post('/run', async (req, res) => {
  const { goal, priority, conversationId } = req.body;
  if (!goal) {
    return res.status(400).json({ error: "Goal parameter is required." });
  }

  try {
    const task = await taskManager.createTask(goal, priority || 'MEDIUM', conversationId);
    
    // Trigger runtime asynchronously to avoid blocking the REST request
    runTask(task._id.toString(), {
      onUpdate: (update) => {
        console.log(`[AGENT UPDATE] Task ${task._id}:`, update.message || update.status);
      }
    }).catch(err => {
      console.error(`[AGENT TASK EXCEPTION] Task ${task._id} execution failed:`, err);
    });

    return res.json({ success: true, taskId: task._id.toString(), status: 'PENDING' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// 2. List all tasks
router.get('/tasks', async (req, res) => {
  try {
    const tasks = await Task.find().sort({ createdAt: -1 });
    return res.json({ tasks });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// 3. Get task detail with steps
router.get('/tasks/:id', async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found." });

    const steps = await TaskStep.find({ taskId: task._id }).sort({ stepIndex: 1 });
    return res.json({ task, steps });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// 4. Cancel a running task
router.post('/tasks/:id/cancel', async (req, res) => {
  try {
    const goalManager = require('../agent/goalManager');
    goalManager.cancelGoal(req.params.id);
    return res.json({ success: true, status: 'CANCELLED' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// 4b. Pause a running task
router.post('/tasks/:id/pause', async (req, res) => {
  try {
    const goalManager = require('../agent/goalManager');
    goalManager.pauseGoal(req.params.id);
    return res.json({ success: true, status: 'PAUSED' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// 4c. Resume a paused task
router.post('/tasks/:id/resume', async (req, res) => {
  try {
    const goalManager = require('../agent/goalManager');
    goalManager.resumeGoal(req.params.id);
    return res.json({ success: true, status: 'RUNNING' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// 5. Get pending approvals
router.get('/approvals', async (req, res) => {
  try {
    const approvals = await Approval.find({ status: 'PENDING' });
    return res.json({ approvals });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// 6. Action approval responses
router.post('/approvals/:id/decide', async (req, res) => {
  const { approved, reason } = req.body;
  try {
    const approval = await Approval.findById(req.params.id);
    if (!approval) return res.status(404).json({ error: "Approval request not found." });

    approval.status = approved ? 'APPROVED' : 'REJECTED';
    approval.reason = reason || '';
    await approval.save();

    return res.json({ success: true, approval });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
