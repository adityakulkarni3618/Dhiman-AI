const fs = require('fs');
const path = require('path');
const { registerTool } = require('./registry');
const { getOrCreateSession, closeSession } = require('../services/browser/sessionManager');

// Helper to get active page and session
async function getActiveContext(context) {
  const taskId = context.taskId || 'default_task';
  const session = getOrCreateSession(taskId);
  await session.initialize();
  return { session, page: session.getActivePage() };
}

// Helper to notify socket updates if socket exists
function notifySocket(context, event, data) {
  if (context.socket) {
    context.socket.emit(event, data);
  }
}

// ==========================================
// 1. BROWSER_OPEN
// ==========================================
registerTool({
  name: "browser_open",
  description: "Initializes the chromium browser context for this task.",
  category: "browser",
  parameters: { type: "object", properties: {} },
  riskLevel: "SAFE",
  execute: async (args, context) => {
    const { session } = await getActiveContext(context);
    notifySocket(context, 'browser_session_created', { taskId: session.taskId });
    return "Browser session initialized and tab_1 opened.";
  }
});

// ==========================================
// 2. BROWSER_NAVIGATE
// ==========================================
registerTool({
  name: "browser_navigate",
  description: "Navigates to a specific URL.",
  category: "browser",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "Target address e.g. https://www.google.com" }
    },
    required: ["url"]
  },
  riskLevel: "SAFE",
  execute: async (args, context) => {
    const { page } = await getActiveContext(context);
    notifySocket(context, 'browser_navigation_started', { url: args.url });
    
    // Default wait to target DOM load
    await page.goto(args.url, { waitUntil: 'load', timeout: 30000 });
    
    notifySocket(context, 'browser_navigation_completed', { url: page.url(), title: await page.title() });
    return `Successfully navigated to: ${page.url()}`;
  }
});

// ==========================================
// 3. BROWSER_BACK
// ==========================================
registerTool({
  name: "browser_back",
  description: "Navigates back in browser history.",
  category: "browser",
  parameters: { type: "object", properties: {} },
  riskLevel: "SAFE",
  execute: async (args, context) => {
    const { page } = await getActiveContext(context);
    await page.goBack();
    return `Navigated back to: ${page.url()}`;
  }
});

// ==========================================
// 4. BROWSER_FORWARD
// ==========================================
registerTool({
  name: "browser_forward",
  description: "Navigates forward in browser history.",
  category: "browser",
  parameters: { type: "object", properties: {} },
  riskLevel: "SAFE",
  execute: async (args, context) => {
    const { page } = await getActiveContext(context);
    await page.goForward();
    return `Navigated forward to: ${page.url()}`;
  }
});

// ==========================================
// 5. BROWSER_REFRESH
// ==========================================
registerTool({
  name: "browser_refresh",
  description: "Reloads the current active browser page.",
  category: "browser",
  parameters: { type: "object", properties: {} },
  riskLevel: "SAFE",
  execute: async (args, context) => {
    const { page } = await getActiveContext(context);
    await page.reload();
    return `Page refreshed. Current URL is ${page.url()}`;
  }
});

// ==========================================
// 6. BROWSER_GET_PAGE
// ==========================================
registerTool({
  name: "browser_get_page",
  description: "Gets the current page URL, title, and structured list of interactive elements.",
  category: "browser",
  parameters: { type: "object", properties: {} },
  riskLevel: "SAFE",
  execute: async (args, context) => {
    const { session } = await getActiveContext(context);
    const summary = await session.getCompactPageSummary();
    notifySocket(context, 'browser_page_observed', { url: summary.url, title: summary.title });
    return summary.summary;
  }
});

// ==========================================
// 7. BROWSER_GET_TEXT
// ==========================================
registerTool({
  name: "browser_get_text",
  description: "Extracts visible body text from the active page.",
  category: "browser",
  parameters: { type: "object", properties: {} },
  riskLevel: "SAFE",
  execute: async (args, context) => {
    const { page } = await getActiveContext(context);
    return await page.innerText('body');
  }
});

// ==========================================
// 8. BROWSER_FIND_ELEMENT
// ==========================================
registerTool({
  name: "browser_find_element",
  description: "Filter element selector details by keyword/placeholder name.",
  category: "browser",
  parameters: {
    type: "object",
    properties: {
      keyword: { type: "string", description: "The button text, link text, or input placeholder to match." }
    },
    required: ["keyword"]
  },
  riskLevel: "SAFE",
  execute: async (args, context) => {
    const { session } = await getActiveContext(context);
    const sum = await session.getCompactPageSummary();
    const matches = [];
    sum.summary.split('\n').forEach(line => {
      if (line.toLowerCase().includes(args.keyword.toLowerCase())) {
        matches.push(line);
      }
    });
    return matches.length > 0 ? matches.join('\n') : "No elements matched the specified keyword.";
  }
});

