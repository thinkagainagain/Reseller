const fs = require('fs/promises');
const path = require('path');
const db = require('../db');
const { CATEGORIES, CONDITIONS } = require('../lib/constants');
const { UPLOADS_ROOT } = require('../lib/uploadsDir');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-haiku-4-5-20251001';
const SERPAPI_URL = 'https://serpapi.com/search.json';
const MAX_MATCHES = 15;

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
};

async function fetchLensMatches(photoUrl) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    throw new Error('Missing SERPAPI_KEY in .env');
  }

  const url = `${SERPAPI_URL}?engine=google_lens&url=${encodeURIComponent(photoUrl)}&api_key=${apiKey}`;
  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SerpApi request failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const matches = (data.visual_matches || []).slice(0, MAX_MATCHES).map((m) => ({
    title: m.title,
    source: m.source,
    price: m.price?.value || null,
  }));

  return matches;
}

async function generateListingDraft(sku) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    throw new Error('Missing ANTHROPIC_API_KEY in .env');
  }

  const appUrl = process.env.APP_PUBLIC_URL;
  if (!appUrl) {
    throw new Error('Missing APP_PUBLIC_URL in .env');
  }

  const item = await db('inventory').where({ sku }).first();
  const photo = await db('intake_photos').where({ sku }).orderBy('id', 'asc').first();
  if (!photo) {
    throw new Error(`No intake photo found for ${sku} -- nothing to send to AI.`);
  }

  const photoUrl = `${appUrl}${photo.file_path}`;
  const lensMatches = await fetchLensMatches(photoUrl);

  const absolutePath = path.join(UPLOADS_ROOT, path.relative('/uploads', photo.file_path));
  const fileBuffer = await fs.readFile(absolutePath);
  const ext = path.extname(absolutePath).toLowerCase();
  const mimeType = MIME_BY_EXT[ext] || 'image/jpeg';
  const base64Data = fileBuffer.toString('base64');

  const tool = {
    name: 'submit_listing_research',
    description: 'Submit the SEO title and research notes for the item shown in the photo. Call this exactly once, as your final step.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The single best SEO-optimized eBay listing title, under 80 characters, based on the Google Lens matches and the photo. This goes directly into the live Title field, so make it the best real answer, not a placeholder.',
        },
        notes: {
          type: 'string',
          description:
            'Everything else useful for the seller\'s own reference (not shown to buyers): 2-3 ' +
            'alternate title ideas, brand/product facts, condition assessment from the photo, and a ' +
            'short list of comparable matches with their prices if any were found in the Lens results.',
        },
        category: { type: 'string', enum: CATEGORIES },
        condition: { type: 'string', enum: CONDITIONS },
      },
      required: ['title', 'notes', 'category', 'condition'],
    },
  };

  const lensMatchesText = lensMatches.length
    ? lensMatches.map((m) => `- "${m.title}" (${m.source}${m.price ? `, ${m.price}` : ''})`).join('\n')
    : '(no visual matches found)';

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system:
        'You are a resale listing assistant. You are given a photo of a secondhand item, the rough ' +
        'working title the seller typed in when they first logged the item (often generic or ' +
        'incomplete), and a list of Google Lens visual-match results for that photo (real matching ' +
        'product listings found on the web, some with prices). Use all three together to identify the ' +
        'exact item and write an SEO-optimized eBay title for it, plus separate research notes covering ' +
        'brand/facts, alternate title ideas, condition assessed from the photo, and comparable prices ' +
        'from the Lens matches. If the Lens matches seem unrelated to the actual item in the photo, ' +
        'trust the photo and say so in the notes rather than forcing a bad match. Call ' +
        'submit_listing_research exactly once with your final answer.',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } },
            {
              type: 'text',
              text:
                `Seller's rough working title: "${item?.item_name || '(none entered)'}"\n\n` +
                `Google Lens visual matches for this photo:\n${lensMatchesText}\n\n` +
                'Identify the exact item and submit your research.',
            },
          ],
        },
      ],
      tools: [tool],
      tool_choice: { type: 'tool', name: 'submit_listing_research' },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude request failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const toolUse = data.content?.find((block) => block.type === 'tool_use' && block.name === 'submit_listing_research');
  if (!toolUse) {
    const explanation = data.content?.find((block) => block.type === 'text')?.text;
    throw new Error(explanation || 'Claude did not return a structured draft.');
  }

  return toolUse.input;
}

module.exports = { generateListingDraft };
