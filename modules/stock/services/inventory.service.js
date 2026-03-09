const InventoryCount = require("../models/inventory-count.model");
const InventoryCountLine = require("../models/inventory-count-line.model");
const StockAdjustment = require("../models/stock-adjustment.model");
const StockItem = require("../models/stock-item.model");
const StockMovement = require("../models/stock-movement.model");
const Product = require("../models/product.model");
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

exports.getAllInventories = async () => {
  return InventoryCount.find()
    .populate("startedBy", "name email role")
    .populate("approvedBy", "name email role")
    .sort({ createdAt: -1 });
};

exports.getInventoryById = async (id) => {
  const inventory = await InventoryCount.findById(id)
    .populate("startedBy", "name email role")
    .populate("approvedBy", "name email role");

  if (!inventory) {
    throw Object.assign(new Error("Inventory session not found"), { statusCode: 404 });
  }

  return inventory;
};

exports.createInventory = async ({ type, notes = "", startedBy = null }) => {
  return InventoryCount.create({
    code: generateInventoryCode(),
    type,
    status: "IN_PROGRESS",
    startedBy,
    startedAt: new Date(),
    notes,
  });
};

exports.getInventoryLines = async (inventoryCountId) => {
  return InventoryCountLine.find({ inventoryCountId })
    .populate("productId")
    .populate("countedBy", "name email role")
    .sort({ createdAt: -1 });
};

exports.addInventoryLine = async ({
  inventoryCountId,
  productId,
  countedQuantity,
  lotRef = "",
  notes = "",
  countedBy = null,
}) => {
  const qty = Number(countedQuantity);
  if (Number.isNaN(qty) || qty < 0) {
    throw Object.assign(new Error("countedQuantity must be a non-negative number"), { statusCode: 400 });
  }

  const inventory = await InventoryCount.findById(inventoryCountId);
  if (!inventory) {
    throw Object.assign(new Error("Inventory session not found"), { statusCode: 404 });
  }

  if (!["IN_PROGRESS", "DRAFT"].includes(inventory.status)) {
    throw Object.assign(new Error("Inventory session is not editable"), { statusCode: 400 });
  }

  const product = await Product.findById(productId);
  if (!product) {
    throw Object.assign(new Error("Product not found"), { statusCode: 404 });
  }

  const stockItem = await StockItem.findOne({ productId });
  const systemQuantity = stockItem ? stockItem.quantityOnHand : 0;

  const existing = await InventoryCountLine.findOne({ inventoryCountId, productId });
  if (existing) {
    throw Object.assign(new Error("This product already has a count line in the session"), { statusCode: 400 });
  }

  const varianceQuantity = qty - Number(systemQuantity);
  const status = varianceQuantity === 0 ? "VALIDATED" : "VARIANCE_FOUND";

  return InventoryCountLine.create({
    inventoryCountId,
    productId,
    systemQuantity,
    countedQuantity: qty,
    varianceQuantity,
    status,
    lotRef,
    notes,
    countedBy,
    countedAt: new Date(),
  });
};

exports.submitInventoryForApproval = async (inventoryCountId) => {
  const inventory = await InventoryCount.findById(inventoryCountId);
  if (!inventory) {
    throw Object.assign(new Error("Inventory session not found"), { statusCode: 404 });
  }

  const lineCount = await InventoryCountLine.countDocuments({ inventoryCountId });
  if (lineCount === 0) {
    throw Object.assign(new Error("Cannot submit empty inventory session"), { statusCode: 400 });
  }

  inventory.status = "PENDING_APPROVAL";
  await inventory.save();

  return inventory;
};

