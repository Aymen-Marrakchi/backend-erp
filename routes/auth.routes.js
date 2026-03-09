// routes/auth.routes.js

const { protect } = require("../hooks/auth.hook");
const { register, login, getMe } = require("../controllers/auth.controller");
const { registerBody, loginBody } = require("../schemas/auth.schema");

async function authRoutes(fastify, options) {
  fastify.post("/register", { schema: { body: registerBody, tags: ["Auth"] } }, register);
  fastify.post("/login",    { schema: { body: loginBody, tags: ["Auth"] } }, login);
  fastify.get("/me",        { preHandler: [protect], schema: { tags: ["Auth"] } }, getMe);
}

module.exports = authRoutes;