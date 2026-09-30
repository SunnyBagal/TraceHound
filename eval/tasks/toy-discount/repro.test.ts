import { expect, test } from "bun:test";
import { applyDiscount, checkoutTotal } from "../src/cart.ts";

test("a 10% discount takes 10% off", () => {
  expect(applyDiscount(200, 10)).toBe(180);
  expect(checkoutTotal([{ price: 50, qty: 2 }], 25)).toBe(75);
});
