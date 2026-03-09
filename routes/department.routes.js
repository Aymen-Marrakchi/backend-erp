// routes/department.routes.js

const employeeService = require('../services/employee.service');
const { createEmployeeSchema, updateEmployeeSchema } = require('../schemas/department.schema');
const { protect } = require('../hooks/auth.hook');
const { success, error } = require('../utils/response');

module.exports = function deptRoutes(department) {
  return async function (fastify, opts) {

    // GET /stats
    fastify.get('/stats', { preHandler: [protect], schema: { tags: ["Department"] } }, async (req, reply) => {
      try {
        const data = await employeeService.getStats(department);
        return success(reply, data);
      } catch (err) {
        return error(reply, err.message);
      }
    });

    // GET /employees
    fastify.get('/employees', { preHandler: [protect], schema: { tags: ["Department"] } }, async (req, reply) => {
      try {
        const data = await employeeService.getAllEmployees(department);
        return success(reply, data);
      } catch (err) {
        return error(reply, err.message);
      }
    });

    // POST /employees
    fastify.post('/employees', { preHandler: [protect], schema: { tags: ["Department"] } }, async (req, reply) => {
      try {
        const { error: valErr, value } = createEmployeeSchema.validate(req.body);
        if (valErr) return error(reply, valErr.details[0].message, 400);
        const data = await employeeService.createEmployee(department, value);
        return success(reply, data, 201);
      } catch (err) {
        return error(reply, err.message);
      }
    });

    // PUT /employees/:id
    fastify.put('/employees/:id', { preHandler: [protect], schema: { tags: ["Department"] } }, async (req, reply) => {
      try {
        const { error: valErr, value } = updateEmployeeSchema.validate(req.body);
        if (valErr) return error(reply, valErr.details[0].message, 400);
        const data = await employeeService.updateEmployee(req.params.id, value);
        if (!data) return error(reply, 'Employee not found', 404);
        return success(reply, data);
      } catch (err) {
        return error(reply, err.message);
      }
    });

    // DELETE /employees/:id
    fastify.delete('/employees/:id', { preHandler: [protect], schema: { tags: ["Department"] } }, async (req, reply) => {
      try {
        await employeeService.deleteEmployee(req.params.id);
        return success(reply, { message: 'Employee deleted' });
      } catch (err) {
        return error(reply, err.message);
      }
    });

  };
};
