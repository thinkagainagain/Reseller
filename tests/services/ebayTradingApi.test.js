const { test } = require('node:test');
const assert = require('node:assert/strict');
const { XMLParser } = require('fast-xml-parser');
const { buildPictureDetailsXml, normalizeItem } = require('../../src/services/ebayTradingApi');

test('normalizeItem reads each variation\'s own SKU, label, price and remaining count', () => {
  const xml = `<Item>
    <ItemID>123</ItemID><Title>Pyrex bowl</Title><QuantityAvailable>9</QuantityAvailable>
    <Variations>
      <Variation>
        <SKU>RT-0010</SKU><StartPrice>12.5</StartPrice><Quantity>3</Quantity>
        <SellingStatus><QuantitySold>1</QuantitySold></SellingStatus>
        <VariationSpecifics><NameValueList><Name>Color</Name><Value>Red</Value></NameValueList></VariationSpecifics>
      </Variation>
      <Variation>
        <StartPrice>12.5</StartPrice><Quantity>3</Quantity>
        <SellingStatus><QuantitySold>3</QuantitySold></SellingStatus>
        <VariationSpecifics>
          <NameValueList><Name>Color</Name><Value>Blue</Value></NameValueList>
          <NameValueList><Name>Size</Name><Value>Large</Value></NameValueList>
        </VariationSpecifics>
      </Variation>
    </Variations>
  </Item>`;
  const item = normalizeItem(new XMLParser().parse(xml).Item);
  assert.deepEqual(item.variations, [
    { sku: 'RT-0010', label: 'Red', price: 12.5, quantityAvailable: 2 },
    { sku: null, label: 'Blue / Large', price: 12.5, quantityAvailable: 0 },
  ]);
});

test('normalizeItem gives a plain listing no variations', () => {
  const item = normalizeItem({ ItemID: 1, Title: 'x', QuantityAvailable: 1 });
  assert.deepEqual(item.variations, []);
});

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