// ==========================================
// 9. BROWSER_CLICK
// ==========================================
registerTool({
  name: "browser_click",
  description: "Clicks a visible element on the page using its element ID.",
  category: "browser",
  parameters: {
    type: "object",
    properties: {
      elementId: { type: "string", description: "Numeric ID of the interactive element from browser_get_page output." }
    },
    required: ["elementId"]
  },
  riskLevel: "CONFIRM",
  execute: async (args, context) => {
    const { session, page } = await getActiveContext(context);
    const selector = session.getSelectorById(args.elementId);
    
    notifySocket(context, 'browser_action_started', { action: 'click', elementId: args.elementId });
    await page.click(selector, { timeout: 10000 });
    notifySocket(context, 'browser_action_completed', { action: 'click', elementId: args.elementId });

    return `Successfully clicked element with ID ${args.elementId}. Current URL is: ${page.url()}`;
  }
});

// ==========================================
// 10. BROWSER_TYPE
// ==========================================
registerTool({
  name: "browser_type",
  description: "Enters text input into a form field/input area.",
  category: "browser",
  parameters: {
    type: "object",
    properties: {
      elementId: { type: "string", description: "Numeric ID of the input field." },
      text: { type: "string", description: "Text string to write." }
    },
    required: ["elementId", "text"]
  },
  riskLevel: "CONFIRM",
  execute: async (args, context) => {
    const { session, page } = await getActiveContext(context);
    const selector = session.getSelectorById(args.elementId);

    notifySocket(context, 'browser_action_started', { action: 'type', elementId: args.elementId });
    await page.fill(selector, args.text, { timeout: 10000 });
    notifySocket(context, 'browser_action_completed', { action: 'type', elementId: args.elementId });

    return `Successfully typed into element ID ${args.elementId}`;
  }
});

// ==========================================
// 11. BROWSER_SELECT
// ==========================================
registerTool({
  name: "browser_select",
  description: "Selects options inside a dropdown element.",
  category: "browser",
  parameters: {
    type: "object",
    properties: {
      elementId: { type: "string" },
      value: { type: "string", description: "The value or label attribute to select." }
    },
    required: ["elementId", "value"]
  },
  riskLevel: "CONFIRM",
  execute: async (args, context) => {
    const { session, page } = await getActiveContext(context);
    const selector = session.getSelectorById(args.elementId);
    await page.selectOption(selector, args.value, { timeout: 10000 });
    return `Selected dropdown option: ${args.value}`;
  }
});

// ==========================================
// 12. BROWSER_SCROLL
// ==========================================
registerTool({
  name: "browser_scroll",
  description: "Scrolls the page layout.",
  category: "browser",
  parameters: {
    type: "object",
    properties: {
      direction: { type: "string", enum: ["down", "up", "top", "bottom"] }
    },
    required: ["direction"]
  },
  riskLevel: "CONFIRM",
  execute: async (args, context) => {
    const { page } = await getActiveContext(context);
    if (args.direction === 'down') {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.7));
    } else if (args.direction === 'up') {
      await page.evaluate(() => window.scrollBy(0, -window.innerHeight * 0.7));
    } else if (args.direction === 'top') {
      await page.evaluate(() => window.scrollTo(0, 0));
    } else if (args.direction === 'bottom') {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    }
    return `Scrolled page: ${args.direction}`;
  }
});

// ==========================================
// 13. BROWSER_WAIT
// ==========================================
registerTool({
  name: "browser_wait",
  description: "Pauses execution for a duration (in milliseconds).",
  category: "browser",
  parameters: {
    type: "object",
    properties: {
      ms: { type: "number", description: "Milliseconds to wait." }
    },
    required: ["ms"]
  },
  riskLevel: "SAFE",
  execute: async (args, context) => {
    const { page } = await getActiveContext(context);
    await page.waitForTimeout(args.ms);
    return `Paused for ${args.ms} ms.`;
  }
});

// ==========================================
// 14. BROWSER_SCREENSHOT
// ==========================================
registerTool({
  name: "browser_screenshot",
  description: "Saves a screenshot image file of the current page viewport.",
  category: "browser",
  parameters: {
    type: "object",
    properties: {
      filename: { type: "string", description: "Target screenshot filename (e.g. screenshot.png)" }
    },
    required: ["filename"]
  },
  riskLevel: "SAFE",
  execute: async (args, context) => {
    const { page } = await getActiveContext(context);
    const targetPath = path.resolve(args.filename);

    // Safety workspace checks
    if (!targetPath.startsWith(path.resolve('.'))) {
      return "Security Error: Target path lies outside permitted workspace boundaries.";
    }

    await page.screenshot({ path: targetPath });
    notifySocket(context, 'browser_screenshot', { filepath: targetPath });
    return `Screenshot successfully captured and saved to: ${args.filename}`;
  }
});

