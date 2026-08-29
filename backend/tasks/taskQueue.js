const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();

// Define schemas for Scheduled Tasks and Notifications
const ScheduledTaskSchema = new mongoose.Schema({
  goal: { type: String, required: true },
  frequency: { type: String, required: true }, // e.g. "daily", "hourly" or "every X minutes"
  lastRun: { type: Date, default: null },
  nextRun: { type: Date, required: true },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const NotificationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ["INFO", "WARNING", "APPROVAL", "SUCCESS", "FAILURE"], default: "INFO" },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const ScheduledTask = mongoose.models.ScheduledTask || mongoose.model('ScheduledTask', ScheduledTaskSchema);
const Notification = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);

// In-memory queue worker references
const backgroundQueue = [];

/**
 * Push an active task to the background queue runner.
 */
function pushToBackground(taskInstance) {
  backgroundQueue.push(taskInstance);
  console.log(`[BACKGROUND WORKER] Pushed task "${taskInstance.goal}" to active worker queue.`);
}

/**
 * Background Scheduler check loop: run every 30 seconds to trigger scheduled tasks.
 */
async function startSchedulerLoop(agentRunnerFunc) {
  setInterval(async () => {
    try {
      const now = new Date();
      const pendingTasks = await ScheduledTask.find({
        active: true,
        nextRun: { $lte: now }
      });

      for (const t of pendingTasks) {
        console.log(`[SCHEDULER] Triggering scheduled task goal: "${t.goal}"`);
        
        // Execute the agent task run in background
        agentRunnerFunc(t.goal).catch(err => {
          console.error(`[SCHEDULER RUN ERROR] "${t.goal}" failed:`, err.message);
        });

        // Compute next run time
        let offset = 24 * 60 * 60 * 1000; // default daily
        if (t.frequency.includes('hour')) offset = 60 * 60 * 1000;
        else if (t.frequency.includes('minute')) {
          const match = t.frequency.match(/(\d+)/);
          const mins = match ? parseInt(match[1], 10) : 5;
          offset = mins * 60 * 1000;
        }

        t.lastRun = now;
        t.nextRun = new Date(now.getTime() + offset);
        await t.save();

        // Broadcast success notification
        await addNotification(`Scheduled Task Triggered`, `Autonomous run started for: ${t.goal}`, 'INFO');
      }
    } catch (err) {
      console.error("[SCHEDULER ERROR] Loop tick failed:", err.message);
    }
  }, 30000);
}

/**
 * Helper to log notification logs.
 */
async function addNotification(title, message, type = 'INFO') {
  try {
    const notify = new Notification({ title, message, type });
    await notify.save();
    return notify;
  } catch (err) {
    console.warn("[NOTIFICATION LOGGER] Failed to save notice:", err.message);
  }
}

// ==========================================
// ROUTER DEFINITIONS
// ==========================================

// 1. Get Scheduled Tasks list
router.get('/scheduled', async (req, res) => {
  try {
    const tasks = await ScheduledTask.find().sort({ createdAt: -1 });
    return res.json(tasks);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. Register Scheduled Task
router.post('/scheduled', async (req, res) => {
  const { goal, frequency } = req.body;
  if (!goal || !frequency) {
    return res.status(400).json({ error: "Missing goal or frequency mapping." });
  }
  try {
    let offset = 24 * 60 * 60 * 1000;
    if (frequency.includes('hour')) offset = 60 * 60 * 1000;
    else if (frequency.includes('minute')) {
      const match = frequency.match(/(\d+)/);
      const mins = match ? parseInt(match[1], 10) : 5;
      offset = mins * 60 * 1000;
    }

    const newTask = new ScheduledTask({
      goal,
      frequency,
      nextRun: new Date(Date.now() + offset)
    });
    await newTask.save();
    await addNotification(`New Task Scheduled`, `Goal: "${goal}" (Frequency: ${frequency})`, 'SUCCESS');
    return res.json(newTask);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 3. List notifications
router.get('/notifications', async (req, res) => {
  try {
    const list = await Notification.find().sort({ createdAt: -1 }).limit(20);
    return res.json(list);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 4. Mark notifications read
router.post('/notifications/read', async (req, res) => {
  try {
    await Notification.updateMany({ read: false }, { read: true });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = {
  router,
  pushToBackground,
  startSchedulerLoop,
  addNotification,
  ScheduledTask,
  Notification
};
