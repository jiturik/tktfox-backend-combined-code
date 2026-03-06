export async function checkAvailability(item_id, requestedQuantity) {
  const item = await global
    .knexConnection("shop_items")
    .where({ item_id })
    .first();

  if (!item) {
    return {
      status: false,
      message: "Invalid item id",
    };
  }

  const quantity = Number(requestedQuantity);

  if (!quantity || Number.isNaN(quantity)) {
    return {
      status: false,
      message: "Item quantity is required",
    };
  }

  const minQty = Number(item.item_min_quantity) || 0;
  const maxQty = Number(item.item_max_quantity) || 0;

  if (minQty && quantity < minQty) {
    return {
      status: false,
      message: `Minimum quantity for this item is ${minQty}`,
    };
  }

  if (maxQty && quantity > maxQty) {
    return {
      status: false,
      message: `Maximum quantity for this item is ${maxQty}`,
    };
  }

  const soldResult = await global
    .knexConnection("reserve_shop_items")
    .where({ item_id, is_reserved: "Y" })
    .sum({ total_sold: "item_quantity" })
    .first();

  const soldQty = Number(soldResult?.total_sold) || 0;
  const totalQty = Number(item.item_total_quantity) || 0;
  const availableQty = totalQty - soldQty;

  if (quantity > availableQty) {
    return {
      status: false,
      message: "Insufficient quantity available for this item",
    };
  }

  return {
    status: true,
    item,
    availableQty,
  };
}
