const SalesOrder = require("../models/sales-order.model");
const Customer = require("../models/customer.model");
const StockProduct = require("../../stock/models/product.model");
const Vehicle = require("../models/vehicle.model");
const Carrier = require("../models/carrier.model");
const stockMovementService = require("../../stock/services/stock-movement.service");
const stockService = require("../../stock/services/stock.service");
const backOrderService = require("./backorder.service");
const notificationService = require("./notification.service");
const financeService = require("../../finance/services/finance.service");
const customerInvoiceService = require("./customer-invoice.service");

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

function promiseDateFromPlanning(plannedEndDate, transitDays = 0) {
  const end = new Date(plannedEndDate);
  if (Number.isNaN(end.getTime())) return null;

  const normalized = new Date(end);
  normalized.setHours(0, 0, 0, 0);
  normalized.setDate(normalized.getDate() + Math.max(0, Number(transitDays) || 0));
  return normalized;
}

async function suggestedTransitDays() {
  const fastestCarrier = await Carrier.findOne({ active: true }).sort({ transitDays: 1, name: 1 }).select("transitDays");
  if (!fastestCarrier) return 2;
  return Math.max(0, Number(fastestCarrier.transitDays || 0));
}

const populateOrder = (query) =>
  query
    .populate("lines.productId")
    .populate("createdBy", "name email role")
    .populate("ordonnancedBy", "name email role")
    .populate("pickingSlipPrintedBy", "name email role")
    .populate("packingValidatedBy", "name email role")
    .populate("carrierId")
    .populate("vehicleId", "matricule capacityPackets capacityKg")
    .populate("customerId", "name email phone company");

async function getPendingBackOrderForOrder(orderId) {
  const backOrder = await backOrderService.getBySalesOrder(orderId);
  if (backOrder?.status === "PENDING") return backOrder;
  return null;
}

async function getPlannedAllocationsByProduct(excludeOrderId = null) {
  const exclusion =
    Array.isArray(excludeOrderId) && excludeOrderId.length > 0
      ? { _id: { $nin: excludeOrderId } }
      : excludeOrderId
        ? { _id: { $ne: excludeOrderId } }
        : {};
  const orders = await SalesOrder.find({
    status: "ORDONNANCED",
    ...exclusion,
  }).select("lines.productId lines.allocatedQuantity");

  const planned = new Map();
  for (const order of orders) {
    for (const line of order.lines) {
      const productId = String(line.productId);
      const allocated = Number(line.allocatedQuantity || 0);
      planned.set(productId, (planned.get(productId) || 0) + allocated);
    }
  }
  return planned;
}

async function applyOrdonnancement(orders, payloads, userId) {
  const lineAllocationsByOrder = new Map(
    payloads.map((entry) => [
      String(entry.orderId || entry._id),
      new Map(
        (entry.lines || []).map((line) => [String(line.productId), Number(line.allocatedQuantity || 0)])
      ),
    ])
  );
  const orderIds = orders.map((order) => order._id);
  const plannedAllocations = await getPlannedAllocationsByProduct(orderIds);
  const stockCache = new Map();
  const requestedByProduct = new Map();

  for (const order of orders) {
    if (order.status !== "DRAFT") {
      throw Object.assign(new Error("Only draft orders can be ordonnanced"), { statusCode: 400 });
    }

    const payload = payloads.find((entry) => String(entry.orderId || entry._id) === String(order._id)) || {};
    if (!payload.plannedStartDate || !payload.plannedEndDate) {
      throw Object.assign(new Error("Planned start and end dates are required for ordonnancement"), {
        statusCode: 400,
      });
    }
    if (new Date(payload.plannedEndDate) < new Date(payload.plannedStartDate)) {
      throw Object.assign(new Error("Planned end date must be after planned start date"), {
        statusCode: 400,
      });
    }

    const lineAllocations = lineAllocationsByOrder.get(String(order._id)) || new Map();
    for (const line of order.lines) {
      const productId = String(line.productId);
      const allocatedQuantity = Math.max(0, Number(lineAllocations.get(productId) || 0));

      if (allocatedQuantity > line.quantity) {
        throw Object.assign(
          new Error(`Allocated quantity cannot exceed ordered quantity for product ${productId}`),
          { statusCode: 400 }
        );
      }

      requestedByProduct.set(productId, (requestedByProduct.get(productId) || 0) + allocatedQuantity);
    }
  }

  for (const [productId, totalAllocated] of requestedByProduct.entries()) {
    const stockItem = await stockService.getOrCreateStockItem(productId);
    stockCache.set(productId, stockItem);
    const availableForPlanning = Math.max(
      0,
      stockItem.quantityOnHand - stockItem.quantityReserved - (plannedAllocations.get(productId) || 0)
    );

    if (totalAllocated > availableForPlanning) {
      throw Object.assign(
        new Error(
          `Allocated quantity for product ${productId} exceeds available quantity for ordonnancement (${availableForPlanning})`
        ),
        { statusCode: 409 }
      );
    }
  }

  for (const order of orders) {
    const payload = payloads.find((entry) => String(entry.orderId || entry._id) === String(order._id)) || {};
    const lineAllocations = lineAllocationsByOrder.get(String(order._id)) || new Map();
    for (const line of order.lines) {
      const productId = String(line.productId);
      const allocatedQuantity = Math.max(0, Number(lineAllocations.get(productId) || 0));
      line.allocatedQuantity = allocatedQuantity;
      line.plannedProductionQuantity = Math.max(0, line.quantity - allocatedQuantity);
    }

    order.status = "ORDONNANCED";
    order.plannedStartDate = new Date(payload.plannedStartDate);
    order.plannedEndDate = new Date(payload.plannedEndDate);
    order.promisedDate =
      promiseDateFromPlanning(payload.plannedEndDate, await suggestedTransitDays()) ||
      order.promisedDate;
    order.ordonnancedAt = new Date();
    order.ordonnancedBy = userId;
    await order.save();
  }
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
  source = "MANUAL",
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
    source,
    lines: resolvedLines,
    notes,
    promisedDate: promisedDate ? new Date(promisedDate) : suggestedPromiseDate(resolvedLines),
    createdBy,
  });

  return exports.getOrderById(order._id);
};

