const { protect, requireRole } = require("../../../hooks/auth.hook");
const controller = require("../controllers/purchase-return.controller");
const {
  idParam,
  createPurchaseReturnBody,
  updatePurchaseReturnStatusBody,
} = require("../schemas/purchase-return.schema");

async function purchaseReturnRoutes(fastify) {
  const access = [protect, requireRole("ADMIN", "PURCHASE_MANAGER")];

  fastify.get("/", { preHandler: access }, controller.getAllPurchaseReturns);
  fastify.get("/:id", { preHandler: access, schema: { params: idParam } }, controller.getPurchaseReturnById);
  fastify.post("/", { preHandler: access, schema: { body: createPurchaseReturnBody } }, controller.createPurchaseReturn);
  fastify.patch(
    "/:id/status",
    { preHandler: access, schema: { params: idParam, body: updatePurchaseReturnStatusBody } },
    controller.updatePurchaseReturnStatus
  );
}

module.exports = purchaseReturnRoutes;
