const Vehicle = require("../models/vehicle.model");
const DeliveryPlan = require("../models/delivery-plan.model");

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

exports.getDeliveries = (id) =>
  DeliveryPlan.find({ vehicleId: id })
    .populate("carrierId", "name code")
    .populate({
      path: "orderIds",
      select: "orderNo customerName status shippingCost lines",
      populate: { path: "lines.productId", select: "name sku" },
    })
    .sort({ planDate: -1 });
