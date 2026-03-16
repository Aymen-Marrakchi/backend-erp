const CustomerInvoice = require("../models/customer-invoice.model");
const SalesOrder = require("../models/sales-order.model");
const financeService = require("../../finance/services/finance.service");
const purchaseSettingService = require("../../purchase/services/purchase-setting.service");

function roundAmount(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 1000) / 1000;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

async function generateInvoiceNo() {
  const count = await CustomerInvoice.countDocuments();
  return `FC-${String(count + 1).padStart(4, "0")}`;
}

const populateInvoice = (query) =>
  query
    .populate("salesOrderId", "orderNo status promisedDate shippedAt deliveredAt closedAt trackingNumber")
    .populate("customerId", "name email company")
    .populate("lines.productId", "name sku")
    .populate("createdBy", "name email role");

function buildLine(line, config) {
  const quantity = Number(line.quantity || 0);
  const inputUnitPrice = roundAmount(Number(line.unitPrice || 0));
  const tvaRate = config.applyTva ? Number(config.tvaRate || 0) : 0;
  const fodecRate = config.applyFodec ? Number(config.fodecRate || 0) : 0;
  const multiplier = 1 + tvaRate / 100 + fodecRate / 100;
  const baseUnitHt =
    config.pricingMode === "TTC_BASED"
      ? roundAmount(multiplier > 0 ? inputUnitPrice / multiplier : inputUnitPrice)
      : inputUnitPrice;
  const subtotalHt = roundAmount(baseUnitHt * quantity);
  const totalVat = roundAmount(subtotalHt * (tvaRate / 100));
  const totalFodec = roundAmount(subtotalHt * (fodecRate / 100));
  const totalBeforeStamp =
    config.pricingMode === "TTC_BASED"
      ? roundAmount(inputUnitPrice * quantity)
      : roundAmount(subtotalHt + totalVat + totalFodec);

  return {
    productId: line.productId,
    description: line.productId?.name || "",
    quantity,
    inputUnitPrice,
    baseUnitHt,
    subtotalHt,
    totalVat,
    totalFodec,
    totalBeforeStamp,
  };
}

function buildInstallments(totalTtc, plan = {}, issueDate = new Date()) {
  const mode = plan.mode || "CUSTOM";
  const startDate = plan.startDate ? new Date(plan.startDate) : new Date(issueDate);
  let amounts = [];
  let dates = [];

  if (mode === "CUSTOM") {
    amounts = Array.isArray(plan.amounts) ? plan.amounts.map((value) => roundAmount(value)) : [];
    dates = Array.isArray(plan.dates) ? plan.dates.map((value) => new Date(value)) : [];
    if (!amounts.length || amounts.length !== dates.length) {
      throw Object.assign(new Error("Custom Kumbil plan requires matching dates and amounts"), {
        statusCode: 400,
      });
    }
  } else {
    const intervalMap = { DAYS_30: 30, DAYS_60: 60, DAYS_90: 90 };
    const intervalDays = intervalMap[mode];
    const installmentsCount = Math.max(1, Number(plan.installmentsCount || 1));
    const baseAmount = roundAmount(Number(totalTtc || 0) / installmentsCount);
    amounts = Array.from({ length: installmentsCount }, (_, index) =>
      index === installmentsCount - 1
        ? roundAmount(Number(totalTtc || 0) - baseAmount * (installmentsCount - 1))
        : baseAmount
    );
    dates = Array.from({ length: installmentsCount }, (_, index) =>
      addDays(startDate, intervalDays * index)
    );
  }

  const totalPlanned = roundAmount(amounts.reduce((sum, value) => sum + value, 0));
  if (roundAmount(totalPlanned) !== roundAmount(totalTtc)) {
    throw Object.assign(new Error("Kumbil plan amounts must equal invoice total"), {
      statusCode: 400,
    });
  }

  return dates.map((dueDate, index) => ({
    dueDate,
    plannedAmount: amounts[index],
    paidAmount: 0,
    paidAt: null,
    status: "PENDING",
  }));
}

function buildTaxDefaults(settings) {
  return {
    tvaRate: Number(settings?.defaultVatRate ?? 19),
    fodecRate: Number(settings?.defaultFodecRate ?? 1),
    timbreFiscal: roundAmount(Number(settings?.defaultTimbreFiscal ?? 1)),
  };
}

