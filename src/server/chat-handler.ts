import { AgentEvent, ChatMessage, MAX_MESSAGE_LENGTH } from '../shared/agent-events';
import { SmartCartEnv } from './env';
import { LlmProvider } from './llm/provider';
import { createProvider } from './llm/select-provider';
import { encodeSse } from './sse';

const MAX_MESSAGES = 20;
const MAX_CONTENT_LENGTH = MAX_MESSAGE_LENGTH;
const UNAVAILABLE_MESSAGE = 'The assistant is unavailable right now. Please try again.';

export async function handleChat(
  request: Request,
  env: SmartCartEnv,
  createProviderFn: (env: SmartCartEnv) => LlmProvider = createProvider,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON.');
  }

  const messages = parseMessages(body);
  if (typeof messages === 'string') return badRequest(messages);

  const provider = createProviderFn(env);
  console.log('[chat] provider=%s key=%s messages=%d', provider.name, env.GEMINI_API_KEY, messages.length);
  return new Response(streamEvents(provider, messages), {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      'x-smartcart-provider': provider.name,
    },
  });
}

/** Returns the validated messages, or an error description. */
function parseMessages(body: unknown): ChatMessage[] | string {
  const messages = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return `messages must be an array of 1 to ${MAX_MESSAGES} items.`;
  }
  if (!messages.every(isChatMessage)) {
    return `Each message needs a role of "user", "assistant" or "system" and content of 1 to ${MAX_CONTENT_LENGTH} characters.`;
  }
  if (messages[messages.length - 1].role !== 'user') {
    return 'The last message must come from the user.';
  }
  return messages;
}

function isChatMessage(value: unknown): value is ChatMessage {
  const { role, content } = (value ?? {}) as Partial<Record<keyof ChatMessage, unknown>>;
  return (
    (role === 'user' || role === 'assistant' || role === 'system') &&
    typeof content === 'string' &&
    content.length >= 1 &&
    content.length <= MAX_CONTENT_LENGTH
  );
}

function streamEvents(provider: LlmProvider, messages: ChatMessage[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      let doneSent = false;
      const send = (event: AgentEvent) => {
        if (event.type === 'done') doneSent = true;
        controller.enqueue(encoder.encode(encodeSse(event)));
      };

      try {
        for await (const event of provider.run(messages)) send(event);
      } catch (error) {
        console.error('Chat provider failed', error);
        if (!doneSent) {
          send({ type: 'error', message: UNAVAILABLE_MESSAGE });
          send({ type: 'done' });
        }
      }
      controller.close();
    },
  });
}

function badRequest(error: string): Response {
  return Response.json({ error }, { status: 400 });
}
