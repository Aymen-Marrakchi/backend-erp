const { protect, requireRole } = require("../../../hooks/auth.hook");
const salesOrderController = require("../controllers/sales-order.controller");
const { idParam, createSalesOrderBody, shipOrderBody } = require("../schemas/sales-order.schema");

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
    "/:id/prepare",
    { preHandler: commercialAccess, schema: { params: idParam } },
    salesOrderController.prepareOrder
  );

  fastify.post(
    "/:id/cancel",
    { preHandler: commercialAccess, schema: { params: idParam } },
    salesOrderController.cancelOrder
  );

  fastify.post(
    "/:id/ship",
    {
      preHandler: commercialAccess,
      schema: { params: idParam, body: shipOrderBody },
    },
    salesOrderController.shipOrder
  );

  fastify.post(
    "/:id/deliver",
    { preHandler: commercialAccess, schema: { params: idParam } },
    salesOrderController.deliverOrder
  );
}

module.exports = salesOrderRoutes;