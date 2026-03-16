const FinanceEntry = require("../models/finance-entry.model");
const PurchaseInvoice = require("../../purchase/models/purchase-invoice.model");
const PurchasePayment = require("../../purchase/models/purchase-payment.model");
const SalesOrder = require("../../commercial/models/sales-order.model");
const CustomerInvoice = require("../../commercial/models/customer-invoice.model");

function roundAmount(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 1000) / 1000;
}

function calcOrderAmount(order) {
  const linesTotal = (order.lines || []).reduce((sum, line) => {
    const quantity = Number(line.quantity || 0);
    const unitPrice = Number(line.unitPrice || 0);
    const discountRate = Math.max(0, Math.min(100, Number(line.discount || 0)));
    return sum + quantity * unitPrice * (1 - discountRate / 100);
  }, 0);

  return roundAmount(linesTotal + Number(order.shippingCost || 0));
}

async function upsertEntry(sourceType, sourceId, payload) {
  return FinanceEntry.findOneAndUpdate(
    { sourceType, sourceId: String(sourceId) },
    {
      $setOnInsert: {
        ...payload,
        sourceType,
        sourceId: String(sourceId),
      },
    },
    { returnDocument: "after", upsert: true }
  );
}

function paymentAccountForMethod(method = "") {
  if (method === "ESPECE") {
    return { code: "531", label: "Cash" };
  }
  return { code: "512", label: "Bank" };
}

function getAccountingLines(entry) {
  const amount = roundAmount(Number(entry.amount || 0));
  const method = entry.metadata?.method || entry.metadata?.paymentMethod || "";
  const cashAccount = paymentAccountForMethod(method);

  switch (entry.entryType) {
    case "PAYABLE_RECORDED":
      return [
        { accountCode: "607", accountName: "Purchases Expense", side: "DEBIT", amount },
        { accountCode: "401", accountName: "Supplier Payables", side: "CREDIT", amount },
      ];
    case "PAYABLE_PAYMENT":
      return [
        { accountCode: "401", accountName: "Supplier Payables", side: "DEBIT", amount },
        { accountCode: cashAccount.code, accountName: cashAccount.label, side: "CREDIT", amount },
      ];
    case "PAYABLE_CREDIT":
      return [
        { accountCode: "401", accountName: "Supplier Payables", side: "DEBIT", amount },
        { accountCode: "609", accountName: "Purchase Credit Notes", side: "CREDIT", amount },
      ];
    case "RECEIVABLE_RECORDED":
      return [
        { accountCode: "411", accountName: "Customer Receivables", side: "DEBIT", amount },
        { accountCode: "419", accountName: "Pending Legalization", side: "CREDIT", amount },
      ];
    case "RECEIVABLE_PAYMENT":
      return [
        { accountCode: cashAccount.code, accountName: cashAccount.label, side: "DEBIT", amount },
        { accountCode: "411", accountName: "Customer Receivables", side: "CREDIT", amount },
      ];
    case "INVOICE_LEGALIZED":
      return [
        { accountCode: "419", accountName: "Pending Legalization", side: "DEBIT", amount },
        { accountCode: "706", accountName: "Sales Revenue", side: "CREDIT", amount },
      ];
    case "REVENUE_RECOGNIZED":
      return [
        { accountCode: "418", accountName: "Delivery Clearing", side: "DEBIT", amount },
        { accountCode: "706", accountName: "Sales Revenue", side: "CREDIT", amount },
      ];
    default:
      return [];
  }
}

function toJournalEntry(entry) {
  return {
    _id: String(entry._id),
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    reference: entry.reference,
    entryType: entry.entryType,
    sourceModule: entry.sourceModule,
    counterpartyName: entry.counterpartyName,
    occurredAt: entry.occurredAt,
    notes: entry.notes,
    currency: entry.currency,
    lines: getAccountingLines(entry),
  };
}

function buildAccountSummaries(journalEntries = []) {
  const accountMap = new Map();

  for (const entry of journalEntries) {
    for (const line of entry.lines) {
      const current = accountMap.get(line.accountCode) || {
        accountCode: line.accountCode,
        accountName: line.accountName,
        debit: 0,
        credit: 0,
        balance: 0,
        entries: [],
      };

      if (line.side === "DEBIT") {
        current.debit = roundAmount(current.debit + line.amount);
        current.balance = roundAmount(current.balance + line.amount);
      } else {
        current.credit = roundAmount(current.credit + line.amount);
        current.balance = roundAmount(current.balance - line.amount);
      }

      current.entries.push({
        journalEntryId: entry._id,
        reference: entry.reference,
        entryType: entry.entryType,
        occurredAt: entry.occurredAt,
        side: line.side,
        amount: line.amount,
        counterpartyName: entry.counterpartyName,
      });
      accountMap.set(line.accountCode, current);
    }
  }

  return Array.from(accountMap.values()).sort((a, b) =>
    a.accountCode.localeCompare(b.accountCode)
  );
}

