'use strict';
// Derived search fields for orders. Nothing here mutates the customer's
// original data: it only builds normalized helper fields used for querying.
//
// Two derived fields are stored on each order:
//  - `searchText`: a single normalized, space-separated string used for a
//    Firestore range prefix query (`>= needle` / `<= needle+\uf8ff`). Because a
//    prefix query only matches from the start of the field, we also prefix the
//    text with each significant token (see `searchTokens`).
//  - `searchTokens`: a bounded array of normalized tokens (words, phone
//    digits, refs) used with `array-contains` for exact token matches.
//
// Both are capped so a single document cannot exceed Firestore limits.

const MAX_TOKENS = 40;
const MAX_TOKEN_LEN = 60;
const MAX_TEXT_LEN = 900;

// Arabic/Persian digits -> ASCII, and drop diacritics.
function foldDigits(value) {
  return String(value ?? '').replace(/[٠-٩۰-۹]/g, ch => {
    const code = ch.charCodeAt(0);
    return String.fromCharCode(48 + (code >= 0x6f0 ? code - 0x6f0 : code - 0x660));
  }).replace(/٫/g, '.');
}

// Normalize Arabic text for search: unify hamza/alef, ya, ta-marbuta; strip
// diacritics; collapse whitespace; keep Latin letters lowercased.
function normalizeSearch(value) {
  return foldDigits(value)
    .normalize('NFKC')
    .toLocaleLowerCase('ar')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '') // harakat/tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokenize(value) {
  const norm = normalizeSearch(value);
  if (!norm) return [];
  return norm.split(' ').filter(t => t.length > 0 && t.length <= MAX_TOKEN_LEN);
}

// Builds the derived search fields for an order-like object. Every source is
// optional; only present/relevant values are included so legacy orders remain
// valid (they simply have fewer tokens until backfilled).
function buildSearchFields(order = {}) {
  const raw = [
    order.customer,
    order.phone,
    order.extraPhone,
    order.description,
    order.note,
    order.city,
    order.area,
    order.address,
    order.orderNumber,
    order.barcodeValue,
    order.pageName,
    order.clickOrderRef,
    order.trackingNumber,
    order.providerOrderId,
  ].filter(v => v != null && String(v).trim() !== '');

  const tokens = new Set();
  for (const value of raw) {
    const text = foldDigits(value).trim();
    // Full-string normalized token (covers multi-word names / refs with dashes).
    const compact = text.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, '');
    if (compact && compact.length <= MAX_TOKEN_LEN) tokens.add(compact);
    for (const t of tokenize(value)) tokens.add(t);
  }
  // Distinct phone-digit tokens (helps pasted numbers with spaces/dashes).
  for (const phone of [order.phone, order.extraPhone]) {
    const digits = foldDigits(phone).replace(/\D/g, '');
    if (digits) tokens.add(digits);
  }

  const tokenList = [...tokens].filter(Boolean).slice(0, MAX_TOKENS);
  // searchText: token then its own value, space separated, so both a prefix of
  // the token and a prefix of the joined text can match.
  const searchText = tokenList.join(' ').slice(0, MAX_TEXT_LEN);
  return { searchTokens: tokenList, searchText };
}

module.exports = { foldDigits, normalizeSearch, tokenize, buildSearchFields, MAX_TOKENS, MAX_TOKEN_LEN, MAX_TEXT_LEN };
