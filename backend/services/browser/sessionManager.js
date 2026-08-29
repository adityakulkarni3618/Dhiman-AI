const playwright = require('playwright');

class BrowserSession {
  constructor(taskId) {
    this.taskId = taskId;
    this.browser = null;
    this.context = null;
    this.pages = {}; // map of tabId -> page
    this.activeTabId = null;
    this.elementsMap = new Map(); // maps numeric ID -> CSS/XPath/locator details
    this.nextElementId = 1;
  }

  async initialize() {
    if (this.browser) return;
    console.log(`[BROWSER SESSION] Launching browser for task: ${this.taskId}`);
    this.browser = await playwright.chromium.launch({
      headless: true
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 }
    });
    
    // Create first page
    const page = await this.context.newPage();
    const tabId = 'tab_1';
    this.pages[tabId] = page;
    this.activeTabId = tabId;
  }

  getActivePage() {
    if (!this.activeTabId || !this.pages[this.activeTabId]) {
      throw new Error("No active tab/page available in current browser session.");
    }
    return this.pages[this.activeTabId];
  }

  async close() {
    console.log(`[BROWSER SESSION] Closing browser for task: ${this.taskId}`);
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
    this.browser = null;
    this.context = null;
    this.pages = {};
    this.activeTabId = null;
    this.elementsMap.clear();
  }

  /**
   * Scrapes the active page and extracts inputs, buttons, and links with temporary IDs.
   */
  async getCompactPageSummary() {
    const page = this.getActivePage();
    const url = page.url();
    const title = await page.title();

    // Reset element maps for the new page load
    this.elementsMap.clear();
    this.nextElementId = 1;

    // Retrieve interactive elements
    const elementsData = await page.evaluate(() => {
      const results = [];
      const selectors = ['a', 'button', 'input', 'select', 'textarea', '[role="button"]'];
      
      let idCounter = 1;
      selectors.forEach(sel => {
        const nodes = document.querySelectorAll(sel);
        nodes.forEach(node => {
          // Check visibility
          const rect = node.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0 && 
                            window.getComputedStyle(node).display !== 'none' &&
                            window.getComputedStyle(node).visibility !== 'hidden';
          if (!isVisible) return;

          // Generate dynamic locator path for matching
          const tagName = node.tagName.toLowerCase();
          const text = (node.innerText || node.value || '').trim().slice(0, 50);
          const placeholder = node.getAttribute('placeholder') || '';
          const name = node.getAttribute('name') || '';
          const idAttr = node.getAttribute('id') || '';

          // Build attributes description
          let desc = `[${tagName}`;
          if (idAttr) desc += ` id="${idAttr}"`;
          if (name) desc += ` name="${name}"`;
          if (placeholder) desc += ` placeholder="${placeholder}"`;
          if (text) desc += ` text="${text}"`;
          desc += `]`;

          // Generate a simple CSS selector path
          let cssSelector = tagName;
          if (idAttr) {
            cssSelector += `#${CSS.escape(idAttr)}`;
          } else if (name) {
            cssSelector += `[name="${CSS.escape(name)}"]`;
          } else if (placeholder) {
            cssSelector += `[placeholder="${CSS.escape(placeholder)}"]`;
          }

          results.push({
            id: idCounter++,
            desc,
            cssSelector,
            tagName,
            text
          });
        });
      });
      return results;
    });

    // Populate elementsMap in node process
    let summaryText = `PAGE URL: ${url}\nPAGE TITLE: ${title}\n\nINTERACTIVE ELEMENTS:\n`;
    if (elementsData.length === 0) {
      summaryText += "(No visible interactive elements found on this page)\n";
    } else {
      elementsData.forEach(el => {
        this.elementsMap.set(el.id, el.cssSelector);
        summaryText += `${el.id}: ${el.desc}\n`;
      });
    }

    return {
      url,
      title,
      summary: summaryText
    };
  }

  getSelectorById(elementId) {
    const numericId = parseInt(elementId, 10);
    const selector = this.elementsMap.get(numericId);
    if (!selector) {
      throw new Error(`Selector ID "${elementId}" not found or page has reloaded.`);
    }
    return selector;
  }
}

// Global active sessions map (taskId -> BrowserSession)
const activeSessions = {};

function getOrCreateSession(taskId) {
  if (!activeSessions[taskId]) {
    activeSessions[taskId] = new BrowserSession(taskId);
  }
  return activeSessions[taskId];
}

async function closeSession(taskId) {
  const session = activeSessions[taskId];
  if (session) {
    await session.close();
    delete activeSessions[taskId];
  }
}

module.exports = {
  getOrCreateSession,
  closeSession,
  BrowserSession
};
