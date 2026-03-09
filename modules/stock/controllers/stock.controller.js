const stockService = require("../services/stock.service");
const stockMovementService = require("../services/stock-movement.service");
const { success, error } = require("../../../utils/response");

exports.getAllStockItems = async (req, reply) => {
  try {
    const data = await stockService.getAllStockItems();
    return success(reply, data);
  } catch (err) {
    console.error("Error in getAllStockItems:", err);
    return error(reply, err.message, err.statusCode || 500);
  }
};

exports.getStockItemByProductId = async (req, reply) => {
  try {
    const data = await stockService.getStockItemByProductId(req.params.productId);
    return success(reply, data);
  } catch (err) {
    console.error("Error in getStockItemByProductId:", err);
    return error(reply, err.message, err.statusCode || 500);
  }
};

exports.getMovementHistory = async (req, reply) => {
  try {
    const data = await stockMovementService.getMovementHistory(req.params.productId);
    return success(reply, data);
  } catch (err) {
    console.error("Error in getMovementHistory:", err);
    return error(reply, err.message, err.statusCode || 500);
  }
};

exports.getAllMovements = async (req, reply) => {
  try {
    const data = await stockMovementService.getMovementHistory();
    return success(reply, data);
  } catch (err) {
    console.error("Error in getAllMovements:", err);
    return error(reply, err.message, err.statusCode || 500);
  }
};

exports.createEntry = async (req, reply) => {
  try {
    console.log("Creating entry with body:", req.body);
    const movement = await stockMovementService.createEntry({
      ...req.body,
      createdBy: req.user?._id || null,
    });
    return success(reply, movement, 201);
  } catch (err) {
    console.error("Error in createEntry controller:", err);
    return error(reply, err.message, err.statusCode || 500);
  }
};

exports.createExit = async (req, reply) => {
  try {
    console.log("Creating exit with body:", req.body);
    const movement = await stockMovementService.createExit({
      ...req.body,
      createdBy: req.user?._id || null,
    });
    return success(reply, movement, 201);
  } catch (err) {
    console.error("Error in createExit controller:", err);
    return error(reply, err.message, err.statusCode || 500);
  }
};

exports.reserveStock = async (req, reply) => {
  try {
    const movement = await stockMovementService.reserveStock({
      ...req.body,
      createdBy: req.user?._id || null,
    });
    return success(reply, movement, 201);
  } catch (err) {
    console.error("Error in reserveStock controller:", err);
    return error(reply, err.message, err.statusCode || 500);
  }
};

exports.releaseReservation = async (req, reply) => {
  try {
    const movement = await stockMovementService.releaseReservation({
      ...req.body,
      createdBy: req.user?._id || null,
    });
    return success(reply, movement, 201);
  } catch (err) {
    console.error("Error in releaseReservation controller:", err);
    return error(reply, err.message, err.statusCode || 500);
  }
};

exports.deductReservedStock = async (req, reply) => {
  try {
    const movement = await stockMovementService.deductReservedStock({
      ...req.body,
      createdBy: req.user?._id || null,
    });
    return success(reply, movement, 201);
  } catch (err) {
    console.error("Error in deductReservedStock controller:", err);
    return error(reply, err.message, err.statusCode || 500);
  }
};