exports.createAdjustmentFromLine = async ({
  inventoryCountLineId,
  reason,
  requestedBy = null,
}) => {
  const line = await InventoryCountLine.findById(inventoryCountLineId);
  if (!line) {
    throw Object.assign(new Error("Inventory count line not found"), { statusCode: 404 });
  }

  if (line.varianceQuantity === 0) {
    throw Object.assign(new Error("No variance found on this line"), { statusCode: 400 });
  }

  const existing = await StockAdjustment.findOne({ inventoryCountLineId });
  if (existing) {
    throw Object.assign(new Error("Adjustment already exists for this line"), { statusCode: 400 });
  }

  return StockAdjustment.create({
    inventoryCountId: line.inventoryCountId,
    inventoryCountLineId: line._id,
    productId: line.productId,
    systemQuantity: line.systemQuantity,
    countedQuantity: line.countedQuantity,
    deltaQuantity: line.varianceQuantity,
    reason,
    requestedBy,
    status: "PENDING_APPROVAL",
  });
};

exports.getAllAdjustments = async () => {
  return StockAdjustment.find()
    .populate("productId")
    .populate("requestedBy", "name email role")
    .populate("approvedBy", "name email role")
    .populate("appliedBy", "name email role")
    .sort({ createdAt: -1 });
};

exports.updateAdjustmentStatus = async ({ id, status, userId = null }) => {
  const adjustment = await StockAdjustment.findById(id);
  if (!adjustment) {
    throw Object.assign(new Error("Stock adjustment not found"), { statusCode: 404 });
  }

  if (status === "APPROVED") {
    adjustment.status = "APPROVED";
    adjustment.approvedBy = userId;
    adjustment.approvedAt = new Date();
    await adjustment.save();
    return adjustment;
  }

  if (status === "REJECTED") {
    adjustment.status = "REJECTED";
    adjustment.approvedBy = userId;
    adjustment.approvedAt = new Date();
    await adjustment.save();
    return adjustment;
  }

  if (status === "APPLIED") {
    if (adjustment.status !== "APPROVED") {
      throw Object.assign(new Error("Only approved adjustments can be applied"), { statusCode: 400 });
    }

    let stockItem = await StockItem.findOne({ productId: adjustment.productId });
    if (!stockItem) {
      stockItem = await StockItem.create({
        productId: adjustment.productId,
        quantityOnHand: 0,
        quantityReserved: 0,
        quantityAvailable: 0,
        status: "ACTIVE",
      });
    }

    const previousOnHand = stockItem.quantityOnHand;
    const previousReserved = stockItem.quantityReserved;

    stockItem.quantityOnHand = adjustment.countedQuantity;
    stockItem.lastMovementAt = new Date();
    await stockItem.save();

    const movement = await StockMovement.create({
      productId: adjustment.productId,
      type: "ADJUSTMENT",
      quantity: Math.abs(adjustment.deltaQuantity),
      previousOnHand,
      newOnHand: stockItem.quantityOnHand,
      previousReserved,
      newReserved: stockItem.quantityReserved,
      sourceModule: "STOCK",
      sourceType: "INVENTORY_ADJUSTMENT",
      sourceId: String(adjustment._id),
      reference: "",
      reason: adjustment.reason,
      notes: "",
      status: "POSTED",
      createdBy: adjustment.requestedBy || userId,
      approvedBy: adjustment.approvedBy || userId,
      approvedAt: adjustment.approvedAt || new Date(),
    });

    adjustment.status = "APPLIED";
    adjustment.appliedBy = userId;
    adjustment.appliedAt = new Date();
    await adjustment.save();

    await stockAlertService.evaluateThreshold({
      productId: adjustment.productId,
      triggeredByMovementId: movement._id,
    });

    await stockEventService.createIntegrationEvent({
      eventType: "STOCK_ADJUSTED",
      aggregateType: "StockAdjustment",
      aggregateId: adjustment._id,
      sourceModule: "STOCK",
      sourceId: String(adjustment._id),
      payload: {
        productId: adjustment.productId,
        deltaQuantity: adjustment.deltaQuantity,
        countedQuantity: adjustment.countedQuantity,
      },
    });

    return adjustment;
  }

  throw Object.assign(new Error("Invalid adjustment status"), { statusCode: 400 });
};