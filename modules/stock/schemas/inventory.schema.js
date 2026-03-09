const idParam = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 24, maxLength: 24 },
  },
};

const createInventoryBody = {
  type: "object",
  required: ["type"],
  properties: {
    type: {
      type: "string",
      enum: ["PERIODIC", "PERMANENT"],
    },
    notes: { type: "string", default: "" },
  },
};

const addLineBody = {
  type: "object",
  required: ["productId", "countedQuantity"],
  properties: {
    productId: { type: "string", minLength: 24, maxLength: 24 },
    countedQuantity: { type: "number", minimum: 0 },
    lotRef: { type: "string", default: "" },
    notes: { type: "string", default: "" },
  },
};

const createAdjustmentBody = {
  type: "object",
  required: ["inventoryCountLineId", "reason"],
  properties: {
    inventoryCountLineId: { type: "string", minLength: 24, maxLength: 24 },
    reason: { type: "string", minLength: 2 },
  },
};

const updateAdjustmentStatusBody = {
  type: "object",
  required: ["status"],
  properties: {
    status: {
      type: "string",
      enum: ["APPROVED", "REJECTED", "APPLIED"],
    },
  },
};

module.exports = {
  idParam,
  createInventoryBody,
  addLineBody,
  createAdjustmentBody,
  updateAdjustmentStatusBody,
};