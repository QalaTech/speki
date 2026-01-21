# OpenAI-Compatible API

Qala-ralph exposes an OpenAI-compatible API endpoint, allowing you to use any OpenAI-compatible chat UI (like LobeChat) as a frontend while maintaining the session-per-spec model.

## Endpoint

```
POST http://localhost:3001/v1/chat/completions
```

## Query Parameters

- `project` (required): Full path to the project directory
- `spec` (required): Spec filename (e.g., `my-feature.md`)
- `sessionId` (optional): Session UUID for resuming existing chats

## Request Format

Standard OpenAI chat completions format:

```json
{
  "model": "claude-sonnet-4",
  "messages": [
    {
      "role": "user",
      "content": "What improvements can you suggest for this spec?"
    }
  ],
  "stream": true
}
```

## Model Names

The `model` field determines which engine to use:

- `claude-sonnet-4` → Claude CLI (Sonnet)
- `claude-opus-4` → Claude CLI (Opus)
- `codex` → Codex CLI

The engine is selected by extracting the first part of the model name (e.g., `claude-*` → `claude`).

## Session Management

Each spec file gets its own session:

1. **First message**: Creates a new session, loads spec content into context
2. **Subsequent messages**: Resumes existing session with full conversation history
3. **Session storage**: Sessions are stored in `.ralph/specs/<spec-id>/review_state.json`

The `sessionId` query parameter is optional:
- If omitted on first message, a new session ID is created
- If provided, the endpoint will try to resume that session
- Sessions are persisted across server restarts

## Using with LobeChat

### 1. Start qala-ralph server

```bash
qala dashboard
```

Server runs on `http://localhost:3001` by default.

### 2. Configure LobeChat

Set environment variables:

```bash
OPENAI_PROXY_URL=http://localhost:3001/v1
OPENAI_API_KEY=dummy  # Qala ignores this
```

Or configure in LobeChat's settings UI:
- API Endpoint: `http://localhost:3001/v1`
- API Key: (anything, it's ignored)

### 3. Start a chat

In LobeChat, create a new conversation and select model `claude-sonnet-4`.

**Important**: You must specify the project and spec in the URL or LobeChat settings:

Option 1: Custom endpoint URL in LobeChat settings:
```
http://localhost:3001/v1/chat/completions?project=/path/to/project&spec=my-spec.md
```

Option 2: Use LobeChat's proxy settings to add query parameters.

## Streaming vs Non-Streaming

### Streaming (recommended)

```json
{
  "stream": true
}
```

Returns Server-Sent Events (SSE) with OpenAI streaming format:

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234567890,"model":"claude-sonnet-4","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: [DONE]
```

### Non-Streaming

```json
{
  "stream": false
}
```

Returns complete response:

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "claude-sonnet-4",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Based on reviewing your spec..."
    },
    "finish_reason": "stop"
  }]
}
```

## Example: cURL Request

### Streaming

```bash
curl -N 'http://localhost:3001/v1/chat/completions?project=/Users/you/myproject&spec=feature.md' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "claude-sonnet-4",
    "messages": [{"role": "user", "content": "Review this spec"}],
    "stream": true
  }'
```

### Non-Streaming

```bash
curl 'http://localhost:3001/v1/chat/completions?project=/Users/you/myproject&spec=feature.md' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "claude-sonnet-4",
    "messages": [{"role": "user", "content": "Review this spec"}],
    "stream": false
  }'
```

## List Models

```bash
curl http://localhost:3001/v1/models
```

Returns:

```json
{
  "object": "list",
  "data": [
    {"id": "claude-sonnet-4", "object": "model", "owned_by": "qala-ralph"},
    {"id": "claude-opus-4", "object": "model", "owned_by": "qala-ralph"},
    {"id": "codex", "object": "model", "owned_by": "qala-ralph"}
  ]
}
```

## Benefits

1. **Use any OpenAI-compatible UI**: LobeChat, ChatGPT UI, LibreChat, etc.
2. **Keep qala's features**: Session-per-spec, spec content in context, multi-engine support
3. **Better UX**: Polished chat interfaces with markdown rendering, code highlighting, file uploads
4. **RAG/Knowledge bases**: LobeChat supports RAG if you want to enhance spec review
5. **MCP integration**: LobeChat's MCP plugin marketplace works with qala's backend

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌───────────────┐
│  LobeChat   │         │  Qala Server │         │ Engine Layer  │
│   (UI)      │────────▶│  OpenAI API  │────────▶│ (Claude/Codex)│
└─────────────┘         └──────────────┘         └───────────────┘
                              │
                              ▼
                        ┌──────────────┐
                        │  Session     │
                        │  Storage     │
                        │ (.ralph/)    │
                        └──────────────┘
```

The OpenAI-compatible endpoint:
1. Receives standard OpenAI request
2. Extracts project/spec from query params
3. Loads or creates session for that spec
4. Selects engine based on model name
5. Translates between OpenAI format and Engine interface
6. Returns response in OpenAI format
7. Persists chat history to session file

## Limitations

- LobeChat needs a way to pass `project` and `spec` query parameters
- Some LobeChat features (like file uploads) may not work without additional integration
- The spec content is only loaded on the first message (as system context)

## Future Enhancements

- Auto-detect project from current directory if not specified
- Support for multiple concurrent spec chats in LobeChat
- Better integration with LobeChat's settings/model switching
- Support for LobeChat's file upload → attach to spec context
