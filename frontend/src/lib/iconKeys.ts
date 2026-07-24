/**
 * Shared icon-key contract for AI Smart Category Icons.
 *
 * `IconKey` mirrors the backend's closed ICON_KEYS set
 * (backend/src/services/llm/prompts.ts). The classifier persists one of these
 * keys on the Category row; the frontend renders it via `ICON_KEY_TO_LUCIDE`.
 * When a category has no `iconKey` (legacy rows / classify failure), callers
 * fall back to the existing `getCategoryMeta()` keyword heuristic.
 *
 * This module is the single source of truth for icon-key → Lucide rendering.
 */
import {
  ShoppingCart,
  Utensils,
  Bus,
  Zap,
  PiggyBank,
  Film,
  HeartPulse,
  ShoppingBag,
  Home,
  GraduationCap,
  Receipt,
  Gift,
  Plane,
  Smartphone,
  PawPrint,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export type IconKey =
  | 'groceries' | 'dining' | 'transport' | 'utilities' | 'savings'
  | 'entertainment' | 'health' | 'shopping' | 'housing' | 'education'
  | 'bills' | 'gifts' | 'travel' | 'load' | 'pets' | 'wallet'; // 'wallet' = default

/** Map each icon key to its Lucide component. Keep in sync with the backend enum. */
export const ICON_KEY_TO_LUCIDE: Record<IconKey, LucideIcon> = {
  groceries: ShoppingCart,
  dining: Utensils,
  transport: Bus,
  utilities: Zap,
  savings: PiggyBank,
  entertainment: Film,
  health: HeartPulse,
  shopping: ShoppingBag,
  housing: Home,
  education: GraduationCap,
  bills: Receipt,
  gifts: Gift,
  travel: Plane,
  load: Smartphone,
  pets: PawPrint,
  wallet: Wallet,
};

/** Type guard: true when `value` is a known IconKey. */
export function isIconKey(value: unknown): value is IconKey {
  return typeof value === 'string' && value in ICON_KEY_TO_LUCIDE;
}

/** Resolve an icon key to its Lucide component, or null when unknown/absent. */
export function lucideForIconKey(iconKey: string | null | undefined): LucideIcon | null {
  return isIconKey(iconKey) ? ICON_KEY_TO_LUCIDE[iconKey] : null;
}
