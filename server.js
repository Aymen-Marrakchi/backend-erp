// server.js


const Fastify = require("fastify");
const dotenv = require("dotenv");
const deptRoutes = require("./routes/department.routes");
const cyclicOrderService = require("./modules/production/services/cyclic-order.service");

dotenv.config();

const fastify = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
      options: { colorize: true },
    },
  },
});

// ── Plugins ────────────────────────────────────────────────
fastify.register(require("@fastify/helmet"));
fastify.register(require("@fastify/swagger"), {
  openapi: {
    info: {
      title: "ERP API Documentation",
      description: "API endpoints for the ERP system (Stock, HR, Finance, etc.)",
      version: "1.0.0",
    },
    servers: [{ url: `http://localhost:${process.env.PORT || 5000}` }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
});

fastify.register(require("@fastify/swagger-ui"), {
  routePrefix: "/docs",
  uiConfig: {
    docExpansion: "list", // 'none', 'list', or 'full'
    deepLinking: false,
  },
  exposeRoute: true,
});
fastify.register(require("@fastify/cors"), {
  origin: (origin, cb) => {
    const isLocalDevOrigin =
      !origin || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);

    if (isLocalDevOrigin) {
      cb(null, true);
    } else {
      cb(new Error("Not allowed by CORS"), false);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});
fastify.register(require("./plugins/mongo.plugin"));   // DB connection
fastify.register(require("./plugins/jwt.plugin"));     // JWT + fastify.authenticate

// ── Routes ─────────────────────────────────────────────────
fastify.register(require("./routes/auth.routes"),  { prefix: "/api/auth"  });
fastify.register(require("./routes/admin.routes"), { prefix: "/api/admin" });
fastify.register(require("./modules/stock/routes/stock.routes"), { prefix: "/api/stock" });
fastify.register(require("./modules/stock/routes/product.routes"), { prefix: "/api/stock/products" });
fastify.register(require("./modules/stock/routes/threshold.routes"), { prefix: "/api/stock/threshold-rules" });
fastify.register(require("./modules/stock/routes/alert.routes"), { prefix: "/api/stock/alerts" });
fastify.register(require("./modules/stock/routes/inventory.routes"), { prefix: "/api/stock/inventories" });
fastify.register(require("./modules/stock/routes/depot.routes"), {
  prefix: "/api/stock/depots",
});
fastify.register(require("./modules/commercial/routes/sales-order.routes"), {
  prefix: "/api/commercial/orders",
});
fastify.register(require("./modules/commercial/routes/backorder.routes"), {
  prefix: "/api/commercial/backorders",
});
fastify.register(require("./modules/commercial/routes/customer.routes"), {
  prefix: "/api/commercial/customers",
});
fastify.register(require("./modules/commercial/routes/carrier.routes"), {
  prefix: "/api/commercial/carriers",
});
fastify.register(require("./modules/commercial/routes/vehicle.routes"), {
  prefix: "/api/commercial/vehicles",
});
fastify.register(require("./modules/commercial/routes/rma.routes"), {
  prefix: "/api/commercial/rmas",
});
fastify.register(require("./modules/commercial/routes/notification.routes"), {
  prefix: "/api/commercial/notifications",
});
fastify.register(require("./modules/production/routes/cyclic-order.routes"), {
  prefix: "/api/commercial/cyclic-orders",
});
fastify.register(require("./modules/commercial/routes/delivery-plan.routes"), {
  prefix: "/api/commercial/delivery-plans",
});
fastify.register(require("./modules/stock/routes/sku-setting.routes"), {
  prefix: "/api/stock/settings/sku",
});
fastify.register(require("./modules/purchase/routes/purchase-request.routes"), {
  prefix: "/api/purchase/requests",
});
fastify.register(require("./modules/production/routes/work-center.routes"), {
  prefix: "/api/production/work-centers",
});
fastify.register(require("./modules/production/routes/production-order.routes"), {
  prefix: "/api/production/orders",
});
fastify.register(require("./modules/production/routes/cyclic-order.routes"), {
  prefix: "/api/production/cyclic-orders",
});

// Department routes — one factory, three registrations
fastify.register(deptRoutes("HR"),           { prefix: "/api/hr"        });
fastify.register(deptRoutes("Marketing"),    { prefix: "/api/marketing" });
fastify.register(deptRoutes("Online Sales"), { prefix: "/api/sales"     });
fastify.register(deptRoutes("Stock"), { prefix: "/api/stock-admin" });
fastify.register(deptRoutes("Commercial"), { prefix: "/api/commercial-admin" });
fastify.register(deptRoutes("Finance"), { prefix: "/api/finance-admin" });
fastify.register(deptRoutes("Purchase"), { prefix: "/api/purchase-admin" });

// ── Health check ───────────────────────────────────────────
fastify.get("/", async (req, reply) => {
  return { message: "ERP API is running ✅" };
});

// ── 404 ────────────────────────────────────────────────────
fastify.setNotFoundHandler((req, reply) => {
  reply.code(404).send({ message: "Route not found" });
});

// ── Global error handler ───────────────────────────────────
fastify.setErrorHandler((err, req, reply) => {
  console.error("ERROR DETAILS:", err);
  console.error("ERROR STACK:", err.stack);
  
  // Handle validation errors
  if (err.validation) {
    return reply.code(400).send({ 
      message: "Validation error", 
      details: err.validation 
    });
  }
  
  // Handle Mongoose CastError (invalid ObjectId)
  if (err.name === "CastError") {
    return reply.code(400).send({ 
      message: "Invalid ID format",
      details: err.message 
    });
  }
  
  // Handle Mongoose validation errors
  if (err.name === "ValidationError") {
    return reply.code(400).send({ 
      message: "Validation error", 
      details: err.message 
    });
  }
  
  // Handle duplicate key errors
  if (err.code === 11000) {
    return reply.code(409).send({ 
      message: "Duplicate entry",
      details: err.message 
    });
  }
  
  reply.code(err.statusCode || 500).send({ 
    message: err.message || "Internal Server Error",
    details: err.stack 
  });
});

// ── Start ──────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
fastify.listen({ port: PORT, host: "0.0.0.0" }, (err) => {
  if (err) { fastify.log.error(err); process.exit(1); }
  const recurringIntervalMs = 60 * 1000;

  cyclicOrderService.processDueOrders().catch((processingError) => {
    fastify.log.error(processingError);
  });

  setInterval(() => {
    cyclicOrderService.processDueOrders().catch((processingError) => {
      fastify.log.error(processingError);
    });
  }, recurringIntervalMs);
});