exports.recordPurchaseInvoiceApproved = async (invoice) => {
  const outstanding = roundAmount(
    Number(invoice.totalTtc || 0) - Number(invoice.creditNoteAmount || 0)
  );

  return upsertEntry("PURCHASE_INVOICE_APPROVED", invoice._id, {
    entryType: "PAYABLE_RECORDED",
    direction: "OUTFLOW",
    sourceModule: "PURCHASE",
    reference: invoice.invoiceNo,
    counterpartyType: "SUPPLIER",
    counterpartyId: String(invoice.supplierId),
    amount: Math.max(0, outstanding),
    status: Math.max(0, outstanding) > 0 ? "OPEN" : "SETTLED",
    occurredAt: invoice.approvedAt || new Date(),
    notes: `Supplier invoice ${invoice.invoiceNo} approved`,
    metadata: {
      purchaseOrderId: String(invoice.purchaseOrderId),
      totalTtc: Number(invoice.totalTtc || 0),
      creditNoteAmount: Number(invoice.creditNoteAmount || 0),
    },
  });
};

exports.recordPurchasePayment = async ({ payment, invoice }) => {
  await upsertEntry("PURCHASE_PAYMENT_CREATED", payment._id, {
    entryType: "PAYABLE_PAYMENT",
    direction: "OUTFLOW",
    sourceModule: "PURCHASE",
    reference: payment.paymentNo,
    counterpartyType: "SUPPLIER",
    counterpartyId: String(payment.supplierId),
    amount: roundAmount(payment.amount),
    status: "SETTLED",
    occurredAt: payment.paymentDate || new Date(),
    notes: `Supplier payment ${payment.paymentNo} registered`,
    metadata: {
      purchaseInvoiceId: String(payment.purchaseInvoiceId),
      method: payment.method,
      invoiceNo: invoice?.invoiceNo || "",
    },
  });

  const payableEntry = await FinanceEntry.findOne({
    sourceType: "PURCHASE_INVOICE_APPROVED",
    sourceId: String(payment.purchaseInvoiceId),
  });

  if (payableEntry) {
    const remaining = roundAmount(
      Number(invoice.totalTtc || 0) -
        Number(invoice.creditNoteAmount || 0) -
        Number(invoice.amountPaid || 0)
    );
    payableEntry.amount = Math.max(0, remaining);
    payableEntry.status = remaining > 0 ? "OPEN" : "SETTLED";
    await payableEntry.save();
  }
};

exports.recordPurchaseReturnCredit = async ({ purchaseReturn, invoice }) => {
  if (Number(purchaseReturn.refundAmount || 0) <= 0) {
    return null;
  }

  await upsertEntry("PURCHASE_RETURN_CREDIT", purchaseReturn._id, {
    entryType: "PAYABLE_CREDIT",
    direction: "NONE",
    sourceModule: "PURCHASE",
    reference: purchaseReturn.returnNo,
    counterpartyType: "SUPPLIER",
    counterpartyId: String(purchaseReturn.supplierId),
    amount: roundAmount(purchaseReturn.refundAmount),
    status: "INFO",
    occurredAt: purchaseReturn.createdAt || new Date(),
    notes: `Supplier return ${purchaseReturn.returnNo} created a credit note`,
    metadata: {
      purchaseInvoiceId: String(purchaseReturn.purchaseInvoiceId),
      invoiceNo: invoice?.invoiceNo || "",
      reason: purchaseReturn.reason,
    },
  });

  const payableEntry = await FinanceEntry.findOne({
    sourceType: "PURCHASE_INVOICE_APPROVED",
    sourceId: String(purchaseReturn.purchaseInvoiceId),
  });

  if (payableEntry) {
    const remaining = roundAmount(
      Number(invoice.totalTtc || 0) -
        Number(invoice.creditNoteAmount || 0) -
        Number(invoice.amountPaid || 0)
    );
    payableEntry.amount = Math.max(0, remaining);
    payableEntry.status = remaining > 0 ? "OPEN" : "SETTLED";
    await payableEntry.save();
  }
};

