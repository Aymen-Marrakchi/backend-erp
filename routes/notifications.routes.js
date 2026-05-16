const { protect } = require("../hooks/auth.hook");
const Notification = require("../models/Notification");

const ROLE_MODULES = {
  ADMIN: ["COMMERCIAL", "FINANCE", "STOCK", "PURCHASE"],
  COMMERCIAL_MANAGER: ["COMMERCIAL"],
  FINANCE_MANAGER: ["FINANCE"],
  STOCK_MANAGER: ["STOCK"],
  PURCHASE_MANAGER: ["PURCHASE"],
  DEPOT_MANAGER: ["STOCK"],
};

async function notificationRoutes(fastify) {
  fastify.get("/", { preHandler: [protect] }, async (req, reply) => {
    const modules = ROLE_MODULES[req.user?.role] || [];
    if (modules.length === 0) return reply.send([]);

    const notifications = await Notification.find({ module: { $in: modules } })
      .populate("createdBy", "name role")
      .sort({ createdAt: -1 })
      .limit(50);

    return reply.send(notifications);
  });

  fastify.post("/:id/read", { preHandler: [protect] }, async (req, reply) => {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return reply.code(404).send({ message: "Notification not found" });
    }
    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();
    return reply.send(notification);
  });
}

module.exports = notificationRoutes;
