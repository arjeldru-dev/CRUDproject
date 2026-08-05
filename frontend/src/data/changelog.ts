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
    version: '1.9.0',
    date: '2026-08-06',
    title: 'See Your Real Savings Balance',
    summary:
      'The Savings graph on your Dashboard now shows two lines — how much you\'ve saved in total and how much is still available after spending. No more guessing where your money went.',
    changes: [
      {
        type: 'feature',
        title: 'Current Balance line on Savings graph',
        description:
          'The Savings Over Time graph now draws a second, dashed emerald line for your Current Balance — the money you can still use — alongside the solid Total Saved line. The shaded area between them shows how much you\'ve already spent from savings.',
        howToUse:
          'Open your Dashboard and scroll to the Savings graph. The solid line is your Total Saved; the dashed green line is your Current Balance. Hover any point to see both numbers and the date.',
      },
      {
        type: 'fix',
        title: 'Current Balance now includes today\'s spending',
        description:
          'Money spent from savings during the current budget period (before the period closes) now shows up immediately on the graph\'s latest point — previously it only appeared after the period ended, so the graph could show a higher balance than you actually had.',
      },
    ],
  },
  {
    version: '1.8.0',
    date: '2026-07-24',
    title: 'BudgetBarkada Gets Smarter (AI)',
    summary:
      'A new AI layer writes friendlier, more personal copy across the app — spending insights, savings nudges, a whole-budget summary, warmer notifications, and smarter category icons. Your numbers stay exact; the AI only handles the wording.',
    changes: [
      {
        type: 'feature',
        title: 'AI spending insights',
        description:
          'The Dashboard\'s Spending Forecast now explains what your numbers mean in plain English — like "You\'re on pace to go about 15% over your Dining limit; trimming a couple of eat-outs this week keeps you on track." The forecast math is unchanged; the AI just puts it in friendlier words.',
        howToUse:
          'Open your Dashboard. Insight cards for categories that are at risk or over budget show AI-written copy with a small "AI" tag. If AI is ever unavailable, you\'ll still see the standard tip — nothing breaks.',
      },
      {
        type: 'feature',
        title: 'Smart category icons',
        description:
          'New categories now get a fitting icon picked automatically from the name — including Filipino terms and slang like "Pamasahe", "Kain Out", or "Load" — instead of falling back to a generic wallet.',
        howToUse:
          'Just create or rename a budget category. The matching icon is chosen for you and shows on the category card and style preview.',
      },
      {
        type: 'feature',
        title: 'Savings nudges',
        description:
          'Your piggybank now gets a short, motivating line — celebrating milestones ("You just crossed ₱1,000 saved — your best stretch yet"), noting momentum, or gently flagging a shortfall so you can adjust next period.',
        howToUse:
          'Open Categories (or the Savings graph on your Dashboard). When there\'s something worth saying about your savings, a nudge appears above your totals with an "AI" tag.',
      },
      {
        type: 'feature',
        title: 'One-glance budget summary',
        description:
          'The Budget Insight card on the Categories page is now always on and sums up your whole budget picture in a single short paragraph across all your categories, instead of showing one line for a single category.',
        howToUse:
          'Open the Categories page — the Budget Insight card at the top now reads like a quick summary of how all your budgets are doing.',
      },
      {
        type: 'adjustment',
        title: 'Friendlier notifications',
        description:
          'System notifications now read like a person wrote them, with warmer wording for things like friend requests, streaks, badge unlocks, and challenge invites. Money-related notifications keep their exact, literal wording.',
      },
    ],
  },
  {
    version: '1.7.0',
    date: '2026-07-24',
    title: 'Move Savings to Budget',
    summary:
      'Using saved money now tops up your category\'s budget for the current period — and anything you don\'t spend flows back into savings when the period ends.',
    changes: [
      {
        type: 'adjustment',
        title: 'Savings now move into your budget',
        description:
          'Covering a category from savings used to log the money as spent right away. Now, releasing savings tops up that category\'s budget for the current period, so you can spend it normally like any other budget — it\'s no longer recorded as an expense you didn\'t make.',
        howToUse:
          'On the Categories page, open a category\'s piggybank and choose "Move to budget." Enter an amount, confirm with your Savings PIN, and that category\'s available budget goes up for the current period.',
      },
      {
        type: 'feature',
        title: 'Unspent money returns to savings',
        description:
          'Releasing is now safe and non-destructive. Money you move into your budget but don\'t end up spending automatically returns to your piggybank when the budget period closes — spend only part of it and just the leftover comes back.',
        howToUse:
          'Move what you think you\'ll need. When the period ends, whatever you didn\'t spend is added back to your savings automatically — no action needed.',
      },
    ],
  },
  {
    version: '1.6.0',
    date: '2026-07-20',
    title: 'Saver Titles & Barkada Streaks',
    summary:
      'Your points now earn you a Saver title, and the Challenges sidebar tracks your barkada\'s streaks at a glance.',
    changes: [
      {
        type: 'feature',
        title: 'Saver titles',
        description:
          'Your lifetime points now earn you a Saver title that grows as you do — Rookie Saver, Saver, Steady Saver, Pro Saver, Elite Saver, and Master Saver. Your current title shows next to your score on the Challenges page.',
        howToUse:
          'Keep budgeting, saving, and completing challenges to earn points. Your title updates automatically on the Challenges page — 100 points reaches Saver, and 2,000 reaches Master Saver.',
      },
      {
        type: 'adjustment',
        title: 'Barkada\'s Streak sidebar',
        description:
          'The "Active Barkadas" friends list in the Challenges sidebar has been reworked into "Barkada\'s Streak." Instead of just listing friends, it now shows each friend\'s current under-budget streak (or "Idle") with a streak indicator, plus a quick Duel button.',
        howToUse:
          'Open the Challenges page and check the "Barkada\'s Streak" panel to see how your friends are doing — tap the swords icon next to anyone to duel them.',
      },
    ],
  },
  {
    version: '1.5.0',
    date: '2026-07-20',
    title: 'New Badges & Animated Frames',
    summary: 'A fresh wave of savings and budgeting badges, plus three new animated avatar frames.',
    changes: [
      {
        type: 'feature',
        title: 'Savings & budgeting badges',
        description:
          'A new set of badges to chase: the savings line (Piggybank Opened, First Peso Saved, Nest Egg, Stacking Up, Vault Keeper, Fortune Builder, Cushion, Safety Net), spending from savings (Smart Spender, Savings Strategist), and finishing budget periods under budget (On Track, Budget Master, Discipline Incarnate).',
        howToUse:
          'Just keep budgeting and saving. New badges unlock automatically and appear with their own icons in the Badges & Frames tab.',
      },
      {
        type: 'feature',
        title: 'New animated avatar frames',
        description:
          'Three new points-unlocked frames join the collection — Piggybank Pride (rose blush), Budget Master (royal violet + gold), and Vault Aura (iridescent aurora). Every frame, old and new, now has a subtle signature animation with more depth and glow.',
        howToUse:
          'Earn points, then equip a frame from the Badges & Frames tab. Frames animate on your profile and previews, and stay static in dense lists to keep the feed smooth.',
      },
    ],
  },
  {
    version: '1.4.0',
    date: '2026-07-20',
    title: 'Savings Piggybank',
    summary: 'Grow a savings piggybank from every budget, spend it safely with a PIN, and race a savings target with your barkada.',
    changes: [
      {
        type: 'feature',
        title: 'Savings piggybank',
        description:
          'Every budget category can now grow savings. On the days you mark a category as "funded," budget you don\'t spend accrues into a piggybank you can see on the Categories page — a total plus a per-category breakdown.',
        howToUse:
          'Open Categories to see your Piggybank summary, then set which days each category is "funded" (with per-date overrides if you need them). Turn savings on from the piggybank settings to start accruing.',
      },
      {
        type: 'feature',
        title: 'Savings graph on the dashboard',
        description:
          'A new Savings graph on your Dashboard, right below the Financial Overview, charts how your savings build over time. Switch between the running total and a per-category view.',
        howToUse:
          'Open your Dashboard and scroll to the Savings section. Use the view toggle to compare your total savings against a per-category breakdown.',
      },
      {
        type: 'feature',
        title: 'Spend from savings (PIN-protected)',
        description:
          'When you go over on a category, you can cover it from what you\'ve saved instead. Spending savings is protected by a separate Savings PIN, so dipping in is always a deliberate choice — savings are never withdrawn automatically.',
        howToUse:
          'Set a Savings PIN in the piggybank settings, then use the spend-from-savings action on a category and confirm with your PIN.',
      },
      {
        type: 'feature',
        title: 'Savings Sprint challenges + solo mode',
        description:
          'Challenge a friend — or just yourself — to save a target amount before time runs out with the new Savings Sprint challenge. And every challenge type can now be started solo, with no friends required.',
        howToUse:
          'On the Challenges page, tap Challenge Friends, pick Savings Sprint, set your target amount and duration, and leave the friends list empty to go solo.',
      },
    ],
  },
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
