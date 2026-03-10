const idParam = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 24, maxLength: 24 },
  },
};

const createSkuSettingBody = {
  type: "object",
  required: ["skuName", "skuMax"],
  properties: {
    skuName: { type: "string", minLength: 2 },
    skuMax: { type: "number", minimum: 1 },
  },
};

const updateSkuSettingBody = {
  type: "object",
  properties: {
    skuName: { type: "string", minLength: 2 },
    skuMax: { type: "number", minimum: 1 },
  },
};

module.exports = {
  idParam,
  createSkuSettingBody,
  updateSkuSettingBody,
};