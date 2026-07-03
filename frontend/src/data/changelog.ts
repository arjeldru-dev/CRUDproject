/**
 * Product changelog shown on the "What's New" / Patch Updates page.
 *
 * To publish an update: add a new entry to the TOP of `CHANGELOG`. Each release
 * groups its changes by type so the page can render them under clear headings.
 *
 * `howToUse` is optional — include it for features/adjustments where the user
 * benefits from a short "how to use it" note.
 */

export type ChangeType = 'feature' | 'fix' | 'adjustment' | 'removed';

export interface ChangeItem {
  type: ChangeType;
  title: string;
  description: string;
  howToUse?: string;
}

export interface Release {
  version: string;
  date: string; // ISO date (YYYY-MM-DD)
  title?: string;
  summary?: string;
  changes: ChangeItem[];
}

export const CHANGELOG: Release[] = [
  {
    version: '1.3.0',
    date: '2026-07-03',
    title: 'Reactions, Reimagined',
    summary: 'A richer reaction experience across posts, comments, and replies.',
    changes: [
      {
        type: 'feature',
        title: 'Hover / long-press reaction picker',
        description:
          'Instead of a fixed row of emoji buttons, each post and comment now has a single React control. A quick tap reacts instantly, and holding it open reveals the full set — Like, Love, Fire, Wow, Trophy, and Thank you.',
        howToUse:
          'On desktop, hover the "React" button to pop the reaction bar; on mobile, press and hold it. Tap an emoji to react. Tapping your current reaction again removes it, and picking a different one switches it.',
      },
      {
        type: 'feature',
        title: 'See who reacted',
        description:
          'Curious who hit Love vs Fire? Tap the reaction count to open a list of everyone who reacted, with tabs to filter by each reaction.',
        howToUse: 'Tap the little reaction icons/number next to a post or comment to open the "who reacted" list.',
      },
      {
        type: 'feature',
        title: 'React to comments and replies',
        description:
          'Reactions now work on comments and replies too, not just posts — the same picker and "who reacted" view apply throughout a thread.',
      },
      {
        type: 'adjustment',
        title: 'One reaction per person',
        description:
          'You now have a single reaction per post or comment. Choosing a new emoji replaces your previous one instead of stacking multiple.',
      },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-07-03',
    title: 'Flexible Budget Periods',
    summary: 'Budgets are no longer locked to the calendar month — set the rhythm that matches how you actually spend.',
    changes: [
      {
        type: 'feature',
        title: 'Daily, weekly, monthly & custom budget periods',
        description:
          'Every budget category can now track on its own recurring cycle instead of just the calendar month. Choose Daily for allowances, Weekly for paycheck cycles, Monthly for a fixed reset day, or Custom for an "every N days" rhythm.',
        howToUse:
          'Go to Budget → New Budget Category (or edit an existing one) and pick a Budget Period. Weekly lets you choose the start day, Monthly lets you choose the reset day (including "Last day of month"), and Custom asks for the cycle length and a start date. Your spend, progress ring, and forecast then follow that period.',
      },
      {
        type: 'feature',
        title: 'Monthly budgets can start on any day',
        description:
          'Paid on the 15th? Set your monthly budget to start on the 15th so your cycle matches your pay cycle instead of resetting on the 1st. Days 29–31 automatically fall back to the last day in shorter months.',
        howToUse:
          'When a category\'s period is Monthly, use the "Month starts on" picker. Leave it on "1st of month" for the classic behavior, pick any day 1–31, or choose "Last day of month".',
      },
      {
        type: 'adjustment',
        title: 'Budget cards now show the active period',
        description:
          'Category cards, the dashboard budget bars, and the feed budget sidebar now show a period label (e.g. "Today", "This week", "This month") next to your spend so it\'s always clear which window you\'re looking at.',
      },
      {
        type: 'adjustment',
        title: 'Timezone-aware budget windows',
        description:
          'Budget windows are now computed in your local timezone, so daily and weekly budgets reset at your midnight — not the server\'s.',
      },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-07-03',
    title: 'Profile menu & What\'s New',
    summary: 'Small quality-of-life improvements to the profile menu.',
    changes: [
      {
        type: 'feature',
        title: 'Patch Updates page',
        description:
          'This page. See what\'s new, what got fixed, what changed, and what was removed in each release — with short notes on how to use new features.',
        howToUse: 'Open it any time from your profile menu (click your avatar, top-right) → What\'s New.',
      },
      {
        type: 'adjustment',
        title: 'Tap your name to view your profile',
        description:
          'In the profile menu, your name and username at the top are now clickable and take you straight to your profile — the same as the old "View Profile" button, in the spot you\'d naturally tap.',
      },
    ],
  },
];
