const idParam = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 24, maxLength: 24 },
  },
};

const createReturnLineSchema = {
  type: "object",
  required: ["purchaseReceiptLineId", "quantity"],
  properties: {
    purchaseReceiptLineId: { type: "string", minLength: 24, maxLength: 24 },
    quantity: { type: "number", minimum: 1 },
    lotRef: { type: "string" },
  },
};

const createPurchaseReturnBody = {
  type: "object",
  required: ["supplierId", "purchaseInvoiceId", "purchaseReceiptId", "reason", "lines"],
  properties: {
    supplierId: { type: "string", minLength: 24, maxLength: 24 },
    purchaseInvoiceId: { type: "string", minLength: 24, maxLength: 24 },
    purchaseReceiptId: { type: "string", minLength: 24, maxLength: 24 },
    reason: {
      type: "string",
      enum: ["DEFECT", "DELIVERY_ERROR", "NON_CONFORMITY"],
    },
    lines: {
      type: "array",
      minItems: 1,
      items: createReturnLineSchema,
    },
    refundAmount: { type: "number", minimum: 0 },
    notes: { type: "string" },
  },
};

const updatePurchaseReturnStatusBody = {
  type: "object",
  required: ["status"],
  properties: {
    status: {
      type: "string",
      enum: ["REFUNDED", "REPLACED", "CLOSED"],
    },
  },
};

module.exports = {
  idParam,
  createPurchaseReturnBody,
  updatePurchaseReturnStatusBody,
};
