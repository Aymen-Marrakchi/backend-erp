const mongoose = require("mongoose");
const StockItem = require("../models/stock-item.model");
const Product = require("../models/product.model");

// Validate MongoDB ObjectId
const isValidObjectId = (id) => {
  if (!id) return false;
  if (!mongoose.Types.ObjectId.isValid(id)) return false;
  return true;
};

exports.getOrCreateStockItem = async (productId) => {
  // Validate productId format
  if (!isValidObjectId(productId)) {
    throw Object.assign(new Error("Invalid product ID format"), { statusCode: 400 });
  }

  let stockItem = await StockItem.findOne({ productId });

  if (!stockItem) {
    const product = await Product.findById(productId);
    if (!product) {
      throw Object.assign(new Error("Product not found"), { statusCode: 404 });
    }

    stockItem = await StockItem.create({
      productId,
      quantityOnHand: 0,
      quantityReserved: 0,
      quantityAvailable: 0,
      status: "ACTIVE",
    });
  }

  return stockItem;
};

exports.getStockItemByProductId = async (productId) => {
  // Validate productId format
  if (!isValidObjectId(productId)) {
    throw Object.assign(new Error("Invalid product ID format"), { statusCode: 400 });
  }

  const stockItem = await StockItem.findOne({ productId }).populate("productId");
  if (!stockItem) {
    throw Object.assign(new Error("Stock item not found"), { statusCode: 404 });
  }
  return stockItem;
};

exports.getAllStockItems = async () => {
  const [items, products] = await Promise.all([
    StockItem.find().populate("productId").sort({ updatedAt: -1 }),
    Product.find({ status: "ACTIVE" }),
  ]);

  // Find products that have no stock item yet and create virtual entries
  const coveredIds = new Set(items.map((i) => String(i.productId?._id || i.productId)));
  const missing = products.filter((p) => !coveredIds.has(String(p._id)));

  if (missing.length > 0) {
    // Persist them so future calls are faster
    const created = await StockItem.insertMany(
      missing.map((p) => ({
        productId: p._id,
        quantityOnHand: 0,
        quantityReserved: 0,
        quantityAvailable: 0,
        status: "ACTIVE",
      }))
    );
    // Populate productId on new items
    const newItems = await StockItem.find({
      _id: { $in: created.map((c) => c._id) },
    }).populate("productId");
    return [...items, ...newItems];
  }

  return items;
};

exports.ensureEnoughAvailableStock = (stockItem, quantity) => {
  // Recalculate available stock to ensure accuracy
  const available = stockItem.quantityOnHand - stockItem.quantityReserved;
  if (available < quantity) {
    throw Object.assign(
      new Error(
        `Insufficient stock: available ${available}, requested ${quantity}`
      ),
      { statusCode: 409 }
    );
  }
};

exports.ensureEnoughReservedStock = (stockItem, quantity) => {
  if (stockItem.quantityReserved < quantity) {
    throw Object.assign(
      new Error(
        `Insufficient reserved stock: reserved ${stockItem.quantityReserved}, requested ${quantity}`
      ),
      { statusCode: 409 }
    );
  }
};

exports.touchLastMovement = async (stockItem) => {
  stockItem.lastMovementAt = new Date();
  await stockItem.save();
  return stockItem;
};
