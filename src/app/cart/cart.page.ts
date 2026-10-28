import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartStore, MAX_QUANTITY } from './cart.store';

@Component({
  selector: 'app-cart-page',
  imports: [CurrencyPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page">
      <h1>Your cart</h1>

      @if (cart.lines().length) {
        <div class="layout">
          <ul class="lines">
            @for (line of cart.lines(); track line.product.id) {
              @let product = line.product;
              <li class="line" data-testid="cart-line">
                <div
                  class="emoji-tile tile"
                  [attr.data-category]="product.category"
                  aria-hidden="true"
                >
                  {{ product.emoji }}
                </div>
                <div class="details">
                  <a class="name" [routerLink]="['/product', product.id]">{{ product.name }}</a>
                  <span class="muted">{{ product.price | currency: 'USD' }} each</span>
                </div>
                <div class="stepper" role="group" [attr.aria-label]="'Quantity of ' + product.name">
                  <button
                    type="button"
                    class="btn btn-icon btn-ghost"
                    data-testid="decrement"
                    [attr.aria-label]="'Decrease quantity of ' + product.name"
                    (click)="cart.setQuantity(product.id, line.quantity - 1)"
                  >
                    −
                  </button>
                  <span class="qty" data-testid="quantity" aria-live="polite">{{
                    line.quantity
                  }}</span>
                  <button
                    type="button"
                    class="btn btn-icon btn-ghost"
                    data-testid="increment"
                    [attr.aria-label]="'Increase quantity of ' + product.name"
                    [disabled]="line.quantity >= maxQuantity"
                    (click)="cart.setQuantity(product.id, line.quantity + 1)"
                  >
                    +
                  </button>
                </div>
                <span class="price line-total" data-testid="line-total">
                  {{ product.price * line.quantity | currency: 'USD' }}
                </span>
                <button
                  type="button"
                  class="btn btn-icon btn-danger"
                  data-testid="remove"
                  [attr.aria-label]="'Remove ' + product.name"
                  (click)="cart.remove(product.id)"
                >
                  ✕
                </button>
              </li>
            }
          </ul>

          <aside class="summary" aria-label="Order summary">
            <h2>Summary</h2>
            <div class="row">
              <span class="muted">Items</span>
              <span>{{ cart.count() }}</span>
            </div>
            <div class="row">
              <span class="muted">Subtotal</span>
              <span data-testid="cart-subtotal">{{ cart.subtotal() | currency: 'USD' }}</span>
            </div>
            @if (cart.discount() > 0) {
              <div class="row discount">
                <span>Bulk discount</span>
                <span data-testid="cart-discount">−{{ cart.discount() | currency: 'USD' }}</span>
              </div>
            }
            <div class="row total">
              <span>Total</span>
              <span class="price" data-testid="cart-total">{{
                cart.total() | currency: 'USD'
              }}</span>
            </div>
            <button type="button" class="btn btn-primary" disabled>Checkout (demo)</button>
            <button
              type="button"
              class="btn btn-danger"
              data-testid="clear-cart"
              (click)="cart.clear()"
            >
              Clear cart
            </button>
          </aside>
        </div>
      } @else {
        <div class="empty-state" data-testid="cart-empty">
          <span class="emoji" aria-hidden="true">🛒</span>
          <p>Your cart is empty.</p>
          <a class="btn btn-primary" routerLink="/">Keep shopping</a>
        </div>
      }
    </div>
  `,
  styles: `
    h1 {
      margin-bottom: var(--space-5);
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-5);
      align-items: start;
    }
    @media (min-width: 56rem) {
      .layout {
        grid-template-columns: minmax(0, 1fr) 20rem;
      }
    }
    .lines {
      display: grid;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .line,
    .summary {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      box-shadow: var(--shadow-sm);
    }
    .line {
      display: grid;
      grid-template-columns: 4rem minmax(0, 1fr) auto auto auto;
      align-items: center;
      gap: var(--space-4);
      padding: var(--space-3);
    }
    @media (max-width: 40rem) {
      .line {
        grid-template-columns: 4rem minmax(0, 1fr) auto;
      }
      .stepper {
        grid-column: 2;
      }
    }
    .tile {
      font-size: 2.25rem;
    }
    .details {
      display: grid;
    }
    .name {
      color: var(--color-text);
      font-weight: 700;
      text-decoration: none;
    }
    .name:hover {
      color: var(--color-primary);
    }
    .stepper {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .qty {
      min-width: 1.5rem;
      font-weight: 700;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .line-total {
      min-width: 5.5rem;
      text-align: right;
    }
    .summary {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-5);
    }
    .row {
      display: flex;
      justify-content: space-between;
    }
    .discount {
      color: var(--color-success);
      font-weight: 600;
    }
    .total {
      padding-top: var(--space-3);
      border-top: 1px solid var(--color-border);
      font-size: 1.25rem;
      font-weight: 700;
    }
  `,
})
export class CartPage {
  protected readonly cart = inject(CartStore);
  protected readonly maxQuantity = MAX_QUANTITY;
}