exports.recordSalesOrderShipped = async (order) => {
  return upsertEntry("SALES_ORDER_SHIPPED", order._id, {
    entryType: "RECEIVABLE_RECORDED",
    direction: "INFLOW",
    sourceModule: "COMMERCIAL",
    reference: order.orderNo,
    counterpartyType: "CUSTOMER",
    counterpartyId: String(order.customerId || ""),
    counterpartyName: order.customerName || "",
    amount: calcOrderAmount(order),
    status: "OPEN",
    occurredAt: order.shippedAt || new Date(),
    notes: `Sales order ${order.orderNo} shipped`,
    metadata: {
      orderStatus: order.status,
      trackingNumber: order.trackingNumber || "",
    },
  });
};

exports.recordSalesOrderDelivered = async (order) => {
  return upsertEntry("SALES_ORDER_DELIVERED", order._id, {
    entryType: "REVENUE_RECOGNIZED",
    direction: "INFLOW",
    sourceModule: "COMMERCIAL",
    reference: order.orderNo,
    counterpartyType: "CUSTOMER",
    counterpartyId: String(order.customerId || ""),
    counterpartyName: order.customerName || "",
    amount: calcOrderAmount(order),
    status: "INFO",
    occurredAt: order.deliveredAt || new Date(),
    notes: `Sales order ${order.orderNo} delivered`,
    metadata: {
      orderStatus: order.status,
    },
  });
};

exports.recordCustomerInvoiceCreated = async (invoice) => {
  await upsertEntry("CUSTOMER_INVOICE_CREATED", invoice._id, {
    entryType: "RECEIVABLE_RECORDED",
    direction: "INFLOW",
    sourceModule: "COMMERCIAL",
    reference: invoice.invoiceNo,
    counterpartyType: "CUSTOMER",
    counterpartyId: String(invoice.customerId || ""),
    counterpartyName: invoice.customerName || "",
    amount: roundAmount(invoice.totalTtc),
    status: invoice.paymentStatus === "PAYEE" ? "SETTLED" : "OPEN",
    occurredAt: invoice.issueDate || new Date(),
    notes: `Customer invoice ${invoice.invoiceNo} issued`,
    metadata: {
      salesOrderId: String(invoice.salesOrderId),
      legalizationStatus: invoice.legalizationStatus,
      paymentStatus: invoice.paymentStatus,
      paymentMethod: invoice.paymentMethod,
    },
  });

  if (invoice.legalizationStatus === "LEGALISEE") {
    await upsertEntry("CUSTOMER_INVOICE_LEGALIZED", invoice._id, {
      entryType: "INVOICE_LEGALIZED",
      direction: "INFLOW",
      sourceModule: "COMMERCIAL",
      reference: invoice.invoiceNo,
      counterpartyType: "CUSTOMER",
      counterpartyId: String(invoice.customerId || ""),
      counterpartyName: invoice.customerName || "",
      amount: roundAmount(invoice.totalTtc),
      status: "INFO",
      occurredAt: invoice.legalizedAt || new Date(),
      notes: `Customer invoice ${invoice.invoiceNo} legalized`,
      metadata: {
        salesOrderId: String(invoice.salesOrderId),
        paymentMethod: invoice.paymentMethod,
      },
    });
  }
};

exports.recordCustomerPayment = async ({ invoice, payment }) => {
  if (!payment || payment.status !== "CLEARED") {
    return null;
  }

  return upsertEntry("CUSTOMER_PAYMENT_RECORDED", payment._id, {
    entryType: "RECEIVABLE_PAYMENT",
    direction: "INFLOW",
    sourceModule: "COMMERCIAL",
    reference: payment.reference || invoice.invoiceNo,
    counterpartyType: "CUSTOMER",
    counterpartyId: String(invoice.customerId || ""),
    counterpartyName: invoice.customerName || "",
    amount: roundAmount(payment.amount),
    status: "SETTLED",
    occurredAt: payment.paidAt || new Date(),
    notes: `Customer payment registered for ${invoice.invoiceNo}`,
    metadata: {
      customerInvoiceId: String(invoice._id),
      invoiceNo: invoice.invoiceNo,
      method: payment.method,
      paymentStatus: payment.status,
    },
  });
};

