// The studio's idle talk, The Office edition (branding/DESIGN.md 8.8).
//
// The cast ARE Dunder Mifflin (see cast.ts), so a quiet team member says a line
// in character. Two kinds:
//   * solo: one line on the speaker's chip. createIdleLines deals the
//     speaker's own lines about 60% of the time, else a break-room line
//     (SHARED_SOLO), never repeating until a pool runs out.
//   * pair: an exchange two quiet people trade as paper planes or envelopes.
//     createBanter deals EXCHANGES, the "that's what she said" bits and each
//     character's signature opener.
//
// Lines are kept short for the 250 px quote bubble. Character keys match
// OfficeCharacterName.

import type { OfficeCharacterName } from './cast';

// ─── solo lines, by spot ─────────────────────────────────────────────────────

const COFFEE: readonly string[] = [
  'is this… decaf?? who did this',
  "we're out of beans again",
  'World’s Best Boss mug',
  'first cup of the day. and the fifth.',
  'the coffee here is basically a hug',
  'who took my mug?',
];

const VENDING: readonly string[] = [
  'the machine ate my dollar',
  'B4… please be the pretzels',
  'it’s stuck. classic.',
  'shaking it. gently. respectfully.',
  'one (1) emotional-support snack',
  'A1 again. living dangerously.',
];

const SNACK: readonly string[] = [
  'is it Pretzel Day?',
  'who finished the chips??',
  'just a little treat',
  'these are everyone’s? cool cool cool',
  'second breakfast',
];

const TABLE: readonly string[] = [
  'big day. lots of meetings.',
  'just five more minutes',
  'did you see the standup notes?',
  'pretending to read my notes',
  'I needed this break, honestly',
  'do NOT tell Michael I’m in here',
];

// ─── character flavour — overrides the generic pool when present ─────────────

// Every character has lines of their own (owner, 2026-09-27: "add some for
// everyone"), written in each one's voice from what the show established.
// Darryl, Erin, Nick and Sadiq were added to this app later.
const BY_CHARACTER: Record<OfficeCharacterName, readonly string[]> = {
  michael:  ['I DECLARE… BANKRUPTCY!', "that's what she said", "I'm not superstitious. just a little stitious.", 'no meetings before coffee. that’s the rule.', 'it says World’s Best Boss. on the mug. so.', 'who wants to hear an improv bit?'],
  dwight:   ['FALSE.', 'identity theft is not a joke', 'that mug is regulation', 'this fridge needs a beet drawer', 'Schrute Farms has better coffee', 'I am fully trained in break room safety', 'assistant TO the regional coffee'],
  jim:      ["...that's what she said", 'bears. beets. Battlestar Galactica.', 'I moved Dwight’s stapler again', 'just here for the gossip', 'stapler. jello. you know the drill.', 'looks at camera'],
  pam:      ['Dunder Mifflin, this is Pam', 'sketching the vending machine', 'the watercolor of the break room', 'I’d rather be painting right now', 'did Jim hide Dwight’s stuff again?'],
  kevin:    ['the chili is NOT ready', 'why waste time say lot word', 'me want snack', 'cookie? cookie.', 'M&Ms count as a food group', 'I only eat the red ones today'],
  angela:   ['this break room is filthy', 'party planning committee, 3pm', 'I’m judging the fridge', 'my cats have better manners', 'who microwaved fish. who.'],
  oscar:    ['actually, it’s “espresso”', 'well, actually…', 'the budget for snacks is concerning', 'I read the ingredients. all of them.', 'that is not how interest works'],
  stanley:  ['is it Pretzel Day?', 'did I stutter?', 'crossword and coffee. leave me be.', "I'll retire before this brews", 'I do crosswords in meetings. and here.'],
  phyllis:  ['Bob is picking me up at five', 'knitting and a nice cup of tea', 'Bob Vance, Vance Refrigeration', 'Christmas party planning starts now'],
  andy:     ['Cornell, ever heard of it?', 'rit-dit-dit, coffee break!', 'Big Tuna, grab a chair', 'I sang a cappella, you know', 'Nard Dog needs caffeine'],
  kelly:    ['did you HEAR what happened??', 'so. much. to tell you.', 'I am the GOSSIP queen', 'Ryan texted me back!!', 'okay who is dating who'],
  ryan:     ['I’m kind of a big deal', 'the temp needs caffeine', 'starting a coffee startup, actually', 'this could be an app', 'I pitched this idea in business school'],
  toby:     ['I should write that up…', 'HR-wise this break is fine', 'no one ever sits with me', 'please don’t tell Michael I’m in here', 'I miss Costa Rica'],
  creed:    ['which one of you is the new guy?', 'I’ve eaten worse out of that fridge', 'mung beans. under my desk.', 'nobody steals from Creed', 'I sprout my beans on a damp towel'],
  meredith: ['is it 5 o’clock yet?', 'someone spike the coffee?', 'I brought my own mug. don’t ask.', 'my kid says hi'],
  darryl:   ['forklift parked. break is sacred.', 'the warehouse fridge is cleaner', 'working on a new song at home', 'dream job: a cereal shack', 'Michael asked me for slang again', 'upstairs coffee. fancy.'],
  erin:     ['is there cake? I love when there’s cake', 'I made a new friend at the coffee machine', 'everyone here is basically family', 'Kelly was taken, so I’m Erin', 'today feels like a party day', 'is a vending snack a meal?'],
  nick:     ['it’s Nick. the IT guy. hi.', 'tried turning it off and on?', 'I can see your browser history', 'nobody remembers my name', 'stop clicking the free cruise emails'],
  sadiq:    ['your password isn’t “password”, right?', 'removed another virus. kids game site.', 'I set up security, not spying. mostly.', 'the phishing test results… wow', 'every day is patch day'],
};


