const { protect, requireRole } = require("../../../hooks/auth.hook");
const controller = require("../controllers/purchase-invoice.controller");
const {
  idParam,
  createPurchaseInvoiceBody,
  updatePurchaseInvoiceStatusBody,
} = require("../schemas/purchase-invoice.schema");

async function purchaseInvoiceRoutes(fastify) {
  const access = [protect, requireRole("ADMIN", "PURCHASE_MANAGER")];

  fastify.get("/", { preHandler: access }, controller.getAllPurchaseInvoices);
  fastify.get("/:id", { preHandler: access, schema: { params: idParam } }, controller.getPurchaseInvoiceById);
  fastify.post("/", { preHandler: access, schema: { body: createPurchaseInvoiceBody } }, controller.createPurchaseInvoice);
  fastify.patch(
    "/:id/status",
    { preHandler: access, schema: { params: idParam, body: updatePurchaseInvoiceStatusBody } },
    controller.updatePurchaseInvoiceStatus
  );
}

module.exports = purchaseInvoiceRoutes;