// ==========================================
// 15. BROWSER_NEW_TAB
// ==========================================
registerTool({
  name: "browser_new_tab",
  description: "Opens a new page tab in the active browser context.",
  category: "browser",
  parameters: { type: "object", properties: {} },
  riskLevel: "SAFE",
  execute: async (args, context) => {
    const { session } = await getActiveContext(context);
    const page = await session.context.newPage();
    const tabId = `tab_${Object.keys(session.pages).length + 1}`;
    session.pages[tabId] = page;
    session.activeTabId = tabId;
    return `Opened new tab: ${tabId}`;
  }
});

// ==========================================
// 16. BROWSER_SWITCH_TAB
// ==========================================
registerTool({
  name: "browser_switch_tab",
  description: "Switches current tab focus by tab index ID.",
  category: "browser",
  parameters: {
    type: "object",
    properties: {
      tabId: { type: "string", description: "Tab ID e.g. tab_1, tab_2" }
    },
    required: ["tabId"]
  },
  riskLevel: "SAFE",
  execute: async (args, context) => {
    const { session } = await getActiveContext(context);
    if (!session.pages[args.tabId]) {
      return `Error: Tab ID "${args.tabId}" does not exist.`;
    }
    session.activeTabId = args.tabId;
    return `Switched active tab focus to: ${args.tabId}`;
  }
});

// ==========================================
// 17. BROWSER_CLOSE_TAB
// ==========================================
registerTool({
  name: "browser_close_tab",
  description: "Closes target page tab.",
  category: "browser",
  parameters: {
    type: "object",
    properties: {
      tabId: { type: "string" }
    },
    required: ["tabId"]
  },
  riskLevel: "DANGEROUS",
  execute: async (args, context) => {
    const { session } = await getActiveContext(context);
    const page = session.pages[args.tabId];
    if (!page) return `Error: Tab "${args.tabId}" not found.`;

    await page.close();
    delete session.pages[args.tabId];
    
    // Reset focus fallback
    const remaining = Object.keys(session.pages);
    if (remaining.length > 0) {
      session.activeTabId = remaining[0];
    } else {
      session.activeTabId = null;
    }
    return `Closed tab: ${args.tabId}`;
  }
});

// ==========================================
// 18. BROWSER_DOWNLOAD
// ==========================================
registerTool({
  name: "browser_download",
  description: "Triggers and saves page download asset inside workspace.",
  category: "browser",
  parameters: {
    type: "object",
    properties: {
      elementId: { type: "string", description: "Interactive element link triggering download." },
      filename: { type: "string" }
    },
    required: ["elementId", "filename"]
  },
  riskLevel: "CONFIRM",
  execute: async (args, context) => {
    const { session, page } = await getActiveContext(context);
    const selector = session.getSelectorById(args.elementId);
    
    const targetPath = path.resolve(args.filename);
    if (!targetPath.startsWith(path.resolve('.'))) {
      return "Security Error: Download destination lies outside workspace.";
    }

    // Start download expectation trigger
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.click(selector)
    ]);

    await download.saveAs(targetPath);
    notifySocket(context, 'browser_download', { filepath: targetPath });
    return `Download successfully saved to: ${args.filename}`;
  }
});

// ==========================================
// 19. BROWSER_UPLOAD
// ==========================================
registerTool({
  name: "browser_upload",
  description: "Uploads a workspace file into a file-selector element.",
  category: "browser",
  parameters: {
    type: "object",
    properties: {
      elementId: { type: "string" },
      filepath: { type: "string", description: "Workspace file path to upload." }
    },
    required: ["elementId", "filepath"]
  },
  riskLevel: "CONFIRM",
  execute: async (args, context) => {
    const { session, page } = await getActiveContext(context);
    const selector = session.getSelectorById(args.elementId);

    const fullPath = path.resolve(args.filepath);
    if (!fullPath.startsWith(path.resolve('.'))) {
      return "Security Error: Upload source lies outside workspace.";
    }

    if (!fs.existsSync(fullPath)) {
      return `Error: Source file does not exist at "${args.filepath}"`;
    }

    await page.setInputFiles(selector, fullPath);
    return `Uploaded file successfully to input selector.`;
  }
});

// ==========================================
// 20. BROWSER_CLOSE
// ==========================================
registerTool({
  name: "browser_close",
  description: "Closes the browser session context and kills active instances.",
  category: "browser",
  parameters: { type: "object", properties: {} },
  riskLevel: "DANGEROUS",
  execute: async (args, context) => {
    const taskId = context.taskId || 'default_task';
    await closeSession(taskId);
    return "Browser session successfully closed.";
  }
});
