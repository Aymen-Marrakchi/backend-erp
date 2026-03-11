const backOrderController = require("../controllers/backorder.controller");

const idParam = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", minLength: 24, maxLength: 24 } },
};

module.exports = async (fastify) => {
  fastify.get("/", { onRequest: [fastify.authenticate] }, backOrderController.getAll);
  fastify.get("/:id", { onRequest: [fastify.authenticate], schema: { params: idParam } }, backOrderController.getById);
  fastify.post("/:id/fulfill", { onRequest: [fastify.authenticate], schema: { params: idParam } }, backOrderController.fulfill);
  fastify.post("/:id/cancel", { onRequest: [fastify.authenticate], schema: { params: idParam } }, backOrderController.cancel);
};
