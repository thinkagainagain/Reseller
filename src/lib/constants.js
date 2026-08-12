const STATUSES = ['Intake', 'Active', 'Sold', 'Death Pile', 'Donated', 'Trashed', 'Returned'];

const CATEGORIES = [
  'Clothing', 'Shoes', 'Accessories', 'Electronics', 'Home Goods',
  'Toys/Collectibles', 'Books/Media', 'Jewelry', 'Sporting Goods', 'Tools',
  'Furniture', 'Other',
];

const SOURCES = [
  'Thrift Store', 'Estate Sale', 'Yard/Garage Sale', 'Auction',
  'Wholesale/Liquidation', 'Online Sourcing', 'Donation Received',
  'Consignment', 'Other',
];

const CONDITIONS = ['New', 'Like New', 'Excellent', 'Good', 'Fair', 'Poor/Parts'];

const DEATH_PILE_REASONS = [
  'Needs Cleaning', 'Shipping Solution Needed', 'Broken/Parts Only',
  'Stale/No Interest', 'Pricing Issue', 'Other',
];

const DEATH_PILE_ACTION_PLANS = [
  'Relist Lower Price', 'Bundle', 'Photograph Better', 'List New Platform',
  'Discount/Offer', 'Donate', 'Discard', 'Keep Watching',
];

const PLATFORMS = [
  'eBay', 'Mercari', 'Poshmark (>=$15)', 'Poshmark (<$15 flat)', 'Depop',
  'Facebook Marketplace', 'Google Merchant', 'Other',
];

module.exports = {
  STATUSES,
  CATEGORIES,
  SOURCES,
  CONDITIONS,
  DEATH_PILE_REASONS,
  DEATH_PILE_ACTION_PLANS,
  PLATFORMS,
};
