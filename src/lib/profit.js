function computeProfit(sale) {
  const salePrice = Number(sale.sale_price || 0);
  const shippingCharged = Number(sale.shipping_charged || 0);
  const shippingCost = Number(sale.shipping_cost || 0);
  const otherFees = Number(sale.other_fees || 0);
  const purchaseCost = Number(sale.purchase_cost || 0);
  const feePercent = Number(sale.fee_percent || 0);
  const flatFee = Number(sale.flat_fee || 0);

  const revenue = salePrice + shippingCharged;
  // A real per-order eBay fee (pulled from the order itself) is more
  // accurate than the estimated fee_percent/flat_fee -- prefer it when sync
  // has captured one.
  const platformFee = sale.ebay_actual_fee != null
    ? Number(sale.ebay_actual_fee)
    : revenue * feePercent + flatFee;
  const profit = revenue - platformFee - purchaseCost - shippingCost - otherFees;
  const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;

  return { revenue, platformFee, profit, marginPct };
}

module.exports = { computeProfit };