function recalculateInvoice(invoice, config = {}, defaults = buildTaxDefaults()) {
  const normalized = {
    pricingMode: config.pricingMode || invoice.pricingMode || "HT_BASED",
    applyTva: typeof config.applyTva === "boolean" ? config.applyTva : invoice.applyTva !== false,
    applyFodec:
      typeof config.applyFodec === "boolean" ? config.applyFodec : invoice.applyFodec !== false,
    tvaRate: Number(defaults.tvaRate),
    fodecRate: Number(defaults.fodecRate),
    timbreFiscal: roundAmount(Number(defaults.timbreFiscal)),
  };

  const rebuiltLines = invoice.lines.map((line) =>
    buildLine(
      {
        productId: line.productId,
        quantity: line.quantity,
        unitPrice:
          normalized.pricingMode === "TTC_BASED"
            ? line.inputUnitPrice
            : line.baseUnitHt || line.inputUnitPrice,
      },
      normalized
    )
  );

  invoice.pricingMode = normalized.pricingMode;
  invoice.applyTva = normalized.applyTva;
  invoice.applyFodec = normalized.applyFodec;
  invoice.tvaRate = normalized.tvaRate;
  invoice.fodecRate = normalized.fodecRate;
  invoice.timbreFiscal = normalized.timbreFiscal;
  invoice.lines = rebuiltLines;
  invoice.subtotalHt = roundAmount(rebuiltLines.reduce((sum, line) => sum + line.subtotalHt, 0));
  invoice.totalVat = roundAmount(rebuiltLines.reduce((sum, line) => sum + line.totalVat, 0));
  invoice.totalFodec = roundAmount(
    rebuiltLines.reduce((sum, line) => sum + line.totalFodec, 0)
  );
  invoice.totalBeforeStamp = roundAmount(
    rebuiltLines.reduce((sum, line) => sum + line.totalBeforeStamp, 0)
  );
  invoice.totalTtc = roundAmount(invoice.totalBeforeStamp + invoice.timbreFiscal);
}

function updateInvoicePaymentState(invoice) {
  const amountPaid = roundAmount(Number(invoice.amountPaid || 0));
  const totalTtc = roundAmount(Number(invoice.totalTtc || 0));
  const hasPendingCheque = (invoice.payments || []).some(
    (payment) => payment.method === "CHEQUE" && payment.status === "PENDING"
  );

  if (hasPendingCheque) {
    invoice.paymentStatus = "PENDING_CHEQUE";
    invoice.legalizationStatus = "NON_LEGALISEE";
    return;
  }

  if (amountPaid >= totalTtc) {
    invoice.paymentStatus = "PAYEE";
    invoice.legalizationStatus = "LEGALISEE";
    invoice.paidAt = invoice.paidAt || new Date();
    invoice.legalizedAt = invoice.legalizedAt || new Date();
    return;
  }

  invoice.paymentStatus = amountPaid > 0 ? "PARTIELLEMENT_PAYEE" : "NON_PAYEE";
  invoice.legalizationStatus = "NON_LEGALISEE";
}

exports.getAllInvoices = async () => populateInvoice(CustomerInvoice.find()).sort({ createdAt: -1 });
exports.getInvoiceById = async (id) => populateInvoice(CustomerInvoice.findById(id));
exports.getInvoiceByOrderId = async (orderId) =>
  populateInvoice(CustomerInvoice.findOne({ salesOrderId: orderId }));

