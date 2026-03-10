const { protect, requireRole } = require("../../../hooks/auth.hook");
const salesOrderController = require("../controllers/sales-order.controller");
const { idParam, createSalesOrderBody } = require("../schemas/sales-order.schema");

async function salesOrderRoutes(fastify) {
  const commercialAccess = [
    protect,
    requireRole("ADMIN", "COMMERCIAL_MANAGER"),
  ];

  fastify.get(
    "/",
    { preHandler: commercialAccess },
    salesOrderController.getAllOrders
  );

  fastify.get(
    "/:id",
    { preHandler: commercialAccess, schema: { params: idParam } },
    salesOrderController.getOrderById
  );

  fastify.post(
    "/",
    { preHandler: commercialAccess, schema: { body: createSalesOrderBody } },
    salesOrderController.createOrder
  );

  fastify.post(
    "/:id/confirm",
    { preHandler: commercialAccess, schema: { params: idParam } },
    salesOrderController.confirmOrder
  );

  fastify.post(
    "/:id/cancel",
    { preHandler: commercialAccess, schema: { params: idParam } },
    salesOrderController.cancelOrder
  );

  fastify.post(
    "/:id/ship",
    { preHandler: commercialAccess, schema: { params: idParam } },
    salesOrderController.shipOrder
  );
}

module.exports = salesOrderRoutes;