// schemas/admin.schema.js

const createUserBody = {
  type: "object",
  required: ["name", "email", "password", "role"],
  properties: {
    name:       { type: "string", minLength: 2 },
    email:      { type: "string", format: "email" },
    password:   { type: "string", minLength: 6 },
    role:       { type: "string", enum: ["ADMIN", "HR_MANAGER", "MARKETING_MANAGER", "SALES_MANAGER", "EMPLOYEE"] },
    department: { type: "string", enum: ["HR", "Marketing", "Online Sales", "None"] },
    position:   { type: "string" },
  },
};

const updateUserBody = {
  type: "object",
  properties: {
    name:       { type: "string", minLength: 2 },
    email:      { type: "string", format: "email" },
    role:       { type: "string", enum: ["ADMIN", "HR_MANAGER", "MARKETING_MANAGER", "SALES_MANAGER", "STOCK_MANAGER", "COMMERCIAL_MANAGER", "FINANCE_MANAGER", "PURCHASE_MANAGER",  "EMPLOYEE"] },
    department: { type: "string", enum: ["HR", "Marketing", "Online Sales", "Stock", "Commercial", "Finance", "Purchase", "None"] },
    position:   { type: "string" },
  },
};

const idParam = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 24, maxLength: 24 },
  },
};

const resetPasswordBody = {
  type: "object",
  required: ["newPassword"],
  properties: {
    newPassword: { type: "string", minLength: 6 },
  },
};

module.exports = { createUserBody, updateUserBody, idParam, resetPasswordBody };