const { XMLParser } = require('fast-xml-parser');

const TRADING_API_URL = 'https://api.ebay.com/ws/api.dll';
const ENTRIES_PER_PAGE = 100;

const parser = new XMLParser();

function buildActiveListRequest(pageNumber) {
  return `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ActiveList>
    <Include>true</Include>
    <Pagination>
      <EntriesPerPage>${ENTRIES_PER_PAGE}</EntriesPerPage>
      <PageNumber>${pageNumber}</PageNumber>
    </Pagination>
  </ActiveList>
</GetMyeBaySellingRequest>`;
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeItem(item) {
  return {
    itemId: String(item.ItemID),
    title: item.Title,
    price: Number(item.SellingStatus?.CurrentPrice ?? item.BuyItNowPrice ?? 0),
    quantityAvailable: Number(item.QuantityAvailable ?? item.Quantity ?? 1),
    startTime: item.ListingDetails?.StartTime,
  };
}

async function fetchActiveListPage(accessToken, pageNumber) {
  const res = await fetch(TRADING_API_URL, {
    method: 'POST',
    headers: {
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1155',
      'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-IAF-TOKEN': accessToken,
      'Content-Type': 'text/xml',
    },
    body: buildActiveListRequest(pageNumber),
  });

  const xml = await res.text();
  const parsed = parser.parse(xml);
  const response = parsed.GetMyeBaySellingResponse;

  if (!response || response.Ack === 'Failure') {
    throw new Error(`Trading API GetMyeBaySelling failed: ${xml.slice(0, 500)}`);
  }

  const activeList = response.ActiveList || {};
  const items = asArray(activeList.ItemArray?.Item).map(normalizeItem);
  const totalPages = Number(activeList.PaginationResult?.TotalNumberOfPages ?? 1);

  return { items, totalPages };
}

async function getActiveListings(accessToken) {
  const allItems = [];
  let page = 1;
  let totalPages = 1;

  do {
    const { items, totalPages: pages } = await fetchActiveListPage(accessToken, page);
    allItems.push(...items);
    totalPages = pages;
    page += 1;
  } while (page <= totalPages);

  return allItems;
}

module.exports = { getActiveListings };