/** A shuffled deck over `pool`: every item once, then a fresh shuffle that
 *  never opens with the one just drawn. */
function deck<T>(pool: readonly T[], random: () => number): () => T {
  let bag: T[] = [];
  let last: T | undefined;
  return () => {
    if (!bag.length) {
      bag = [...pool];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (bag.length > 1 && bag[bag.length - 1] === last) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
    }
    last = bag.pop() as T;
    return last;
  };
}

/** Every break-room line, whoever says it. */
const SHARED_SOLO: readonly string[] = [...COFFEE, ...VENDING, ...SNACK, ...TABLE];

/**
 * The studio's idle lines (DESIGN.md 8.8), from this file's Office lines only
 * (owner, 2026-10-01: "dont show made up lines"): the speaker's own about 60%
 * of the time, else a break-room line, and nothing comes back until its pool
 * has run out. One per studio; `random` is there for tests.
 */
export function createIdleLines(random: () => number = Math.random): (character: OfficeCharacterName) => string {
  const own = new Map<string, () => string>();
  const shared = deck(SHARED_SOLO, random);
  return (character) => {
    const lines = BY_CHARACTER[character];
    if (!lines?.length || random() >= 0.6) return shared();
    if (!own.has(character)) own.set(character, deck(lines, random));
    return own.get(character)!();
  };
}

// ─── paired exchanges (two agents at one table) ──────────────────────────────
//
// Each exchange is a list of beats that ALTERNATE between the two people:
// beat[0] = the one who opens, beat[1] = the other, beat[2] = the opener again,
// and so on. The studio plays them out one beat at a time.

type Exchange = readonly string[];

