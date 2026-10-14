/**
 * Notes a browser writes to the console about itself rather than about the page: Firefox's
 * performance advisories (a preload whose media does not match this screen, scroll-driven
 * positioning, mip levels filled on first use), and WebKit's report of a load that a reload or a
 * navigation cut short, which it words as a failed access check. They are not the farm's to fix, so a clean
 * console is judged without them.
 */
const ADVISORIES = [
  /Preload of .* was ignored due to unknown “as” or “type” values, or non-matching “media” attribute/,
  /This site appears to use a scroll-linked positioning effect/,
  /WebGL warning: .* is incurring lazy initialization/,
  /due to access control checks\.?$/,
];

export const isBrowserNote = (text: string) => ADVISORIES.some((pattern) => pattern.test(text));
