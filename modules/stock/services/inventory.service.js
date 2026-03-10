const InventoryCount = require("../models/inventory-count.model");
const InventoryCountLine = require("../models/inventory-count-line.model");
const StockItem = require("../models/stock-item.model");
const StockMovement = require("../models/stock-movement.model");
const Product = require("../models/product.model");
const Depot = require("../models/depot.model");
const stockAlertService = require("./stock-alert.service");
const stockEventService = require("./stock-event.service");

const generateInventoryCode = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const t = Date.now().toString().slice(-5);
  return `INV-${y}${m}${d}-${t}`;
};

exports.getAllInventories = async ({ userId, role } = {}) => {
  let filter = {};
  if (role === "DEPOT_MANAGER" && userId) {
    const depot = await Depot.findOne({ managerId: userId });
    if (depot) filter.depotId = depot._id;
    else return [];
  }
  return InventoryCount.find(filter)
    .populate("startedBy", "name email role")
    .populate("depotId", "name address")
    .sort({ createdAt: -1 });
};

exports.getInventoryById = async (id) => {
  const inventory = await InventoryCount.findById(id)
    .populate("startedBy", "name email role")
    .populate("depotId", "name address");
  if (!inventory) throw Object.assign(new Error("Inventory session not found"), { statusCode: 404 });
  return inventory;
};

exports.createInventory = async ({ type, notes = "", startedBy = null, depotId = null }) => {
  if (!depotId) throw Object.assign(new Error("A depot must be selected"), { statusCode: 400 });
  return InventoryCount.create({
    code: generateInventoryCode(),
    type,
    status: "IN_PROGRESS",
    startedBy,
    startedAt: new Date(),
    notes,
    depotId,
  });
};

exports.getInventoryLines = async (inventoryCountId) => {
  return InventoryCountLine.find({ inventoryCountId })
    .populate("productId")
    .populate("countedBy", "name email role")
    .populate("approvedBy", "name email role")
    .populate("reasonHistory.addedBy", "name email role")
    .sort({ createdAt: -1 });
};

exports.addInventoryLine = async ({ inventoryCountId, productId, countedQuantity, lotRef = "", notes = "", countedBy = null }) => {
  const qty = Number(countedQuantity);
  if (Number.isNaN(qty) || qty < 0) throw Object.assign(new Error("countedQuantity must be a non-negative number"), { statusCode: 400 });
  const inventory = await InventoryCount.findById(inventoryCountId);
  if (!inventory) throw Object.assign(new Error("Inventory session not found"), { statusCode: 404 });
  if (inventory.status !== "IN_PROGRESS") throw Object.assign(new Error("Lines can only be added while session is IN_PROGRESS"), { statusCode: 400 });
  const product = await Product.findById(productId);
  if (!product) throw Object.assign(new Error("Product not found"), { statusCode: 404 });
  const existing = await InventoryCountLine.findOne({ inventoryCountId, productId });
  if (existing) throw Object.assign(new Error("This product already has a count line in this session"), { statusCode: 400 });
  const stockItem = await StockItem.findOne({ productId });
  const systemQuantity = stockItem ? stockItem.quantityOnHand : 0;
  return InventoryCountLine.create({
    inventoryCountId, productId, systemQuantity,
    countedQuantity: qty, lotRef, notes,
    status: "PENDING", countedBy, countedAt: new Date(),
  });
};

exports.sendToDepot = async (inventoryCountId) => {
  const inventory = await InventoryCount.findById(inventoryCountId);
  if (!inventory) throw Object.assign(new Error("Inventory session not found"), { statusCode: 404 });
  if (inventory.status !== "IN_PROGRESS") throw Object.assign(new Error("Session must be IN_PROGRESS to send to depot"), { statusCode: 400 });
  const lineCount = await InventoryCountLine.countDocuments({ inventoryCountId });
  if (lineCount === 0) throw Object.assign(new Error("Add at least one count line before sending to depot"), { statusCode: 400 });
  inventory.status = "SENT_TO_DEPOT";
  await inventory.save();
  return inventory;
};

exports.addDepotReason = async ({ lineId, reason, userId }) => {
  const line = await InventoryCountLine.findById(lineId).populate("inventoryCountId");
  if (!line) throw Object.assign(new Error("Line not found"), { statusCode: 404 });
  const session = line.inventoryCountId;
  if (!["SENT_TO_DEPOT", "PENDING_APPROVAL"].includes(session.status))
    throw Object.assign(new Error("Session is not open for depot review"), { statusCode: 400 });
  if (!["PENDING", "REJECTED"].includes(line.status))
    throw Object.assign(new Error("This line is not waiting for a depot reason"), { statusCode: 400 });
  line.depotReason = reason.trim();
  line.reasonHistory.push({ reason: reason.trim(), addedBy: userId, action: "DEPOT_REASON" });
  line.status = "REVIEWED";
  await line.save();
  return InventoryCountLine.findById(line._id)
    .populate("productId")
    .populate("countedBy", "name role")
    .populate("approvedBy", "name role")
    .populate("reasonHistory.addedBy", "name role");
};

