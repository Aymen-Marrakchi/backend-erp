const salesOrderService = require("../services/sales-order.service");

exports.getAllOrders = async (req, reply) => {
  try {
    const orders = await salesOrderService.getAllOrders();
    return reply.code(200).send(orders);
  } catch (err) {
    return reply.code(err.statusCode || 500).send({ message: err.message });
  }
};

exports.getOrderById = async (req, reply) => {
  try {
    const order = await salesOrderService.getOrderById(req.params.id);

    if (!order) {
      return reply.code(404).send({ message: "Sales order not found" });
    }

    return reply.code(200).send(order);
  } catch (err) {
    return reply.code(err.statusCode || 500).send({ message: err.message });
  }
};

exports.createOrder = async (req, reply) => {
  try {
    const order = await salesOrderService.createOrder({
      ...req.body,
      createdBy: req.user?._id || null,
    });

    return reply.code(201).send(order);
  } catch (err) {
    return reply.code(err.statusCode || 500).send({ message: err.message });
  }
};

exports.confirmOrder = async (req, reply) => {
  try {
    const order = await salesOrderService.confirmOrder(req.params.id, req.user?._id || null);
    return reply.code(200).send(order);
  } catch (err) {
    return reply.code(err.statusCode || 500).send({ message: err.message });
  }
};

exports.cancelOrder = async (req, reply) => {
  try {
    const order = await salesOrderService.cancelOrder(req.params.id, req.user?._id || null);
    return reply.code(200).send(order);
  } catch (err) {
    return reply.code(err.statusCode || 500).send({ message: err.message });
  }
};

exports.shipOrder = async (req, reply) => {
  try {
    const order = await salesOrderService.shipOrder(req.params.id, req.user?._id || null);
    return reply.code(200).send(order);
  } catch (err) {
    return reply.code(err.statusCode || 500).send({ message: err.message });
  }
};