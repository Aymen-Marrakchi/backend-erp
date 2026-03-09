const Product = require("../models/product.model");

exports.getAllProducts = async () => {
  return Product.find().sort({ createdAt: -1 });
};

exports.getProductById = async (id) => {
  const product = await Product.findById(id);
  if (!product) {
    throw Object.assign(new Error("Product not found"), { statusCode: 404 });
  }
  return product;
};

exports.createProduct = async ({
  sku,
  name,
  description = "",
  category = "",
  unit,
  isLotTracked = false,
  status = "ACTIVE",
  createdBy = null,
}) => {
  const exists = await Product.findOne({ sku: sku.trim().toUpperCase() });
  if (exists) {
    throw Object.assign(new Error("SKU already exists"), { statusCode: 400 });
  }

  return Product.create({
    sku: sku.trim().toUpperCase(),
    name,
    description,
    category,
    unit,
    isLotTracked,
    status,
    createdBy,
    updatedBy: createdBy,
  });
};

exports.updateProduct = async (
  id,
  { sku, name, description, category, unit, isLotTracked, status, updatedBy = null }
) => {
  const product = await Product.findById(id);
  if (!product) {
    throw Object.assign(new Error("Product not found"), { statusCode: 404 });
  }

  if (sku && sku.trim().toUpperCase() !== product.sku) {
    const exists = await Product.findOne({
      sku: sku.trim().toUpperCase(),
      _id: { $ne: id },
    });
    if (exists) {
      throw Object.assign(new Error("SKU already exists"), { statusCode: 400 });
    }
    product.sku = sku.trim().toUpperCase();
  }

  if (name !== undefined) product.name = name;
  if (description !== undefined) product.description = description;
  if (category !== undefined) product.category = category;
  if (unit !== undefined) product.unit = unit;
  if (isLotTracked !== undefined) product.isLotTracked = isLotTracked;
  if (status !== undefined) product.status = status;
  product.updatedBy = updatedBy;

  await product.save();
  return product;
};

exports.deleteProduct = async (id) => {
  const product = await Product.findById(id);
  if (!product) {
    throw Object.assign(new Error("Product not found"), { statusCode: 404 });
  }

  await product.deleteOne();
  return { message: "Product deleted successfully" };
};