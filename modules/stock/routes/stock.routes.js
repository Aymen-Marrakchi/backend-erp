const { protect, requireRole } = require("../../../hooks/auth.hook");
const stockController = require("../controllers/stock.controller");
const {
  objectIdParam,
  entryBody,
  exitBody,
  reservationBody,
  releaseReservationBody,
  deductReservationBody,
} = require("../schemas/stock.schema");

async function stockRoutes(fastify) {
  const adminOnly = [protect, requireRole("ADMIN")];
  const stockAccess = [protect , requireRole("STOCK_MANAGER")]; // later you can replace with STOCK_MANAGER, ADMIN, etc.

  fastify.get(
    "/items",
    { preHandler: stockAccess, schema: { tags: ["Stock"] } },
    stockController.getAllStockItems
  );

  fastify.get(
    "/items/:productId",
    { preHandler: stockAccess, schema: { params: objectIdParam, tags: ["Stock"] } },
    stockController.getStockItemByProductId
  );

  fastify.get(
    "/movements",
    { preHandler: stockAccess, schema: { tags: ["Stock"] } },
    stockController.getAllMovements
  );

  fastify.get(
    "/movements/:productId",
    { preHandler: stockAccess, schema: { params: objectIdParam, tags: ["Stock"] } },
    stockController.getMovementHistory
  );

  fastify.post(
    "/movements/entry",
    { preHandler: stockAccess, schema: { body: entryBody, tags: ["Stock"] } },
    stockController.createEntry
  );

  fastify.post(
    "/movements/exit",
    { preHandler: stockAccess, schema: { body: exitBody, tags: ["Stock"] } },
    stockController.createExit
  );

  fastify.post(
    "/reservations",
    { preHandler: stockAccess, schema: { body: reservationBody, tags: ["Stock"] } },
    stockController.reserveStock
  );

  fastify.post(
    "/reservations/release",
    { preHandler: stockAccess, schema: { body: releaseReservationBody, tags: ["Stock"] } },
    stockController.releaseReservation
  );

  fastify.post(
    "/reservations/deduct",
    { preHandler: stockAccess, schema: { body: deductReservationBody, tags: ["Stock"] } },
    stockController.deductReservedStock
  );
}

module.exports = stockRoutes;