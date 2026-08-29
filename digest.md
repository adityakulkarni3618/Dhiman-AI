# Digest

## 2026-08-11

- Created `README.md` with project overview and run/install instructions.
- Created `digest.md` (this file) to record the change log.

## 2026-08-13

- Migrated persistence layer from Supabase (PostgreSQL) to local MongoDB using Mongoose.
- Added Mongoose models for Conversations, Messages, and MemoryFacts.
- Refactored database wrapper `db.js` and server endpoints in `server.js` to query MongoDB.
- Implemented client-side speech synthesis null safeguards in `App.js`.

## 2026-08-13

- Added support for Anthropic Claude API client integration and fallback embeddings.
- Added JSON serialization support for structured tool-use payloads in Message contents in MongoDB.
- Implemented Claude tools spec/handler loops in backend routes and WebSockets.
- Updated system prompt/persona to establish Dhiman as a general-purpose assistant.
- Migrated socket connection and HTTP route LLM loops to OpenRouter Gemini models.

## 2026-08-14

- Implemented safe system tools for date/time retrieval, Tavily web search, launching local applications, and opening URLs.
- Implemented interactive terminal command execution wrapper (`run_terminal_command`) with real-time approval.
- Added security validation dialog in frontend (`App.js`) requiring manual approval before terminal execution.
