const { protect, requireRole } = require("../../../hooks/auth.hook");
const controller = require("../controllers/purchase-receipt.controller");
const { idParam, createReceiptBody } = require("../schemas/purchase-receipt.schema");

async function purchaseReceiptRoutes(fastify) {
  const access = [protect, requireRole("ADMIN", "PURCHASE_MANAGER")];

  fastify.get("/", { preHandler: access }, controller.getAllReceipts);
  fastify.get("/:id", { preHandler: access, schema: { params: idParam } }, controller.getReceiptById);
  fastify.post("/", { preHandler: access, schema: { body: createReceiptBody } }, controller.createReceipt);
}

module.exports = purchaseReceiptRoutes;
