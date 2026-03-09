// routes/admin.routes.js

const { protect, requireRole } = require("../hooks/auth.hook");
const {
  getStats, getAllUsers, getUserById, createUser, updateUser, deleteUser, resetPassword,
} = require("../controllers/admin.controller");
const { createUserBody, updateUserBody, idParam, resetPasswordBody } = require("../schemas/admin.schema");

const adminOnly = [protect, requireRole("ADMIN")];

async function adminRoutes(fastify, options) {
  fastify.get("/stats",        { preHandler: adminOnly, schema: { tags: ["Admin"] } }, getStats);
  fastify.get("/users",        { preHandler: adminOnly, schema: { tags: ["Admin"] } }, getAllUsers);

  fastify.get("/users/:id",    { preHandler: adminOnly, schema: { params: idParam, tags: ["Admin"] } }, getUserById);

  fastify.post("/users",       { preHandler: adminOnly, schema: { body: createUserBody, tags: ["Admin"] } }, createUser);

  fastify.put("/users/:id",    {
    preHandler: adminOnly,
    schema: { body: updateUserBody, params: idParam, tags: ["Admin"] }
  }, updateUser);

  fastify.delete("/users/:id", { preHandler: adminOnly, schema: { params: idParam, tags: ["Admin"] } }, deleteUser);

  fastify.patch("/users/:id/reset-password", {
    preHandler: adminOnly,
    schema: { body: resetPasswordBody, params: idParam, tags: ["Admin"] }
  }, resetPassword);
}

module.exports = adminRoutes;