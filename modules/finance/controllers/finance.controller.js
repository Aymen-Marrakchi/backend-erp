const financeService = require("../services/finance.service");

exports.getDashboard = async (req, reply) => {
  try {
    return reply.code(200).send(await financeService.getDashboard());
  } catch (err) {
    return reply.code(err.statusCode || 500).send({ message: err.message });
  }
};

exports.getReceivables = async (req, reply) => {
  try {
    return reply.code(200).send(await financeService.getReceivables());
  } catch (err) {
    return reply.code(err.statusCode || 500).send({ message: err.message });
  }
};

exports.getPayables = async (req, reply) => {
  try {
    return reply.code(200).send(await financeService.getPayables());
  } catch (err) {
    return reply.code(err.statusCode || 500).send({ message: err.message });
  }
};

exports.getTreasury = async (req, reply) => {
  try {
    return reply.code(200).send(await financeService.getTreasury());
  } catch (err) {
    return reply.code(err.statusCode || 500).send({ message: err.message });
  }
};

exports.getEntries = async (req, reply) => {
  try {
    return reply.code(200).send(await financeService.getEntries());
  } catch (err) {
    return reply.code(err.statusCode || 500).send({ message: err.message });
  }
};

exports.getJournal = async (req, reply) => {
  try {
    return reply.code(200).send(await financeService.getJournal());
  } catch (err) {
    return reply.code(err.statusCode || 500).send({ message: err.message });
  }
};

exports.getAccounts = async (req, reply) => {
  try {
    return reply.code(200).send(await financeService.getAccounts());
  } catch (err) {
    return reply.code(err.statusCode || 500).send({ message: err.message });
  }
};

exports.getAccountLedger = async (req, reply) => {
  try {
    return reply.code(200).send(await financeService.getAccountLedger(req.params.code));
  } catch (err) {
    return reply.code(err.statusCode || 500).send({ message: err.message });
  }
};

exports.getReports = async (req, reply) => {
  try {
    return reply.code(200).send(await financeService.getReports());
  } catch (err) {
    return reply.code(err.statusCode || 500).send({ message: err.message });
  }
};
