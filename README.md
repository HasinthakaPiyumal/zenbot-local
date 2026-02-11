# Web Embedded AI Bot

Node.js + React chat app with an on-device LLM (Transformers.js v4, Qwen3-0.6B-ONNX). WhatsApp-style UI; model download progress is shown in the Node console and synced to the frontend via SSE.

## Prerequisites

- Node.js 18+
- npm 9+

## Setup

```bash
# Root (optional - run both server and client)
npm install

# Server
cd server && npm install

# Client
cd client && npm install
```

**Note:** The first `npm install` in `server/` may take several minutes (downloads ONNX runtime and model assets).

## Run

**Option 1 – from root (both at once):**
```bash
npm run dev
```

**Option 2 – separately:**
```bash
# Terminal 1
cd server && npm run dev

# Terminal 2
cd client && npm run dev
```

- **Server:** http://localhost:3000  
- **Client:** http://localhost:5173  

Set `VITE_API_URL` in `client/.env` if the API runs on a different host/port.

## API

- `GET /api/chat` – list messages  
- `POST /api/chat` – send user message, get back user + assistant messages (body: `{ "content": "..." }`)  
- `GET /api/model-progress` – SSE stream of model load progress and `{ "ready": true }` when done  
- `POST /api/ai/generate` – body `{ "message": "..." }`, returns `{ "reply": "..." }`

## Stack

- **Server:** Node.js, Express, TypeScript, `@huggingface/transformers@4.0.0-next.2`  
- **Client:** React, Vite, TypeScript  