exports.ordonanceOrder = async (id, lines = [], userId = null) => {
  const order = await SalesOrder.findById(id);
  if (!order) {
    throw Object.assign(new Error("Sales order not found"), { statusCode: 404 });
  }

  await applyOrdonnancement([order], [{ orderId: String(order._id), lines }], userId);

  return exports.getOrderById(order._id);
};

exports.ordonanceOrders = async (ordersPayload = [], userId = null) => {
  const orderIds = ordersPayload.map((entry) => String(entry.orderId || "")).filter(Boolean);
  if (orderIds.length === 0) {
    throw Object.assign(new Error("At least one order is required"), { statusCode: 400 });
  }

  const orders = await SalesOrder.find({ _id: { $in: orderIds } });
  if (orders.length !== orderIds.length) {
    throw Object.assign(new Error("One or more sales orders were not found"), { statusCode: 404 });
  }

  const ordersById = new Map(orders.map((order) => [String(order._id), order]));
  const orderedList = orderIds.map((id) => ordersById.get(id));

  await applyOrdonnancement(orderedList, ordersPayload, userId);

  return Promise.all(orderedList.map((order) => exports.getOrderById(order._id)));
};

exports.confirmOrder = async (id, userId = null) => {
  const order = await SalesOrder.findById(id);
  if (!order) {
    throw Object.assign(new Error("Sales order not found"), { statusCode: 404 });
  }

  if (order.status !== "ORDONNANCED") {
    throw Object.assign(new Error("Only ordonnanced orders can be confirmed"), { statusCode: 400 });
  }

  const backOrderLines = [];
  const reservedItems = []; // track for compensation rollback

  try {
    for (const line of order.lines) {
      const stockItem = await stockService.getOrCreateStockItem(line.productId);
      const available = stockItem.quantityOnHand - stockItem.quantityReserved;
      const plannedAllocation = Math.min(line.quantity, Number(line.allocatedQuantity || 0));
      const toReserve = Math.min(available, plannedAllocation);

      if (toReserve < plannedAllocation) {
        throw Object.assign(
          new Error("Planned stock allocation is no longer available. Please re-ordonnance the order."),
          { statusCode: 409 }
        );
      }

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
    await customerInvoiceService.createOrRefreshFromOrder(order._id, {}, userId);
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

exports.markPickingSlipPrinted = async (id, userId = null) => {
  const order = await SalesOrder.findById(id);
  if (!order) {
    throw Object.assign(new Error("Sales order not found"), { statusCode: 404 });
  }

  if (!["CONFIRMED", "PREPARED"].includes(order.status)) {
    throw Object.assign(
      new Error("Picking slip can only be printed for confirmed or prepared orders"),
      { statusCode: 400 }
    );
  }

  order.pickingSlipPrintedAt = new Date();
  order.pickingSlipPrintedBy = userId;
  await order.save();

  return exports.getOrderById(order._id);
};

exports.validatePacking = async (id, userId = null) => {
  const order = await SalesOrder.findById(id);
  if (!order) {
    throw Object.assign(new Error("Sales order not found"), { statusCode: 404 });
  }

  if (order.status !== "PREPARED") {
    throw Object.assign(new Error("Only prepared orders can be packing-validated"), {
      statusCode: 400,
    });
  }

  if (!order.pickingSlipPrintedAt) {
    throw Object.assign(new Error("Print the picking slip before validating packing"), {
      statusCode: 400,
    });
  }

  order.packingValidatedAt = new Date();
  order.packingValidatedBy = userId;
  await order.save();

  return exports.getOrderById(order._id);
};

exports.cancelOrder = async (id, userId = null) => {
  const order = await SalesOrder.findById(id);
  if (!order) {
    throw Object.assign(new Error("Sales order not found"), { statusCode: 404 });
  }

  if (!["ORDONNANCED", "CONFIRMED", "PREPARED"].includes(order.status)) {
    throw Object.assign(
      new Error("Only ordonnanced, confirmed or prepared orders can be cancelled"),
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

  if (!order.packingValidatedAt) {
    throw Object.assign(new Error("Only packed orders can be shipped"), { statusCode: 400 });
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
  if (carrierId && order.plannedEndDate) {
    const carrier = await Carrier.findById(carrierId).select("transitDays");
    if (carrier) {
      order.promisedDate =
        promiseDateFromPlanning(order.plannedEndDate, carrier.transitDays) || order.promisedDate;
    }
  }
  if (vehicleId) order.vehicleId = vehicleId;
  if (shipmentAddress) order.shipmentAddress = shipmentAddress.trim();
  order.shippingCost = shippingCost || 0;
  await order.save();
  await financeService.recordSalesOrderShipped(order);
  await notificationService.createForShipment(order, userId);

  return exports.getOrderById(order._id);
};

exports.deliverOrder = async (id, userId = null) => {
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
  await financeService.recordSalesOrderDelivered(order);
  await notificationService.createForDelivery(order, userId);

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
