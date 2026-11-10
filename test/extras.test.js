const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

/* The five optional modules: stats, share, resume, rate, haptics. Each is
   loaded into its own sandbox with a fake Store and, where it matters, a fake
   Capacitor. */
function sandbox({ native = false, platform = 'ios', stored = {}, plugin = {}, now } = {}) {
  const storage = new Map(Object.entries(stored));
  const calls = [];
  const proxy = new Proxy({}, { get: (_, m) => m === 'then' ? undefined : async arg => {
    calls.push([m, arg]); if (plugin[m]) return plugin[m](arg); return {}; } });
  let clock = now || Date.now();
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(clock); } static now() { return clock; } }
  const context = vm.createContext({
    console: { warn() {} }, Date: FakeDate, JSON, Promise, Math, setTimeout, encodeURIComponent, decodeURIComponent,
    Store: { read: k => (storage.has(k) ? storage.get(k) : null), write: (k, v) => { storage.set(k, v); return true; } },
    Capacitor: { isNativePlatform: () => native, getPlatform: () => platform, registerPlugin: () => proxy },
  });
  context.window = context;
  const load = f => vm.runInContext(fs.readFileSync(f, 'utf8'), context);
  return { context, load, storage, calls, tick: ms => { clock += ms; } };
}
const DAY = 86400000;

/* ───── stats ───── */
function stats() { const s = sandbox(); s.load('js/daily.js'); s.load('js/stats.js'); return s.context; }

test('stats: an empty record is all zeros with nothing earned', () => {
  const c = stats();
  const s = c.Stats.compute({}, { sortTotal: 1000, mergeTotal: 1000 }, c.Daily);
  assert.equal(s.solved, 0); assert.equal(s.trophiesEarned, 0); assert.equal(s.trophies.length, 12);
});

test('stats: totals add up across all four modes', () => {
  const c = stats();
  const s = c.Stats.compute({
    levels: { a: { stars: 3, moves: 2 }, b: { stars: 2, moves: 5 } },
    merge: { m: { stars: 3, moves: 4 } },
    daily: { '2026-11-09': { stars: 1, moves: 9 }, '2026-11-10': { stars: 3, moves: 9 } },
    random: { hard: { won: 4, par3: 1 }, 'merge:easy': { won: 2, par3: 2 } }
  }, { sortTotal: 1000, mergeTotal: 1000 }, c.Daily);
  assert.equal(s.solved, 2 + 1 + 2 + 6);
  assert.equal(s.stars, 5 + 3 + 4);
  assert.equal(s.perfect, 1 + 1 + 1 + 3);
  assert.equal(s.randomWon, 6);
  assert.equal(s.bestStreak, 2);
  assert.ok(s.trophies.find(t => t.id === 'first-pour').earned);
  assert.ok(s.trophies.find(t => t.id === 'warming-up').earned);
  assert.equal(s.trophies.find(t => t.id === 'century').have, 11);
});

test('stats: a trophy is announced once, on the win that earns it', () => {
  const c = stats();
  const counts = { sortTotal: 1000, mergeTotal: 1000 };
  const levels = {}; for (let i = 0; i < 9; i++) levels['l' + i] = { stars: 1, moves: 9 };
  const before = c.Stats.compute({ levels }, counts, c.Daily);
  levels.l9 = { stars: 1, moves: 9 };
  const after = c.Stats.compute({ levels }, counts, c.Daily);
  assert.deepEqual(Array.from(c.Stats.newlyEarned(before, after), t => t.id), ['warming-up']);
  levels.l10 = { stars: 1, moves: 9 };
  assert.equal(c.Stats.newlyEarned(after, c.Stats.compute({ levels }, counts, c.Daily)).length, 0);
});

/* ───── share ───── */
function share(opts) { const s = sandbox(opts); s.load('js/share.js'); return s; }

