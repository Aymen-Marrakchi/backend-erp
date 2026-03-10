const { protect, requireRole } = require("../../../hooks/auth.hook");
const inventoryController = require("../controllers/inventory.controller");
const {
  idParam,
  lineIdParam,
  createInventoryBody,
  addLineBody,
  depotReasonBody,
} = require("../schemas/inventory.schema");

async function inventoryRoutes(fastify) {
  const canRead   = [protect, requireRole("ADMIN", "STOCK_MANAGER", "DEPOT_MANAGER")];
  const canCreate = [protect, requireRole("ADMIN", "STOCK_MANAGER")];
  const canStock  = [protect, requireRole("ADMIN", "STOCK_MANAGER")];
  const canDepot  = [protect, requireRole("ADMIN", "DEPOT_MANAGER")];

  // Sessions
  fastify.get("/",    { preHandler: canRead },   inventoryController.getAllInventories);
  fastify.get("/:id", { preHandler: canRead, schema: { params: idParam } }, inventoryController.getInventoryById);
  fastify.post("/",   { preHandler: canCreate, schema: { body: createInventoryBody } }, inventoryController.createInventory);

  // Lines
  fastify.get("/:id/lines",  { preHandler: canRead,  schema: { params: idParam } }, inventoryController.getInventoryLines);
  fastify.post("/:id/lines", { preHandler: canStock, schema: { params: idParam, body: addLineBody } }, inventoryController.addInventoryLine);

  // Stock Manager workflow
  fastify.post("/:id/send-to-depot",         { preHandler: canStock, schema: { params: idParam } }, inventoryController.sendToDepot);
  fastify.post("/:id/lines/:lineId/approve", { preHandler: canStock, schema: { params: lineIdParam } }, inventoryController.approveInventoryLine);
  fastify.post("/:id/lines/:lineId/reject",  { preHandler: canStock, schema: { params: lineIdParam } }, inventoryController.rejectInventoryLine);

  // Depot Manager workflow
  fastify.post("/:id/lines/:lineId/reason",  { preHandler: canDepot, schema: { params: lineIdParam, body: depotReasonBody } }, inventoryController.addDepotReason);
  fastify.post("/:id/submit-review",         { preHandler: canDepot, schema: { params: idParam } }, inventoryController.submitDepotReview);
}

module.exports = inventoryRoutes;
