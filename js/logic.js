// Akika BD - pure logic (no DOM). Runs in the browser and in Node.
// All money in integer paisa (1 taka = 100 paisa). Dates are 'YYYY-MM-DD'.
// The birth day counts as day 1, so the 7th day is birth + 6 days.
'use strict';

var ANIMALS_FOR = { boy: 2, girl: 1 };
var SHARE_KEYS = ['family', 'relatives', 'poor'];
var MAX_ANIMALS = 10;
var MAX_GUESTS = 2000;

// --- dates ---
function parseDate(s) {
  if (typeof s !== 'string') return null;
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  var y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  var dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}
function fmtDate(dt) {
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return dt.getUTCFullYear() + '-' + p(dt.getUTCMonth() + 1) + '-' + p(dt.getUTCDate());
}
function todayStr() {
  var n = new Date();
  return fmtDate(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())));
}
function addDays(dateStr, n) {
  var dt = parseDate(dateStr);
  if (!dt) return null;
  dt.setUTCDate(dt.getUTCDate() + n);
  return fmtDate(dt);
}
function daysBetween(a, b) {
  var da = parseDate(a), db = parseDate(b);
  if (!da || !db) return null;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

// 7th / 14th / 21st day from a birth date (birth day = day 1).
function aqiqahDays(birthDate) {
  if (!parseDate(birthDate)) return null;
  return { d7: addDays(birthDate, 6), d14: addDays(birthDate, 13), d21: addDays(birthDate, 20) };
}
function animalsFor(gender) {
  return ANIMALS_FOR[gender] || 1;
}

// --- money (integer paisa) ---
function toPaisa(taka) {
  var n = Number(taka);
  if (!isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
function fmtPaisa(p, lang) {
  var neg = p < 0;
  var abs = Math.abs(p);
  var whole = Math.floor(abs / 100);
  var frac = abs % 100;
  var s = whole.toLocaleString('en-US') + (frac ? '.' + (frac < 10 ? '0' : '') + frac : '');
  if (lang === 'bn') s = toBnDigits(s);
  return (neg ? '-' : '') + s;
}
var BN_DIGITS = ['\u09e6', '\u09e7', '\u09e8', '\u09e9', '\u09ea', '\u09eb', '\u09ec', '\u09ed', '\u09ee', '\u09ef'];
function toBnDigits(s) {
  return String(s).replace(/\d/g, function (d) { return BN_DIGITS[+d]; });
}
function fmtNum(n, lang) {
  var s = String(n);
  return lang === 'bn' ? toBnDigits(s) : s;
}

// --- sacrifice cost ---
// input: { count, priceEachTk, butcherTk, cookingTk, otherTk } (taka, any >= 0)
// returns paisa amounts, or { error } when invalid.
function sacrificeCost(inp) {
  var count = Math.floor(Number(inp.count));
  if (!isFinite(count) || count < 1 || count > MAX_ANIMALS) return { error: 'count' };
  var price = toPaisa(inp.priceEachTk), butcher = toPaisa(inp.butcherTk);
  var cooking = toPaisa(inp.cookingTk), other = toPaisa(inp.otherTk);
  if (price === null || butcher === null || cooking === null || other === null) return { error: 'money' };
  var animals = price * count;
  var fees = butcher + cooking + other;
  var total = animals + fees;
  return {
    count: count, animals: animals, fees: fees, total: total,
    perAnimal: Math.round(total / count)
  };
}

// --- meat shares ---
// pcts: { family, relatives, poor } in percent; must sum to 100.
// totalKg: number > 0, up to 2 decimals. Returns kg per share (2dp) or { error }.
function round2(n) { return Math.round(n * 100) / 100; }
function splitMeat(totalKg, pcts) {
  var kg = Number(totalKg);
  if (!isFinite(kg) || kg <= 0 || kg > 1000) return { error: 'kg' };
  var sum = 0, out = {};
  for (var i = 0; i < SHARE_KEYS.length; i++) {
    var k = SHARE_KEYS[i];
    var p = Number(pcts[k]);
    if (!isFinite(p) || p < 0 || p > 100) return { error: 'pct' };
    sum += p;
    out[k] = round2(kg * p / 100);
  }
  if (Math.abs(sum - 100) > 0.001) return { error: 'sum' };
  out.totalKg = round2(kg);
  return out;
}
function evenShares() {
  return { family: 33, relatives: 33, poor: 34 };
}

// --- hair charity: grams (up to 2dp) x silver rate Tk/gram -> paisa ---
function charityAmount(grams, rateTk) {
  var g = Number(grams), r = Number(rateTk);
  if (!isFinite(g) || g <= 0 || g > 1000) return { error: 'grams' };
  if (!isFinite(r) || r <= 0) return { error: 'rate' };
  return { paisa: Math.round(g * r * 100) };
}

// --- feast / event budget (integer paisa) ---
function eventBudget(inp) {
  var guests = Math.floor(Number(inp.guests));
  if (!isFinite(guests) || guests < 0 || guests > MAX_GUESTS) return { error: 'guests' };
  var perHead = toPaisa(inp.perHeadTk), venue = toPaisa(inp.venueTk), decor = toPaisa(inp.decorTk);
  if (perHead === null || venue === null || decor === null) return { error: 'money' };
  var food = perHead * guests;
  return { guests: guests, food: food, venue: venue, decor: decor, total: food + venue + decor };
}

// --- plan validation (for save + import) ---
function validPlan(p) {
  if (!p || typeof p !== 'object') return false;
  if (typeof p.name !== 'string' || p.name.trim().length === 0 || p.name.length > 80) return false;
  if (p.gender !== 'boy' && p.gender !== 'girl') return false;
  if (!parseDate(p.birthDate)) return false;
  if (sacrificeCost({ count: p.count, priceEachTk: p.priceEachTk, butcherTk: p.butcherTk, cookingTk: p.cookingTk, otherTk: p.otherTk }).error) return false;
  return true;
}
function validateImport(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'not-object' };
  if (obj.app !== 'akika-bd' || obj.version !== 1) return { ok: false, error: 'wrong-app' };
  if (!Array.isArray(obj.plans)) return { ok: false, error: 'no-plans' };
  if (obj.plans.length > 50) return { ok: false, error: 'too-many' };
  for (var i = 0; i < obj.plans.length; i++) {
    if (!validPlan(obj.plans[i])) return { ok: false, error: 'bad-plan' };
  }
  if (obj.checklist !== undefined) {
    if (!Array.isArray(obj.checklist)) return { ok: false, error: 'bad-checklist' };
    for (var j = 0; j < obj.checklist.length; j++) {
      if (obj.checklist[j] !== 0 && obj.checklist[j] !== 1) return { ok: false, error: 'bad-checklist' };
    }
  }
  return { ok: true };
}

var AK = {
  ANIMALS_FOR: ANIMALS_FOR, SHARE_KEYS: SHARE_KEYS, MAX_ANIMALS: MAX_ANIMALS, MAX_GUESTS: MAX_GUESTS,
  parseDate: parseDate, fmtDate: fmtDate, todayStr: todayStr, addDays: addDays,
  daysBetween: daysBetween, aqiqahDays: aqiqahDays, animalsFor: animalsFor,
  toPaisa: toPaisa, fmtPaisa: fmtPaisa, toBnDigits: toBnDigits, fmtNum: fmtNum,
  sacrificeCost: sacrificeCost, splitMeat: splitMeat, evenShares: evenShares,
  charityAmount: charityAmount, eventBudget: eventBudget,
  validPlan: validPlan, validateImport: validateImport
};

if (typeof module !== 'undefined' && module.exports) module.exports = AK;
if (typeof window !== 'undefined') window.AK = AK;
