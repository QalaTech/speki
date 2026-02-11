/**
 * OpenAI-compatible API endpoint for LobeChat integration.
 *
 * This endpoint allows LobeChat (and other OpenAI-compatible UIs) to use
 * qala-ralph's multi-engine backend while maintaining session-per-spec model.
 *
 * Usage from LobeChat:
 * OPENAI_PROXY_URL=http://localhost:3001/v1
 *
 * Request format:
 * POST /v1/chat/completions?project=/path/to/project&spec=my-spec.md&sessionId=uuid
 *
 * The endpoint:
 * - Creates a new session on first message for a spec
 * - Resumes existing sessions on subsequent messages
 * - Loads spec content into session context
 * - Supports streaming and non-streaming responses
 * - Translates between OpenAI format and qala's Engine interface
 */

import { Router, Request, Response } from 'express';
import { selectEngine } from '@speki/core';
import { loadSpecContent } from '@speki/core';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { loadSession, saveSession } from '@speki/core';
import type { ChatMessage, SessionFile } from '@speki/core';

const router = Router();

// OpenAI message format
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// OpenAI chat completion request
interface OpenAIChatCompletionRequest {
  model: string;
  messages: OpenAIMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

// OpenAI chat completion response (non-streaming)
interface OpenAIChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: 'stop' | 'length' | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// OpenAI streaming chunk
interface OpenAIChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
    };
    finish_reason: 'stop' | 'length' | null;
  }>;
}

/**
 * POST /v1/chat/completions
 *
 * OpenAI-compatible chat completions endpoint.
 * Query params:
 * - project: Project path (required)
 * - spec: Spec filename (required for session context)
 * - sessionId: Session ID (optional - created if not provided)
 */
