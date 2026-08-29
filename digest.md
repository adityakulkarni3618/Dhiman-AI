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

## 2026-08-29

- Transformed chatbot architecture into a production-grade autonomous agent runtime.
- Added Mongoose models for `Task`, `TaskStep`, and `Approval` to support persistent task tracking.
- Created central agent engine files (`agentRuntime.js`, `planner.js`, `executor.js`, `verifier.js`, `recoveryManager.js`, `contextManager.js`).
- Implemented structured LLM model router (`llm/router.js`) and centralized `tools/registry.js`.
- Registered Filesystem, Terminal, Web Search, Browser, GitHub, and email/calendar tools.
- Set up agent REST routes (`/api/agent/*`) and updated WebSocket connections to leverage the `runTask` runtime.
- Enhanced the React frontend chat interface to display task progress steps and timelines.
- Added unit test suite `backend/tests/agent.test.js` validating registry safety policies.
- Implemented integration test suite `backend/tests/integration.test.js` verifying task plans, terminal approvals, and WebSocket broadcasts.
- Added programmatic fallback safety overrides inside the agent runtime loop for missing credentials environments.
- Upgraded Dhiman-AI into a multimodal operating assistant with central config startup validation and dynamic tool discovery.
- Implemented Windows-native computer control tools (screenshots, active window queries, mouse/keyboard triggers, application launching) via PowerShell wrappers.
- Created coding agent utilities (grep searching, file patching, test/build executions) and Git/GitHub API wrappers.
- Integrated mock-fallback email, calendar, and Functionize REST clients.
- Upgraded Episodic and Semantic memory pipelines and added server-side Voice STT/TTS routing.
- Built a background task worker queue, scheduler loops, in-app notifications, and React dashboards.
- Added multimodal integration test suite `backend/tests/multimodal.test.js` (all tests passed).
- Implemented `backend/agent/assistantRouter.js` separating Conversational Mode from Agent Mode.
- Integrated process-level Windows launch verification inside the `application_launch` tool using PowerShell `Get-Process`.
- Redefined fallback summary strings to avoid exposing internal LLM credentials warning blocks to the user.
- Created `backend/agent/goalManager.js` implementing goal state tracking and pause/resume/cancel controllers.
- Integrated Dynamic Capability Selection filtering within `backend/agent/planner.js` and the tool registry.
- Implemented `backend/agent/appResolver.js` for generic Windows app installation and path discovery.
- Upgraded the Agent Runtime task loop to handle cancellations, pause triggers, and dynamic replanning on tool failures.
- Implemented `backend/agent/entityResolver.js` for confidence-based project, file, and alias resolution.
- Integrated contextual resolution mappings for conversational active project contexts and pronouns ("run it", "stop it").
- Upgraded `backend/agent/verifier.js` to run goal-specific programmatic checks on active process properties.
- Added background running and termination capabilities inside `backend/tools/codingTools.js`.




