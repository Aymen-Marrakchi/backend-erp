const purchaseReceiptService = require("../services/purchase-receipt.service");

exports.getAllReceipts = async (req, reply) => {
  try {
    return reply.code(200).send(await purchaseReceiptService.getAllReceipts());
  } catch (err) {
    return reply.code(err.statusCode || 500).send({ message: err.message });
  }
};

exports.getReceiptById = async (req, reply) => {
  try {
    const receipt = await purchaseReceiptService.getReceiptById(req.params.id);
    if (!receipt) {
      return reply.code(404).send({ message: "Purchase receipt not found" });
    }
    return reply.code(200).send(receipt);
  } catch (err) {
    return reply.code(err.statusCode || 500).send({ message: err.message });
  }
};

exports.createReceipt = async (req, reply) => {
  try {
    const receipt = await purchaseReceiptService.createReceipt({
      ...req.body,
      createdBy: req.user?.id || null,
    });
    return reply.code(201).send(receipt);
  } catch (err) {
    return reply.code(err.statusCode || 500).send({ message: err.message });
  }
};
