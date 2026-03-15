const CommercialNotification = require("../models/notification.model");

exports.getAll = async () =>
  CommercialNotification.find()
    .populate("relatedOrderId", "orderNo status shippedAt deliveredAt")
    .populate("createdBy", "name email role")
    .sort({ createdAt: -1 });

exports.markRead = async (id) => {
  const notification = await CommercialNotification.findById(id);
  if (!notification) {
    throw Object.assign(new Error("Notification not found"), { statusCode: 404 });
  }

  notification.isRead = true;
  notification.readAt = new Date();
  await notification.save();

  return CommercialNotification.findById(notification._id)
    .populate("relatedOrderId", "orderNo status shippedAt deliveredAt")
    .populate("createdBy", "name email role");
};

exports.createForShipment = async (order, createdBy = null) => {
  const payloads = [
    {
      audience: "INTERNAL",
      eventType: "ORDER_SHIPPED",
      title: `Order ${order.orderNo} shipped`,
      message: `Order ${order.orderNo} for ${order.customerName} was shipped and is now in transit.`,
    },
    {
      audience: "CUSTOMER",
      eventType: "ORDER_SHIPPED",
      title: `Your order ${order.orderNo} has shipped`,
      message: `Your order ${order.orderNo} has been shipped. Delivery is in progress.`,
    },
  ];

  await CommercialNotification.insertMany(
    payloads.map((entry) => ({
      ...entry,
      relatedOrderId: order._id,
      customerName: order.customerName,
      createdBy,
    }))
  );
};

exports.createForDelivery = async (order, createdBy = null) => {
  const payloads = [
    {
      audience: "INTERNAL",
      eventType: "ORDER_DELIVERED",
      title: `Order ${order.orderNo} delivered`,
      message: `Order ${order.orderNo} for ${order.customerName} was marked as delivered.`,
    },
    {
      audience: "CUSTOMER",
      eventType: "ORDER_DELIVERED",
      title: `Your order ${order.orderNo} is delivered`,
      message: `Your order ${order.orderNo} has been delivered successfully.`,
    },
  ];

  await CommercialNotification.insertMany(
    payloads.map((entry) => ({
      ...entry,
      relatedOrderId: order._id,
      customerName: order.customerName,
      createdBy,
    }))
  );
};