// Generic banter — works between any two agents (they're all Dunder Mifflin).
const EXCHANGES: readonly Exchange[] = [
  ['world’s best boss.', 'you are. I had the mug made.', 'and I cherish it.'],
  ['would an idiot do this?', '...if yes, I don’t.', 'that’s my boy.'],
  ['feared or loved? both.', 'that’s beautiful.', 'I know.'],
  ['I edited your wiki page again.', 'I know. thank you.'],
  ['question. how many bears?', 'one.', 'that’s too many.'],
  ['fact: bears eat beets.', 'bears. beets. Galactica.', 'what is happening.'],
  ['I grew up on a beet farm.', 'shocking.', '...not shocking at all.'],
  ['what’s Schrute Farms smell like?', 'victory. and beets.'],
  ['did you just throw your phone?', 'didn’t like what it said.', 'cool.'],
  ['is a hot dog a sandwich?', 'it is.', 'I know, right?'],
  ['three-hole-punch Jim returns.', 'never gets old.'],
  ['why few word when lot word?', '...genuinely profound.', 'I know.'],
  ['I am not a bad person.', '...', 'not a great person either.', 'there it is.'],
  ['I love my cats more than people.', 'including us?', 'especially you.'],
  ['cats are better than dogs.', 'dogs are better.', '...sorry.'],
  ['do you love me?', 'I love… being here.', 'that’s a yes.'],
  ['I’m kind of a big deal.', 'you are?', 'in my mind. yes.'],
  ['did you miss me?', 'no.', 'a little?', '...there it is.'],
  ['did you just roll your eyes?', 'I did.', 'why?', 'muscle memory.'],
  ['I’ve watched that clock since 4.', 'weren’t you working?', 'watching the clock.'],
  ['what do we sell again?', 'paper.', 'sure, yeah.'],
  ['how old are you?', 'yeah.', 'that’s not an answer.', 'sure it is.'],
  ['that’s not how math works.', 'I know.', 'then why?', 'faster.'],
  ['I’m not an alcoholic.', 'you went to a meeting.', 'for the food.'],
  ['I went to Cornell.', 'nobody cares.', 'I went to Cornell.', 'still nobody cares.'],
  ['I have a lot of feelings.', 'I can tell.', 'is that bad?', 'for us? yes.'],
  ['why are you the way you are?', '...', 'honestly.'],
  ['your cat died.', 'I know.', 'I’m sorry.', '...thank you.'],
  ['stop looking at me.', 'you stop looking at me.'],
  ['sign this.', 'what is it?', 'doesn’t matter.', '...fine.'],
  ['you can’t say that.', 'I just did.', 'gonna stop me?', '...no.'],
  ['that’s a fire lane.', 'fire hasn’t happened yet.'],
  ['I wrapped your stapler in Jello.', 'I’ll eat around it.', 'fair.'],
  ['zombie attack plan?', 'especially that.', 'of course.'],
  ['just seeing if you’d answer.', 'I hate you.', 'I know.'],
  ['a little stitious, not super.', 'that’s not a word.', 'it is now.'],
  ['funniest person in the office?', 'and other times?', 'other times I know it.'],
  ['that’s what she said.', '...every time.', 'come on.'],
  ['I started the fire.', 'no you didn’t.', 'in our hearts, I did.'],
  ['is today a day ending in Y?', 'yes.', 'then no.'],
  ['Bob Vance.', 'Phyllis Vance.', 'Vance Refrigeration.'],
  ['you look beautiful today.', '...I know.'],
  ['I’m better than you in every way.', 'probably.', 'definitely.', 'sure.'],
  ['I’m a nice guy.', 'you’re okay.', 'nicest thing you’ve said.'],
  ['are you okay?', 'I’ve been worse.', 'when?', 'can’t narrow it down.'],
  ['there’s a spider on your desk.', 'where?', '...you ate it.', 'protein.'],
  ['soul mates can be bosses.', 'you’re my boss.', 'exactly.'],
  ['standup ran 40 minutes.', 'could’ve been an email.'],
  ['is the build green yet?', '...don’t look.'],
  ['who reply-all’d everyone?', 'we don’t talk about it.'],
];

