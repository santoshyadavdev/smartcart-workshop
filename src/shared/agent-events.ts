import { Product } from './product';

export type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'products'; items: Product[] }
  | { type: 'action'; action: 'addToCart'; productId: string; quantity: number }
  | { type: 'error'; message: string }
  | { type: 'done' };

/** Longest message content /api/chat accepts. */
export const MAX_MESSAGE_LENGTH = 2000;

export interface ChatMessage {
  /** `system` lets the storefront send page context, e.g. "The shopper is viewing the kitchen category". */
  role: 'user' | 'assistant' | 'system';
  content: string;
}
