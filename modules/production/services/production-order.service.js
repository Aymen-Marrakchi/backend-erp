const ProductionOrder = require("../models/production-order.model");
const StockItem = require("../../stock/models/stock-item.model");
const StockMovement = require("../../stock/models/stock-movement.model");
const DeliveryPlan = require("../../commercial/models/delivery-plan.model");

const PRIORITY_RANK = { LOW: 0, NORMAL: 1, HIGH: 2, URGENT: 3 };

function derivePriority(order, planDate) {
  if (order.isUrgent) return "URGENT";
  if (order.promisedDate) {
    const days = (new Date(order.promisedDate) - new Date(planDate)) / 86400000;
    if (days <= 3) return "HIGH";
  }
  return "NORMAL";
}

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

/**
 * Generate production orders from a SHIPMENT delivery plan.
 * Aggregates quantities per product, derives priority from order urgency/promised date,
 * and validates total quantity against vehicle capacity.
 */
exports.createFromDeliveryPlan = async (planId, createdBy) => {
  const plan = await DeliveryPlan.findById(planId)
    .populate("vehicleId", "matricule capacityKg capacityPackets")
    .populate({
      path: "orderIds",
      populate: { path: "lines.productId", select: "name sku unit" },
    });

  if (!plan) throw Object.assign(new Error("Delivery plan not found"), { statusCode: 404 });
  if (plan.planType !== "SHIPMENT")
    throw Object.assign(new Error("Only SHIPMENT plans can generate production orders"), { statusCode: 400 });
  if (plan.status === "CANCELLED")
    throw Object.assign(new Error("Cannot generate from a cancelled plan"), { statusCode: 400 });

  // Aggregate quantities per product, track highest priority per product
  const productMap = new Map();
  for (const order of plan.orderIds) {
    const priority = derivePriority(order, plan.planDate);
    for (const line of order.lines) {
      const pid = String(line.productId._id);
      if (!productMap.has(pid)) {
        productMap.set(pid, { productId: pid, quantity: 0, priority: "LOW", salesOrderId: order._id });
      }
      const entry = productMap.get(pid);
      entry.quantity += line.quantity;
      if (PRIORITY_RANK[priority] > PRIORITY_RANK[entry.priority]) {
        entry.priority = priority;
      }
    }
  }

  // Vehicle capacity check (capacityPackets = max total units)
  const totalQty = [...productMap.values()].reduce((sum, e) => sum + e.quantity, 0);
  const vehicleCapacity = plan.vehicleId?.capacityPackets;
  if (vehicleCapacity && totalQty > vehicleCapacity) {
    throw Object.assign(
      new Error(`Total (${totalQty} unités) dépasse la capacité du véhicule (${vehicleCapacity} colis)`),
      { statusCode: 400 }
    );
  }

  // Create production orders sorted by priority (highest first)
  const sorted = [...productMap.values()].sort(
    (a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]
  );

  const created = [];
  for (const entry of sorted) {
    const po = await exports.create({
      productId: entry.productId,
      quantity: entry.quantity,
      priority: entry.priority,
      salesOrderId: String(entry.salesOrderId),
      notes: `Généré depuis plan ${plan.planNo}`,
      createdBy,
    });
    created.push(po);
  }

  return { orders: created, planNo: plan.planNo, totalQty, vehicleCapacity };
};
