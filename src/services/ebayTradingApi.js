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
    sku: item.SKU ? String(item.SKU).trim() : null,
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

// Sets only the Custom Label (SKU) field on an existing listing, leaving
// everything else (price, policies, etc.) untouched. Confirmed working via
// live test: Ack comes back "Warning" (a generic "you didn't include business
// policy IDs" notice, not an error) rather than "Success", so Warning is
// treated as an accepted outcome here, not a failure.
async function reviseSku(accessToken, itemId, sku) {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Item>
    <ItemID>${itemId}</ItemID>
    <SKU>${sku}</SKU>
  </Item>
</ReviseFixedPriceItemRequest>`;

  const res = await fetch(TRADING_API_URL, {
    method: 'POST',
    headers: {
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1155',
      'X-EBAY-API-CALL-NAME': 'ReviseFixedPriceItem',
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-IAF-TOKEN': accessToken,
      'Content-Type': 'text/xml',
    },
    body,
  });

  const xml = await res.text();
  const parsed = parser.parse(xml);
  const response = parsed.ReviseFixedPriceItemResponse;

  if (!response || response.Ack === 'Failure') {
    throw new Error(`ReviseFixedPriceItem failed for ${itemId}: ${xml.slice(0, 800)}`);
  }

  return { ack: response.Ack };
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildItemSpecificsXml(specifics) {
  const entries = Object.entries(specifics || {}).filter(([, value]) => value);
  if (entries.length === 0) return '';

  const nameValueLines = entries
    .map(([name, value]) => `    <NameValueList>\n      <Name>${escapeXml(name)}</Name>\n      <Value>${escapeXml(value)}</Value>\n    </NameValueList>`)
    .join('\n');

  return `\n  <ItemSpecifics>\n${nameValueLines}\n  </ItemSpecifics>`;
}

// Creates a new fixed-price listing scheduled to go live at a future date
// (rather than immediately), so it's a real, native, editable Seller Hub
// listing during the hold -- see the "Ready to Publish" plan for why this
// call (not the modern Inventory API) is used.
function buildAddFixedPriceItemRequest(listing) {
  return `<?xml version="1.0" encoding="utf-8"?>
<AddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Item>
    <Title>${escapeXml(listing.title)}</Title>
    <Description><![CDATA[${listing.description}]]></Description>
    <PrimaryCategory>
      <CategoryID>${listing.categoryId}</CategoryID>
    </PrimaryCategory>
    <ConditionID>${listing.conditionId}</ConditionID>
    <StartPrice>${listing.price}</StartPrice>
    <Quantity>1</Quantity>
    <SKU>${escapeXml(listing.sku)}</SKU>
    <Country>${listing.shipFromCountry}</Country>
    <Currency>USD</Currency>
    <PostalCode>${listing.shipFromPostalCode}</PostalCode>
    <Site>US</Site>
    <ListingType>FixedPriceItem</ListingType>
    <ListingDuration>GTC</ListingDuration>
    <PictureDetails>
      <PictureURL>${escapeXml(listing.pictureUrl)}</PictureURL>
    </PictureDetails>
    <ShippingPackageDetails>
      <WeightMajor unit="lbs">${listing.weightLbs}</WeightMajor>
      <WeightMinor unit="oz">${listing.weightOz}</WeightMinor>
      <PackageLength unit="in">${listing.packageLength}</PackageLength>
      <PackageWidth unit="in">${listing.packageWidth}</PackageWidth>
      <PackageDepth unit="in">${listing.packageHeight}</PackageDepth>
    </ShippingPackageDetails>
    <SellerProfiles>
      <SellerPaymentProfile>
        <PaymentProfileID>${listing.paymentPolicyId}</PaymentProfileID>
      </SellerPaymentProfile>
      <SellerReturnProfile>
        <ReturnProfileID>${listing.returnPolicyId}</ReturnProfileID>
      </SellerReturnProfile>
      <SellerShippingProfile>
        <ShippingProfileID>${listing.fulfillmentPolicyId}</ShippingProfileID>
      </SellerShippingProfile>
    </SellerProfiles>
    <SchedulingInfo>
      <StartTime>${listing.startTime}</StartTime>
    </SchedulingInfo>${buildItemSpecificsXml(listing.itemSpecifics)}
  </Item>
</AddFixedPriceItemRequest>`;
}

async function addFixedPriceItem(accessToken, listing) {
  const body = buildAddFixedPriceItemRequest(listing);

  const res = await fetch(TRADING_API_URL, {
    method: 'POST',
    headers: {
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1155',
      'X-EBAY-API-CALL-NAME': 'AddFixedPriceItem',
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-IAF-TOKEN': accessToken,
      'Content-Type': 'text/xml',
    },
    body,
  });

  const xml = await res.text();
  const parsed = parser.parse(xml);
  const response = parsed.AddFixedPriceItemResponse;

  if (!response || response.Ack === 'Failure') {
    throw new Error(`AddFixedPriceItem failed: ${xml.slice(0, 1500)}`);
  }

  return { ack: response.Ack, itemId: String(response.ItemID), startTime: response.StartTime };
}

module.exports = { getActiveListings, reviseSku, addFixedPriceItem };
