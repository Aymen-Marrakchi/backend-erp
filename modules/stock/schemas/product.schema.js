const idParam = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 24, maxLength: 24 },
  },
};

const createProductBody = {
  type: "object",
  required: ["sku", "name", "unit"],
  properties: {
    sku: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 2 },
    description: { type: "string", default: "" },
    category: { type: "string", default: "" },
    unit: { type: "string", minLength: 1 },
    isLotTracked: { type: "boolean", default: false },
    status: { type: "string", enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
  },
};

const updateProductBody = {
  type: "object",
  properties: {
    sku: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 2 },
    description: { type: "string" },
    category: { type: "string" },
    unit: { type: "string", minLength: 1 },
    isLotTracked: { type: "boolean" },
    status: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
  },
};

module.exports = {
  idParam,
  createProductBody,
  updateProductBody,
};