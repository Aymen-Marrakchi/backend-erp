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
  cancelQuotationBody,
  markSentBody,
  acceptQuotationBody,
  rejectQuotationBody,
} = require("../schemas/customer-invoice.schema");

async function customerInvoiceRoutes(fastify) {
  const readAccess = [protect, requireRole("ADMIN", "COMMERCIAL_MANAGER", "FINANCE_MANAGER")];
  const commercialWrite = [protect, requireRole("ADMIN", "COMMERCIAL_MANAGER")];
  const financeWrite = [protect, requireRole("ADMIN", "FINANCE_MANAGER")];

  fastify.get("/", { preHandler: readAccess }, controller.getAllInvoices);
  fastify.get("/:id", { preHandler: readAccess, schema: { params: idParam } }, controller.getInvoiceById);
  fastify.delete("/:id", { preHandler: financeWrite, schema: { params: idParam } }, controller.deleteInvoice);
  fastify.post(
    "/:id/cancel",
    { preHandler: financeWrite, schema: { params: idParam, body: cancelQuotationBody } },
    controller.cancelQuotation
  );
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
    { preHandler: financeWrite, schema: { params: idParam, body: invoiceConfigBody } },
    controller.configureInvoice
  );
  fastify.post(
    "/:id/finalize",
    { preHandler: financeWrite, schema: { params: idParam, body: invoiceConfigBody } },
    controller.finalizeInvoice
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
  fastify.post(
    "/:id/mark-sent",
    { preHandler: financeWrite, schema: { params: idParam, body: markSentBody } },
    controller.markAsSent
  );
  fastify.post(
    "/:id/accept",
    { preHandler: financeWrite, schema: { params: idParam, body: acceptQuotationBody } },
    controller.acceptQuotation
  );
  fastify.post(
    "/:id/reject",
    { preHandler: financeWrite, schema: { params: idParam, body: rejectQuotationBody } },
    controller.rejectQuotation
  );
}

module.exports = customerInvoiceRoutes;
