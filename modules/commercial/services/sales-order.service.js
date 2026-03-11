const SalesOrder = require("../models/sales-order.model");
const stockMovementService = require("../../stock/services/stock-movement.service");
const stockService = require("../../stock/services/stock.service");
const backOrderService = require("./backorder.service");

const populateOrder = (query) =>
  query
    .populate("lines.productId")
    .populate("createdBy", "name email role")
    .populate("carrierId");

exports.getAllOrders = async () => {
  return populateOrder(SalesOrder.find()).sort({ createdAt: -1 });
};

exports.getOrderById = async (id) => {
  return populateOrder(SalesOrder.findById(id));
};

exports.createOrder = async ({
  orderNo,
  customerName,
  lines,
  notes = "",
  promisedDate = null,
  createdBy = null,
}) => {
  const exists = await SalesOrder.findOne({ orderNo: orderNo.trim().toUpperCase() });
  if (exists) {
    throw Object.assign(new Error("Order number already exists"), { statusCode: 400 });
  }

  const order = await SalesOrder.create({
    orderNo: orderNo.trim().toUpperCase(),
    customerName,
    lines,
    notes,
    promisedDate,
    createdBy,
  });

  return exports.getOrderById(order._id);
};

exports.confirmOrder = async (id, userId = null) => {
  const order = await SalesOrder.findById(id);
  if (!order) {
    throw Object.assign(new Error("Sales order not found"), { statusCode: 404 });
  }

  if (order.status !== "DRAFT") {
    throw Object.assign(new Error("Only draft orders can be confirmed"), { statusCode: 400 });
  }

  const backOrderLines = [];

  for (const line of order.lines) {
    const stockItem = await stockService.getOrCreateStockItem(line.productId);
    const available = stockItem.quantityOnHand - stockItem.quantityReserved;
    const toReserve = Math.min(available, line.quantity);

    if (toReserve > 0) {
      await stockMovementService.reserveStock({
        productId: line.productId,
        quantity: toReserve,
        sourceModule: "COMMERCIAL",
        sourceType: "SALES_ORDER_CONFIRMED",
        sourceId: String(order._id),
        reference: order.orderNo,
        reason: "Stock reserved for sales order",
        notes: `Order confirmed for ${order.customerName}`,
        createdBy: userId,
      });
    }

    const backordered = line.quantity - toReserve;
    if (backordered > 0) {
      backOrderLines.push({
        productId: line.productId,
        quantityOrdered: line.quantity,
        quantityReserved: toReserve,
        quantityBackordered: backordered,
      });
    }
  }

  if (backOrderLines.length > 0) {
    await backOrderService.createBackOrder({
      salesOrderId: order._id,
      orderNo: order.orderNo,
      customerName: order.customerName,
      lines: backOrderLines,
      createdBy: userId,
    });
  }

  order.status = "CONFIRMED";
  await order.save();

  return exports.getOrderById(order._id);
};

exports.prepareOrder = async (id) => {
  const order = await SalesOrder.findById(id);
  if (!order) {
    throw Object.assign(new Error("Sales order not found"), { statusCode: 404 });
  }

  if (order.status !== "CONFIRMED") {
    throw Object.assign(new Error("Only confirmed orders can be prepared"), { statusCode: 400 });
  }

  order.status = "PREPARED";
  order.preparedAt = new Date();
  await order.save();

  return exports.getOrderById(order._id);
};

exports.cancelOrder = async (id, userId = null) => {
  const order = await SalesOrder.findById(id);
  if (!order) {
    throw Object.assign(new Error("Sales order not found"), { statusCode: 404 });
  }

  if (!["CONFIRMED", "PREPARED"].includes(order.status)) {
    throw Object.assign(
      new Error("Only confirmed or prepared orders can be cancelled"),
      { statusCode: 400 }
    );
  }

  // Cancel any associated pending backorder
  const existingBO = await backOrderService.getBySalesOrder(order._id);
  if (existingBO && existingBO.status === "PENDING") {
    await backOrderService.cancelBackOrder(String(existingBO._id));
  }

  for (const line of order.lines) {
    // Only release what was actually reserved (may be less than ordered if backorder exists)
    const stockItem = await stockService.getOrCreateStockItem(line.productId);
    const reservedForThisOrder = existingBO
      ? (existingBO.lines.find(
          (bl) => String(bl.productId?._id || bl.productId) === String(line.productId)
        )?.quantityReserved ?? line.quantity)
      : line.quantity;

    if (reservedForThisOrder > 0 && stockItem.quantityReserved >= reservedForThisOrder) {
      await stockMovementService.releaseReservation({
        productId: line.productId,
        quantity: reservedForThisOrder,
        sourceModule: "COMMERCIAL",
        sourceType: "SALES_ORDER_RELEASED",
        sourceId: String(order._id),
        reference: order.orderNo,
        reason: "Reservation released after order cancellation",
        notes: `Order cancelled for ${order.customerName}`,
        createdBy: userId,
      });
    }
  }

  order.status = "CANCELLED";
  await order.save();

  return exports.getOrderById(order._id);
};