test('share: the daily text carries the result, the streak and a link to the same day', () => {
  const t = share().context.Share.text({ mode: 'daily', stars: 3, moves: 12, par: 12, dailyKey: '2026-11-10', dateTitle: '10 November 2026', streak: 5 });
  assert.match(t, /Daily Puzzle, 10 November 2026/);
  assert.match(t, /⭐⭐⭐ 12 moves \(par 12\) — perfect!/);
  assert.match(t, /5-day streak/);
  assert.ok(t.endsWith('https://colormatch.politecarrot.com/?daily=2026-11-10'));
});

test('share: a random puzzle links to the same board only when a link can name it', () => {
  const S = share().context.Share;
  const base = { mode: 'random', stars: 2, moves: 16, par: 14, label: 'Hard', difficulty: 'hard', seed: 12345 };
  const linked = S.text(Object.assign({ linkable: true, merge: true }, base));
  assert.ok(linked.endsWith('?random=hard&seed=12345&merge=1'));
  assert.match(linked, /⭐⭐☆ 16 moves \(par 14\)\n/);
  assert.match(linked, /Can you beat me\?/);
  assert.ok(S.text(Object.assign({ linkable: false }, base)).endsWith('https://colormatch.politecarrot.com/'));
});

test('share: links round-trip, and anything malformed is ignored', () => {
  const S = share().context.Share;
  const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));
  same(S.parseLink('?daily=2026-11-10'), { kind: 'daily', key: '2026-11-10' });
  same(S.parseLink('?random=hard&seed=12345&merge=1'), { kind: 'random', difficulty: 'hard', seed: 12345, merge: true });
  same(S.parseLink('?utm_source=x&random=easy&seed=7'), { kind: 'random', difficulty: 'easy', seed: 7, merge: false });
  for (const bad of ['', '?', '?daily=tomorrow', '?daily=2026-1-1', '?random=hard', '?random=hard&seed=-4', '?random=<b>&seed=1',
    '?random=hard&seed=99999999999', '?seed=5', '?daily=%E0%A4%A', '?random=hard&seed=1e3']) {
    assert.equal(S.parseLink(bad), null, bad);
  }
});

test('share: the app uses the share sheet, a closed sheet is not an error, and a broken one falls back', async () => {
  let s = share({ native: true });
  assert.equal(await s.context.Share.send('hello'), 'shared');
  assert.equal(s.calls[0][0], 'share'); assert.equal(s.calls[0][1].text, 'hello');
  s = share({ native: true, plugin: { share: () => { throw new Error('Share canceled'); } } });
  assert.equal(await s.context.Share.send('x'), 'cancelled');
  s = share({ native: true, plugin: { share: () => { throw new Error('boom'); } } });
  assert.equal(await s.context.Share.send('x'), 'failed', 'no clipboard in this sandbox, so it reports failure rather than throwing');
});

/* ───── resume ───── */
const LEVEL = { id: 'level-10', target: 'red', main: { cap: 4 }, jars: [{ cap: 4, fills: ['red'] }, { cap: 4, fills: [] }] };
function resume(opts) { const s = sandbox(opts); s.load('js/resume.js'); return s; }

test('resume: what is saved comes back, stamped, until it is cleared', () => {
  const s = resume(); const R = s.context.Resume;
  assert.equal(R.load(), null);
  R.save({ level: LEVEL, mode: 'campaign', dailyKey: null, log: [['jar0', 'jar1']], hintsUsed: 1, hintsLeft: 0 });
  const back = R.load();
  assert.equal(back.level.id, 'level-10'); assert.equal(back.log.length, 1); assert.equal(back.hintsUsed, 1);
  assert.equal(typeof back.at, 'number');
  R.clear();
  assert.equal(R.load(), null);
});

test('resume: an old save is ignored, and so is a damaged one', () => {
  const s = resume(); const R = s.context.Resume;
  R.save({ level: LEVEL, mode: 'campaign', log: [], hintsUsed: 0, hintsLeft: 1 });
  s.tick(47 * 3600 * 1000); assert.ok(R.load());
  s.tick(2 * 3600 * 1000); assert.equal(R.load(), null);
  for (const bad of ['not json', '{}', '{"level":{},"mode":"campaign","log":[],"at":1}', JSON.stringify({ level: LEVEL, mode: 'campaign', log: [[1, 2]], at: Date.now() }),
    JSON.stringify({ level: LEVEL, mode: 'campaign', log: 'x', at: Date.now() })]) {
    const t = resume({ stored: { 'colourjars.resume.v1': bad } });
    assert.equal(t.context.Resume.load(), null, bad.slice(0, 30));
  }
});

