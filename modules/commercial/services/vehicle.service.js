const Vehicle = require("../models/vehicle.model");
const DeliveryPlan = require("../models/delivery-plan.model");
const SalesOrder = require("../models/sales-order.model");

exports.getAll = () => Vehicle.find().sort({ createdAt: -1 });
exports.getActive = () => Vehicle.find({ active: true }).sort({ matricule: 1 });
exports.getById = (id) => Vehicle.findById(id);

exports.create = async ({ matricule, capacityKg, capacityPackets, purchaseDate, lifeExpectancyDays, notes }) => {
  const exists = await Vehicle.findOne({ matricule: matricule.trim().toUpperCase() });
  if (exists) throw Object.assign(new Error("Matricule already exists"), { statusCode: 409 });
  return Vehicle.create({ matricule, capacityKg, capacityPackets, purchaseDate, lifeExpectancyDays, notes });
};

exports.update = (id, data) =>
  Vehicle.findByIdAndUpdate(id, data, { new: true, runValidators: true });

exports.toggleActive = async (id) => {
  const v = await Vehicle.findById(id);
  if (!v) throw Object.assign(new Error("Vehicle not found"), { statusCode: 404 });
  v.active = !v.active;
  return v.save();
};

exports.getDeliveries = async (id) => {
  const orders = await SalesOrder.find({ vehicleId: id })
    .populate("carrierId", "name code")
    .populate({
      path: "lines.productId",
      select: "name sku",
    })
    .sort({ shippedAt: -1 });

  const orderIds = orders.map((order) => order._id);
  const plans = await DeliveryPlan.find({ orderIds: { $in: orderIds } }).select(
    "planNo planDate status zone completedAt orderIds"
  );

  return orders.map((order) => {
    const linkedPlan = plans.find((plan) =>
      plan.orderIds.some((planOrderId) => String(planOrderId) === String(order._id))
    );

    return {
      _id: String(order._id),
      planNo: linkedPlan?.planNo || order.orderNo,
      planDate: linkedPlan?.planDate || order.shippedAt || order.createdAt,
      status: linkedPlan?.status || order.status,
      zone: linkedPlan?.zone || "",
      orderIds: [order],
      carrierId: order.carrierId || null,
      completedAt: linkedPlan?.completedAt || order.deliveredAt || null,
    };
  });
};
