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
    discount: { type: "number", minimum: 0, maximum: 100 },
  },
};

const createSalesOrderBody = {
  type: "object",
  required: ["orderNo", "lines"],
  properties: {
    orderNo: { type: "string", minLength: 1 },
    customerId: { type: "string", minLength: 24, maxLength: 24 },
    customerName: { type: "string" },
    notes: { type: "string" },
    promisedDate: { type: "string" },
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
    vehicleId: { type: "string", minLength: 24, maxLength: 24 },
    shippingCost: { type: "number", minimum: 0 },
    shipmentAddress: { type: "string" },
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