exports.createOrRefreshFromOrder = async (orderId, payload = {}, userId = null) => {
  const order = await SalesOrder.findById(orderId).populate("lines.productId customerId");
  if (!order) throw Object.assign(new Error("Sales order not found"), { statusCode: 404 });
  const settings = await purchaseSettingService.getSettings();
  const taxDefaults = buildTaxDefaults(settings);

  let invoice = await CustomerInvoice.findOne({ salesOrderId: orderId });
  if (!invoice) {
    invoice = new CustomerInvoice({
      invoiceNo: await generateInvoiceNo(),
      salesOrderId: order._id,
      customerId: order.customerId?._id || order.customerId || null,
      customerName: order.customerName,
      issueDate: new Date(),
      dueDate: order.promisedDate || null,
      createdBy: userId,
      paymentMethod: payload.paymentMethod || "UNSET",
      notes: payload.notes || "",
    });
  } else {
    invoice.customerId = order.customerId?._id || order.customerId || null;
    invoice.customerName = order.customerName;
    invoice.dueDate = order.promisedDate || invoice.dueDate;
  }

  invoice.lines = order.lines.map((line) =>
    buildLine(
      {
        productId: line.productId?._id || line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPrice || 0,
      },
      {
        pricingMode: payload.pricingMode || invoice.pricingMode || "HT_BASED",
        applyTva:
          typeof payload.applyTva === "boolean" ? payload.applyTva : invoice.applyTva !== false,
        applyFodec:
          typeof payload.applyFodec === "boolean" ? payload.applyFodec : invoice.applyFodec !== false,
        ...taxDefaults,
      }
    )
  );

  recalculateInvoice(invoice, payload, taxDefaults);

  if (payload.paymentMethod) invoice.paymentMethod = payload.paymentMethod;
  if (payload.dueDate) invoice.dueDate = new Date(payload.dueDate);

  if (invoice.paymentMethod === "KUMBIL" && payload.installmentPlan) {
    invoice.installments = buildInstallments(invoice.totalTtc, payload.installmentPlan, invoice.issueDate);
  } else if (invoice.paymentMethod !== "KUMBIL") {
    invoice.installments = [];
  }

  updateInvoicePaymentState(invoice);
  await invoice.save();
  await financeService.recordCustomerInvoiceCreated(invoice);
  return exports.getInvoiceById(invoice._id);
};

exports.configureInvoice = async (id, payload = {}) => {
  const invoice = await CustomerInvoice.findById(id);
  if (!invoice) throw Object.assign(new Error("Customer invoice not found"), { statusCode: 404 });
  const settings = await purchaseSettingService.getSettings();
  const taxDefaults = buildTaxDefaults(settings);

  recalculateInvoice(invoice, payload, taxDefaults);
  if (payload.paymentMethod) invoice.paymentMethod = payload.paymentMethod;
  if (payload.dueDate) invoice.dueDate = new Date(payload.dueDate);

  if (invoice.paymentMethod === "KUMBIL") {
    invoice.installments = buildInstallments(
      invoice.totalTtc,
      payload.installmentPlan || {
        mode: "DAYS_30",
        installmentsCount: invoice.installments?.length || 1,
        startDate: invoice.issueDate || new Date(),
      },
      invoice.issueDate || new Date()
    );
  } else {
    invoice.installments = [];
  }

  updateInvoicePaymentState(invoice);
  await invoice.save();
  await financeService.recordCustomerInvoiceCreated(invoice);
  return exports.getInvoiceById(invoice._id);
};