// ─── "that's what she said" ──────────────────────────────────────────────────
//
// The office's favourite bit. These are generic (added to the shared pool
// below) so ANY two agents at a table can run them: whoever sits down first
// delivers the innocent setup (beat 0) and their table-mate lands the punchline
// (beat 1). Some carry the show's follow-up beats — a sheepish clarification and
// the inevitable "still counts." Setups are trimmed to fit the thought cloud.
const TWSS_EXCHANGES: readonly Exchange[] = [
  ['taking way longer than I expected.', 'that’s what she said.'],
  ['it’s too big, can’t fit it in my mouth.', 'that’s what she said.'],
  ['you really need to slow down.', 'that’s what she said.'],
  ['gonna need a bigger one.', 'that’s what she said.'],
  ['help, I can’t get it to go in.', 'that’s what she said.'],
  ['it’s not that hard if you just push.', 'that’s what she said.'],
  ['I can’t do this all night.', 'that’s what she said.'],
  ['I need it now, I can’t wait.', 'that’s what she said.'],
  ['so hot in here, I’m sweating.', 'that’s what she said.'],
  ['it keeps slipping out of my hands.', 'that’s what she said.'],
  ['why not just stick it in already?', 'that’s what she said.', '*looks at camera*'],
  ['I just need a few more inches.', 'that’s what she said.', 'for the shelf!', 'still counts.'],
  ['make it louder, I can barely feel it.', 'that’s what she said.'],
  ['can we get this over with quickly?', 'that’s what she said.', 'I meant the meeting.', 'sure.'],
  ['I just need you to hold it steady.', 'that’s what she said.'],
  ['can’t believe I did that all morning.', 'that’s what she said.'],
  ['my hands are cramping.', 'that’s what she said.', 'from typing!', 'that’s what she said.'],
  ['hours in and barely halfway done.', 'that’s what she said.'],
  ['surprisingly heavy for its size.', 'that’s what she said.'],
  ['be more precise. less sloppy.', 'that’s what she said.', 'I meant the spreadsheet.', 'I know.'],
  ['how long was it?', 'that’s what she said.', '*the whole room goes quiet*', 'I’m sorry, I can’t help it.'],
  ['too tight, cutting off my circulation.', 'that’s what she said.', '*mouths thank you*'],
  ['I don’t think it’ll fit.', 'that’s what she said.', '*stands up and applauds*'],
  ['stop, you’re doing it wrong.', 'that’s what she said.', 'never been prouder.'],
  ['this just keeps getting harder.', 'that’s what she said.', 'he’s ready.'],
  ['not wide enough, I need more room.', 'that’s what she said.'],
  ['I can hold it a really long time.', 'that’s what she said.', 'my breath!', 'still.'],
  ['why is it taking so long?', 'that’s what she said.', 'I hate you.', 'then why set me up?'],
  ['I can’t do it with people watching.', 'that’s what she said.', 'the presentation!', 'sure.'],
  ['it’s deeper than it looks.', 'that’s what she said.', 'the pothole, Michael!', 'doesn’t matter.'],
  ['so much longer than last time.', 'that’s what she said.', 'the report, Michael.', 'right, right.'],
  ['oh my god, it went on FOREVER.', 'that’s what she said.', 'the Twilight movie!', 'classic.'],
  ['can’t believe how thick this is.', 'that’s what she said.', 'the folder. *stares*'],
  ['I fit all THAT in one day?', 'that’s what she said.', 'that’s actually what I said!', 'meta.'],
  ['I went at it hard this morning.', 'that’s what she said.', 'at the gym!', 'irrelevant.'],
  ['someone help me finish this off.', 'that’s what she said.', 'the leftover cake!', 'still works.'],
  ['get in, do my thing, get out.', 'that’s what she said.', '*doesn’t look up from crossword*'],
  ['can’t believe it took this long.', 'that’s what she said.', 'the raise. eight years.', 'that one’s on me.'],
  ['do it slower, it’ll hurt less.', 'that’s what she said.', 'for the quarterly review.', 'sure, Oscar.'],
  ['didn’t realize how big it’d be.', 'that’s what she said.', 'the calzone, it’s enormous!', 'I love this office.'],
  ['*to no one* that’s what she said.', 'nobody said anything.', 'just thinking about earlier.'],
  ['*on the phone* that’s what she said.', 'who was that?', 'my mother. about a sandwich.'],
  ['too hot in here! that’s what she said.', 'you said both parts.', 'I contain multitudes.'],
  ['*at the TV* that’s what she said.', 'you’re alone, Michael.', 'she doesn’t know that.'],
  ['you need to be more professional.', 'that’s what she said.', 'I am she.', '...that’s what she said.'],
  ['stop. just stop. every time…', 'that’s what she said.', '*leaves the room*', '*whispers* that’s what she said.'],
  ['as you can see, it’s going up.', 'that’s what she said.', '*everyone groans*', 'set that one up myself.'],
  ['I declared bankruptcy once. felt good.', 'what does that have to do with…', 'that’s what she said.', 'it doesn’t.', 'I know.'],
  ['you didn’t say it.', 'I know.', 'why not?', 'I’m growing.', '...that’s what she said.', 'there it is.'],
  ['impressive you held back today.', 'thank you.', 'I counted zero times.', 'that’s what she said.', 'still counts.'],
];

