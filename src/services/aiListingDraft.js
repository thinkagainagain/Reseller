const fs = require('fs/promises');
const path = require('path');
const db = require('../db');
const { CATEGORIES, CONDITIONS } = require('../lib/constants');
const { UPLOADS_ROOT } = require('../lib/uploadsDir');
const { getAppAccessToken } = require('./ebayAuth');
const { getCategorySuggestion } = require('./ebayTaxonomy');

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

async function generateListingDraft(sku, clarification) {
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
    description: 'Submit the researched listing fields for the item shown in the photo. Call this exactly once, as your final step.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The single best SEO-optimized eBay listing title, under 80 characters. This goes directly into the live Title field.',
        },
        description: {
          type: 'string',
          description:
            'A factual, persuasive eBay sales listing description built to actually sell the item -- ' +
            'written for both search engines (SEO) and AI shopping/answer assistants (AEO): lead with ' +
            'what it is and why it is desirable, include verified facts (not visual guesses), and end ' +
            'with a light call to action. This is shown directly to buyers.',
        },
        brand: { type: 'string', description: 'Only if positively identified -- omit entirely if not confidently known.' },
        item_size: { type: 'string', description: 'Only if positively identified -- omit entirely if not confidently known.' },
        color: { type: 'string', description: 'Only if positively identified -- omit entirely if not confidently known.' },
        year_manufactured: { type: 'string', description: 'Only if positively identified (a specific year or era like "1970s") -- omit entirely if not confidently known.' },
        country_of_origin: { type: 'string', description: 'Only if positively identified -- omit entirely if not confidently known.' },
        list_price: {
          type: 'number',
          description: 'A best-guess asking price in USD based on comparable prices found in the Lens matches. Omit if no useful pricing data was found.',
        },
        category: { type: 'string', enum: CATEGORIES, description: 'Our internal simplified category list.' },
        condition: { type: 'string', enum: CONDITIONS },
        notes: {
          type: 'string',
          description:
            'Bonus research for the seller\'s own reference (not shown to buyers): 2-3 alternate title ' +
            'ideas, any additional facts that did not fit the structured fields above, and a short list ' +
            'of comparable matches with prices from the Lens results.',
        },
      },
      required: ['title', 'description', 'category', 'condition'],
    },
  };

  const lensMatchesText = lensMatches.length
    ? lensMatches.map((m) => `- "${m.title}" (${m.source}${m.price ? `, ${m.price}` : ''})`).join('\n')
    : '(no visual matches found)';

  const clarificationText = clarification
    ? `\n\nThe seller reviewed a previous draft and left this correction/clarification -- treat it as ` +
      `ground truth and incorporate it: "${clarification}"`
    : '';

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
        'You are a resale listing research assistant. You are given a photo of a secondhand item, the ' +
        'rough working title the seller typed in when they first logged the item (often generic or ' +
        'incomplete), and a list of Google Lens visual-match results for that photo (real matching ' +
        'product listings found on the web, some with prices). Identify the exact item and fill in the ' +
        'structured fields. Only fill in brand/size/color/year/country if you can positively identify ' +
        'them -- never guess or fabricate these, just omit them if unsure. If the Lens matches seem ' +
        'unrelated to the actual item in the photo, trust the photo over the matches and say so in the ' +
        'notes. Call submit_listing_research exactly once with your final answer.',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } },
            {
              type: 'text',
              text:
                `Seller's rough working title: "${item?.item_name || '(none entered)'}"\n\n` +
                `Google Lens visual matches for this photo:\n${lensMatchesText}${clarificationText}\n\n` +
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

  const draft = toolUse.input;

  try {
    const appToken = await getAppAccessToken();
    const suggestion = await getCategorySuggestion(appToken, draft.title);
    if (suggestion) {
      draft.ebay_category_id = suggestion.categoryId;
      draft.ebay_category_name = suggestion.categoryName;
    }
  } catch (err) {
    // eBay category lookup is a bonus, not essential -- don't fail the whole
    // draft over it, just proceed without a suggestion.
    console.error('eBay category suggestion failed:', err.message);
  }

  return draft;
}

module.exports = { generateListingDraft };
