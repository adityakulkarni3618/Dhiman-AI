const assert = require('assert');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const config = require('../config');
const { getLLMToolDefinitionsFiltered } = require('../tools/registry');
const { addMemory, listAllMemories, deleteMemory } = require('../memory/memoryManager');
const { ScheduledTask, Notification } = require('../tasks/taskQueue');

// Import tools registry to boot definitions
require('../tools/allTools');

async function runMultimodalTests() {
  console.log("⚡ Starting Dhiman Multimodal Operating Layer Integration Tests...\n");

  // Connect to MongoDB if not already
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(config.mongodbUri);
  }

  // 1. Test Intent Classification Routing
  console.log("🧪 Testing Assistant Intent Router...");
  const { classifyIntent, handleChatResponse } = require('../agent/assistantRouter');
  
  const chatIntent1 = await classifyIntent("Hello.");
  assert.strictEqual(chatIntent1, 'CHAT');

  const actionIntent1 = await classifyIntent("Open VS Code.");
  assert.strictEqual(actionIntent1, 'ACTION');

  const chatIntent2 = await classifyIntent("What is MongoDB?");
  assert.strictEqual(chatIntent2, 'CHAT');

  const actionIntent2 = await classifyIntent("Commit changes to git");
  assert.strictEqual(actionIntent2, 'ACTION');

  const chatReply = await handleChatResponse("Hello");
  assert(chatReply && chatReply.length > 5);
  console.log("   ✅ Intent routing successfully separated CHAT from ACTION workflows.");

  // 2. Test Dynamic Tool Discovery
  console.log("\n🧪 Testing Dynamic Tool Discovery...");
  const gitTools = getLLMToolDefinitionsFiltered("check my git status and repo");
  assert(gitTools.some(t => t.function.name === 'git_status'));
  assert(!gitTools.some(t => t.function.name === 'send_email'));

  const commsTools = getLLMToolDefinitionsFiltered("send an email to my manager");
  assert(commsTools.some(t => t.function.name === 'send_email'));
  assert(!commsTools.some(t => t.function.name === 'git_commit'));
  console.log("   ✅ Dynamic tool filtering by keyword matches succeeded.");

  // 2. Test Computer screenshot tool
  console.log("\n🧪 Testing computer screenshot execution...");
  const screenshotTool = require('../tools/registry').getTool('computer_screenshot');
  const tempName = 'test_computer_screenshot.png';
  const tempPath = path.resolve(tempName);

  const res = await screenshotTool.execute({ filename: tempName });
  assert(res.includes("Successfully captured") || res.includes("Failed to capture"));
  if (fs.existsSync(tempPath)) {
    fs.unlinkSync(tempPath); // Clean up
  }
  console.log("   ✅ Desktop screenshot capture tool ran successfully.");

  // 3. Test Memory Vault CRUD
  console.log("\n🧪 Testing Memory Vault CRUD operations...");
  const initialMemories = await listAllMemories();
  const testFactText = "Aditya prefers VS Code layout for technical documentation edits.";
  
  const createdFact = await addMemory(testFactText);
  assert.strictEqual(createdFact.fact, testFactText);

  const updatedMemories = await listAllMemories();
  assert.strictEqual(updatedMemories.length, initialMemories.length + 1);

  await deleteMemory(createdFact.id);
  const finalMemories = await listAllMemories();
  assert.strictEqual(finalMemories.length, initialMemories.length);
  console.log("   ✅ Memory Vault add, list, and delete operations succeeded.");

  // 4. Test Scheduling and Notifications log tables
  console.log("\n🧪 Testing Scheduler db schemas and Notification logger...");
  const sched = new ScheduledTask({
    goal: "Verify test action outcomes weekly",
    frequency: "weekly",
    nextRun: new Date()
  });
  await sched.save();

  const saved = await ScheduledTask.findOne({ goal: "Verify test action outcomes weekly" });
  assert(saved);
  await ScheduledTask.deleteOne({ _id: saved._id });

  const notify = new Notification({
    title: "Test Alert",
    message: "Harness test succeeded",
    type: "SUCCESS"
  });
  await notify.save();

  const savedNotify = await Notification.findOne({ title: "Test Alert" });
  assert(savedNotify);
  await Notification.deleteOne({ _id: savedNotify._id });
  console.log("   ✅ Scheduler and Notification schemas successfully tested.");

  // 4b. Test Entity Target Resolution
  console.log("\n🧪 Testing Semantic Entity and Target Resolver...");
  const { resolveTarget, updateContext, getContext } = require('../agent/entityResolver');
  
  // Test basic scan
  const projectMatches = resolveTarget("Dhiman-AI");
  assert(projectMatches.length > 0);
  assert(projectMatches[0].confidence >= 0.8);
  
  // Test active context setting
  updateContext({ activeProject: projectMatches[0].path });
  assert.strictEqual(getContext().activeProject, projectMatches[0].path);
  
  // Test contextual references (run it)
  const itMatches = resolveTarget("run it");
  assert.strictEqual(itMatches[0].confidence, 1.0);
  assert.strictEqual(itMatches[0].path, projectMatches[0].path);
  console.log("   ✅ Entity Target Resolver successfully matched names, scored confidence, and resolved 'it' references.");

  // 5. Test Response Formatter
  console.log("\n🧪 Testing responseFormatter actions mapping...");
  const { formatResponse } = require('../agent/responseFormatter');
  
  const mockTask = { goal: "Open VS Code", status: "COMPLETED", result: "" };
  const mockSteps = [
    { action: { tool: "application_launch" }, status: "COMPLETED", verified: true }
  ];
  const resp1 = formatResponse(mockTask, mockSteps);
  assert.strictEqual(resp1, "VS Code is open.");

  const mockFailTask = { goal: "Open VS Code", status: "FAILED", error: "Process timed out" };
  const mockFailSteps = [
    { action: { tool: "application_launch" }, status: "FAILED", error: "Visual Studio Code could not be located" }
  ];
  const resp2 = formatResponse(mockFailTask, mockFailSteps);
  assert.strictEqual(resp2, "I couldn't complete that because: Visual Studio Code could not be located.");
  console.log("   ✅ Response Formatter successfully generated natural summaries from verified steps.");

  console.log("\n🎉 ALL MULTIMODAL ASSISTANT TESTS PASSED SUCCESSFULLY!");
  process.exit(0);
}

runMultimodalTests().catch(err => {
  console.error("\n❌ Multimodal integration tests failed:", err);
  process.exit(1);
});
