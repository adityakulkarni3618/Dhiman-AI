-- Supabase / Postgres migration for Dhiman-AI memory match optimization
-- This creates an RPC function in the public schema to query similarity utilizing pgvector.

CREATE OR REPLACE FUNCTION dhiman_match_memories(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  fact text,
  source_message_id uuid,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dhiman_memory_facts.id,
    dhiman_memory_facts.fact,
    dhiman_memory_facts.source_message_id,
    1 - (dhiman_memory_facts.embedding <=> query_embedding) AS similarity
  FROM dhiman_memory_facts
  WHERE 1 - (dhiman_memory_facts.embedding <=> query_embedding) > match_threshold
  ORDER BY dhiman_memory_facts.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
