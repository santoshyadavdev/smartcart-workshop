import { CurrencyPipe } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartStore } from '../cart/cart.store';
import { ChatService } from './chat.service';
import { MAX_MESSAGE_LENGTH } from '../../shared/agent-events';

@Component({
  selector: 'app-assistant-panel',
  imports: [CurrencyPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <section
        class="panel"
        role="dialog"
        aria-label="Shopping assistant"
        data-testid="assistant-panel"
        (keydown.escape)="close()"
      >
        <header class="panel-header">
          <h2><span aria-hidden="true">✨</span> Shopping assistant</h2>
          <button
            type="button"
            class="btn btn-icon btn-ghost"
            aria-label="Start a new conversation"
            title="New conversation"
            data-testid="assistant-reset"
            [disabled]="chat.streaming()"
            (click)="chat.reset()"
          >
            ↺
          </button>
          <button
            type="button"
            class="btn btn-icon btn-ghost"
            aria-label="Close shopping assistant"
            data-testid="assistant-close"
            (click)="close()"
          >
            ✕
          </button>
        </header>

        @if (chat.provider() === 'mock') {
          <p class="banner" data-testid="demo-banner">
            Demo mode — responses are simulated. Add a GEMINI_API_KEY to use Gemini.
          </p>
        }

        <div #log class="log" aria-live="polite">
          @for (message of chat.messages(); track message.id) {
            <div class="message" data-testid="assistant-message" [attr.data-role]="message.role">
              @if (message.text) {
                <p class="bubble">{{ message.text }}</p>
              }
              @if (message.id === pendingId()) {
                <p class="bubble typing" data-testid="typing-indicator">
                  <span></span><span></span><span></span>
                  <span class="visually-hidden">Assistant is typing</span>
                </p>
              }
              @if (message.id === pendingId() && elapsed() > 2) {
                <p class="muted thinking" data-testid="assistant-elapsed">Thinking… {{ elapsed() }}s</p>
              }
              @if (message.products.length) {
                <ul class="products">
                  @for (product of message.products; track $index) {
                    <li class="product" data-testid="assistant-product">
                      <a class="product-link" [routerLink]="['/product', product.id]">
                        <span
                          class="emoji-tile"
                          [attr.data-category]="product.category"
                          aria-hidden="true"
                          >{{ product.emoji }}</span
                        >
                        <span class="product-name">{{ product.name }}</span>
                        <span class="price">{{ product.price | currency: 'USD' }}</span>
                      </a>
                      <button
                        type="button"
                        class="btn btn-primary add"
                        [attr.aria-label]="'Add ' + product.name + ' to cart'"
                        (click)="cart.add(product)"
                      >
                        Add
                      </button>
                    </li>
                  }
                </ul>
              }
              @if (message.error) {
                <p class="error" role="alert" data-testid="assistant-error">{{ message.error }}</p>
              }
            </div>
          } @empty {
            <div class="intro">
              <p class="muted">Hi! 👋 I can find products and add them to your cart. Try:</p>
              @for (suggestion of suggestions; track suggestion) {
                <button
                  type="button"
                  class="suggestion"
                  data-testid="assistant-suggestion"
                  [disabled]="chat.streaming()"
                  (click)="submit(suggestion)"
                >
                  {{ suggestion }}
                </button>
              }
            </div>
          }
        </div>

        <form class="composer" (submit)="$event.preventDefault(); submit()">
          <label for="assistant-input" class="visually-hidden">Message the assistant</label>
          <textarea
            #input
            id="assistant-input"
            class="field"
            rows="1"
            placeholder="Ask about products…"
            [attr.maxlength]="maxLength"
            data-testid="assistant-input"
            [value]="draft()"
            (input)="draft.set(input.value)"
            (keydown.enter)="onEnter($event)"
          ></textarea>
          <button
            type="submit"
            class="btn btn-primary"
            data-testid="assistant-send"
            [disabled]="!canSend()"
          >
            Send
          </button>
          @if (chat.streaming()) {
            <button
              type="button"
              class="btn btn-ghost"
              data-testid="assistant-stop"
              (click)="chat.stop()"
            >
              Stop
            </button>
          }
        </form>
      </section>
    } @else {
      <button
        #toggle
        type="button"
        class="btn btn-primary toggle"
        aria-label="Open shopping assistant"
        data-testid="assistant-toggle"
        (click)="show()"
      >
        <span aria-hidden="true">✨</span> Ask AI
      </button>
    }
  `,
  styles: `
    .toggle {
      position: fixed;
      right: var(--space-5);
      bottom: var(--space-5);
      z-index: 20;
      min-height: 3.25rem;
      padding-inline: var(--space-5);
      box-shadow: var(--shadow-lg);
      font-size: 1.0625rem;
    }
    .panel {
      position: fixed;
      right: var(--space-4);
      bottom: var(--space-4);
      z-index: 30;
      display: flex;
      flex-direction: column;
      width: min(26rem, calc(100vw - 2 * var(--space-4)));
      height: min(40rem, calc(100vh - 6rem));
      overflow: hidden;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      box-shadow: var(--shadow-lg);
      animation: rise 180ms ease-out;
    }
    @media (max-width: 40rem) {
      .panel {
        inset: auto 0 0;
        width: 100%;
        height: 80vh;
        border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      }
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(1rem);
      }
    }
    .panel-header {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--color-border);
    }
    h2 {
      flex: 1;
      font-size: 1.0625rem;
    }
    .banner {
      padding: var(--space-2) var(--space-4);
      background: #fffbeb;
      color: #92400e;
      font-size: 0.875rem;
    }
    .log {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-4);
      overflow-y: auto;
      background: var(--color-bg);
    }
    .message {
      display: grid;
      gap: var(--space-2);
      max-width: 88%;
    }
    .message[data-role='user'] {
      align-self: flex-end;
    }
    .bubble {
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      box-shadow: var(--shadow-sm);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    [data-role='user'] .bubble {
      background: var(--color-primary);
      color: var(--color-on-primary);
    }
    .typing {
      display: flex;
      gap: 0.3rem;
      width: fit-content;
      padding-block: var(--space-3);
    }
    .typing span:not(.visually-hidden) {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      background: var(--color-text-muted);
      animation: blink 1s infinite ease-in-out;
    }
    .typing span:nth-child(2) {
      animation-delay: 0.15s;
    }
    .typing span:nth-child(3) {
      animation-delay: 0.3s;
    }
    @keyframes blink {
      50% {
        opacity: 0.25;
        transform: translateY(-2px);
      }
    }
    .products {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .product {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
    }
    .product-link {
      display: flex;
      flex: 1;
      align-items: center;
      gap: var(--space-3);
      min-width: 0;
      color: var(--color-text);
      text-decoration: none;
    }
    .product-link .emoji-tile {
      width: 2.5rem;
      font-size: 1.5rem;
      border-radius: var(--radius-sm);
    }
    .product-name {
      flex: 1;
      font-weight: 600;
    }
    .product-link:hover .product-name {
      color: var(--color-primary);
    }
    .add {
      min-height: 2rem;
      padding-inline: var(--space-3);
    }
    .error {
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      background: var(--color-danger-soft);
      color: var(--color-danger);
    }
    .intro {
      display: grid;
      gap: var(--space-2);
    }
    .suggestion {
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      text-align: left;
      cursor: pointer;
    }
    .suggestion:hover {
      border-color: var(--color-primary);
      background: var(--color-primary-soft);
    }
    .composer {
      display: flex;
      gap: var(--space-2);
      padding: var(--space-3);
      border-top: 1px solid var(--color-border);
    }
    textarea {
      flex: 1;
      resize: none;
      border-radius: var(--radius-md);
    }
  `,
})
export class AssistantPanel {
  protected readonly chat = inject(ChatService);
  protected readonly cart = inject(CartStore);

  protected readonly suggestions = [
    'Show me headphones under $100',
    'Add the cheapest mug to my cart',
    'What fitness gear do you have?',
  ];

  protected readonly open = signal(false);
  protected readonly draft = signal('');
  protected readonly maxLength = MAX_MESSAGE_LENGTH;
  /** Seconds the current reply has been streaming. */
  protected readonly elapsed = signal(0);
  protected readonly canSend = computed(() => !this.chat.streaming() && !!this.draft().trim());
  /** The assistant reply still waiting for its first token. */
  protected readonly pendingId = computed(() => {
    const last = this.chat.messages().at(-1);
    const waiting = last?.role === 'assistant' && !last.text && !last.error;
    return this.chat.streaming() && waiting ? last.id : null;
  });

  private readonly log = viewChild<ElementRef<HTMLElement>>('log');
  private readonly input = viewChild<ElementRef<HTMLTextAreaElement>>('input');
  private readonly toggle = viewChild<ElementRef<HTMLButtonElement>>('toggle');
  private restoreToggleFocus = false;

  constructor() {
    setInterval(() => {
      if (this.chat.streaming()) this.elapsed.update((seconds) => seconds + 1);
      else this.elapsed.set(0);
    }, 1000);
    // afterRenderEffect only runs in the browser, so these DOM touches are SSR-safe.
    afterRenderEffect(() => {
      this.chat.messages();
      const log = this.log()?.nativeElement;
      if (log) log.scrollTop = log.scrollHeight;
    });
    afterRenderEffect(() => {
      if (this.open()) {
        this.input()?.nativeElement.focus();
      } else if (this.restoreToggleFocus) {
        this.restoreToggleFocus = false;
        this.toggle()?.nativeElement.focus();
      }
    });
  }

  protected show(): void {
    this.open.set(true);
  }

  protected close(): void {
    this.restoreToggleFocus = true;
    this.open.set(false);
  }

  protected submit(text = this.draft()): void {
    if (this.chat.streaming() || !text.trim()) return;
    this.draft.set('');
    void this.chat.send(text);
  }

  protected onEnter(event: Event): void {
    if ((event as KeyboardEvent).shiftKey) return;
    event.preventDefault();
    this.submit();
  }
}
