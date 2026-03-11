const idParam = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 24, maxLength: 24 },
  },
};

const salesOrderLine = {
  type: "object",
  required: ["productId", "quantity"],
  properties: {
    productId: { type: "string", minLength: 24, maxLength: 24 },
    quantity: { type: "number", minimum: 1 },
    unitPrice: { type: "number", minimum: 0 },
  },
};

const createSalesOrderBody = {
  type: "object",
  required: ["orderNo", "customerName", "lines"],
  properties: {
    orderNo: { type: "string", minLength: 2 },
    customerName: { type: "string", minLength: 2 },
    notes: { type: "string" },
    promisedDate: { type: "string", format: "date-time" },
    lines: {
      type: "array",
      minItems: 1,
      items: salesOrderLine,
    },
  },
};

const shipOrderBody = {
  type: "object",
  properties: {
    trackingNumber: { type: "string" },
    carrierId: { type: "string", minLength: 24, maxLength: 24 },
    shippingCost: { type: "number", minimum: 0 },
  },
};

const markUrgentBody = {
  type: "object",
  properties: {
    urgent: { type: "boolean" },
  },
};

const rejectShipBody = {
  type: "object",
  required: ["reason"],
  properties: {
    reason: { type: "string", minLength: 1 },
  },
};

module.exports = {
  idParam,
  createSalesOrderBody,
  shipOrderBody,
  markUrgentBody,
  rejectShipBody,
};