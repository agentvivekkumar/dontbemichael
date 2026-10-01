/**
 * Makes the reference shots repeatable. The page's clock starts at a fixed
 * time of day (10:42 today, or ?at=HH:MM) and ticks from there, so every shot
 * shows the same hour and the same "asked 5h ago" times; and Math.random is
 * seeded, so the same person says the same idle line every run. Imported
 * first, before anything reads either.
 */
const RealDate = Date;
const [h, m] = (new URLSearchParams(location.search).get('at') ?? '10:42').split(':').map(Number);
const target = new RealDate();
target.setHours(h, m, 0, 0);
const offset = target.getTime() - RealDate.now();

class FixedDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(RealDate.now() + offset);
    else super(...(args as [string]));
  }
  static now() { return RealDate.now() + offset; }
}
(window as unknown as { Date: DateConstructor }).Date = FixedDate as DateConstructor;

/** mulberry32: a small seeded generator, plenty for picking idle lines. */
let seed = 0x5eed;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
