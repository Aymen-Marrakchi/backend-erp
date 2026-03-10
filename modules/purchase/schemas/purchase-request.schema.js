const idParam = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 24, maxLength: 24 },
  },
};

const createPurchaseRequestBody = {
  type: "object",
  required: ["requestNo", "productId", "requestedQuantity", "reason"],
  properties: {
    requestNo: { type: "string", minLength: 2 },
    productId: { type: "string", minLength: 24, maxLength: 24 },
    requestedQuantity: { type: "number", minimum: 1 },
    reason: { type: "string", minLength: 2 },
    priority: {
      type: "string",
      enum: ["LOW", "NORMAL", "URGENT"],
    },
    sourceAlertId: { type: "string", minLength: 24, maxLength: 24 },
    notes: { type: "string" },
  },
};

const updatePurchaseRequestStatusBody = {
  type: "object",
  required: ["status"],
  properties: {
    status: {
      type: "string",
      enum: ["PENDING", "IN_PROGRESS", "COMPLETED", "REJECTED"],
    },
    notes: { type: "string" },
  },
};

module.exports = {
  idParam,
  createPurchaseRequestBody,
  updatePurchaseRequestStatusBody,
};