router.post('/chat/completions', async (req: Request, res: Response) => {
  try {
    const body = req.body as OpenAIChatCompletionRequest;
    const { model, messages, stream = false } = body;

    // Extract query parameters
    const projectPath = req.query.project as string;
    const specFilename = req.query.spec as string;
    let sessionId = req.query.sessionId as string | undefined;

    if (!projectPath) {
      return res.status(400).json({
        error: {
          message: 'Missing required query parameter: project',
          type: 'invalid_request_error',
          param: 'project',
          code: 'missing_parameter',
        },
      });
    }

    if (!specFilename) {
      return res.status(400).json({
        error: {
          message: 'Missing required query parameter: spec',
          type: 'invalid_request_error',
          param: 'spec',
          code: 'missing_parameter',
        },
      });
    }

    // Extract engine name from model (e.g., "claude-opus-4" → "claude")
    // Or use the full model name if it matches known engines
    const modelParts = model.toLowerCase().split('-');
    const engineName = modelParts[0]; // e.g., "claude", "codex"

    // Get the last user message
    const lastMessage = messages.filter(m => m.role === 'user').pop();
    if (!lastMessage) {
      return res.status(400).json({
        error: {
          message: 'No user message found in messages array',
          type: 'invalid_request_error',
          param: 'messages',
          code: 'invalid_messages',
        },
      });
    }

    // Load or create session
    let session: SessionFile | null = null;

    if (sessionId) {
      // Try to load existing session
      session = await loadSession(specFilename, projectPath);
    }

    // Determine if this is the first message
    const isFirstMessage = !session || !session.sessionId;

    // Create new session if needed
    if (!session) {
      sessionId = randomUUID();
      session = {
        sessionId,
        specFilePath: specFilename,
        status: 'completed', // Chat-only sessions are "completed"
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        suggestions: [],
        chatMessages: [],
        changeHistory: [],
      };
    } else {
      sessionId = session.sessionId!;
    }

    // Load spec content on first message
    let specContent: string | undefined;
    if (isFirstMessage) {
      const fullSpecPath = join(projectPath, specFilename);
      specContent = await loadSpecContent(fullSpecPath);
    }

    // Select engine (claude, codex, etc.) with specChat purpose
    const { engine } = await selectEngine({
      engineName,
      model,
      projectPath,
      purpose: 'specChat',
    });

    // Handle streaming response
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const chunkId = `chatcmpl-${randomUUID()}`;
      const created = Math.floor(Date.now() / 1000);

      // Send initial chunk with role
      const initialChunk: OpenAIChatCompletionChunk = {
        id: chunkId,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [{
          index: 0,
          delta: { role: 'assistant' },
          finish_reason: null,
        }],
      };
      res.write(`data: ${JSON.stringify(initialChunk)}\n\n`);

      let fullResponse = '';

      // Stream the response
      const chatResponse = await engine.runChat({
        sessionId,
        message: lastMessage.content,
        isFirstMessage,
        cwd: projectPath,
        specContent,
        specPath: specFilename,
        model,
        onStreamLine: (line) => {
          // Parse JSONL line to extract text content
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === 'assistant' && parsed.message?.content) {
              const content = parsed.message.content;
              if (Array.isArray(content)) {
                for (const block of content) {
                  if (block.type === 'text' && block.text) {
                    fullResponse += block.text;
                    // Send content chunk
                    const contentChunk: OpenAIChatCompletionChunk = {
                      id: chunkId,
                      object: 'chat.completion.chunk',
                      created,
                      model,
                      choices: [{
                        index: 0,
                        delta: { content: block.text },
                        finish_reason: null,
                      }],
                    };
                    res.write(`data: ${JSON.stringify(contentChunk)}\n\n`);
                  }
                }
              }
            }
          } catch {
            // Ignore parse errors
          }
        },
      });

      // Send final chunk
      const finalChunk: OpenAIChatCompletionChunk = {
        id: chunkId,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [{
          index: 0,
          delta: {},
          finish_reason: 'stop',
        }],
      };
      res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();

      // Update session with messages
      const userMessage: ChatMessage = {
        id: randomUUID(),
        role: 'user',
        content: lastMessage.content,
        timestamp: new Date().toISOString(),
      };
      const assistantMessage: ChatMessage = {
        id: randomUUID(),
        role: 'assistant',
        content: chatResponse.content || fullResponse,
        timestamp: new Date().toISOString(),
      };

      if (isFirstMessage) {
        session.chatMessages = [userMessage, assistantMessage];
      } else {
        session.chatMessages.push(userMessage, assistantMessage);
      }
      session.lastUpdatedAt = new Date().toISOString();
      await saveSession(session, projectPath);
    } else {
      // Non-streaming response
      const chatResponse = await engine.runChat({
        sessionId,
        message: lastMessage.content,
        isFirstMessage,
        cwd: projectPath,
        specContent,
        specPath: specFilename,
        model,
      });

      if (chatResponse.error) {
        return res.status(500).json({
          error: {
            message: chatResponse.error,
            type: 'server_error',
            code: 'engine_error',
          },
        });
      }

      const response: OpenAIChatCompletionResponse = {
        id: `chatcmpl-${randomUUID()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: chatResponse.content,
          },
          finish_reason: 'stop',
        }],
      };

      res.json(response);

      // Update session with messages
      const userMessage: ChatMessage = {
        id: randomUUID(),
        role: 'user',
        content: lastMessage.content,
        timestamp: new Date().toISOString(),
      };
      const assistantMessage: ChatMessage = {
        id: randomUUID(),
        role: 'assistant',
        content: chatResponse.content,
        timestamp: new Date().toISOString(),
      };

      if (isFirstMessage) {
        session.chatMessages = [userMessage, assistantMessage];
      } else {
        session.chatMessages.push(userMessage, assistantMessage);
      }
      session.lastUpdatedAt = new Date().toISOString();
      await saveSession(session, projectPath);
    }
  } catch (error) {
    console.error('[OpenAI Compat] Error:', error);
    res.status(500).json({
      error: {
        message: error instanceof Error ? error.message : 'Internal server error',
        type: 'server_error',
        code: 'internal_error',
      },
    });
  }
});

/**
 * GET /v1/models
 *
 * List available models (optional - for compatibility)
 */
router.get('/models', async (req: Request, res: Response) => {
  res.json({
    object: 'list',
    data: [
      {
        id: 'claude-opus-4-6',
        object: 'model',
        created: Date.now(),
        owned_by: 'qala-ralph',
      },
      {
        id: 'claude-sonnet-4-5',
        object: 'model',
        created: Date.now(),
        owned_by: 'qala-ralph',
      },
      {
        id: 'codex',
        object: 'model',
        created: Date.now(),
        owned_by: 'qala-ralph',
      },
    ],
  });
});

export default router;
