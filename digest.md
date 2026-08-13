# Digest

## 2026-08-11

- Created `README.md` with project overview and run/install instructions.
- Created `digest.md` (this file) to record the change log.

## 2026-08-13

- Migrated persistence layer from Supabase (PostgreSQL) to local MongoDB using Mongoose.
- Added Mongoose models for Conversations, Messages, and MemoryFacts.
- Refactored database wrapper `db.js` and server endpoints in `server.js` to query MongoDB.
- Implemented client-side speech synthesis null safeguards in `App.js`.

