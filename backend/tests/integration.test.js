const assert = require('assert');
const path = require('path');
const fs = require('fs');
const taskManager = require('../agent/taskManager');
const { runTask } = require('../agent/agentRuntime');
const Approval = require('../models/Approval');
const Task = require('../models/Task');
const TaskStep = require('../models/TaskStep');

const mongoose = require('mongoose');
const db = require('../db');
require('../tools/allTools');

// Mock sockets to track WebSocket events emitted during task execution
const mockSocket = {
  emitted: [],
  emit(event, data) {
    this.emitted.push({ event, data });
  }
};

async function runIntegrationTests() {
  console.log("⚡ Starting Dhiman Agent Integration Tests...\n");

  // 1. Filesystem task, verification, and WebSocket event logging
  console.log("🧪 Integration Test: Filesystem Task & Verification...");
  const fsGoal = "Create a validation file inside the project directory";
  const fsTaskObj = await taskManager.createTask(fsGoal, "MEDIUM");

  // Manually mock steps for the integration runtime execution
  const testFilepath = path.join(__dirname, 'integration_test_output.txt');
  const planSteps = [
    {
      description: "Write test content to target path",
      action: {
        tool: "write_file",
        args: { filepath: testFilepath, content: "Dhiman integration test payload" }
      }
    }
  ];
  await taskManager.createPlanSteps(fsTaskObj._id, planSteps);

  // Setup context to track callbacks
  const mockContext = {
    requestApproval: async () => true,
    onUpdate: (update) => {
      mockSocket.emit('task-update', update);
    }
  };

  await runTask(fsTaskObj._id.toString(), mockContext);

  // Assertions
  assert(fs.existsSync(testFilepath));
  assert.strictEqual(fs.readFileSync(testFilepath, 'utf8'), "Dhiman integration test payload");
  
  // Cleanup test file
  fs.unlinkSync(testFilepath);

  // Verify socket event broadcasts occurred
  assert(mockSocket.emitted.some(e => e.event === 'task-update'));
  console.log("   ✅ Filesystem task executed, verified, and socket updates streamed successfully.");

  // 2. Terminal task & approval flow logic
  console.log("\n🧪 Integration Test: Terminal Command Task & Approval Flow...");
  const termGoal = "Check node workspace directory configuration";
  const termTaskObj = await taskManager.createTask(termGoal, "MEDIUM");

  const termSteps = [
    {
      description: "List folder content using command line",
      action: {
        tool: "run_terminal_command",
        args: { command: "node --version" }
      }
    }
  ];
  await taskManager.createPlanSteps(termTaskObj._id, termSteps);

  let approvalTriggered = false;
  const mockApprovalContext = {
    requestApproval: async (toolName, args) => {
      approvalTriggered = true;
      return true; // Simulate user approving the command
    },
    onUpdate: () => {}
  };

  await runTask(termTaskObj._id.toString(), mockApprovalContext);
  assert.strictEqual(approvalTriggered, true);
  console.log("   ✅ Terminal safety check triggered approval request and completed successfully.");

  // 3. Failed Tool Recovery
  console.log("\n🧪 Integration Test: Failed Tool Recovery...");
  const recoveryGoal = "Attempt write to invalid directory";
  const recoveryTask = await taskManager.createTask(recoveryGoal, "LOW");

  const recoverySteps = [
    {
      description: "Write to non-existent drive root",
      action: {
        tool: "write_file",
        args: { filepath: "Z:\\invalid\\directory\\test.txt", content: "payload" }
      }
    }
  ];
  await taskManager.createPlanSteps(recoveryTask._id, recoverySteps);

  try {
    await runTask(recoveryTask._id.toString(), { onUpdate: () => {} });
  } catch (err) {
    // Assert task is marked failed in db
    const finalTask = await taskManager.getTask(recoveryTask._id.toString());
    assert.strictEqual(finalTask.status, "FAILED");
    console.log("   ✅ Failed tools are caught and task is safely updated to FAILED state.");
  }

  // 4. Task Cancellation
  console.log("\n🧪 Integration Test: Task Cancellation...");
  const cancelGoal = "Long running command simulation";
  const cancelTask = await taskManager.createTask(cancelGoal, "MEDIUM");
  await taskManager.createPlanSteps(cancelTask._id, [
    {
      description: "Ping local node instance",
      action: { tool: "run_terminal_command", args: { command: "ping localhost" } }
    }
  ]);

  // Cancel immediately
  await taskManager.updateTaskStatus(cancelTask._id.toString(), 'CANCELLED');
  const cancelledTask = await taskManager.getTask(cancelTask._id.toString());
  assert.strictEqual(cancelledTask.status, 'CANCELLED');
  console.log("   ✅ Task status updated to CANCELLED state successfully.");

  console.log("\n🎉 ALL INTEGRATION TEST ASSERTIONS PASSED SUCCESSFULLY!");
  process.exit(0);
}

mongoose.connection.once('open', () => {
  runIntegrationTests().catch(err => {
    console.error("\n❌ Integration Tests Failed:", err);
    process.exit(1);
  });
});
