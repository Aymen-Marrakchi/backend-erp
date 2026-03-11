const { protect, requireRole } = require("../../../hooks/auth.hook");
const carrierController = require("../controllers/carrier.controller");

const idParam = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 24, maxLength: 24 },
  },
};

const carrierBody = {
  type: "object",
  required: ["name", "code"],
  properties: {
    name: { type: "string", minLength: 1 },
    code: { type: "string", minLength: 1 },
    contactEmail: { type: "string" },
    contactPhone: { type: "string" },
    baseRateFlat: { type: "number", minimum: 0 },
    baseRatePerKg: { type: "number", minimum: 0 },
    notes: { type: "string" },
  },
};

async function carrierRoutes(fastify) {
  const access = [protect, requireRole("ADMIN", "COMMERCIAL_MANAGER")];

  fastify.get("/", { preHandler: access }, carrierController.getAll);
  fastify.get("/active", { preHandler: access }, carrierController.getActive);
  fastify.get("/:id", { preHandler: access, schema: { params: idParam } }, carrierController.getById);
  fastify.post("/", { preHandler: access, schema: { body: carrierBody } }, carrierController.create);
  fastify.put("/:id", { preHandler: access, schema: { params: idParam } }, carrierController.update);
  fastify.post("/:id/toggle", { preHandler: access, schema: { params: idParam } }, carrierController.toggleActive);
}

module.exports = carrierRoutes;
