// controllers/department.controller.js
// Factory that creates identical controllers for HR / Marketing / Sales
// Usage: const ctrl = require("./department.controller")("HR")

const employeeService = require("../services/employee.service");
const { success, error, notFound } = require("../utils/response");

module.exports = (department) => ({
  getAllEmployees: async (req, reply) => {
    try {
      return success(reply, await employeeService.getAllEmployees(department));
    } catch (err) {
      return error(reply, err.message);
    }
  },

  getStats: async (req, reply) => {
    try {
      return success(reply, await employeeService.getStats(department));
    } catch (err) {
      return error(reply, err.message);
    }
  },

  createEmployee: async (req, reply) => {
    try {
      const employee = await employeeService.createEmployee(department, req.body);
      return success(reply, employee, 201);
    } catch (err) {
      return error(reply, err.message);
    }
  },

  updateEmployee: async (req, reply) => {
    try {
      const employee = await employeeService.updateEmployee(req.params.id, req.body);
      if (!employee) return notFound(reply, "Employee not found");
      return success(reply, employee);
    } catch (err) {
      return error(reply, err.message);
    }
  },

  deleteEmployee: async (req, reply) => {
    try {
      const employee = await employeeService.deleteEmployee(req.params.id);
      if (!employee) return notFound(reply, "Employee not found");
      return success(reply, { message: "Employee deleted" });
    } catch (err) {
      return error(reply, err.message);
    }
  },
});