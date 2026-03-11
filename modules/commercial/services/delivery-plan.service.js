const DeliveryPlan = require("../models/delivery-plan.model");
const SalesOrder = require("../models/sales-order.model");

const populatePlan = (query) =>
  query
    .populate("carrierId")
    .populate({
      path: "orderIds",
      populate: { path: "lines.productId", select: "name sku" },
    })
    .populate("createdBy", "name email");

exports.getAll = async () =>
  populatePlan(DeliveryPlan.find()).sort({ planDate: -1 });

exports.getById = async (id) => populatePlan(DeliveryPlan.findById(id));

/**
 * Shipped orders not currently assigned to an active (PLANNED/IN_PROGRESS) plan.
 */
exports.getUnassignedShippedOrders = async () => {
  const activePlans = await DeliveryPlan.find({
    status: { $in: ["PLANNED", "IN_PROGRESS"] },
  }).select("orderIds");

  const assignedIds = activePlans.flatMap((p) => p.orderIds.map(String));

  return SalesOrder.find({
    status: "SHIPPED",
    _id: { $nin: assignedIds },
  })
    .populate("lines.productId", "name sku")
    .populate("carrierId")
    .sort({ shippedAt: 1 });
};

exports.create = async ({
  planNo,
  planDate,
  carrierId = null,
  zone = "",
  driver = "",
  orderIds = [],
  notes = "",
  createdBy = null,
}) => {
  const exists = await DeliveryPlan.findOne({
    planNo: planNo.trim().toUpperCase(),
  });
  if (exists) {
    throw Object.assign(new Error("Plan number already exists"), {
      statusCode: 400,
    });
  }

  const plan = await DeliveryPlan.create({
    planNo,
    planDate,
    carrierId,
    zone,
    driver,
    orderIds,
    notes,
    createdBy,
  });

  return exports.getById(plan._id);
};

exports.startDelivery = async (id) => {
  const plan = await DeliveryPlan.findById(id);
  if (!plan) {
    throw Object.assign(new Error("Delivery plan not found"), {
      statusCode: 404,
    });
  }
  if (plan.status !== "PLANNED") {
    throw Object.assign(
      new Error("Only planned deliveries can be started"),
      { statusCode: 400 }
    );
  }

  plan.status = "IN_PROGRESS";
  plan.startedAt = new Date();
  await plan.save();

  return exports.getById(plan._id);
};

exports.complete = async (id) => {
  const plan = await DeliveryPlan.findById(id);
  if (!plan) {
    throw Object.assign(new Error("Delivery plan not found"), {
      statusCode: 404,
    });
  }
  if (plan.status !== "IN_PROGRESS") {
    throw Object.assign(
      new Error("Only in-progress deliveries can be completed"),
      { statusCode: 400 }
    );
  }

  // Auto-deliver all orders in the plan
  const now = new Date();
  await SalesOrder.updateMany(
    { _id: { $in: plan.orderIds }, status: "SHIPPED" },
    { $set: { status: "DELIVERED", deliveredAt: now } }
  );

  plan.status = "COMPLETED";
  plan.completedAt = now;
  await plan.save();

  return exports.getById(plan._id);
};

exports.cancel = async (id) => {
  const plan = await DeliveryPlan.findById(id);
  if (!plan) {
    throw Object.assign(new Error("Delivery plan not found"), {
      statusCode: 404,
    });
  }
  if (plan.status === "COMPLETED") {
    throw Object.assign(new Error("Completed plans cannot be cancelled"), {
      statusCode: 400,
    });
  }

  plan.status = "CANCELLED";
  plan.cancelledAt = new Date();
  await plan.save();

  return exports.getById(plan._id);
};
