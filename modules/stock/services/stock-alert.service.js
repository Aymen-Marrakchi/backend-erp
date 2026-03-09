const ThresholdRule = require("../models/threshold-rule.model");
const StockAlert = require("../models/stock-alert.model");

exports.evaluateThreshold = async ({ productId, triggeredByMovementId = null }) => {
  const rule = await ThresholdRule.findOne({
    productId,
    isActive: true,
    alertEnabled: true,
  });

  if (!rule) return null;

  const StockItem = require("../models/stock-item.model");
  const stockItem = await StockItem.findOne({ productId });

  if (!stockItem) return null;

  if (stockItem.quantityOnHand < rule.minQuantity) {
    return StockAlert.create({
      productId,
      thresholdRuleId: rule._id,
      type: stockItem.quantityOnHand === 0 ? "OUT_OF_STOCK" : "LOW_STOCK",
      title: stockItem.quantityOnHand === 0 ? "Out of stock" : "Low stock alert",
      message: `Current stock (${stockItem.quantityOnHand}) is below threshold (${rule.minQuantity}).`,
      currentQuantity: stockItem.quantityOnHand,
      thresholdQuantity: rule.minQuantity,
      status: "OPEN",
      triggeredByMovementId,
    });
  }

  return null;
};