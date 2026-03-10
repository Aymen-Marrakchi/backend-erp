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
    depotId: { type: "string", minLength: 24, maxLength: 24 },
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

const lineIdParam = {
  type: "object",
  required: ["id", "lineId"],
  properties: {
    id: { type: "string", minLength: 24, maxLength: 24 },
    lineId: { type: "string", minLength: 24, maxLength: 24 },
  },
};

const depotReasonBody = {
  type: "object",
  required: ["reason"],
  properties: {
    reason: { type: "string", minLength: 2 },
  },
};

module.exports = {
  idParam,
  lineIdParam,
  createInventoryBody,
  addLineBody,
  depotReasonBody,
};