const DeliveryPlan = require("../models/delivery-plan.model");
const SalesOrder = require("../models/sales-order.model");

async function generatePlanNo(planDate) {
  const date = new Date(planDate);
  if (Number.isNaN(date.getTime())) {
    throw Object.assign(new Error("Invalid plan date"), { statusCode: 400 });
  }

  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = String(date.getUTCFullYear());
  const planSuffix = `${month}/${year}`;
  const regex = new RegExp(`^PLAN-(\\d+)-${month}\\/${year}$`, "i");

  const plans = await DeliveryPlan.find({
    planNo: { $regex: regex },
  }).select("planNo");

  const maxSequence = plans.reduce((max, plan) => {
    const match = String(plan.planNo || "").match(regex);
    const sequence = match ? Number(match[1]) : 0;
    return Math.max(max, sequence);
  }, 0);

  return `PLAN-${maxSequence + 1}-${planSuffix}`;
}

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

exports.getDiscoveredZones = async () => {
  const zones = await DeliveryPlan.find({
    planType: "DISCOVER",
    status: { $ne: "CANCELLED" },
    zone: { $ne: "" },
  }).distinct("zone");

  return zones
    .map((zone) => String(zone || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
};

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
  planDate,
  carrierId = null,
  zone = "",
  startDate = null,
  orderIds = [],
  notes = "",
  planType = "SHIPMENT",
  createdBy = null,
}) => {
  const normalizedPlanType = String(planType || "SHIPMENT").toUpperCase();
  const normalizedZone = String(zone || "").trim();

  if (!["SHIPMENT", "DISCOVER"].includes(normalizedPlanType)) {
    throw Object.assign(new Error("Invalid delivery plan type"), {
      statusCode: 400,
    });
  }

  if (normalizedPlanType === "DISCOVER" && !normalizedZone) {
    throw Object.assign(new Error("Zone is required for discover plans"), {
      statusCode: 400,
    });
  }

  const planNo = await generatePlanNo(planDate);

  const plan = await DeliveryPlan.create({
    planNo,
    planDate,
    carrierId: normalizedPlanType === "SHIPMENT" ? carrierId : null,
    zone: normalizedZone,
    startDate,
    orderIds: normalizedPlanType === "SHIPMENT" ? orderIds : [],
    notes,
    planType: normalizedPlanType,
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

  const relatedOrders = await SalesOrder.find({ _id: { $in: plan.orderIds } }).select(
    "orderNo status"
  );
  const pendingOrders = relatedOrders.filter(
    (order) => !["DELIVERED", "CLOSED", "CANCELLED"].includes(order.status)
  );
  if (pendingOrders.length > 0) {
    throw Object.assign(
      new Error(
        `All plan orders must be delivered before completion: ${pendingOrders
          .map((order) => order.orderNo)
          .join(", ")}`
      ),
      { statusCode: 400 }
    );
  }

  const now = new Date();

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
