const inventoryService = require("../services/inventory.service");
const { success, error } = require("../../../utils/response");

exports.getAllInventories = async (req, reply) => {
  try { return success(reply, await inventoryService.getAllInventories({ userId: req.user?._id, role: req.user?.role })); }
  catch (err) { return error(reply, err.message, err.statusCode || 500); }
};

exports.getInventoryById = async (req, reply) => {
  try { return success(reply, await inventoryService.getInventoryById(req.params.id)); }
  catch (err) { return error(reply, err.message, err.statusCode || 500); }
};

exports.createInventory = async (req, reply) => {
  try {
    return success(reply, await inventoryService.createInventory({
      type: req.body.type, notes: req.body.notes,
      depotId: req.body.depotId || null, startedBy: req.user?._id || null,
    }), 201);
  } catch (err) { return error(reply, err.message, err.statusCode || 500); }
};

exports.getInventoryLines = async (req, reply) => {
  try { return success(reply, await inventoryService.getInventoryLines(req.params.id)); }
  catch (err) { return error(reply, err.message, err.statusCode || 500); }
};

exports.addInventoryLine = async (req, reply) => {
  try {
    return success(reply, await inventoryService.addInventoryLine({
      inventoryCountId: req.params.id, ...req.body, countedBy: req.user?._id || null,
    }), 201);
  } catch (err) {
    const statusCode = err.statusCode ?? (err.name === "ValidationError" ? 400 : null) ?? 500;
    return error(reply, err.message, statusCode);
  }
};

exports.sendToDepot = async (req, reply) => {
  try { return success(reply, await inventoryService.sendToDepot(req.params.id)); }
  catch (err) { return error(reply, err.message, err.statusCode || 500); }
};

exports.addDepotReason = async (req, reply) => {
  try {
    return success(reply, await inventoryService.addDepotReason({
      lineId: req.params.lineId, reason: req.body.reason, userId: req.user?._id || null,
    }));
  } catch (err) { return error(reply, err.message, err.statusCode || 500); }
};

exports.submitDepotReview = async (req, reply) => {
  try { return success(reply, await inventoryService.submitDepotReview(req.params.id)); }
  catch (err) { return error(reply, err.message, err.statusCode || 500); }
};

exports.approveInventoryLine = async (req, reply) => {
  try {
    return success(reply, await inventoryService.approveInventoryLine({
      lineId: req.params.lineId, userId: req.user?._id || null,
    }));
  } catch (err) { return error(reply, err.message, err.statusCode || 500); }
};

exports.rejectInventoryLine = async (req, reply) => {
  try {
    return success(reply, await inventoryService.rejectInventoryLine({
      lineId: req.params.lineId, userId: req.user?._id || null,
    }));
  } catch (err) { return error(reply, err.message, err.statusCode || 500); }
};