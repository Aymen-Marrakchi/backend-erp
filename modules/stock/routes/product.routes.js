const { protect, requireRole } = require("../../../hooks/auth.hook");
const productController = require("../controllers/product.controller");
const {
  idParam,
  createProductBody,
  updateProductBody,
} = require("../schemas/product.schema");

async function productRoutes(fastify) {
  const stockAccess = [protect];
  const adminOnly = [protect, requireRole("ADMIN")];
  const stockManagers = [protect, requireRole("ADMIN", "STOCK_MANAGER")];

  fastify.get(
    "/",
    { preHandler: stockAccess, schema: { tags: ["Products"] } },
    productController.getAllProducts
  );

  fastify.get(
    "/:id",
    { preHandler: stockAccess, schema: { params: idParam, tags: ["Products"] } },
    productController.getProductById
  );

  fastify.post(
    "/",
    { preHandler:  stockManagers , schema: { body: createProductBody, tags: ["Products"] } },
    productController.createProduct
  );

  fastify.put(
    "/:id",
    {
      preHandler:  stockManagers,
      schema: { params: idParam, body: updateProductBody, tags: ["Products"] }
    },
    productController.updateProduct
  );

  fastify.delete(
    "/:id",
    { preHandler:  stockManagers, schema: { params: idParam, tags: ["Products"] } },
    productController.deleteProduct
  );
}

module.exports = productRoutes;