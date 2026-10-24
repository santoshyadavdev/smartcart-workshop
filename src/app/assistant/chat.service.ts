import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import { AgentEvent, ChatMessage, MAX_MESSAGE_LENGTH } from '../../shared/agent-events';
import { Product } from '../../shared/product';
import { CartStore } from '../cart/cart.store';
import { SseParser } from './sse-parser';

export const FETCH = new InjectionToken<typeof fetch>('FETCH', {
  providedIn: 'root',
  factory: () => (input, init) => fetch(input, init),
});

export interface UiMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  products: Product[];
  error?: string;
}

type ProviderName = 'gemini' | 'mock';

const MAX_HISTORY = 20;
const GENERIC_ERROR = 'Sorry, something went wrong. Please try again.';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly fetch = inject(FETCH);
  private readonly cart = inject(CartStore);
  private readonly state = signal<UiMessage[]>([]);
  private readonly isStreaming = signal(false);
  private readonly providerName = signal<ProviderName | null>(null);
  private nextId = 1;

  readonly messages = this.state.asReadonly();
  readonly streaming = this.isStreaming.asReadonly();
  readonly provider = this.providerName.asReadonly();

  async send(text: string): Promise<void> {
    const content = text.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!content || this.isStreaming()) return;

    const history = this.history();
    const userId = this.nextId++;
    const assistantId = this.nextId++;
    this.state.update((messages) => [
      ...messages,
      { id: userId, role: 'user', text: content, products: [] },
      { id: assistantId, role: 'assistant', text: '', products: [] },
    ]);
    this.isStreaming.set(true);

    try {
      const response = await this.fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [...history, { role: 'user', content }].slice(-MAX_HISTORY),
        }),
      });
      this.providerName.set(toProviderName(response.headers.get('x-smartcart-provider')));

      if (!response.ok || !response.body) {
        this.patch(assistantId, () => ({ error: GENERIC_ERROR }));
        return;
      }
      await this.consume(response.body, assistantId);
    } catch {
      this.patch(assistantId, () => ({ error: GENERIC_ERROR }));
    } finally {
      this.isStreaming.set(false);
    }
  }

  /** Stops the current reply so the shopper can ask something else. */
  stop(): void {
    this.isStreaming.set(false);
  }

  reset(): void {
    this.state.set([]);
  }

  private async consume(body: ReadableStream<Uint8Array>, assistantId: number): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        for (const event of parser.push(decoder.decode(value, { stream: true }))) {
          if (event.type === 'done') return;
          this.apply(event, assistantId);
        }
      }
    } finally {
      reader.cancel().catch(() => undefined);
    }
  }

  private apply(event: Exclude<AgentEvent, { type: 'done' }>, assistantId: number): void {
    switch (event.type) {
      case 'text':
        this.patch(assistantId, (message) => ({ text: message.text + event.delta }));
        break;
      case 'products':
        this.patch(assistantId, (message) => ({ products: [...message.products, ...event.items] }));
        break;
      case 'action':
        this.cart.addById(event.productId, event.quantity);
        break;
      case 'error':
        this.patch(assistantId, () => ({ error: event.message }));
        break;
    }
  }

  /**
   * Turns worth sending back to the model as context. A turn whose reply failed is
   * dropped entirely, so one rejected message can't break every later request.
   */
  private history(): ChatMessage[] {
    const messages = this.state();
    return messages
      .filter((message, index) => {
        if (message.role === 'user') return !messages[index + 1]?.error;
        return message.text && !message.error;
      })
      .map((message) => ({
        role: message.role,
        content: message.text.slice(0, MAX_MESSAGE_LENGTH),
      }));
  }

  private patch(id: number, change: (message: UiMessage) => Partial<UiMessage>): void {
    this.state.update((messages) =>
      messages.map((message) => (message.id === id ? { ...message, ...change(message) } : message)),
    );
  }
}

function toProviderName(value: string | null): ProviderName | null {
  return value === 'gemini' || value === 'mock' ? value : null;
}
