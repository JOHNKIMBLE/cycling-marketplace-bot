const CATEGORY_PATTERNS = [
  { name: 'ISO', patterns: [/\biso\b/i, /\bin search of\b/i, /\bwanted\b/i, /\bwtb\b/i] },
  { name: 'Complete Bike', patterns: [/\bcomplete bike\b/i, /\bframeset build\b/i, /\bbike for sale\b/i] },
  { name: 'Wheels', patterns: [/\bwheelset\b/i, /\bwheels?\b/i, /\brims?\b/i, /\bhubs?\b/i] },
  { name: 'Frame', patterns: [/\bframeset\b/i, /\bframe\b/i, /\bfork\b/i] },
  { name: 'Parts', patterns: [/\bgroupset\b/i, /\bcrank\b/i, /\bderailleur\b/i, /\bcassette\b/i, /\bchainring\b/i, /\bbar tape\b/i, /\blever\b/i, /\bpedals?\b/i, /\bstem\b/i, /\bhandlebars?\b/i, /\bseatpost\b/i, /\bsaddle\b/i, /\bbrake\b/i] },
  { name: 'Gear', patterns: [/\bhelmet\b/i, /\bshoe\b/i, /\bkit\b/i, /\btrainer\b/i, /\bjersey\b/i, /\bbibs?\b/i, /\bcomputer\b/i, /\bpower meter\b/i, /\bgarmin\b/i, /\bwahoo\b/i] },
];

const TAG_SYNONYMS = new Map([
  ['complete bike', 'Complete Bike'],
  ['bike', 'Complete Bike'],
  ['parts', 'Parts'],
  ['gear', 'Gear'],
  ['wheels', 'Wheels'],
  ['frame', 'Frame'],
  ['iso', 'ISO'],
  ['wanted', 'ISO'],
  ['sold', 'Sold'],
  ['pending', 'Pending'],
  ['closed', 'Closed'],
]);

const STATUS_PATTERNS = [
  {
    status: 'Sold',
    patterns: [
      /^\s*\[?sold\]?\b/i,
      /\b(?:item|bike|frame|frameset|wheelset|wheels|parts|group|groupset|crank|derailleur|trainer|helmet|shoe|kit|jersey|bibs|computer)\s+(?:is|are|was|were)?\s*sold\b/i,
      /\b(?:this|these|it|they(?:'re| are)?)\s+(?:is|are|was|were)?\s*sold\b/i,
      /\bmarked sold\b/i,
      /\bno longer available\b/i,
      /\bgone\b/i,
    ],
  },
  {
    status: 'Pending',
    patterns: [
      /^\s*\[?pending\]?\b/i,
      /\b(?:item|bike|frame|frameset|wheelset|wheels|parts|group|groupset|crank|derailleur|trainer|helmet|shoe|kit|jersey|bibs|computer)\s+(?:is|are|was|were)?\s*pending\b/i,
      /\b(?:this|these|it|they(?:'re| are)?)\s+(?:is|are|was|were)?\s*pending\b/i,
      /\bon hold\b/i,
      /\boffer accepted\b/i,
    ],
  },
];

function normalizeText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

export function truncate(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function stripStatusPrefix(title = '') {
  return title.replace(/^\[(sold|pending|closed)\]\s*/i, '').trim();
}

function extractPriceQualifier(text, matchEndIndex) {
  const trailingText = text.slice(matchEndIndex);
  return /^\s*(?:o\.?\s*b\.?\s*o\.?|obo|or best offer)\b/i.test(trailingText) ? ' OBO' : '';
}

export function extractPrice(...chunks) {
  const text = chunks.filter(Boolean).join(' ');
  const shorthandPattern = /\$\s?(\d+(?:\.\d+)?)\s*([km])\b/i;
  const shorthandMatch = shorthandPattern.exec(text);

  if (shorthandMatch) {
    const numeric = Number(shorthandMatch[1]);
    const multiplier = shorthandMatch[2].toLowerCase() === 'm' ? 1_000_000 : 1_000;
    const normalizedValue = numeric * multiplier;
    const qualifier = extractPriceQualifier(text, shorthandMatch.index + shorthandMatch[0].length);

    return `$${Number.isInteger(normalizedValue)
      ? normalizedValue.toLocaleString('en-US')
      : normalizedValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}${qualifier}`;
  }

  const pricePattern = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/;
  const match = pricePattern.exec(text);

  if (!match) {
    return null;
  }

  return `$${match[1]}${extractPriceQualifier(text, match.index + match[0].length)}`;
}

export function inferCategory({ title = '', body = '', tagNames = [] }) {
  for (const tagName of tagNames) {
    const normalizedTag = tagName.trim().toLowerCase();
    if (TAG_SYNONYMS.has(normalizedTag)) {
      const tagValue = TAG_SYNONYMS.get(normalizedTag);
      if (['Sold', 'Pending', 'Closed'].includes(tagValue)) {
        continue;
      }

      return tagValue;
    }
  }

  const combined = `${title} ${body}`;

  for (const rule of CATEGORY_PATTERNS) {
    if (rule.patterns.some((pattern) => pattern.test(combined))) {
      return rule.name;
    }
  }

  return 'Gear';
}

export function inferListingType({ title = '', body = '' }) {
  return inferCategory({ title, body }) === 'ISO' ? 'ISO' : 'For Sale';
}

export function inferStatus({
  title = '',
  body = '',
  tagNames = [],
  archived = false,
  locked = false,
}) {
  for (const tagName of tagNames) {
    const normalizedTag = TAG_SYNONYMS.get(tagName.trim().toLowerCase());
    if (normalizedTag === 'Sold' || normalizedTag === 'Pending') {
      return normalizedTag;
    }
  }

  const bodyLines = body
    .split('\n')
    .map((line) => normalizeText(line))
    .filter(Boolean);
  const statusCandidates = [
    normalizeText(title),
    ...bodyLines.slice(0, 3),
    ...bodyLines.slice(-2),
  ].join('\n');

  for (const rule of STATUS_PATTERNS) {
    if (rule.patterns.some((pattern) => pattern.test(statusCandidates))) {
      return rule.status;
    }
  }

  if (archived || locked) {
    return 'Closed';
  }

  return 'Active';
}

export function summarizeBody(body, maxLength = 500) {
  const normalized = normalizeText(body || '');
  return normalized ? truncate(normalized, maxLength) : 'No body text was included in the original listing.';
}

export function analyzeListing({ title = '', body = '', tagNames = [], archived = false, locked = false }) {
  const category = inferCategory({ title, body, tagNames });
  const type = inferListingType({ title, body });
  const price = extractPrice(title, body);
  const status = inferStatus({ title, body, tagNames, archived, locked });

  return {
    category,
    type,
    price,
    status,
    summary: summarizeBody(body),
  };
}

export function buildMirrorThreadName(teamName, title, status = 'Active') {
  const safeTeamName = normalizeText(teamName || 'Unknown Team');
  const safeTitle = normalizeText(stripStatusPrefix(title || 'Untitled Listing'));
  const statusPrefix = status === 'Active' ? '' : `[${status.toUpperCase()}] `;
  return truncate(`${statusPrefix}[${safeTeamName}] ${safeTitle}`, 100);
}
