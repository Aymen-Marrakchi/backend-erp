const { protect, requireRole } = require("../../../hooks/auth.hook");
const controller = require("../controllers/purchase-order.controller");
const {
  idParam,
  createPurchaseOrderBody,
  updatePurchaseOrderStatusBody,
} = require("../schemas/purchase-order.schema");

async function purchaseOrderRoutes(fastify) {
  const access = [protect, requireRole("ADMIN", "PURCHASE_MANAGER")];

  fastify.get("/", { preHandler: access }, controller.getAllPurchaseOrders);
  fastify.get("/:id", { preHandler: access, schema: { params: idParam } }, controller.getPurchaseOrderById);
  fastify.post("/", { preHandler: access, schema: { body: createPurchaseOrderBody } }, controller.createPurchaseOrder);
  fastify.patch(
    "/:id/status",
    { preHandler: access, schema: { params: idParam, body: updatePurchaseOrderStatusBody } },
    controller.updatePurchaseOrderStatus
  );
}

module.exports = purchaseOrderRoutes;
