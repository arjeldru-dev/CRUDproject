/**
 * Formats a numeric amount as Philippine peso currency for display.
 *
 * Output is prefixed with the peso sign (₱), always shows exactly two decimal
 * places, and groups thousands with separators (e.g. `₱1,234.50`). Backing the
 * format with `Intl.NumberFormat('en-PH', …)` keeps grouping/decimal rules
 * locale-correct and consistent across the savings UI.
 *
 * Extracted into its own module so component files export only components
 * (keeps React Fast Refresh working).
 *
 * @see Requirements 11.9 (savings-piggybank)
 */

// Single shared formatter instance (construction is comparatively expensive).
const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatPeso = (n: number): string => {
  // Guard against non-finite inputs so the UI never shows "₱NaN"/"₱∞".
  const value = Number.isFinite(n) ? n : 0;
  return pesoFormatter.format(value);
};
