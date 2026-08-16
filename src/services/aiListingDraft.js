const fs = require('fs/promises');
const path = require('path');
const db = require('../db');
const { CATEGORIES, CONDITIONS } = require('../lib/constants');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-haiku-4-5-20251001';
const UPLOADS_ROOT = path.join(__dirname, '..', '..', 'public', 'uploads');

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

  const tool = {
    name: 'draft_listing',
    description: 'Draft resale marketplace listing fields for the item shown in the photo.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'A concise resale listing title, under 80 characters.' },
        description: {
          type: 'string',
          description: 'A short marketplace listing description of the item, naturally mentioning color, brand, and material if visible.',
        },
        category: { type: 'string', enum: CATEGORIES },
        condition: { type: 'string', enum: CONDITIONS },
      },
      required: ['title', 'description', 'category', 'condition'],
    },
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
      max_tokens: 1024,
      system:
        'You are a resale listing assistant. Look at the photo of a secondhand item and draft ' +
        'marketplace listing fields for it. Fold in color, apparent brand, and material naturally ' +
        'into the title and description rather than listing them separately. Pick the single best ' +
        'matching category and condition from the provided lists.',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } },
            { type: 'text', text: 'Draft listing fields for this item.' },
          ],
        },
      ],
      tools: [tool],
      tool_choice: { type: 'tool', name: 'draft_listing' },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude request failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const toolUse = data.content?.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    throw new Error('Claude did not return a structured draft.');
  }

  return toolUse.input;
}

module.exports = { generateListingDraft };
