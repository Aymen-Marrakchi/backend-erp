const CyclicOrder = require("../models/cyclic-order.model");
const productionOrderService = require("./production-order.service");

const populate = (q) =>
  q
    .populate("customerId", "name email")
    .populate("productId", "name sku unit")
    .populate("createdBy", "name");

exports.getAll = () => populate(CyclicOrder.find().sort({ nextDueDate: 1 }));

exports.getDue = () => {
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 14); // next 14 days
  return populate(
    CyclicOrder.find({
      active: true,
      nextDueDate: { $lte: horizon },
    }).sort({ nextDueDate: 1 })
  );
};

exports.getById = (id) => populate(CyclicOrder.findById(id));

exports.create = async ({
  customerId,
  customerName,
  productId,
  quantity,
  frequencyDays,
  nextDueDate,
  notes,
  createdBy,
}) => {
  const order = await CyclicOrder.create({
    customerId,
    customerName,
    productId,
    quantity,
    frequencyDays,
    nextDueDate: new Date(nextDueDate),
    notes: notes || "",
    createdBy: createdBy || null,
  });
  return exports.getById(order._id);
};

exports.update = async (id, { quantity, frequencyDays, nextDueDate, notes }) => {
  const order = await CyclicOrder.findById(id);
  if (!order) throw Object.assign(new Error("Cyclic order not found"), { statusCode: 404 });
  if (quantity !== undefined) order.quantity = quantity;
  if (frequencyDays !== undefined) order.frequencyDays = frequencyDays;
  if (nextDueDate !== undefined) order.nextDueDate = new Date(nextDueDate);
  if (notes !== undefined) order.notes = notes;
  await order.save();
  return exports.getById(order._id);
};

exports.toggleActive = async (id) => {
  const order = await CyclicOrder.findById(id);
  if (!order) throw Object.assign(new Error("Cyclic order not found"), { statusCode: 404 });
  order.active = !order.active;
  await order.save();
  return exports.getById(order._id);
};

/**
 * Fire a cyclic order → creates a production order and advances nextDueDate.
 */
exports.fire = async (id, createdBy) => {
  const cyclic = await CyclicOrder.findById(id).populate("productId", "name sku unit");
  if (!cyclic) throw Object.assign(new Error("Cyclic order not found"), { statusCode: 404 });
  if (!cyclic.active) throw Object.assign(new Error("Cyclic order is inactive"), { statusCode: 400 });

  const productionOrder = await productionOrderService.create({
    productId: String(cyclic.productId._id),
    quantity: cyclic.quantity,
    priority: "NORMAL",
    notes: `Ordre cyclique — ${cyclic.customerName} — tous les ${cyclic.frequencyDays} jours`,
    createdBy,
  });

  // Advance nextDueDate by frequencyDays
  const nextDue = new Date(cyclic.nextDueDate);
  nextDue.setDate(nextDue.getDate() + cyclic.frequencyDays);
  cyclic.lastFiredAt = new Date();
  cyclic.nextDueDate = nextDue;
  await cyclic.save();

  return { cyclicOrder: await exports.getById(id), productionOrder };
};
