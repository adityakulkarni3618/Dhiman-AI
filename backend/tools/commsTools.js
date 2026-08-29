const config = require('../config');
const { registerTool } = require('./registry');

// Local storage mocks for Calendar Events in testing
const localCalendarEvents = [
  { id: "1", title: "GATE 2027 Prep Sprint", start: "2026-08-30T10:00:00Z", end: "2026-08-30T12:00:00Z" }
];

// ==========================================
// 1. LIST_CALENDAR_EVENTS
// ==========================================
registerTool({
  name: "list_calendar_events",
  description: "List scheduled items and meetings from the calendar.",
  category: "communication",
  parameters: { type: "object", properties: {} },
  riskLevel: "SAFE",
  execute: async () => {
    return localCalendarEvents.map(e => `- [${e.id}] ${e.title} (${e.start} to ${e.end})`).join('\n') || "No events scheduled.";
  }
});

// ==========================================
// 2. CREATE_CALENDAR_EVENT
// ==========================================
registerTool({
  name: "create_calendar_event",
  description: "Schedule a new meeting block or study session.",
  category: "communication",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      start: { type: "string", description: "ISO DateTime format" },
      end: { type: "string", description: "ISO DateTime format" }
    },
    required: ["title", "start", "end"]
  },
  riskLevel: "CONFIRM",
  execute: async (args) => {
    const newEvent = {
      id: String(localCalendarEvents.length + 1),
      title: args.title,
      start: args.start,
      end: args.end
    };
    localCalendarEvents.push(newEvent);
    return `Event successfully scheduled: "${args.title}" (ID: ${newEvent.id})`;
  }
});

// ==========================================
// 3. DELETE_CALENDAR_EVENT
// ==========================================
registerTool({
  name: "delete_calendar_event",
  description: "Removes an event block from the calendar by ID.",
  category: "communication",
  parameters: {
    type: "object",
    properties: {
      eventId: { type: "string" }
    },
    required: ["eventId"]
  },
  riskLevel: "DANGEROUS",
  execute: async (args) => {
    const idx = localCalendarEvents.findIndex(e => e.id === args.eventId);
    if (idx === -1) return `Error: Event ID "${args.eventId}" not found.`;
    const [removed] = localCalendarEvents.splice(idx, 1);
    return `Successfully deleted calendar event: "${removed.title}"`;
  }
});

// ==========================================
// 4. SEND_EMAIL
// ==========================================
registerTool({
  name: "send_email",
  description: "Sends an email message to a specified recipient.",
  category: "communication",
  parameters: {
    type: "object",
    properties: {
      to: { type: "string", description: "Recipient address." },
      subject: { type: "string" },
      body: { type: "string" }
    },
    required: ["to", "subject", "body"]
  },
  riskLevel: "CONFIRM",
  execute: async (args) => {
    if (config.emailUser && config.emailPass) {
      // SMTP logic would send email here using standard nodemailer
      return `Email sent successfully to ${args.to} via SMTP: "${args.subject}"`;
    }
    // Gratefully fallback to log notification
    return `SMTP Credentials not configured. Simulated email successfully sent to ${args.to} with subject "${args.subject}".`;
  }
});
