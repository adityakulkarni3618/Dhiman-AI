const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { getOrCreateSession, closeSession } = require('../services/browser/sessionManager');
const { getTool } = require('../tools/registry');

// Require tools registry to activate definitions
require('../tools/browserTools');

async function runBrowserTests() {
  console.log("⚡ Starting Dhiman Browser Agent Integration Tests...\n");

  const taskId = "browser_test_task";
  const context = { taskId, onUpdate: () => {} };

  // 1. Test Open Browser
  console.log("🧪 Testing browser_open...");
  const openTool = getTool("browser_open");
  const openRes = await openTool.execute({}, context);
  assert(openRes.includes("initialized"));

  const session = getOrCreateSession(taskId);
  assert(session.browser);
  assert(session.context);
  console.log("   ✅ Browser session instantiated.");

  // 2. Test Navigate to Local HTML page
  console.log("\n🧪 Testing browser_navigate...");
  const navigateTool = getTool("browser_navigate");
  const localPagePath = `file:///${path.resolve(__dirname, 'localTestPage.html').replace(/\\/g, '/')}`;
  
  const navRes = await navigateTool.execute({ url: localPagePath }, context);
  assert(navRes.includes("Successfully navigated"));
  
  const page = session.getActivePage();
  assert.strictEqual(page.url(), localPagePath);
  console.log("   ✅ Navigation successfully targeted local test page.");

  // 3. Test Get Page Elements Summary
  console.log("\n🧪 Testing browser_get_page...");
  const getPageTool = getTool("browser_get_page");
  const summary = await getPageTool.execute({}, context);
  
  assert(summary.includes("PAGE TITLE: Dhiman Browser Testing Environment"));
  assert(summary.includes("[input id=\"search-input\""));
  assert(summary.includes("[button id=\"submit-btn\""));
  console.log("   ✅ Compact page summary successfully extracted elements.");

  // Find dynamic element IDs
  const searchInputIdMatch = summary.match(/(\d+): \[input id="search-input"/);
  const selectIdMatch = summary.match(/(\d+): \[select id="options-select"/);
  const submitBtnIdMatch = summary.match(/(\d+): \[button id="submit-btn"/);

  assert(searchInputIdMatch);
  assert(selectIdMatch);
  assert(submitBtnIdMatch);

  const searchInputId = searchInputIdMatch[1];
  const selectId = selectIdMatch[1];
  const submitBtnId = submitBtnIdMatch[1];

  // 4. Test Typing
  console.log("\n🧪 Testing browser_type...");
  const typeTool = getTool("browser_type");
  await typeTool.execute({ elementId: searchInputId, text: "React Hooks Tutorial" }, context);
  
  const inputValue = await page.inputValue('#search-input');
  assert.strictEqual(inputValue, "React Hooks Tutorial");
  console.log("   ✅ Enters text input successfully.");

  // 5. Test Select Options
  console.log("\n🧪 Testing browser_select...");
  const selectTool = getTool("browser_select");
  await selectTool.execute({ elementId: selectId, value: "react" }, context);

  const selectValue = await page.inputValue('#options-select');
  assert.strictEqual(selectValue, "react");
  console.log("   ✅ Selects option from dropdown successfully.");

  // 6. Test Click Element
  console.log("\n🧪 Testing browser_click...");
  const clickTool = getTool("browser_click");
  await clickTool.execute({ elementId: submitBtnId }, context);

  const outputText = await page.innerText('#output-message');
  assert.strictEqual(outputText, 'Searched: "React Hooks Tutorial" with option "react"');
  console.log("   ✅ Submits click event and updates DOM successfully.");

  // 7. Test Screenshots
  console.log("\n🧪 Testing browser_screenshot...");
  const screenshotTool = getTool("browser_screenshot");
  const screenshotName = "browser_test_screenshot.png";
  const screenshotPath = path.resolve(screenshotName);

  await screenshotTool.execute({ filename: screenshotName }, context);
  assert(fs.existsSync(screenshotPath));
  fs.unlinkSync(screenshotPath); // clean up
  console.log("   ✅ Screenshot captures and saves successfully.");

  // 8. Test Tab management
  console.log("\n🧪 Testing browser tabs management...");
  const newTabTool = getTool("browser_new_tab");
  const switchTabTool = getTool("browser_switch_tab");
  const closeTabTool = getTool("browser_close_tab");

  const tabOpenRes = await newTabTool.execute({}, context);
  assert(tabOpenRes.includes("tab_2"));
  assert.strictEqual(session.activeTabId, "tab_2");

  await switchTabTool.execute({ tabId: "tab_1" }, context);
  assert.strictEqual(session.activeTabId, "tab_1");

  await closeTabTool.execute({ tabId: "tab_2" }, context);
  assert.strictEqual(Object.keys(session.pages).length, 1);
  console.log("   ✅ Tab creation, switches, and tab termination operations succeeded.");

  // 9. Close Session
  console.log("\n🧪 Testing browser_close...");
  const closeTool = getTool("browser_close");
  await closeTool.execute({}, context);
  assert.strictEqual(session.browser, null);
  console.log("   ✅ Browser session closed successfully.");

  console.log("\n🎉 ALL BROWSER INTEGRATION TESTS PASSED SUCCESSFULLY!");
  process.exit(0);
}

runBrowserTests().catch(err => {
  console.error("\n❌ Browser Agent Integration Tests Failed:", err);
  process.exit(1);
});