exports.markUrgent = async (id, urgent = true) => {
  const order = await SalesOrder.findById(id);
  if (!order) {
    throw Object.assign(new Error("Sales order not found"), { statusCode: 404 });
  }

  if (["SHIPPED", "DELIVERED", "CANCELLED"].includes(order.status)) {
    throw Object.assign(new Error("Cannot change urgency of a shipped, delivered or cancelled order"), { statusCode: 400 });
  }

  order.isUrgent = urgent;
  if (!urgent) {
    order.shipApproval = {
      status: "NONE",
      requestedAt: null,
      requestedBy: null,
      approvedAt: null,
      approvedBy: null,
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: "",
    };
  }
  await order.save();
  return exports.getOrderById(order._id);
};

exports.requestShipApproval = async (id, userId = null) => {
  const order = await SalesOrder.findById(id);
  if (!order) {
    throw Object.assign(new Error("Sales order not found"), { statusCode: 404 });
  }

  if (order.status !== "PREPARED") {
    throw Object.assign(new Error("Only prepared orders can request ship approval"), { statusCode: 400 });
  }

  if (!order.isUrgent) {
    throw Object.assign(new Error("Order is not flagged as urgent"), { statusCode: 400 });
  }

  if (order.shipApproval?.status === "PENDING") {
    throw Object.assign(new Error("Approval already pending"), { statusCode: 400 });
  }

  order.shipApproval = {
    status: "PENDING",
    requestedAt: new Date(),
    requestedBy: userId,
    approvedAt: null,
    approvedBy: null,
    rejectedAt: null,
    rejectedBy: null,
    rejectionReason: "",
  };
  await order.save();
  return exports.getOrderById(order._id);
};

exports.approveShip = async (id, userId = null) => {
  const order = await SalesOrder.findById(id);
  if (!order) {
    throw Object.assign(new Error("Sales order not found"), { statusCode: 404 });
  }

  if (order.shipApproval?.status !== "PENDING") {
    throw Object.assign(new Error("No pending approval request for this order"), { statusCode: 400 });
  }

  order.shipApproval.status = "APPROVED";
  order.shipApproval.approvedAt = new Date();
  order.shipApproval.approvedBy = userId;
  await order.save();
  return exports.getOrderById(order._id);
};

exports.rejectShip = async (id, userId = null, reason = "") => {
  const order = await SalesOrder.findById(id);
  if (!order) {
    throw Object.assign(new Error("Sales order not found"), { statusCode: 404 });
  }

  if (order.shipApproval?.status !== "PENDING") {
    throw Object.assign(new Error("No pending approval request for this order"), { statusCode: 400 });
  }

  if (!reason || !reason.trim()) {
    throw Object.assign(new Error("A rejection reason is required"), { statusCode: 400 });
  }

  order.shipApproval.status = "REJECTED";
  order.shipApproval.rejectedAt = new Date();
  order.shipApproval.rejectedBy = userId;
  order.shipApproval.rejectionReason = reason.trim();
  await order.save();
  return exports.getOrderById(order._id);
};

exports.shipOrder = async (id, userId = null, trackingNumber = "", carrierId = null, shippingCost = 0) => {
  const order = await SalesOrder.findById(id);
  if (!order) {
    throw Object.assign(new Error("Sales order not found"), { statusCode: 404 });
  }

  if (order.status !== "PREPARED") {
    throw Object.assign(new Error("Only prepared orders can be shipped"), { statusCode: 400 });
  }

  // Urgent orders require prior approval
  if (order.isUrgent && order.shipApproval?.status !== "APPROVED") {
    throw Object.assign(
      new Error("Urgent orders require shipment approval before shipping"),
      { statusCode: 403 }
    );
  }

  for (const line of order.lines) {
    await stockMovementService.deductReservedStock({
      productId: line.productId,
      quantity: line.quantity,
      sourceModule: "COMMERCIAL",
      sourceType: "SALES_ORDER_SHIPPED",
      sourceId: String(order._id),
      reference: order.orderNo,
      reason: "Reserved stock deducted after shipping",
      notes: `Order shipped for ${order.customerName}`,
      createdBy: userId,
    });
  }

  order.status = "SHIPPED";
  order.shippedAt = new Date();
  if (trackingNumber) order.trackingNumber = trackingNumber.trim();
  if (carrierId) order.carrierId = carrierId;
  order.shippingCost = shippingCost || 0;
  await order.save();

  return exports.getOrderById(order._id);
};

exports.deliverOrder = async (id) => {
  const order = await SalesOrder.findById(id);
  if (!order) {
    throw Object.assign(new Error("Sales order not found"), { statusCode: 404 });
  }

  if (order.status !== "SHIPPED") {
    throw Object.assign(new Error("Only shipped orders can be marked as delivered"), {
      statusCode: 400,
    });
  }

  order.status = "DELIVERED";
  order.deliveredAt = new Date();
  await order.save();

  return exports.getOrderById(order._id);
};