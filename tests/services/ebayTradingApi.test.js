const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildPictureDetailsXml } = require('../../src/services/ebayTradingApi');

test('buildPictureDetailsXml renders one PictureURL per photo', () => {
  const xml = buildPictureDetailsXml(['https://example.com/a.jpg', 'https://example.com/b.jpg']);
  assert.match(xml, /<PictureURL>https:\/\/example\.com\/a\.jpg<\/PictureURL>/);
  assert.match(xml, /<PictureURL>https:\/\/example\.com\/b\.jpg<\/PictureURL>/);
});

test('buildPictureDetailsXml drops falsy entries', () => {
  const xml = buildPictureDetailsXml(['https://example.com/a.jpg', null, undefined, '']);
  const matches = xml.match(/<PictureURL>/g) || [];
  assert.equal(matches.length, 1);
});
