const SalesOrder = require("../models/sales-order.model");
const stockMovementService = require("../../stock/services/stock-movement.service");

const populateOrder = (query) =>
  query
    .populate("lines.productId")
    .populate("createdBy", "name email role");

exports.getAllOrders = async () => {
  return populateOrder(SalesOrder.find()).sort({ createdAt: -1 });
};

exports.getOrderById = async (id) => {
  return populateOrder(SalesOrder.findById(id));
};

exports.createOrder = async ({ orderNo, customerName, lines, notes = "", createdBy = null }) => {
  const exists = await SalesOrder.findOne({ orderNo: orderNo.trim().toUpperCase() });
  if (exists) {
    throw Object.assign(new Error("Order number already exists"), { statusCode: 400 });
  }

  const order = await SalesOrder.create({
    orderNo: orderNo.trim().toUpperCase(),
    customerName,
    lines,
    notes,
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

  for (const line of order.lines) {
    await stockMovementService.reserveStock({
      productId: line.productId,
      quantity: line.quantity,
      sourceModule: "COMMERCIAL",
      sourceType: "SALES_ORDER_CONFIRMED",
      sourceId: String(order._id),
      reference: order.orderNo,
      reason: "Stock reserved for sales order",
      notes: `Order confirmed for ${order.customerName}`,
      createdBy: userId,
    });
  }

  order.status = "CONFIRMED";
  await order.save();

  return exports.getOrderById(order._id);
};

exports.cancelOrder = async (id, userId = null) => {
  const order = await SalesOrder.findById(id);
  if (!order) {
    throw Object.assign(new Error("Sales order not found"), { statusCode: 404 });
  }

  if (order.status !== "CONFIRMED") {
    throw Object.assign(new Error("Only confirmed orders can be cancelled"), { statusCode: 400 });
  }

  for (const line of order.lines) {
    await stockMovementService.releaseReservation({
      productId: line.productId,
      quantity: line.quantity,
      sourceModule: "COMMERCIAL",
      sourceType: "SALES_ORDER_RELEASED",
      sourceId: String(order._id),
      reference: order.orderNo,
      reason: "Reservation released after order cancellation",
      notes: `Order cancelled for ${order.customerName}`,
      createdBy: userId,
    });
  }

  order.status = "CANCELLED";
  await order.save();

  return exports.getOrderById(order._id);
};

exports.shipOrder = async (id, userId = null) => {
  const order = await SalesOrder.findById(id);
  if (!order) {
    throw Object.assign(new Error("Sales order not found"), { statusCode: 404 });
  }

  if (order.status !== "CONFIRMED") {
    throw Object.assign(new Error("Only confirmed orders can be shipped"), { statusCode: 400 });
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
  await order.save();

  return exports.getOrderById(order._id);
};