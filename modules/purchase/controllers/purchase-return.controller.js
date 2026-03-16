const purchaseReturnService = require("../services/purchase-return.service");

exports.getAllPurchaseReturns = async (req, reply) => {
  try {
    return reply.code(200).send(await purchaseReturnService.getAllPurchaseReturns());
  } catch (err) {
    return reply.code(err.statusCode || 500).send({ message: err.message });
  }
};

exports.getPurchaseReturnById = async (req, reply) => {
  try {
    const purchaseReturn = await purchaseReturnService.getPurchaseReturnById(req.params.id);
    if (!purchaseReturn) {
      return reply.code(404).send({ message: "Purchase return not found" });
    }
    return reply.code(200).send(purchaseReturn);
  } catch (err) {
    return reply.code(err.statusCode || 500).send({ message: err.message });
  }
};

exports.createPurchaseReturn = async (req, reply) => {
  try {
    const purchaseReturn = await purchaseReturnService.createPurchaseReturn({
      ...req.body,
      createdBy: req.user?.id || null,
    });
    return reply.code(201).send(purchaseReturn);
  } catch (err) {
    return reply.code(err.statusCode || 500).send({ message: err.message });
  }
};

exports.updatePurchaseReturnStatus = async (req, reply) => {
  try {
    return reply
      .code(200)
      .send(await purchaseReturnService.updatePurchaseReturnStatus(req.params.id, req.body.status));
  } catch (err) {
    return reply.code(err.statusCode || 500).send({ message: err.message });
  }
};
