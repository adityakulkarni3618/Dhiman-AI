# Dhiman-AI

Simple fullstack app with frontend/ (React) and backend/ (Node).

## Project structure

- frontend/: React front-end
- backend/: Node back-end

Key files:

- [frontend/src/App.js](frontend/src/App.js)
- [backend/server.js](backend/server.js)

## Prerequisites

- Node.js (16+ recommended)

## Install

Install dependencies for both apps:

```bash
cd frontend
npm install

cd ../backend
npm install
```

## Run (development)

Run frontend and backend in separate terminals:

Frontend:

```bash
cd frontend
npm start
```

Backend:

```bash
cd backend
npm start
```

If `npm start` is defined for the backend, use `npm start` instead of `node server.js`.

## Build (frontend)

```bash
cd frontend
npm run build
```

## Notes

- Edit the front-end in [frontend/src](frontend/src).
- Edit the back-end in [backend](backend).

## Database Configuration

This project persists chat sessions and memories locally using **MongoDB**.

1. **Prerequisite**: Ensure a local MongoDB instance is running (usually on `mongodb://localhost:27017`).
2. **Environment**: Create or edit `backend/.env` and define:
   ```env
   MONGODB_URI=mongodb://localhost:27017/dhiman_ai
   ```

## AI and Search Configuration

The assistant leverages OpenRouter (Gemini) and Anthropic (Claude) for text/tool operations, and Tavily for web searches.

Configure the API keys in `backend/.env`:
```env
# OpenRouter API Key (Gemini)
OPENROUTER_API_KEY=your-openrouter-key

# Anthropic API Key (Claude)
ANTHROPIC_API_KEY=your-anthropic-key

# OpenAI API Key (Embeddings)
OPENAI_API_KEY=your-openai-key

# Tavily API Key (Web Search)
TAVILY_API_KEY=your-tavily-key
```

## Security & Interactive Tools

Dhiman features system integration capabilities, including local terminal command execution. For host security:
- Whenever the assistant triggers the `run_terminal_command` tool, the frontend renders a security approval modal.
- Commands will remain pending and will not run until you explicitly click **APPROVE & EXECUTE**.
