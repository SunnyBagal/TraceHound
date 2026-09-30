import { expect, test } from "bun:test";
import { checkoutTotal, subtotal } from "../src/cart.ts";

test("subtotal multiplies price by quantity", () => {
  expect(subtotal([{ price: 2.5, qty: 4 }, { price: 1, qty: 1 }])).toBe(11);
});

test("checkoutTotal keeps cents when there is no discount", () => {
  expect(checkoutTotal([{ price: 19.99, qty: 1 }])).toBe(19.99);
});