test('resume: an unchanged board is not rewritten, a changed one is', () => {
  const s = resume(); const R = s.context.Resume;
  let writes = 0; const real = s.context.Store.write; s.context.Store.write = (k, v) => { writes++; return real(k, v); };
  const snap = { level: LEVEL, mode: 'campaign', log: [], hintsUsed: 0, hintsLeft: 1 };
  R.save(snap); R.save(snap); R.save(snap);
  assert.equal(writes, 1);
  snap.log.push(['jar0', 'jar1']); R.save(snap);
  assert.equal(writes, 2);
});

/* ───── rate ───── */
function rate(mem, opts) {
  const s = sandbox(Object.assign({ native: true, stored: mem ? { 'colourjars.rate.v1': JSON.stringify(mem) } : {} }, opts));
  s.load('js/rate.js'); return s;
}

test('rate: asks only on a three-star win by a returning player who knows the game', async () => {
  const now = Date.now();
  const ok = rate({ firstSeen: now - 5 * DAY, asks: 0, lastAt: 0 }, { now });
  assert.equal(await ok.context.Rate.noteWin({ stars: 2, solved: 40 }), false, 'not three stars');
  assert.equal(await ok.context.Rate.noteWin({ stars: 3, solved: 5 }), false, 'too new to the game');
  assert.equal(await ok.context.Rate.noteWin({ stars: 3, solved: 40 }), true);
  assert.equal(ok.calls.filter(c => c[0] === 'requestReview').length, 1);
  assert.equal(await ok.context.Rate.noteWin({ stars: 3, solved: 41 }), false, 'just asked');
  ok.tick(91 * DAY);
  assert.equal(await ok.context.Rate.noteWin({ stars: 3, solved: 90 }), true, 'three months on');
});

test('rate: never on the first days, never more than three times, never on the web', async () => {
  const now = Date.now();
  const fresh = rate(null, { now });
  assert.equal(await fresh.context.Rate.noteWin({ stars: 3, solved: 40 }), false);
  fresh.tick(3 * DAY);
  assert.equal(await fresh.context.Rate.noteWin({ stars: 3, solved: 40 }), true, 'first launch was remembered');
  const spent = rate({ firstSeen: now - 900 * DAY, asks: 3, lastAt: now - 300 * DAY }, { now });
  assert.equal(await spent.context.Rate.noteWin({ stars: 3, solved: 400 }), false);
  const web = rate({ firstSeen: now - 5 * DAY, asks: 0, lastAt: 0 }, { now, native: false });
  assert.equal(await web.context.Rate.noteWin({ stars: 3, solved: 40 }), false);
  assert.equal(web.calls.length, 0);
});

/* ───── haptics ───── */
test('haptics: each feel maps to one call, off means silence, and a failing motor never throws', async () => {
  const s = sandbox({ native: true }); s.load('js/haptics.js'); const H = s.context.Haptics;
  H.pick(); H.pour(); H.nope(); H.win();
  assert.equal(JSON.stringify(s.calls), JSON.stringify([['impact', { style: 'LIGHT' }], ['impact', { style: 'MEDIUM' }], ['notification', { type: 'WARNING' }], ['notification', { type: 'SUCCESS' }]]));
  H.setEnabled(false); H.pour(); H.win();
  assert.equal(s.calls.length, 4);
  const broken = sandbox({ native: true, plugin: { impact: () => { throw new Error('no motor'); } } }); broken.load('js/haptics.js');
  broken.context.Haptics.pour();
  await new Promise(r => setImmediate(r));
  const web = sandbox({ native: false }); web.load('js/haptics.js');
  web.context.Haptics.win();
  assert.equal(web.context.Haptics.available(), false); assert.equal(web.calls.length, 0);
});
