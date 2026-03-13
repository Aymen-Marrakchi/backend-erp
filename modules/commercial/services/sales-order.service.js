const SalesOrder = require("../models/sales-order.model");
const Customer = require("../models/customer.model");
const StockProduct = require("../../stock/models/product.model");
const Vehicle = require("../models/vehicle.model");
const stockMovementService = require("../../stock/services/stock-movement.service");
const stockService = require("../../stock/services/stock.service");
const backOrderService = require("./backorder.service");

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function suggestedPromiseDate(lines = []) {
  const totalQuantity = lines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0),
    0
  );

  if (totalQuantity <= 10) return addDays(new Date(), 2);
  if (totalQuantity <= 50) return addDays(new Date(), 4);
  return addDays(new Date(), 7);
}

const populateOrder = (query) =>
  query
    .populate("lines.productId")
    .populate("createdBy", "name email role")
    .populate("carrierId")
    .populate("vehicleId", "matricule capacityPackets capacityKg")
    .populate("customerId", "name email phone company");

async function getPendingBackOrderForOrder(orderId) {
  const backOrder = await backOrderService.getBySalesOrder(orderId);
  if (backOrder?.status === "PENDING") return backOrder;
  return null;
}

exports.getAllOrders = async () => {
  return populateOrder(SalesOrder.find()).sort({ createdAt: -1 });
};

exports.getOrderById = async (id) => {
  return populateOrder(SalesOrder.findById(id));
};

exports.createOrder = async ({
  orderNo,
  customerId = null,
  customerName,
  lines,
  notes = "",
  promisedDate = null,
  createdBy = null,
}) => {
  // Enforce ORD- prefix
  const rawNo = String(orderNo).trim().toUpperCase().replace(/^ORD-/, "");
  const finalOrderNo = `ORD-${rawNo}`;

  const exists = await SalesOrder.findOne({ orderNo: finalOrderNo });
  if (exists) {
    throw Object.assign(new Error("Order number already exists"), { statusCode: 400 });
  }

  // Auto-fill customerName from Customer document if customerId provided
  let resolvedName = customerName || "";
  if (customerId) {
    const customer = await Customer.findById(customerId);
    if (!customer) throw Object.assign(new Error("Customer not found"), { statusCode: 404 });
    resolvedName = customer.name;
  }
  if (!resolvedName) throw Object.assign(new Error("Customer is required"), { statusCode: 400 });

  // Validate and auto-fill unit prices from product catalogue
  const resolvedLines = await Promise.all(
    lines.map(async (line) => {
      const product = await StockProduct.findById(line.productId).select("salePrice name");
      if (!product) throw Object.assign(new Error(`Product ${line.productId} not found`), { statusCode: 404 });
      const catalogPrice = product.salePrice || 0;
      const unitPrice = line.unitPrice != null ? Number(line.unitPrice) : catalogPrice;
      if (catalogPrice > 0 && unitPrice < catalogPrice * 0.5) {
        throw Object.assign(
          new Error(`Unit price for "${product.name}" (${unitPrice}) is below 50% of catalogue price (${catalogPrice}). Override not allowed.`),
          { statusCode: 400 }
        );
      }
      return { ...line, unitPrice: unitPrice || catalogPrice };
    })
  );

  const order = await SalesOrder.create({
    orderNo: finalOrderNo,
    customerId: customerId || null,
    customerName: resolvedName,
    lines: resolvedLines,
    notes,
    promisedDate: promisedDate ? new Date(promisedDate) : suggestedPromiseDate(resolvedLines),
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
  const reservedItems = []; // track for compensation rollback

  try {
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
        reservedItems.push({ productId: line.productId, quantity: toReserve });
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
  } catch (err) {
    // Compensation: release any stock already reserved in this transaction
    for (const item of reservedItems) {
      try {
        await stockMovementService.releaseReservation({
          productId: item.productId,
          quantity: item.quantity,
          sourceModule: "COMMERCIAL",
          sourceType: "SALES_ORDER_CONFIRM_ROLLBACK",
          sourceId: String(order._id),
          reference: order.orderNo,
          reason: "Order confirmation rolled back",
          createdBy: userId,
        });
      } catch (_) { /* don't mask the original error */ }
    }
    throw err;
  }

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

  const pendingBackOrder = await getPendingBackOrderForOrder(order._id);
  if (pendingBackOrder) {
    throw Object.assign(
      new Error("Cannot prepare an order while a pending backorder still exists"),
      { statusCode: 400 }
    );
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
    const stockItem = await stockService.getOrCreateStockItem(line.productId);

    // Calculate how much was actually reserved:
    // If a backorder exists, the backordered quantity was never reserved — only
    // (line.quantity - quantityBackordered) was reserved. Works for all backorder
    // states (PENDING, FULFILLED, CANCELLED) and when no backorder exists.
    const backorderLine = existingBO
      ? existingBO.lines.find(
          (bl) => String(bl.productId?._id || bl.productId) === String(line.productId)
        )
      : null;
    const quantityBackordered = backorderLine?.quantityBackordered ?? 0;
    const toRelease = Math.min(
      line.quantity - quantityBackordered,
      stockItem.quantityReserved // never release more than what's actually reserved
    );

    if (toRelease > 0) {
      await stockMovementService.releaseReservation({
        productId: line.productId,
        quantity: toRelease,
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

exports.shipOrder = async (id, userId = null, { trackingNumber = "", carrierId = null, vehicleId = null, shippingCost = 0, shipmentAddress = "" } = {}) => {
  const order = await SalesOrder.findById(id);
  if (!order) {
    throw Object.assign(new Error("Sales order not found"), { statusCode: 404 });
  }

  if (order.status !== "PREPARED") {
    throw Object.assign(new Error("Only prepared orders can be shipped"), { statusCode: 400 });
  }

  const pendingBackOrder = await getPendingBackOrderForOrder(order._id);
  if (pendingBackOrder) {
    throw Object.assign(
      new Error("Cannot ship an order while a pending backorder still exists"),
      { statusCode: 400 }
    );
  }

  // Urgent orders require prior approval
  if (order.isUrgent && order.shipApproval?.status !== "APPROVED") {
    throw Object.assign(
      new Error("Urgent orders require shipment approval before shipping"),
      { statusCode: 403 }
    );
  }

  // Vehicle capacity check
  if (vehicleId) {
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) throw Object.assign(new Error("Vehicle not found"), { statusCode: 404 });
    if (!vehicle.active) throw Object.assign(new Error("Vehicle is not active"), { statusCode: 400 });
    const totalQty = order.lines.reduce((sum, l) => sum + l.quantity, 0);
    if (vehicle.capacityPackets > 0 && totalQty > vehicle.capacityPackets) {
      throw Object.assign(
        new Error(`Order total (${totalQty} packets) exceeds vehicle capacity (${vehicle.capacityPackets} packets)`),
        { statusCode: 400 }
      );
    }
    // Use vehicle matricule as tracking number if none provided
    if (!trackingNumber) trackingNumber = vehicle.matricule;
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
  if (vehicleId) order.vehicleId = vehicleId;
  if (shipmentAddress) order.shipmentAddress = shipmentAddress.trim();
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

exports.closeOrder = async (id) => {
  const order = await SalesOrder.findById(id);
  if (!order) {
    throw Object.assign(new Error("Sales order not found"), { statusCode: 404 });
  }

  if (order.status !== "DELIVERED") {
    throw Object.assign(new Error("Only delivered orders can be closed"), { statusCode: 400 });
  }

  order.status = "CLOSED";
  order.closedAt = new Date();
  await order.save();

  return exports.getOrderById(order._id);
};
