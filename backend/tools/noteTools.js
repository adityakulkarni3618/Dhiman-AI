const Note = require('../models/Note');
const { ScheduledTask } = require('../tasks/taskQueue');
const { registerTool } = require('./registry');

// ==========================================
// 1. NOTE_CREATE
// ==========================================
registerTool({
  name: "note_create",
  description: "Creates and saves a persistent structured note.",
  category: "notes",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "Title of the note." },
      content: { type: "string", description: "Text content of the note." },
      tags: { type: "array", items: { type: "string" }, description: "Optional tags." }
    },
    required: ["title", "content"]
  },
  riskLevel: "SAFE",
  execute: async (args) => {
    try {
      const note = new Note({
        title: args.title,
        content: args.content,
        tags: args.tags || []
      });
      await note.save();
      
      // Update entity resolver active context
      const { updateContext } = require('../agent/entityResolver');
      updateContext({ activeNote: note._id.toString() });

      return `Successfully created note: "${args.title}" with ID: ${note._id}`;
    } catch (err) {
      return `Failed to create note: ${err.message}`;
    }
  }
});

// ==========================================
// 2. NOTE_GET
// ==========================================
registerTool({
  name: "note_get",
  description: "Finds and returns notes by matching a query string in the title, content, or tags.",
  category: "notes",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Query string to search in notes." }
    },
    required: ["query"]
  },
  riskLevel: "SAFE",
  execute: async (args) => {
    try {
      const regex = new RegExp(args.query, 'i');
      const notes = await Note.find({
        $or: [
          { title: regex },
          { content: regex },
          { tags: regex }
        ]
      });

      if (notes.length === 0) {
        return `No notes found matching query "${args.query}".`;
      }

      return notes.map(n => `[ID: ${n._id}] Title: ${n.title}\nContent: ${n.content}\nTags: ${n.tags.join(', ')}`).join('\n\n');
    } catch (err) {
      return `Failed to search notes: ${err.message}`;
    }
  }
});

// ==========================================
// 3. NOTE_LIST
// ==========================================
registerTool({
  name: "note_list",
  description: "Lists all persistent notes saved in the system.",
  category: "notes",
  parameters: { type: "object", properties: {} },
  riskLevel: "SAFE",
  execute: async () => {
    try {
      const notes = await Note.find().sort({ updatedAt: -1 });
      if (notes.length === 0) {
        return "No notes stored currently.";
      }
      return notes.map(n => `[ID: ${n._id}] Title: ${n.title} (Updated: ${n.updatedAt.toISOString()})`).join('\n');
    } catch (err) {
      return `Failed to list notes: ${err.message}`;
    }
  }
});

// ==========================================
// 4. NOTE_DELETE
// ==========================================
registerTool({
  name: "note_delete",
  description: "Deletes a persistent note by its ID or exact title.",
  category: "notes",
  parameters: {
    type: "object",
    properties: {
      noteIdentifier: { type: "string", description: "The ID or exact title of the note to delete." }
    },
    required: ["noteIdentifier"]
  },
  riskLevel: "CONFIRM",
  execute: async (args) => {
    try {
      let result;
      if (args.noteIdentifier.match(/^[0-9a-fA-F]{24}$/)) {
        result = await Note.findByIdAndDelete(args.noteIdentifier);
      } else {
        result = await Note.findOneAndDelete({ title: args.noteIdentifier });
      }

      if (!result) {
        return `Note not found matching identifier "${args.noteIdentifier}".`;
      }
      return `Note "${result.title}" was deleted successfully.`;
    } catch (err) {
      return `Failed to delete note: ${err.message}`;
    }
  }
});

// ==========================================
// 5. SCHEDULE_TASK
// ==========================================
registerTool({
  name: "schedule_task",
  description: "Schedules a background task/reminder to run at a specific frequency (e.g. daily, hourly, 'every 5 minutes').",
  category: "scheduler",
  parameters: {
    type: "object",
    properties: {
      goal: { type: "string", description: "The agent task/reminder goal to execute." },
      frequency: { type: "string", description: "Run frequency, e.g. 'daily', 'hourly', 'every 30 minutes', or a day (e.g. 'every Monday')." }
    },
    required: ["goal", "frequency"]
  },
  riskLevel: "CONFIRM",
  execute: async (args) => {
    try {
      let offset = 24 * 60 * 60 * 1000; // default daily
      const freq = args.frequency.toLowerCase();
      if (freq.includes('hour')) offset = 60 * 60 * 1000;
      else if (freq.includes('minute')) {
        const match = freq.match(/(\d+)/);
        const mins = match ? parseInt(match[1], 10) : 5;
        offset = mins * 60 * 1000;
      } else if (freq.includes('monday') || freq.includes('every monday')) {
        offset = 7 * 24 * 60 * 60 * 1000;
      }

      const newTask = new ScheduledTask({
        goal: args.goal,
        frequency: args.frequency,
        nextRun: new Date(Date.now() + offset)
      });
      await newTask.save();
      return `Task scheduled successfully: "${args.goal}" running frequency: "${args.frequency}". Next run: ${newTask.nextRun.toISOString()}`;
    } catch (err) {
      return `Failed to schedule task: ${err.message}`;
    }
  }
});

// ==========================================
// 6. SCHEDULE_LIST
// ==========================================
registerTool({
  name: "schedule_list",
  description: "Lists all currently scheduled tasks/reminders.",
  category: "scheduler",
  parameters: { type: "object", properties: {} },
  riskLevel: "SAFE",
  execute: async () => {
    try {
      const tasks = await ScheduledTask.find();
      if (tasks.length === 0) {
        return "No scheduled tasks/reminders currently.";
      }
      return tasks.map(t => `[ID: ${t._id}] Goal: "${t.goal}" | Frequency: ${t.frequency} | Active: ${t.active} | Next Run: ${t.nextRun.toISOString()}`).join('\n');
    } catch (err) {
      return `Failed to list scheduled tasks: ${err.message}`;
    }
  }
});

// ==========================================
// 7. SCHEDULE_CANCEL
// ==========================================
registerTool({
  name: "schedule_cancel",
  description: "Cancels/deletes a scheduled task or reminder by ID.",
  category: "scheduler",
  parameters: {
    type: "object",
    properties: {
      scheduleId: { type: "string", description: "The database ID of the scheduled task." }
    },
    required: ["scheduleId"]
  },
  riskLevel: "CONFIRM",
  execute: async (args) => {
    try {
      const deleted = await ScheduledTask.findByIdAndDelete(args.scheduleId);
      if (!deleted) {
        return `Scheduled task ID "${args.scheduleId}" not found.`;
      }
      return `Scheduled task "${deleted.goal}" has been cancelled successfully.`;
    } catch (err) {
      return `Failed to cancel scheduled task: ${err.message}`;
    }
  }
});
