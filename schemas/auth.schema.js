// schemas/auth.schema.js

const registerBody = {
  type: "object",
  required: ["name", "email", "password"],
  properties: {
    name:       { type: "string", minLength: 2 },
    email:      { type: "string", format: "email" },
    password:   { type: "string", minLength: 6 },
    role:       { type: "string", enum: ["ADMIN", "HR_MANAGER", "MARKETING_MANAGER", "SALES_MANAGER", "STOCK_MANAGER", "COMMERCIAL_MANAGER", "FINANCE_MANAGER", "PURCHASE_MANAGER", "EMPLOYEE"] },
    department: { type: "string", enum: ["HR", "Marketing", "Online Sales", "Stock", "Commercial", "Finance", "Purchase", "None"] },
  },
};

const loginBody = {
  type: "object",
  required: ["email", "password"],
  properties: {
    email:    { type: "string", format: "email" },
    password: { type: "string", minLength: 1 },
  },
};

module.exports = { registerBody, loginBody };