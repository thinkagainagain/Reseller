const fs = require('fs/promises');
const path = require('path');
const db = require('../db');
const { CATEGORIES, CONDITIONS } = require('../lib/constants');
const { UPLOADS_ROOT } = require('../lib/uploadsDir');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-haiku-4-5-20251001';

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
};

async function generateListingDraft(sku) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY in .env');
  }

  const photo = await db('intake_photos').where({ sku }).orderBy('id', 'asc').first();
  if (!photo) {
    throw new Error(`No intake photo found for ${sku} -- nothing to send to AI.`);
  }

  const absolutePath = path.join(UPLOADS_ROOT, path.relative('/uploads', photo.file_path));
  const fileBuffer = await fs.readFile(absolutePath);
  const ext = path.extname(absolutePath).toLowerCase();
  const mimeType = MIME_BY_EXT[ext] || 'image/jpeg';
  const base64Data = fileBuffer.toString('base64');

  const researchTool = {
    name: 'research_item',
    description: 'Submit research findings about the item shown in the photo. Call this exactly once, as your last step, after identifying the item and researching it.',
    input_schema: {
      type: 'object',
      properties: {
        research_notes: {
          type: 'string',
          description:
            'Everything found about the exact item, written for the seller\'s own reference (not final ' +
            'listing copy): brand, exact product/title, model or edition, key specs, materials, ' +
            'dimensions if found, notable history or background, and any other facts useful for writing ' +
            'an eBay listing later. Be thorough and factual -- include a suggested SEO-style title idea ' +
            'and a couple of possible description angles, but this is raw research material, not a ' +
            'polished listing.',
        },
        category: { type: 'string', enum: CATEGORIES },
        condition: { type: 'string', enum: CONDITIONS },
      },
      required: ['research_notes', 'category', 'condition'],
    },
  };

  const webSearchTool = {
    type: 'web_search_20250305',
    name: 'web_search',
    max_uses: 5,
  };

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system:
        'You are a resale item research assistant. Look at the photo of a secondhand item and ' +
        'identify exactly what it is -- read any visible title, brand, model number, barcode, or ' +
        'other distinguishing text in the image. Then use web search to find and verify the real, ' +
        'exact item (e.g. the precise book/movie/album/product listing) so your notes are built from ' +
        'real, verified facts rather than a guess based on appearance. Only fall back to a visual ' +
        'description if the item genuinely cannot be identified after searching. When you are done ' +
        'researching, call research_item exactly once with your final findings.',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } },
            { type: 'text', text: 'Identify this exact item, research it, and report your findings.' },
          ],
        },
      ],
      tools: [webSearchTool, researchTool],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude request failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const toolUse = data.content?.find((block) => block.type === 'tool_use' && block.name === 'research_item');
  if (!toolUse) {
    const explanation = data.content?.find((block) => block.type === 'text')?.text;
    throw new Error(explanation || 'Claude did not return research findings.');
  }

  return toolUse.input;
}

module.exports = { generateListingDraft };