// Everything any table-mate pair can draw from.
const PAIR_POOL: readonly Exchange[] = [...EXCHANGES, ...TWSS_EXCHANGES];

// Keyed off the SPEAKER so, when the right character sits down first, they get
// to open with their signature bit.
const KEYED_EXCHANGES: Partial<Record<OfficeCharacterName, Exchange>> = {
  michael:  ['that’s what she said.', '...there it is.'],
  dwight:   ['identity theft is not a joke.', 'nobody touched your stapler, Dwight.'],
  kevin:    ['why few word when lot word?', '...just use the words, Kevin.'],
  kelly:    ['okay don’t freak out, but…', 'I’m already freaking out.'],
  oscar:    ['well, actually…', '...here we go.'],
  angela:   ['this table is filthy.', 'it’s a break room, Angela.'],
  creed:    ['which one are you again?', '...we sit next to each other.'],
  stanley:  ['is it Pretzel Day?', 'no, Stanley.', '...did I stutter?'],
  andy:     ['I went to Cornell.', 'nobody cares.', '...I went to Cornell.'],
  jim:      ['question.', 'yes.', 'nothing. just checking.'],
  darryl:   ['Michael wants slang again.', 'what did you teach him?', 'nothing. he made it all up.'],
  erin:     ['is it someone’s birthday?', 'no, Erin.', 'cake anyway?'],
  nick:     ['hey… uh…', 'Nick.', 'right. Rick. my printer’s broken.'],
  sadiq:    ['did you click the cruise link?', 'it said I won!', '…running a scan.'],
  pam:      ['want to see a sketch?', 'is that the vending machine?', 'it’s you, actually.'],
};

/**
 * Conversations for the studio (DESIGN.md 8.8): two idle people trade the
 * beats of an exchange as paper planes or envelopes. The full set: EXCHANGES,
 * the "that's what she said" bits (owner, 2026-10-01: "bring full set back")
 * and the signature openers. No exchange comes back until all have played;
 * `random` is there for tests.
 */
export function createBanter(random: () => number = Math.random): (opener: OfficeCharacterName) => Exchange {
  const next = deck(PAIR_POOL, random);
  const keyedUsed = new Set<string>();
  return (opener) => {
    const keyed = KEYED_EXCHANGES[opener];
    // A signature bit at most once per person while the studio is open, when they happen to open.
    if (keyed && !keyedUsed.has(opener) && random() < 0.35) { keyedUsed.add(opener); return keyed; }
    return next();
  };
}
