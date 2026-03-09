const { protect, requireRole } = require("../../../hooks/auth.hook");
const inventoryController = require("../controllers/inventory.controller");
const {
  idParam,
  createInventoryBody,
  addLineBody,
  createAdjustmentBody,
  updateAdjustmentStatusBody,
} = require("../schemas/inventory.schema");

async function inventoryRoutes(fastify) {
  const stockAccess = [protect];
  const adminOnly = [protect, requireRole("ADMIN")];
  /** ADMIN or STOCK_MANAGER can approve/reject/apply inventory adjustments */
  const canManageAdjustments = [protect, requireRole("ADMIN", "STOCK_MANAGER")];

  fastify.get(
    "/",
    { preHandler: stockAccess, schema: { tags: ["Inventory"] } },
    inventoryController.getAllInventories
  );

  fastify.get(
    "/:id",
    { preHandler: stockAccess, schema: { params: idParam, tags: ["Inventory"] } },
    inventoryController.getInventoryById
  );

  fastify.post(
    "/",
    { preHandler: stockAccess, schema: { body: createInventoryBody, tags: ["Inventory"] } },
    inventoryController.createInventory
  );

  fastify.get(
    "/:id/lines",
    { preHandler: stockAccess, schema: { params: idParam, tags: ["Inventory"] } },
    inventoryController.getInventoryLines
  );

  fastify.post(
    "/:id/lines",
    {
      preHandler: stockAccess,
      schema: { params: idParam, body: addLineBody, tags: ["Inventory"] }
    },
    inventoryController.addInventoryLine
  );

  fastify.post(
    "/:id/submit",
    { preHandler: stockAccess, schema: { params: idParam, tags: ["Inventory"] } },
    inventoryController.submitInventoryForApproval
  );

  fastify.get(
    "/adjustments/all",
    { preHandler: stockAccess, schema: { tags: ["Inventory"] } },
    inventoryController.getAllAdjustments
  );

  fastify.post(
    "/adjustments",
    { preHandler: stockAccess, schema: { body: createAdjustmentBody, tags: ["Inventory"] } },
    inventoryController.createAdjustmentFromLine
  );

  fastify.patch(
    "/adjustments/:id/status",
    {
      preHandler: canManageAdjustments,
      schema: { params: idParam, body: updateAdjustmentStatusBody, tags: ["Inventory"] }
    },
    inventoryController.updateAdjustmentStatus
  );
}

module.exports = inventoryRoutes;