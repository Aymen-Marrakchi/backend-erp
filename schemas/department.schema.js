// schemas/department.schema.js
const Joi = require("joi");

const createEmployeeSchema = Joi.object({
  name:       Joi.string().trim().min(2).max(100).required(),
  position:   Joi.string().trim().max(100).required(),
  status:     Joi.string().valid("Active", "On Leave", "Inactive").default("Active"),
  phone:      Joi.string().pattern(/^\d{8}$/).allow("").optional(),
  email:      Joi.string().email().allow("").optional(), // ← ADDED
  salary:     Joi.number().min(0).default(0),
  joinedDate: Joi.date().iso().optional(),
});

const updateEmployeeSchema = Joi.object({
  name:       Joi.string().trim().min(2).max(100).optional(),
  email:      Joi.string().email().allow("").optional(),
  position:   Joi.string().trim().max(100).optional(),
  status:     Joi.string().valid("Active", "On Leave", "Inactive").optional(),
  phone:      Joi.string().pattern(/^\d{8}$/).allow("").optional(),
  salary:     Joi.number().min(0).optional(),
  joinedDate: Joi.date().iso().optional(),
});

module.exports = { createEmployeeSchema, updateEmployeeSchema };