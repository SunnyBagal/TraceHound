export interface Item {
  price: number;
  qty: number;
}

export function subtotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

/** Apply a percentage discount (0-100) to a total. */
export function applyDiscount(total: number, percent: number): number {
  return total - percent;
}

/** Total to charge, rounded to cents. */
export function checkoutTotal(items: Item[], percent = 0): number {
  return Math.round(applyDiscount(subtotal(items), percent) * 100) / 100;
}
