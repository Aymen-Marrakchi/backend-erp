const Customer = require("../models/customer.model");

exports.getAll = () => Customer.find().sort({ name: 1 });

exports.getActive = () => Customer.find({ active: true }).sort({ name: 1 });

exports.getById = (id) => Customer.findById(id);

exports.create = async ({
  name,
  email,
  phone,
  company,
  address,
  city,
  continent,
  country,
  state,
  notes,
}) => {
  const normalizedCountry = String(country || "").trim();
  const normalizedState = String(state || "").trim();
  const normalizedContinent =
    String(continent || "").trim() ||
    (normalizedCountry ? "Africa" : "");

  return Customer.create({
    name,
    email,
    phone,
    company,
    address,
    city,
    continent: normalizedContinent,
    country: normalizedCountry,
    state: normalizedState,
    notes,
  });
};

exports.update = (id, data) =>
  Customer.findByIdAndUpdate(id, data, { new: true, runValidators: true });

exports.toggleActive = async (id) => {
  const customer = await Customer.findById(id);
  if (!customer) throw Object.assign(new Error("Customer not found"), { statusCode: 404 });
  customer.active = !customer.active;
  return customer.save();
};
