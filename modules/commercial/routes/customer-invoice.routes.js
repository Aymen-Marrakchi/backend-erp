const { protect, requireRole } = require("../../../hooks/auth.hook");
const controller = require("../controllers/customer-invoice.controller");
const {
  idParam,
  orderIdParam,
  invoiceConfigBody,
  registerPaymentBody,
  clearChequePaymentBody,
  sendInvoiceBody,
  sendReminderBody,
} = require("../schemas/customer-invoice.schema");

async function customerInvoiceRoutes(fastify) {
  const readAccess = [protect, requireRole("ADMIN", "COMMERCIAL_MANAGER", "FINANCE_MANAGER")];
  const commercialWrite = [protect, requireRole("ADMIN", "COMMERCIAL_MANAGER")];
  const financeWrite = [protect, requireRole("ADMIN", "FINANCE_MANAGER")];

  fastify.get("/", { preHandler: readAccess }, controller.getAllInvoices);
  fastify.get("/:id", { preHandler: readAccess, schema: { params: idParam } }, controller.getInvoiceById);
  fastify.get(
    "/by-order/:orderId",
    { preHandler: readAccess, schema: { params: orderIdParam } },
    controller.getInvoiceByOrderId
  );
  fastify.post(
    "/from-order/:orderId",
    { preHandler: commercialWrite, schema: { params: orderIdParam, body: invoiceConfigBody } },
    controller.createOrRefreshFromOrder
  );
  fastify.post(
    "/:id/send",
    { preHandler: commercialWrite, schema: { params: idParam, body: sendInvoiceBody } },
    controller.sendInvoice
  );
  fastify.patch(
    "/:id/configure",
    { preHandler: commercialWrite, schema: { params: idParam, body: invoiceConfigBody } },
    controller.configureInvoice
  );
  fastify.post(
    "/:id/payments",
    { preHandler: financeWrite, schema: { params: idParam, body: registerPaymentBody } },
    controller.registerPayment
  );
  fastify.post(
    "/:id/remind",
    { preHandler: financeWrite, schema: { params: idParam, body: sendReminderBody } },
    controller.sendReminder
  );
  fastify.post(
    "/:id/clear-cheque",
    { preHandler: financeWrite, schema: { params: idParam, body: clearChequePaymentBody } },
    controller.clearChequePayment
  );
}

module.exports = customerInvoiceRoutes;