exports.getDashboard = async () => {
  const [invoices, payments, customerInvoices, entries] = await Promise.all([
    PurchaseInvoice.find().populate("supplierId", "supplierNo name"),
    PurchasePayment.find().populate("supplierId", "supplierNo name"),
    CustomerInvoice.find().sort({ createdAt: -1 }),
    FinanceEntry.find().sort({ occurredAt: -1, createdAt: -1 }).limit(8),
  ]);

  const payableInvoices = invoices.filter((invoice) =>
    ["APPROVED", "PARTIALLY_PAID", "PAID"].includes(invoice.status)
  );

  const totalPayablesOutstanding = roundAmount(
    payableInvoices.reduce(
      (sum, invoice) =>
        sum +
        Math.max(
          0,
          Number(invoice.totalTtc || 0) -
            Number(invoice.creditNoteAmount || 0) -
            Number(invoice.amountPaid || 0)
        ),
      0
    )
  );
  const totalPaidOut = roundAmount(
    payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  );
  const totalReceivables = roundAmount(
    customerInvoices.reduce(
      (sum, invoice) =>
        sum + Math.max(0, Number(invoice.totalTtc || 0) - Number(invoice.amountPaid || 0)),
      0
    )
  );
  const recognizedRevenue = roundAmount(
    customerInvoices
      .filter((invoice) => invoice.legalizationStatus === "LEGALISEE")
      .reduce((sum, invoice) => sum + Number(invoice.totalTtc || 0), 0)
  );
  const overduePayables = payableInvoices.filter((invoice) => {
    const outstanding =
      Number(invoice.totalTtc || 0) -
      Number(invoice.creditNoteAmount || 0) -
      Number(invoice.amountPaid || 0);
    return outstanding > 0 && invoice.dueDate && new Date(invoice.dueDate) < new Date();
  }).length;

  return {
    totals: {
      totalPayablesOutstanding,
      totalPaidOut,
      totalReceivables,
      recognizedRevenue,
      netExpectedCash: roundAmount(totalReceivables - totalPayablesOutstanding),
      overduePayables,
    },
    recentEntries: entries,
  };
};

exports.getReceivables = async () => {
  const invoices = await CustomerInvoice.find()
    .populate("salesOrderId", "orderNo status shippedAt deliveredAt closedAt promisedDate trackingNumber")
    .sort({ issueDate: -1, createdAt: -1 });

  return invoices.map((invoice) => ({
    _id: String(invoice.salesOrderId?._id || invoice.salesOrderId || invoice._id),
    orderNo: invoice.salesOrderId?.orderNo || invoice.invoiceNo,
    customerId: invoice.customerId ? String(invoice.customerId) : "",
    customerName: invoice.customerName,
    status: invoice.salesOrderId?.status || "SHIPPED",
    amount: roundAmount(
      Math.max(0, Number(invoice.totalTtc || 0) - Number(invoice.amountPaid || 0))
    ),
    promisedDate: invoice.salesOrderId?.promisedDate || invoice.dueDate || null,
    shippedAt: invoice.salesOrderId?.shippedAt || null,
    deliveredAt: invoice.salesOrderId?.deliveredAt || null,
    closedAt: invoice.salesOrderId?.closedAt || null,
    trackingNumber: invoice.salesOrderId?.trackingNumber || "",
    invoiceNo: invoice.invoiceNo,
    legalizationStatus: invoice.legalizationStatus,
    paymentStatus: invoice.paymentStatus,
    paymentMethod: invoice.paymentMethod,
  }));
};

exports.getPayables = async () => {
  const invoices = await PurchaseInvoice.find()
    .populate("supplierId", "supplierNo name")
    .sort({ dueDate: 1, createdAt: -1 });

  return invoices
    .filter((invoice) => ["APPROVED", "PARTIALLY_PAID", "PAID"].includes(invoice.status))
    .map((invoice) => {
      const outstanding = roundAmount(
        Math.max(
          0,
          Number(invoice.totalTtc || 0) -
            Number(invoice.creditNoteAmount || 0) -
            Number(invoice.amountPaid || 0)
        )
      );

      return {
        _id: String(invoice._id),
        invoiceNo: invoice.invoiceNo,
        supplierId: invoice.supplierId?._id ? String(invoice.supplierId._id) : String(invoice.supplierId || ""),
        supplierNo: invoice.supplierId?.supplierNo || "",
        supplierName: invoice.supplierId?.name || "Unknown supplier",
        status: invoice.status,
        totalTtc: roundAmount(invoice.totalTtc),
        amountPaid: roundAmount(invoice.amountPaid || 0),
        creditNoteAmount: roundAmount(invoice.creditNoteAmount || 0),
        outstanding,
        legalizationStatus: invoice.legalizationStatus || "NON_LEGALISEE",
        dueDate: invoice.dueDate,
        invoiceDate: invoice.invoiceDate,
        matchingStatus: invoice.matchingStatus,
        isOverdue: outstanding > 0 && invoice.dueDate && new Date(invoice.dueDate) < new Date(),
      };
    });
};

