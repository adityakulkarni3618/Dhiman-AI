const mongoose = require('mongoose');
const config = require('./config');
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');
const MemoryFact = require('./models/MemoryFact');

// Connect to MongoDB
if (config.mongodbUri) {
  mongoose.connect(config.mongodbUri)
    .then(() => console.log('✅ Connected to MongoDB successfully.'))
    .catch((err) => console.error('❌ MongoDB Connection Error:', err));
} else {
  console.warn("⚠️  MONGODB_URI is missing in config/env. Database operations will fail.");
}

// Cosine similarity helper for local memory matching
const parseVector = (value) => {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value.replace(/\(|\)/g, ''));
    } catch (_e) {
      return null;
    }
  }
  if (typeof value === 'object' && value.data) {
    return value.data;
  }
  return null;
};

const dotProduct = (a, b) => a.reduce((sum, x, idx) => sum + x * b[idx], 0);
const magnitude = (vector) => Math.sqrt(dotProduct(vector, vector));
const cosineSimilarity = (a, b) => {
  if (!a || !b || a.length !== b.length) return 0;
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  return dotProduct(a, b) / (magA * magB);
};

// 1. Get or Create Conversation
async function getOrCreateConversation(conversationId, initialTitle) {
  if (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) {
    const existing = await Conversation.findById(conversationId);
    if (existing) return existing._id.toString();
  }

  const title = initialTitle?.trim().slice(0, 120) || 'New conversation';
  const newConv = await Conversation.create({ title });
  return newConv._id.toString();
}

// 2. Save Message
async function saveMessage(conversationId, role, content) {
  const newMessage = await Message.create({
    conversationId,
    role,
    content
  });
  return { id: newMessage._id.toString(), role, content };
}

// 3. Get Recent Messages
async function getRecentMessages(conversationId, limit = 20) {
  if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
    return [];
  }
  const messages = await Message.find({ conversationId })
    .sort({ createdAt: 1 })
    .limit(limit);
    
  return messages.map(msg => ({
    id: msg._id.toString(),
    role: msg.role,
    content: msg.content,
    created_at: msg.createdAt
  }));
}

// 4. Fetch Relevant Memory Facts (using local cosine similarity comparison)
async function fetchRelevantMemoryFacts(queryEmbedding, topK = 3) {
  const allMemories = await MemoryFact.find({});
  
  return allMemories
    .map((row) => ({
      id: row._id.toString(),
      fact: row.fact,
      embedding: row.embedding,
      similarity: row.embedding ? cosineSimilarity(queryEmbedding, row.embedding) : 0
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .filter((row) => row.similarity > 0.6)
    .slice(0, topK);
}

// 5. Create Memory Facts
async function createMemoryFacts(facts, sourceMessageId, embeddings) {
  const inserts = [];
  for (let i = 0; i < facts.length; i++) {
    if (Array.isArray(embeddings[i])) {
      inserts.push({
        fact: facts[i],
        embedding: embeddings[i],
        sourceMessageId: mongoose.Types.ObjectId.isValid(sourceMessageId) ? sourceMessageId : null
      });
    }
  }
  
  if (inserts.length === 0) return [];
  const results = await MemoryFact.insertMany(inserts);
  return results.map(r => ({ id: r._id.toString(), fact: r.fact }));
}

// 6. List All Memories
async function listAllMemoryFacts() {
  const list = await MemoryFact.find({}).sort({ createdAt: -1 });
  return list.map(item => ({
    id: item._id.toString(),
    fact: item.fact,
    created_at: item.createdAt
  }));
}

// 7. Delete Memory Fact
async function deleteMemoryFact(id) {
  if (mongoose.Types.ObjectId.isValid(id)) {
    await MemoryFact.findByIdAndDelete(id);
  }
  return { success: true };
}

// 8. Add Manual Memory Fact
async function addManualMemoryFact(fact, embedding) {
  const manualFact = await MemoryFact.create({ fact, embedding });
  return { id: manualFact._id.toString(), fact: manualFact.fact };
}

// 9. List Conversations
async function listConversations() {
  const list = await Conversation.find({}).sort({ createdAt: -1 });
  return list.map(c => ({
    id: c._id.toString(),
    title: c.title,
    created_at: c.createdAt
  }));
}

module.exports = {
  getOrCreateConversation,
  saveMessage,
  getRecentMessages,
  fetchRelevantMemoryFacts,
  createMemoryFacts,
  listAllMemoryFacts,
  deleteMemoryFact,
  addManualMemoryFact,
  listConversations
};
