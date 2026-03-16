const { protect, requireRole } = require("../../../hooks/auth.hook");
const controller = require("../controllers/finance.controller");

async function financeRoutes(fastify) {
  const access = [protect, requireRole("ADMIN", "FINANCE_MANAGER")];

  fastify.get("/dashboard", { preHandler: access }, controller.getDashboard);
  fastify.get("/receivables", { preHandler: access }, controller.getReceivables);
  fastify.get("/payables", { preHandler: access }, controller.getPayables);
  fastify.get("/treasury", { preHandler: access }, controller.getTreasury);
  fastify.get("/entries", { preHandler: access }, controller.getEntries);
  fastify.get("/journal", { preHandler: access }, controller.getJournal);
  fastify.get("/accounts", { preHandler: access }, controller.getAccounts);
  fastify.get("/accounts/:code", { preHandler: access }, controller.getAccountLedger);
  fastify.get("/reports", { preHandler: access }, controller.getReports);
}

module.exports = financeRoutes;