exports.getTreasury = async () => {
  const [payments, payables, receivables, entries] = await Promise.all([
    PurchasePayment.find().sort({ paymentDate: -1 }).populate("supplierId", "supplierNo name"),
    exports.getPayables(),
    exports.getReceivables(),
    FinanceEntry.find().sort({ occurredAt: -1, createdAt: -1 }).limit(20),
  ]);

  const supplierPayments = payments.map((payment) => ({
    _id: String(payment._id),
    reference: payment.paymentNo,
    direction: "OUTFLOW",
    amount: roundAmount(payment.amount),
    method: payment.method,
    date: payment.paymentDate,
    counterparty: payment.supplierId?.name || "Unknown supplier",
  }));

  const expectedCustomerInflows = receivables.map((item) => ({
    _id: item._id,
    reference: item.orderNo,
    direction: "INFLOW",
    amount: item.amount,
    method: "EXPECTED",
    date: item.deliveredAt || item.shippedAt || item.promisedDate || null,
    counterparty: item.customerName,
  }));

  return {
    summary: {
      actualOutflows: roundAmount(
        supplierPayments.reduce((sum, item) => sum + item.amount, 0)
      ),
      expectedInflows: roundAmount(
        expectedCustomerInflows.reduce((sum, item) => sum + item.amount, 0)
      ),
      openPayables: roundAmount(payables.reduce((sum, item) => sum + item.outstanding, 0)),
      openReceivables: roundAmount(receivables.reduce((sum, item) => sum + item.amount, 0)),
      next30DaysSupplierDue: roundAmount(
        payables
          .filter((item) => {
            if (!item.dueDate || item.outstanding <= 0) return false;
            const due = new Date(item.dueDate).getTime();
            const now = Date.now();
            const limit = now + 30 * 24 * 60 * 60 * 1000;
            return due >= now && due <= limit;
          })
          .reduce((sum, item) => sum + item.outstanding, 0)
      ),
    },
    cashMovements: [...supplierPayments, ...expectedCustomerInflows]
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
      .slice(0, 20),
    recentEntries: entries,
  };
};

exports.getEntries = async () => {
  return FinanceEntry.find().sort({ occurredAt: -1, createdAt: -1 }).limit(100);
};

exports.getJournal = async () => {
  const entries = await FinanceEntry.find().sort({ occurredAt: -1, createdAt: -1 }).limit(500);
  return entries.map(toJournalEntry);
};

exports.getAccounts = async () => {
  const journalEntries = await exports.getJournal();
  return buildAccountSummaries(journalEntries);
};

exports.getAccountLedger = async (accountCode) => {
  const accounts = await exports.getAccounts();
  const account = accounts.find((item) => item.accountCode === accountCode);
  if (!account) {
    throw Object.assign(new Error("Account not found"), { statusCode: 404 });
  }
  return account;
};

exports.getReports = async () => {
  const accounts = await exports.getAccounts();
  const getBalance = (code) => accounts.find((item) => item.accountCode === code)?.balance || 0;

  const balanceSheet = {
    assets: {
      receivables: roundAmount(Math.max(0, getBalance("411"))),
      cash: roundAmount(Math.max(0, getBalance("531"))),
      bank: roundAmount(Math.max(0, getBalance("512"))),
    },
    liabilities: {
      supplierPayables: roundAmount(Math.max(0, Math.abs(getBalance("401")))),
      pendingLegalization: roundAmount(Math.max(0, Math.abs(getBalance("419")))),
    },
  };

  balanceSheet.assets.total = roundAmount(
    balanceSheet.assets.receivables + balanceSheet.assets.cash + balanceSheet.assets.bank
  );
  balanceSheet.liabilities.total = roundAmount(
    balanceSheet.liabilities.supplierPayables + balanceSheet.liabilities.pendingLegalization
  );

  const profitAndLoss = {
    revenue: {
      salesRevenue: roundAmount(Math.abs(getBalance("706"))),
      purchaseCredits: roundAmount(Math.abs(getBalance("609"))),
    },
    expenses: {
      purchasesExpense: roundAmount(Math.max(0, getBalance("607"))),
    },
  };
  profitAndLoss.revenue.total = roundAmount(
    profitAndLoss.revenue.salesRevenue + profitAndLoss.revenue.purchaseCredits
  );
  profitAndLoss.expenses.total = roundAmount(profitAndLoss.expenses.purchasesExpense);
  profitAndLoss.netResult = roundAmount(
    profitAndLoss.revenue.total - profitAndLoss.expenses.total
  );

  return {
    balanceSheet,
    profitAndLoss,
    accounts,
  };
};
