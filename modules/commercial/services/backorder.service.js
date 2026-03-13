const BackOrder = require("../models/backorder.model");
const stockMovementService = require("../../stock/services/stock-movement.service");
const stockService = require("../../stock/services/stock.service");

const populateBackOrder = (query) =>
  query
    .populate("lines.productId", "name sku")
    .populate("salesOrderId", "orderNo status")
    .populate("createdBy", "name email role");

exports.getAll = async () => {
  return populateBackOrder(BackOrder.find()).sort({ createdAt: -1 });
};

exports.getById = async (id) => {
  return populateBackOrder(BackOrder.findById(id));
};

exports.getBySalesOrder = async (salesOrderId) => {
  return populateBackOrder(BackOrder.findOne({ salesOrderId }));
};

/**
 * Called from confirmOrder when stock is insufficient.
 * lines: [{ productId, quantityOrdered, quantityReserved, quantityBackordered }]
 */
exports.createBackOrder = async ({
  salesOrderId,
  orderNo,
  customerName,
  lines,
  createdBy = null,
}) => {
  const bo = await BackOrder.create({
    salesOrderId,
    orderNo,
    customerName,
    lines,
    createdBy,
  });
  return populateBackOrder(BackOrder.findById(bo._id));
};

/**
 * Attempt to fulfill a pending backorder.
 * Pre-validates ALL lines before reserving anything to prevent partial state.
 */
exports.fulfillBackOrder = async (id, userId = null) => {
  const bo = await BackOrder.findById(id);
  if (!bo) throw Object.assign(new Error("Backorder not found"), { statusCode: 404 });
  if (bo.status !== "PENDING") {
    throw Object.assign(new Error("Only pending backorders can be fulfilled"), { statusCode: 400 });
  }

  // Pre-validation pass — collect all stock shortfalls before touching anything
  const shortfalls = [];
  for (const line of bo.lines) {
    if (line.quantityBackordered <= 0) continue;
    const stockItem = await stockService.getOrCreateStockItem(line.productId);
    const available = stockItem.quantityOnHand - stockItem.quantityReserved;
    if (available < line.quantityBackordered) {
      shortfalls.push(`Product ${line.productId}: needs ${line.quantityBackordered}, available ${available}`);
    }
  }

  if (shortfalls.length > 0) {
    throw Object.assign(
      new Error(`Insufficient stock:\n${shortfalls.join("\n")}`),
      { statusCode: 400 }
    );
  }

  // All lines pass — now reserve
  for (const line of bo.lines) {
    if (line.quantityBackordered <= 0) continue;

    await stockMovementService.reserveStock({
      productId: line.productId,
      quantity: line.quantityBackordered,
      sourceModule: "COMMERCIAL",
      sourceType: "BACKORDER_FULFILLED",
      sourceId: String(bo.salesOrderId),
      reference: bo.orderNo,
      reason: "Backorder stock reservation",
      notes: `Backorder fulfilled for ${bo.customerName}`,
      createdBy: userId,
    });

    line.quantityReserved += line.quantityBackordered;
    line.quantityBackordered = 0;
  }

  bo.status = "FULFILLED";
  bo.fulfilledAt = new Date();
  await bo.save();

  return populateBackOrder(BackOrder.findById(bo._id));
};

exports.cancelBackOrder = async (id, userId = null) => {
  const bo = await BackOrder.findById(id);
  if (!bo) throw Object.assign(new Error("Backorder not found"), { statusCode: 404 });
  if (bo.status !== "PENDING") {
    throw Object.assign(new Error("Only pending backorders can be cancelled"), { statusCode: 400 });
  }

  bo.status = "CANCELLED";
  bo.cancelledAt = new Date();
  await bo.save();

  return populateBackOrder(BackOrder.findById(bo._id));
};