exports.registerPayment = async (id, payload = {}) => {
  const invoice = await CustomerInvoice.findById(id);
  if (!invoice) throw Object.assign(new Error("Customer invoice not found"), { statusCode: 404 });

  const method = payload.method || invoice.paymentMethod;
  if (!method || method === "UNSET") {
    throw Object.assign(new Error("Select a payment method first"), { statusCode: 400 });
  }

  const remaining = roundAmount(Number(invoice.totalTtc || 0) - Number(invoice.amountPaid || 0));
  const amount = roundAmount(Number(payload.amount || 0));
  if (amount <= 0 || amount > remaining) {
    throw Object.assign(new Error(`Payment amount must be between 0 and ${remaining}`), {
      statusCode: 400,
    });
  }

  const paidAt = payload.paidAt ? new Date(payload.paidAt) : new Date();

  if (method === "CHEQUE") {
    invoice.payments.push({
      method,
      amount,
      paidAt,
      status: "PENDING",
      dueDate: addDays(paidAt, 8),
      reference: payload.reference || "",
      notes: payload.notes || "",
    });
    invoice.paymentMethod = method;
    updateInvoicePaymentState(invoice);
    await invoice.save();
    return exports.getInvoiceById(invoice._id);
  }

  if (method === "KUMBIL") {
    if (!invoice.installments.length) {
      throw Object.assign(new Error("Configure a Kumbil installment plan first"), {
        statusCode: 400,
      });
    }

    const installmentIndex =
      payload.installmentIndex != null
        ? Number(payload.installmentIndex)
        : invoice.installments.findIndex((item) => item.status !== "PAID");
    const installment = invoice.installments[installmentIndex];
    if (!installment) throw Object.assign(new Error("Installment not found"), { statusCode: 404 });

    const installmentRemaining = roundAmount(
      Number(installment.plannedAmount || 0) - Number(installment.paidAmount || 0)
    );
    if (amount > installmentRemaining) {
      throw Object.assign(
        new Error(`Installment payment must be between 0 and ${installmentRemaining}`),
        { statusCode: 400 }
      );
    }

    installment.paidAmount = roundAmount(Number(installment.paidAmount || 0) + amount);
    installment.paidAt = paidAt;
    installment.status = installment.paidAmount >= installment.plannedAmount ? "PAID" : "PARTIAL";
    invoice.payments.push({
      method,
      amount,
      paidAt,
      status: "CLEARED",
      installmentIndex,
      reference: payload.reference || "",
      notes: payload.notes || "",
    });
  } else {
    invoice.payments.push({
      method,
      amount,
      paidAt,
      status: "CLEARED",
      reference: payload.reference || "",
      notes: payload.notes || "",
    });
  }

  invoice.paymentMethod = method;
  invoice.amountPaid = roundAmount(Number(invoice.amountPaid || 0) + amount);
  if (invoice.amountPaid >= invoice.totalTtc) invoice.paidAt = paidAt;
  updateInvoicePaymentState(invoice);
  await invoice.save();
  await financeService.recordCustomerInvoiceCreated(invoice);
  const payment = invoice.payments[invoice.payments.length - 1];
  await financeService.recordCustomerPayment({ invoice, payment });
  return exports.getInvoiceById(invoice._id);
};

exports.clearChequePayment = async (id, paymentId) => {
  const invoice = await CustomerInvoice.findById(id);
  if (!invoice) throw Object.assign(new Error("Customer invoice not found"), { statusCode: 404 });

  const payment = invoice.payments.id(paymentId);
  if (!payment || payment.method !== "CHEQUE") {
    throw Object.assign(new Error("Cheque payment not found"), { statusCode: 404 });
  }
  if (payment.status !== "PENDING") {
    throw Object.assign(new Error("Cheque payment is not pending"), { statusCode: 400 });
  }
  if (payment.dueDate && new Date(payment.dueDate) > new Date()) {
    throw Object.assign(new Error("Cheque cannot be legalized before the 8-day delay"), {
      statusCode: 400,
    });
  }

  payment.status = "CLEARED";
  invoice.amountPaid = roundAmount(Number(invoice.amountPaid || 0) + Number(payment.amount || 0));
  if (invoice.amountPaid >= invoice.totalTtc) invoice.paidAt = new Date();
  updateInvoicePaymentState(invoice);
  await invoice.save();
  await financeService.recordCustomerInvoiceCreated(invoice);
  await financeService.recordCustomerPayment({ invoice, payment });
  return exports.getInvoiceById(invoice._id);
};

exports.sendInvoice = async (id, userId = null, payload = {}) => {
  const invoice = await CustomerInvoice.findById(id);
  if (!invoice) throw Object.assign(new Error("Customer invoice not found"), { statusCode: 404 });

  invoice.sentAt = new Date();
  invoice.sentBy = userId;
  if (payload.note) {
    invoice.notes = [invoice.notes, payload.note].filter(Boolean).join("\n");
  }
  await invoice.save();
  return exports.getInvoiceById(invoice._id);
};

exports.sendReminder = async (id, userId = null, payload = {}) => {
  const invoice = await CustomerInvoice.findById(id);
  if (!invoice) throw Object.assign(new Error("Customer invoice not found"), { statusCode: 404 });
  if (!invoice.sentAt) {
    throw Object.assign(new Error("Invoice must be sent before reminders"), { statusCode: 400 });
  }
  if (invoice.paymentStatus === "PAYEE") {
    throw Object.assign(new Error("Paid invoices do not need reminders"), { statusCode: 400 });
  }

  invoice.reminders.push({
    sentAt: new Date(),
    channel: payload.channel || "MANUAL",
    note: payload.note || "",
    sentBy: userId,
  });
  invoice.reminderCount = Number(invoice.reminderCount || 0) + 1;
  invoice.lastReminderAt = new Date();
  await invoice.save();
  return exports.getInvoiceById(invoice._id);
};