exports.submitDepotReview = async (inventoryCountId) => {
  const inventory = await InventoryCount.findById(inventoryCountId);
  if (!inventory) throw Object.assign(new Error("Inventory session not found"), { statusCode: 404 });
  if (inventory.status !== "SENT_TO_DEPOT") throw Object.assign(new Error("Session must be SENT_TO_DEPOT to submit review"), { statusCode: 400 });
  const lines = await InventoryCountLine.find({ inventoryCountId });
  const unreviewed = lines.filter((l) => !["REVIEWED", "APPROVED"].includes(l.status));
  if (unreviewed.length > 0) throw Object.assign(new Error(`${unreviewed.length} line(s) still need a reason before submitting`), { statusCode: 400 });
  inventory.status = "PENDING_APPROVAL";
  await inventory.save();
  return inventory;
};

exports.approveInventoryLine = async ({ lineId, userId }) => {
  const line = await InventoryCountLine.findById(lineId).populate("inventoryCountId");
  if (!line) throw Object.assign(new Error("Line not found"), { statusCode: 404 });
  const session = line.inventoryCountId;
  if (session.status === "CLOSED") throw Object.assign(new Error("Session is already closed"), { statusCode: 400 });
  if (session.status === "IN_PROGRESS") throw Object.assign(new Error("Session must be sent to depot first"), { statusCode: 400 });
  if (line.status !== "REVIEWED") throw Object.assign(new Error("Line must be REVIEWED before approval"), { statusCode: 400 });

  if (line.varianceQuantity !== 0) {
    let stockItem = await StockItem.findOne({ productId: line.productId });
    if (!stockItem) {
      stockItem = await StockItem.create({ productId: line.productId, quantityOnHand: 0, quantityReserved: 0, quantityAvailable: 0, status: "ACTIVE" });
    }
    const previousOnHand = stockItem.quantityOnHand;
    const previousReserved = stockItem.quantityReserved;
    stockItem.quantityOnHand = line.countedQuantity;
    stockItem.lastMovementAt = new Date();
    await stockItem.save();
    const movement = await StockMovement.create({
      productId: line.productId, type: "ADJUSTMENT",
      quantity: Math.abs(line.varianceQuantity),
      previousOnHand, newOnHand: stockItem.quantityOnHand,
      previousReserved, newReserved: stockItem.quantityReserved,
      sourceModule: "STOCK", sourceType: "INVENTORY_ADJUSTMENT",
      sourceId: String(line._id), reference: session.code,
      reason: line.depotReason, notes: "", status: "POSTED",
      createdBy: userId, approvedBy: userId, approvedAt: new Date(),
    });
    await stockAlertService.evaluateThreshold({ productId: line.productId, triggeredByMovementId: movement._id });
  }

  line.status = "APPROVED";
  line.approvedBy = userId;
  line.approvedAt = new Date();
  line.reasonHistory.push({ reason: "Approved by stock manager", addedBy: userId, action: "APPROVED" });
  await line.save();

  const pendingCount = await InventoryCountLine.countDocuments({ inventoryCountId: session._id, status: { $ne: "APPROVED" } });
  if (pendingCount === 0) {
    session.status = "CLOSED";
    session.closedAt = new Date();
    await session.save();
    // Fire-and-forget: don't let integration event failure block the response
    stockEventService.createIntegrationEvent({
      eventType: "INVENTORY_CLOSED", aggregateType: "InventoryCount", aggregateId: session._id,
      sourceModule: "STOCK", sourceId: String(session._id),
      payload: { depotId: session.depotId, code: session.code },
    }).catch((e) => console.error("IntegrationEvent error:", e.message));
  }

  return InventoryCountLine.findById(line._id)
    .populate("productId")
    .populate("approvedBy", "name role")
    .populate("reasonHistory.addedBy", "name role");
};

exports.rejectInventoryLine = async ({ lineId, userId }) => {
  const line = await InventoryCountLine.findById(lineId).populate("inventoryCountId");
  if (!line) throw Object.assign(new Error("Line not found"), { statusCode: 404 });
  const session = line.inventoryCountId;
  if (session.status === "CLOSED") throw Object.assign(new Error("Session is already closed"), { statusCode: 400 });
  if (session.status === "IN_PROGRESS") throw Object.assign(new Error("Session must be sent to depot first"), { statusCode: 400 });
  if (line.status !== "REVIEWED") throw Object.assign(new Error("Line must be REVIEWED to be rejected"), { statusCode: 400 });
  line.status = "REJECTED";
  line.depotReason = "";
  line.reasonHistory.push({ reason: "Rejected by stock manager", addedBy: userId, action: "REJECTED" });
  await line.save();
  // Session stays PENDING_APPROVAL — depot manager can re-add a reason directly
  return InventoryCountLine.findById(line._id)
    .populate("productId")
    .populate("reasonHistory.addedBy", "name role");
};
