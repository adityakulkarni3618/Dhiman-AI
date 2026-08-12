const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

let supabase = null;
if (config.supabaseUrl && config.supabaseServiceKey) {
  supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
} else {
  console.warn("⚠️  SUPABASE CREDENTIALS MISSING. Database operations will fail. Configure keys in your .env vault.");
  // Create a Proxy client to avoid throwing on start but report descriptive errors on invocation
  supabase = new Proxy({}, {
    get: (target, prop) => {
      return () => {
        throw new Error(`Database query failed: "${prop}" was called but SUPABASE_URL/SUPABASE_SERVICE_KEY is missing in your .env vault.`);
      };
    }
  });
}

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

async function getOrCreateConversation(conversationId, initialTitle) {
  if (conversationId) {
    const { data, error } = await supabase
      .from('dhiman_conversations')
      .select('id')
      .eq('id', conversationId)
      .single();
    if (!error && data) {
      return data.id;
    }
  }

  const title = initialTitle?.trim().slice(0, 120) || 'New conversation';
  const { data, error } = await supabase
    .from('dhiman_conversations')
    .insert({ title })
    .select('id')
    .single();

  if (error) {
    throw error;
  }
  return data.id;
}

async function saveMessage(conversationId, role, content) {
  const { data, error } = await supabase
    .from('dhiman_messages')
    .insert({ conversation_id: conversationId, role, content })
    .select('id')
    .single();

  if (error) {
    throw error;
  }
  return data;
}

async function getRecentMessages(conversationId, limit = 20) {
  const { data, error } = await supabase
    .from('dhiman_messages')
    .select('id,role,content,created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }
  return data || [];
}

async function fetchRelevantMemoryFacts(queryEmbedding, topK = 3) {
  try {
    // Attempt standard RPC match on dhiman_match_memories
    const { data, error } = await supabase.rpc('dhiman_match_memories', {
      query_embedding: queryEmbedding,
      match_threshold: 0.6,
      match_count: topK
    });

    if (!error && data) {
      return data;
    }

    console.warn("dhiman_match_memories RPC not found or failed, falling back to in-memory matching:", error?.message);
  } catch (err) {
    console.warn("RPC fetch error, falling back to in-memory:", err.message);
  }

  // Fallback to fetching memory facts in-memory and sorting (legacy mode)
  const { data, error } = await supabase
    .from('dhiman_memory_facts')
    .select('id,fact,embedding,source_message_id,created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.warn('Memory lookup warning:', error.message);
    return [];
  }

  return (data || [])
    .map((row) => {
      const embedding = parseVector(row.embedding);
      return {
        ...row,
        similarity: embedding ? cosineSimilarity(queryEmbedding, embedding) : 0
      };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
    .filter((row) => row.similarity > 0.6);
}

async function createMemoryFacts(facts, sourceMessageId, embeddings) {
  if (facts.length === 0) return [];

  const inserts = [];
  for (let i = 0; i < facts.length; i++) {
    const fact = facts[i];
    const embedding = embeddings[i];
    if (Array.isArray(embedding)) {
      inserts.push({ fact, embedding, source_message_id: sourceMessageId });
    }
  }

  if (inserts.length === 0) return [];

  const { data, error } = await supabase
    .from('dhiman_memory_facts')
    .insert(inserts)
    .select('id,fact');

  if (error) {
    throw error;
  }
  return data || [];
}

async function listAllMemoryFacts() {
  const { data, error } = await supabase
    .from('dhiman_memory_facts')
    .select('id,fact,created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function deleteMemoryFact(id) {
  const { error } = await supabase
    .from('dhiman_memory_facts')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return { success: true };
}

async function addManualMemoryFact(fact, embedding) {
  const { data, error } = await supabase
    .from('dhiman_memory_facts')
    .insert({ fact, embedding })
    .select('id,fact')
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  supabase,
  getOrCreateConversation,
  saveMessage,
  getRecentMessages,
  fetchRelevantMemoryFacts,
  createMemoryFacts,
  listAllMemoryFacts,
  deleteMemoryFact,
  addManualMemoryFact
};
