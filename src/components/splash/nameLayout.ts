/**
 * The name's box, shared by the splash and the nav screen so the name does not move at the hand-off.
 *
 * Both screens lay the name out the same way: a full-viewport-height (100vh) grid, one centered column, 1rem side
 * padding, the name's h1 alone in the middle row. From the `sm` breakpoint the rows are [1fr auto 1fr], so the name sits
 * at the vertical center of 100vh. On phones the rows are [7fr auto 9fr]: the name sits about 6% of the screen height
 * above center, so the name and the links under it land where a thumb and the eye rest. Anything else on the splash
 * (tagline, prompt) must hang off the name without taking part in this grid's sizing, or the name leaves its row.
 * Change these two strings only for both screens at once.
 */
export const NAME_CLASS = "text-4xl sm:text-5xl md:text-6xl font-mono font-bold text-accent-green tracking-tight";
export const NAME_GRID_CLASS = "grid grid-rows-[7fr_auto_9fr] sm:grid-rows-[1fr_auto_1fr] justify-items-center px-4";
