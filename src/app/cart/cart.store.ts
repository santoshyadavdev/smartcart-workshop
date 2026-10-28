import { isPlatformBrowser } from '@angular/common';
import { computed, effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { Product } from '../../shared/product';
import { findProduct } from '../../shared/products';

export interface CartLine {
  product: Product;
  quantity: number;
}

export const MAX_QUANTITY = 10;
export const CART_STORAGE_KEY = 'smartcart.cart.v1';

interface StoredLine {
  productId: string;
  quantity: number;
}

const clampQuantity = (quantity: number) =>
  Math.min(Math.max(1, Math.floor(quantity)), MAX_QUANTITY);

@Injectable({ providedIn: 'root' })
export class CartStore {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly state = signal<CartLine[]>(this.restore());

  readonly lines = this.state.asReadonly();
  readonly count = computed(() => this.lines().reduce((sum, line) => sum + line.quantity, 0));
  readonly subtotal = computed(() => {
    const sum = this.lines().reduce((acc, line) => acc + line.product.price * line.quantity, 0);
    return Math.round(sum * 100) / 100;
  });
  /** Bulk discount: 10% off any line with a quantity of 3 or more. */
  readonly discount = computed(() => {
    if (this.lines().length < 3) return 0;
    const sum = this.lines().reduce(
      (acc, line) => acc + line.product.price * line.quantity * 0.1,
      0,
    );
    return Math.round(sum * 100) / 100;
  });
  readonly total = computed(() => Math.round((this.subtotal() - this.discount()) * 100) / 100);

  constructor() {
    effect(() => this.persist(this.lines()));
  }

  add(product: Product, quantity = 1): void {
    const existing = this.lines().find((line) => line.product.id === product.id);
    if (existing) {
      this.setQuantity(product.id, existing.quantity + quantity);
    } else if (quantity > 0) {
      this.state.update((lines) => [...lines, { product, quantity: clampQuantity(quantity) }]);
    }
  }

  addById(productId: string, quantity = 1): boolean {
    const product = findProduct(productId);
    if (!product) return false;
    this.add(product, quantity);
    return true;
  }

  setQuantity(productId: string, quantity: number): void {
    if (quantity <= 0) {
      this.remove(productId);
      return;
    }
    this.state.update((lines) =>
      lines.map((line) =>
        line.product.id === productId ? { ...line, quantity: clampQuantity(quantity) } : line,
      ),
    );
  }

  remove(productId: string): void {
    this.state.update((lines) => lines.filter((line) => line.product.id !== productId));
  }

  clear(): void {
    this.state.set([]);
  }

  private persist(lines: CartLine[]): void {
    if (!this.isBrowser) return;
    const stored: StoredLine[] = lines.map((line) => ({
      productId: line.product.id,
      quantity: line.quantity,
    }));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(stored));
  }

  private restore(): CartLine[] {
    if (!this.isBrowser) return [];
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((entry: Partial<StoredLine>) => {
        const product = findProduct(String(entry?.productId));
        const quantity = Number(entry?.quantity);
        if (!product || !Number.isFinite(quantity) || quantity <= 0) return [];
        return [{ product, quantity: clampQuantity(quantity) }];
      });
    } catch {
      return [];
    }
  }
}
