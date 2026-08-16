const fs = require('fs/promises');
const path = require('path');
const db = require('../db');
const { CATEGORIES, CONDITIONS } = require('../lib/constants');

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';
const UPLOADS_ROOT = path.join(__dirname, '..', '..', 'public', 'uploads');

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
};

async function generateListingDraft(sku) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY in .env');
  }

  const photo = await db('intake_photos').where({ sku }).orderBy('id', 'asc').first();
  if (!photo) {
    throw new Error(`No intake photo found for ${sku} -- nothing to send to AI.`);
  }

  const absolutePath = path.join(UPLOADS_ROOT, path.relative('/uploads', photo.file_path));
  const fileBuffer = await fs.readFile(absolutePath);
  const ext = path.extname(absolutePath).toLowerCase();
  const mimeType = MIME_BY_EXT[ext] || 'image/jpeg';
  const dataUri = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;

  const schema = {
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
    additionalProperties: false,
  };

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a resale listing assistant. Look at the photo of a secondhand item and draft ' +
            'marketplace listing fields for it. Fold in color, apparent brand, and material naturally ' +
            'into the title and description rather than listing them separately. Pick the single best ' +
            'matching category and condition from the provided lists.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Draft listing fields for this item.' },
            { type: 'image_url', image_url: { url: dataUri } },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'listing_draft', strict: true, schema },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI request failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned no content to parse.');
  }

  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`OpenAI returned unparseable content: ${content}`);
  }
}

module.exports = { generateListingDraft };
