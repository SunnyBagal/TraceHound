import { expect, test } from "bun:test";
import { subtotal } from "../src/cart.ts";

// subtotal is not buggy at baseSha: this "repro" passes before any fix.
test("subtotal adds line totals", () => {
  expect(subtotal([{ price: 3, qty: 2 }])).toBe(6);
});
