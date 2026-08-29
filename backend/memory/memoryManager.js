const db = require('../db');
const MemoryFact = require('../models/MemoryFact');
const Message = require('../models/Message');
const Task = require('../models/Task');
const ai = require('../services/ai');

// In-memory cache for temporary settings or active task scopes
const memoryConfig = {
  enabled: true
};

/**
 * 1. Semantic/Long-Term Memory: Search relevant facts by text query.
 */
async function searchSemanticMemory(queryText, limit = 5) {
  if (!memoryConfig.enabled) return [];
  try {
    const queryEmbedding = await ai.getEmbedding(queryText);
    if (!queryEmbedding) return [];
    return await db.fetchRelevantMemoryFacts(queryEmbedding, limit);
  } catch (err) {
    console.warn("[MEMORY] Semantic search skipped:", err.message);
    return [];
  }
}

/**
 * 2. Episodic Memory: Extract and return summaries of previous completed tasks.
 */
async function getEpisodicMemory(limit = 5) {
  try {
    const completedTasks = await Task.find({ status: 'COMPLETED' })
      .sort({ updatedAt: -1 })
      .limit(limit);
    return completedTasks.map(t => ({
      taskId: t._id.toString(),
      goal: t.goal,
      result: t.result,
      completedAt: t.completedAt
    }));
  } catch (err) {
    console.warn("[MEMORY] Failed to retrieve episodic memory:", err.message);
    return [];
  }
}

/**
 * 3. CRUD operations on memories
 */
async function listAllMemories() {
  return await db.listAllMemoryFacts();
}

async function addMemory(factText) {
  const cleaned = factText.trim();
  if (cleaned.length < 5) {
    throw new Error("Fact detail is too short.");
  }
  // Filter credentials/passwords out
  if (/\b(password|pass|secret|key|token|auth)\b/i.test(cleaned)) {
    throw new Error("Security block: Facts containing credentials cannot be saved to persistent memory.");
  }
  const embedding = await ai.getEmbedding(cleaned);
  return await db.addManualMemoryFact(cleaned, embedding);
}

async function deleteMemory(id) {
  return await db.deleteMemoryFact(id);
}

async function updateMemory(id, newFactText) {
  const cleaned = newFactText.trim();
  const embedding = await ai.getEmbedding(cleaned);
  const updated = await MemoryFact.findByIdAndUpdate(id, {
    fact: cleaned,
    embedding
  }, { new: true });
  return { id: updated._id.toString(), fact: updated.fact };
}

function setMemoryEnabled(isEnabled) {
  memoryConfig.enabled = isEnabled;
}

function isMemoryEnabled() {
  return memoryConfig.enabled;
}

module.exports = {
  searchSemanticMemory,
  getEpisodicMemory,
  listAllMemories,
  addMemory,
  deleteMemory,
  updateMemory,
  setMemoryEnabled,
  isMemoryEnabled
};
