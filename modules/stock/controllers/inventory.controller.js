const inventoryService = require("../services/inventory.service");
const { success, error } = require("../../../utils/response");

exports.getAllInventories = async (req, reply) => {
  try {
    return success(reply, await inventoryService.getAllInventories());
  } catch (err) {
    return error(reply, err.message, err.statusCode || 500);
  }
};

exports.getInventoryById = async (req, reply) => {
  try {
    return success(reply, await inventoryService.getInventoryById(req.params.id));
  } catch (err) {
    return error(reply, err.message, err.statusCode || 500);
  }
};

exports.createInventory = async (req, reply) => {
  try {
    return success(
      reply,
      await inventoryService.createInventory({
        ...req.body,
        startedBy: req.user?._id || null,
      }),
      201
    );
  } catch (err) {
    return error(reply, err.message, err.statusCode || 500);
  }
};

exports.getInventoryLines = async (req, reply) => {
  try {
    return success(reply, await inventoryService.getInventoryLines(req.params.id));
  } catch (err) {
    return error(reply, err.message, err.statusCode || 500);
  }
};

exports.addInventoryLine = async (req, reply) => {
  try {
    const result = await inventoryService.addInventoryLine({
      inventoryCountId: req.params.id,
      ...req.body,
      countedBy: req.user?._id || null,
    });
    const payload = result?.toObject?.() ?? result;
    return success(reply, payload, 201);
  } catch (err) {
    const statusCode =
      err.statusCode ??
      (err.name === "ValidationError" ? 400 : null) ??
      (err.name === "CastError" ? 400 : null) ??
      500;
    const message =
      err.name === "ValidationError"
        ? Object.values(err.errors || {})
            .map((e) => e.message)
            .join("; ") || err.message
        : err.message;
    if (statusCode >= 500) {
      req.log?.error({ err }, "addInventoryLine failed");
      console.error("[addInventoryLine]", err.message, err.stack);
    }
    return error(reply, message, statusCode);
  }
};

exports.submitInventoryForApproval = async (req, reply) => {
  try {
    return success(reply, await inventoryService.submitInventoryForApproval(req.params.id));
  } catch (err) {
    return error(reply, err.message, err.statusCode || 500);
  }
};

exports.createAdjustmentFromLine = async (req, reply) => {
  try {
    return success(
      reply,
      await inventoryService.createAdjustmentFromLine({
        ...req.body,
        requestedBy: req.user?._id || null,
      }),
      201
    );
  } catch (err) {
    return error(reply, err.message, err.statusCode || 500);
  }
};

exports.getAllAdjustments = async (req, reply) => {
  try {
    return success(reply, await inventoryService.getAllAdjustments());
  } catch (err) {
    return error(reply, err.message, err.statusCode || 500);
  }
};

exports.updateAdjustmentStatus = async (req, reply) => {
  try {
    return success(
      reply,
      await inventoryService.updateAdjustmentStatus({
        id: req.params.id,
        status: req.body.status,
        userId: req.user?._id || null,
      })
    );
  } catch (err) {
    return error(reply, err.message, err.statusCode || 500);
  }
};