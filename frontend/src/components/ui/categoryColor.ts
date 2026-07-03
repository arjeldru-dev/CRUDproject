/**
 * Resolves category colors dynamically using design tokens and high-contrast
 * light/dark mode compliant colors to prevent category visualization collisions.
 *
 * Extracted into its own module so component files export only components
 * (keeps React Fast Refresh working).
 */
export const getCategoryColor = (name: string): string => {
  const norm = name.toLowerCase().trim();

  // Neutral, high-contrast category mappings (decoupled from semantic status colors like error/success)
  if (norm.includes('food') || norm.includes('dining') || norm.includes('groceries')) {
    return '#f43f5e'; // Pleasant Rose
  }
  if (norm.includes('transport') || norm.includes('travel') || norm.includes('commute')) {
    return 'var(--color-primary)'; // Sky Blue
  }
  if (norm.includes('rent') || norm.includes('housing')) {
    return 'var(--color-secondary)'; // Accent Indigo
  }
  if (norm.includes('utilities') || norm.includes('bills')) {
    return '#0d9488'; // Deep Teal
  }
  if (norm.includes('entertainment') || norm.includes('leisure') || norm.includes('recreation')) {
    return '#8b5cf6'; // Violet/Purple
  }

  // Non-colliding fallbacks that are clean and visible in both light & dark themes
  if (norm.includes('shopping') || norm.includes('personal') || norm.includes('clothing')) {
    return '#ec4899'; // Pink
  }
  if (norm.includes('health') || norm.includes('fitness') || norm.includes('medical')) {
    return '#10b981'; // Emerald/Green
  }
  if (norm.includes('education') || norm.includes('books')) {
    return '#06b6d4'; // Cyan
  }

  // Deterministic HSL generator with calibrated saturation/lightness (prevents colors blending together)
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hueIndex = Math.abs(hash) % 12;
  const hue = hueIndex * 30; // 0, 30, 60, ..., 330 degrees
  return `hsl(${hue}, 60%, 50%)`;
};
