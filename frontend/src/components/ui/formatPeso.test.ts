import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { formatPeso } from './formatPeso';

// Feature: savings-piggybank, Property 16: Peso formatting
//
// Property 16 (design.md): For any non-negative number, `formatPeso` produces a
// string prefixed with `₱`, showing exactly two decimal places and grouping
// thousands with separators.
//
// Validates: Requirements 11.9

describe('formatPeso', () => {
  it('Property 16: peso-prefixed, two decimals, grouped thousands for any non-negative number', () => {
    fc.assert(
      fc.property(
        // Non-negative numbers across the savings display range (0.00 … 999,999,999.99).
        fc.double({
          min: 0,
          max: 999_999_999.99,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (n) => {
          const out = formatPeso(n);

          // (a) Prefixed with the peso sign.
          expect(out.startsWith('₱')).toBe(true);

          // (b) Exactly two decimal places: the fractional part after the last
          //     dot has precisely two digits.
          expect(/\.\d{2}$/.test(out)).toBe(true);
          const decimals = out.slice(out.lastIndexOf('.') + 1);
          expect(decimals).toHaveLength(2);

          // (c) Thousands grouped with commas: strip the ₱ prefix and the
          //     two-decimal fraction, then assert the integer part uses
          //     comma-separated groups of three when it exceeds 999.
          const numeric = out.slice(1); // drop '₱'
          const integerPart = numeric.slice(0, numeric.lastIndexOf('.'));
          const digitsOnly = integerPart.replace(/,/g, '');

          if (digitsOnly.length > 3) {
            // Groups: leading 1-3 digits, then repeated ",ddd".
            expect(/^\d{1,3}(,\d{3})+$/.test(integerPart)).toBe(true);
          } else {
            // No separator needed for values below 1,000.
            expect(integerPart.includes(',')).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('formats representative values with peso sign, two decimals, and grouping', () => {
    expect(formatPeso(0)).toBe('₱0.00');
    expect(formatPeso(1234.5)).toBe('₱1,234.50');
    expect(formatPeso(1000000)).toBe('₱1,000,000.00');
    expect(formatPeso(999.99)).toBe('₱999.99');
  });
});
