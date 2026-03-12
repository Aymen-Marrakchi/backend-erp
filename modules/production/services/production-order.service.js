const ProductionOrder = require("../models/production-order.model");
const StockItem = require("../../stock/models/stock-item.model");
const StockMovement = require("../../stock/models/stock-movement.model");

const populate = (q) =>
  q
    .populate("productId", "name sku unit")
    .populate("workCenterId", "name code type")
    .populate("salesOrderId", "orderNo")
    .populate("createdBy", "name");

const genOrderNo = async () => {
  const count = await ProductionOrder.countDocuments();
  return `PO-${String(count + 1).padStart(5, "0")}`;
};

exports.getAll = () => populate(ProductionOrder.find().sort({ createdAt: -1 }));

exports.getById = (id) => populate(ProductionOrder.findById(id));

// Returns SCHEDULED + IN_PROGRESS orders overlapping [from, to] for Gantt view
exports.getTimeline = (from, to) =>
  populate(
    ProductionOrder.find({
      status: { $in: ["SCHEDULED", "IN_PROGRESS"] },
      scheduledStart: { $lte: new Date(to) },
      scheduledEnd: { $gte: new Date(from) },
    }).sort({ scheduledStart: 1 })
  );

exports.create = async ({ salesOrderId, productId, quantity, priority, estimatedHours, notes, createdBy }) => {
  const orderNo = await genOrderNo();
  return ProductionOrder.create({
    orderNo,
    salesOrderId: salesOrderId || null,
    productId,
    quantity,
    priority: priority || "NORMAL",
    estimatedHours: estimatedHours || 0,
    notes: notes || "",
    createdBy: createdBy || null,
  });
};

exports.schedule = async (id, { workCenterId, scheduledStart, scheduledEnd }) => {
  const order = await ProductionOrder.findById(id);
  if (!order) throw Object.assign(new Error("Production order not found"), { statusCode: 404 });
  if (!["DRAFT", "SCHEDULED"].includes(order.status))
    throw Object.assign(new Error("Cannot reschedule this order"), { statusCode: 400 });
  if (new Date(scheduledEnd) <= new Date(scheduledStart))
    throw Object.assign(new Error("End date must be after start date"), { statusCode: 400 });

  order.workCenterId = workCenterId;
  order.scheduledStart = new Date(scheduledStart);
  order.scheduledEnd = new Date(scheduledEnd);
  order.status = "SCHEDULED";
  return order.save();
};

exports.start = async (id) => {
  const order = await ProductionOrder.findById(id);
  if (!order) throw Object.assign(new Error("Production order not found"), { statusCode: 404 });
  if (order.status !== "SCHEDULED")
    throw Object.assign(new Error("Order must be SCHEDULED to start"), { statusCode: 400 });
  order.status = "IN_PROGRESS";
  order.actualStart = new Date();
  return order.save();
};

exports.complete = async (id, completedQty, userId) => {
  const order = await ProductionOrder.findById(id).populate("productId");
  if (!order) throw Object.assign(new Error("Production order not found"), { statusCode: 404 });
  if (order.status !== "IN_PROGRESS")
    throw Object.assign(new Error("Order must be IN_PROGRESS to complete"), { statusCode: 400 });

  const qty = completedQty || order.quantity;

  // Update or create stock item
  let stockItem = await StockItem.findOne({ productId: order.productId._id });
  const previousOnHand = stockItem ? stockItem.quantityOnHand : 0;

  if (stockItem) {
    stockItem.quantityOnHand += qty;
    stockItem.lastMovementAt = new Date();
    await stockItem.save();
  } else {
    stockItem = await StockItem.create({
      productId: order.productId._id,
      quantityOnHand: qty,
      quantityReserved: 0,
      lastMovementAt: new Date(),
    });
  }

  // Record stock movement
  await StockMovement.create({
    productId: order.productId._id,
    type: "ENTRY",
    quantity: qty,
    previousOnHand,
    newOnHand: previousOnHand + qty,
    previousReserved: stockItem.quantityReserved,
    newReserved: stockItem.quantityReserved,
    sourceModule: "PRODUCTION",
    sourceType: "ProductionOrder",
    sourceId: String(order._id),
    reference: order.orderNo,
    reason: "Production order completed",
    notes: `Production order ${order.orderNo} completed — ${qty} units added to stock`,
    createdBy: userId || null,
    status: "POSTED",
  });

  order.status = "COMPLETED";
  order.completedQty = qty;
  order.actualEnd = new Date();
  await order.save();

  return order;
};

exports.cancel = async (id) => {
  const order = await ProductionOrder.findById(id);
  if (!order) throw Object.assign(new Error("Production order not found"), { statusCode: 404 });
  if (order.status === "COMPLETED")
    throw Object.assign(new Error("Cannot cancel a completed order"), { statusCode: 400 });
  order.status = "CANCELLED";
  return order.save();
};
