const FinanceEntry = require("../models/finance-entry.model");
const ManualJournalEntry = require("../models/manual-journal-entry.model");
const CompanySettings = require("../models/company-settings.model");
const PurchaseInvoice = require("../../purchase/models/purchase-invoice.model");
const PurchasePayment = require("../../purchase/models/purchase-payment.model");
const CustomerInvoice = require("../../commercial/models/customer-invoice.model");

function roundAmount(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 1000) / 1000;
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
  if (method === "ESPECE") return { code: "531", label: "Caisse" };
  return { code: "512", label: "Banque" };
}

function getAccountingLines(entry) {
  const amount = roundAmount(Number(entry.amount || 0));
  const method = entry.metadata?.method || entry.metadata?.paymentMethod || "";
  const cashAccount = paymentAccountForMethod(method);
  const htAmount = roundAmount(Number(entry.metadata?.subtotalHt ?? amount));

  const hasSeparatedTax = entry.metadata?.totalVat != null;
  const tvaAmount = hasSeparatedTax ? roundAmount(Number(entry.metadata.totalVat || 0)) : 0;
  const fodecAmount = hasSeparatedTax ? roundAmount(Number(entry.metadata.totalFodec || 0)) : 0;
  const timbreAmount = hasSeparatedTax ? roundAmount(Number(entry.metadata.timbreFiscal || 0)) : 0;
  const legacyTaxAmount = hasSeparatedTax ? 0 : roundAmount(Math.max(0, amount - htAmount));

  switch (entry.entryType) {
    case "INVOICE_ISSUED": {
      const lines = [
        { accountCode: "411", accountName: "Clients", side: "DEBIT", amount },
        { accountCode: "706", accountName: "Ventes de marchandises", side: "CREDIT", amount: htAmount },
      ];
      if (hasSeparatedTax) {
        if (tvaAmount > 0) lines.push({ accountCode: "4457", accountName: "TVA collectée", side: "CREDIT", amount: tvaAmount });
        if (fodecAmount > 0) lines.push({ accountCode: "44581", accountName: "FODEC collecté", side: "CREDIT", amount: fodecAmount });
        if (timbreAmount > 0) lines.push({ accountCode: "4371", accountName: "Timbre fiscal à décaisser", side: "CREDIT", amount: timbreAmount });
      } else if (legacyTaxAmount > 0) {
        lines.push({ accountCode: "4457", accountName: "TVA collectée", side: "CREDIT", amount: legacyTaxAmount });
      }
      return lines;
    }
    case "REGLEMENT_RECU":
      return [
        { accountCode: cashAccount.code, accountName: cashAccount.label, side: "DEBIT", amount },
        { accountCode: "411", accountName: "Clients", side: "CREDIT", amount },
      ];
    case "PAYABLE_RECORDED": {
      const lines = [
        { accountCode: "607", accountName: "Achats de marchandises", side: "DEBIT", amount: htAmount },
      ];
      if (hasSeparatedTax) {
        if (tvaAmount > 0) lines.push({ accountCode: "4456", accountName: "TVA déductible", side: "DEBIT", amount: tvaAmount });
        // FODEC on purchases is NOT recoverable in Tunisia — it is a cost (charge), not a tax credit
        if (fodecAmount > 0) lines.push({ accountCode: "60800", accountName: "FODEC sur achats", side: "DEBIT", amount: fodecAmount });
        if (timbreAmount > 0) lines.push({ accountCode: "6371", accountName: "Timbre fiscal", side: "DEBIT", amount: timbreAmount });
      } else if (legacyTaxAmount > 0) {
        lines.push({ accountCode: "4456", accountName: "TVA déductible", side: "DEBIT", amount: legacyTaxAmount });
      }
      lines.push({ accountCode: "401", accountName: "Fournisseurs", side: "CREDIT", amount });
      return lines;
    }
    case "PAYABLE_PAYMENT": {
      const rsAmount = roundAmount(Number(entry.metadata?.rsAmount || 0));
      const cashOut = roundAmount(amount - rsAmount);
      const lines = [
        { accountCode: "401", accountName: "Fournisseurs", side: "DEBIT", amount },
        { accountCode: cashAccount.code, accountName: cashAccount.label, side: "CREDIT", amount: rsAmount > 0 ? cashOut : amount },
      ];
      if (rsAmount > 0) {
        lines.push({ accountCode: "4028", accountName: "Retenues à la source à décaisser", side: "CREDIT", amount: rsAmount });
      }
      return lines;
    }
    case "PAYABLE_CREDIT":
      return [
        { accountCode: "401", accountName: "Fournisseurs", side: "DEBIT", amount },
        { accountCode: "609", accountName: "Avoirs fournisseurs", side: "CREDIT", amount },
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

function toManualJournalEntry(entry) {
  return {
    _id: String(entry._id),
    sourceType: "MANUAL",
    sourceId: String(entry._id),
    reference: entry.reference,
    entryType: "MANUAL_ENTRY",
    sourceModule: "FINANCE",
    counterpartyName: "",
    occurredAt: entry.occurredAt,
    notes: entry.description || "",
    currency: "TND",
    lines: (entry.lines || []).map((l) => ({
      accountCode: l.accountCode,
      accountName: l.accountName,
      side: l.side,
      amount: roundAmount(Number(l.amount || 0)),
    })),
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

// ─── Recording Functions ──────────────────────────────────────────────────────

exports.recordInvoiceIssued = async (invoice) => {
  const totalTtc = roundAmount(Number(invoice.totalTtc || 0));
  const subtotalHt = roundAmount(Number(invoice.subtotalHt || 0));
  const totalVat = roundAmount(Number(invoice.totalVat || 0));
  const totalFodec = roundAmount(Number(invoice.totalFodec || 0));
  const timbreFiscal = roundAmount(Number(invoice.timbreFiscal || 0));

  return upsertEntry("CUSTOMER_INVOICE_FINALIZED", invoice._id, {
    entryType: "INVOICE_ISSUED",
    direction: "INFLOW",
    sourceModule: "COMMERCIAL",
    reference: invoice.invoiceNo,
    counterpartyType: "CUSTOMER",
    counterpartyId: String(invoice.customerId || ""),
    counterpartyName: invoice.customerName || "",
    amount: totalTtc,
    status: "OPEN",
    occurredAt: invoice.finalizedAt || invoice.issueDate || new Date(),
    notes: `Facture ${invoice.invoiceNo} émise`,
    metadata: {
      subtotalHt,
      totalVat,
      totalFodec,
      timbreFiscal,
      salesOrderId: String(invoice.salesOrderId || ""),
    },
  });
};

exports.recordReglement = async ({ invoice, payment }) => {
  if (!payment || payment.status !== "CLEARED") return null;

  await upsertEntry("CUSTOMER_REGLEMENT", payment._id, {
    entryType: "REGLEMENT_RECU",
    direction: "INFLOW",
    sourceModule: "COMMERCIAL",
    reference: payment.reference || invoice.invoiceNo,
    counterpartyType: "CUSTOMER",
    counterpartyId: String(invoice.customerId || ""),
    counterpartyName: invoice.customerName || "",
    amount: roundAmount(payment.amount),
    status: "SETTLED",
    occurredAt: payment.paidAt || new Date(),
    notes: `Règlement reçu pour ${invoice.invoiceNo}`,
    metadata: {
      customerInvoiceId: String(invoice._id),
      invoiceNo: invoice.invoiceNo,
      method: payment.method,
    },
  });

  const invoiceEntry = await FinanceEntry.findOne({
    sourceType: "CUSTOMER_INVOICE_FINALIZED",
    sourceId: String(invoice._id),
  });
  if (invoiceEntry) {
    const remaining = roundAmount(
      Number(invoice.totalTtc || 0) - Number(invoice.amountPaid || 0)
    );
    invoiceEntry.amount = Math.max(0, remaining);
    invoiceEntry.status = remaining <= 0 ? "SETTLED" : "OPEN";
    await invoiceEntry.save();
  }
};

exports.recordPurchaseInvoiceApproved = async (invoice) => {
  const outstanding = roundAmount(
    Number(invoice.totalTtc || 0) - Number(invoice.creditNoteAmount || 0)
  );
  const subtotalHt = roundAmount(Number(invoice.subtotalHt || 0));
  const totalVat = roundAmount(Number(invoice.totalVat || 0));
  const totalFodec = roundAmount(Number(invoice.totalFodec || 0));
  const timbreFiscal = roundAmount(Number(invoice.timbreFiscal || 0));

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
    notes: `Facture fournisseur ${invoice.invoiceNo} approuvée`,
    metadata: {
      subtotalHt,
      totalVat,
      totalFodec,
      timbreFiscal,
      purchaseOrderId: String(invoice.purchaseOrderId),
      totalTtc: Number(invoice.totalTtc || 0),
      creditNoteAmount: Number(invoice.creditNoteAmount || 0),
    },
  });
};

exports.recordPurchasePayment = async ({ payment, invoice }) => {
  const rsAmount = roundAmount(Number(payment.rsAmount || 0));

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
    notes: `Paiement fournisseur ${payment.paymentNo}`,
    metadata: {
      purchaseInvoiceId: String(payment.purchaseInvoiceId),
      method: payment.method,
      invoiceNo: invoice?.invoiceNo || "",
      rsAmount,
      rsRate: Number(payment.rsRate || 0),
      rsType: payment.rsType || "",
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
  if (Number(purchaseReturn.refundAmount || 0) <= 0) return null;

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
    notes: `Avoir fournisseur ${purchaseReturn.returnNo}`,
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

// ─── TEJ ──────────────────────────────────────────────────────────────────────

exports.updateInvoiceTej = async (invoiceId, payload) => {
  const invoice = await CustomerInvoice.findById(invoiceId);
  if (!invoice) throw Object.assign(new Error("Facture introuvable"), { statusCode: 404 });
  if (invoice.documentStage !== "INVOICE")
    throw Object.assign(new Error("Seules les factures finalisées acceptent une référence TEJ"), { statusCode: 400 });

  const { tejReference, tejStatus, tejQrData } = payload;
  if (tejReference !== undefined) invoice.tejReference = String(tejReference).trim();
  if (tejStatus !== undefined) invoice.tejStatus = tejStatus;
  if (tejQrData !== undefined) invoice.tejQrData = String(tejQrData).trim();

  await invoice.save();
  return invoice;
};

// ─── Manual Journal Entries ───────────────────────────────────────────────────

exports.createManualEntry = async (body, userId) => {
  const { reference, description, occurredAt, lines } = body;
  if (!reference) throw Object.assign(new Error("Référence obligatoire"), { statusCode: 400 });
  if (!lines || lines.length < 2)
    throw Object.assign(new Error("Au moins 2 lignes sont requises"), { statusCode: 400 });

  const totalDebit = roundAmount(
    lines.filter((l) => l.side === "DEBIT").reduce((sum, l) => sum + Number(l.amount || 0), 0)
  );
  const totalCredit = roundAmount(
    lines.filter((l) => l.side === "CREDIT").reduce((sum, l) => sum + Number(l.amount || 0), 0)
  );

  if (Math.abs(totalDebit - totalCredit) > 0.001)
    throw Object.assign(new Error(`Débit (${totalDebit}) ≠ Crédit (${totalCredit})`), { statusCode: 400 });

  const entry = new ManualJournalEntry({
    reference: String(reference).trim().toUpperCase(),
    description: String(description || "").trim(),
    occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
    lines: lines.map((l) => ({
      accountCode: String(l.accountCode).trim(),
      accountName: String(l.accountName).trim(),
      side: l.side,
      amount: roundAmount(Number(l.amount)),
    })),
    createdBy: userId || null,
  });

  await entry.save();
  return entry;
};

exports.getManualEntries = async () =>
  ManualJournalEntry.find().sort({ occurredAt: -1, createdAt: -1 }).limit(500);

exports.deleteManualEntry = async (id) => {
  const entry = await ManualJournalEntry.findById(id);
  if (!entry) throw Object.assign(new Error("Écriture introuvable"), { statusCode: 404 });
  await entry.deleteOne();
};

// ─── RS ───────────────────────────────────────────────────────────────────────

exports.getRsPayments = async () => {
  const payments = await PurchasePayment.find({ rsAmount: { $gt: 0 } })
    .populate("supplierId", "supplierNo name")
    .populate("purchaseInvoiceId", "invoiceNo")
    .sort({ paymentDate: -1 });

  const totalRs = roundAmount(payments.reduce((sum, p) => sum + Number(p.rsAmount || 0), 0));

  return {
    payments: payments.map((p) => ({
      _id: String(p._id),
      paymentNo: p.paymentNo,
      supplierName: p.supplierId?.name || "Fournisseur inconnu",
      supplierNo: p.supplierId?.supplierNo || "",
      invoiceNo: p.purchaseInvoiceId?.invoiceNo || "",
      amount: roundAmount(p.amount),
      rsRate: p.rsRate || 0,
      rsAmount: roundAmount(p.rsAmount || 0),
      rsType: p.rsType || "",
      method: p.method,
      paymentDate: p.paymentDate,
    })),
    totalRs,
  };
};

// ─── Query Functions ──────────────────────────────────────────────────────────

exports.getDashboard = async () => {
  const [purchaseInvoices, purchasePayments, customerInvoices, entries] = await Promise.all([
    PurchaseInvoice.find().populate("supplierId", "supplierNo name"),
    PurchasePayment.find().populate("supplierId", "supplierNo name"),
    CustomerInvoice.find({ documentStage: "INVOICE" }).sort({ createdAt: -1 }),
    FinanceEntry.find().sort({ occurredAt: -1, createdAt: -1 }).limit(8),
  ]);

  const payableInvoices = purchaseInvoices.filter((inv) =>
    ["APPROVED", "PARTIALLY_PAID", "PAID"].includes(inv.status)
  );

  const totalPayablesOutstanding = roundAmount(
    payableInvoices.reduce(
      (sum, inv) =>
        sum +
        Math.max(
          0,
          Number(inv.totalTtc || 0) -
            Number(inv.creditNoteAmount || 0) -
            Number(inv.amountPaid || 0)
        ),
      0
    )
  );
  const totalPaidOut = roundAmount(
    purchasePayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
  );
  const totalReceivables = roundAmount(
    customerInvoices.reduce(
      (sum, inv) => sum + Math.max(0, Number(inv.totalTtc || 0) - Number(inv.amountPaid || 0)),
      0
    )
  );
  const recognizedRevenue = roundAmount(
    customerInvoices.reduce((sum, inv) => sum + Number(inv.totalTtc || 0), 0)
  );
  const overduePayables = payableInvoices.filter((inv) => {
    const outstanding =
      Number(inv.totalTtc || 0) -
      Number(inv.creditNoteAmount || 0) -
      Number(inv.amountPaid || 0);
    return outstanding > 0 && inv.dueDate && new Date(inv.dueDate) < new Date();
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
  const invoices = await CustomerInvoice.find({ documentStage: "INVOICE" })
    .populate("salesOrderId", "orderNo status shippedAt deliveredAt closedAt promisedDate trackingNumber")
    .sort({ issueDate: -1, createdAt: -1 });

  return invoices.map((invoice) => ({
    _id: String(invoice._id),
    orderNo: invoice.salesOrderId?.orderNo || invoice.invoiceNo,
    customerId: invoice.customerId ? String(invoice.customerId) : "",
    customerName: invoice.customerName,
    status: invoice.salesOrderId?.status || "INVOICED",
    amount: roundAmount(
      Math.max(0, Number(invoice.totalTtc || 0) - Number(invoice.amountPaid || 0))
    ),
    totalTtc: roundAmount(Number(invoice.totalTtc || 0)),
    amountPaid: roundAmount(Number(invoice.amountPaid || 0)),
    promisedDate: invoice.salesOrderId?.promisedDate || invoice.dueDate || null,
    shippedAt: invoice.salesOrderId?.shippedAt || null,
    deliveredAt: invoice.salesOrderId?.deliveredAt || null,
    closedAt: invoice.salesOrderId?.closedAt || null,
    trackingNumber: invoice.salesOrderId?.trackingNumber || "",
    invoiceNo: invoice.invoiceNo,
    paymentStatus: invoice.paymentStatus,
    paymentMethod: invoice.paymentMethod,
    dueDate: invoice.dueDate || null,
    finalizedAt: invoice.finalizedAt || null,
  }));
};

exports.getPayables = async () => {
  const invoices = await PurchaseInvoice.find()
    .populate("supplierId", "supplierNo name")
    .sort({ dueDate: 1, createdAt: -1 });

  return invoices
    .filter((inv) => ["APPROVED", "PARTIALLY_PAID", "PAID"].includes(inv.status))
    .map((inv) => {
      const outstanding = roundAmount(
        Math.max(
          0,
          Number(inv.totalTtc || 0) -
            Number(inv.creditNoteAmount || 0) -
            Number(inv.amountPaid || 0)
        )
      );
      return {
        _id: String(inv._id),
        invoiceNo: inv.invoiceNo,
        supplierId: inv.supplierId?._id
          ? String(inv.supplierId._id)
          : String(inv.supplierId || ""),
        supplierNo: inv.supplierId?.supplierNo || "",
        supplierName: inv.supplierId?.name || "Fournisseur inconnu",
        status: inv.status,
        totalTtc: roundAmount(inv.totalTtc),
        amountPaid: roundAmount(inv.amountPaid || 0),
        creditNoteAmount: roundAmount(inv.creditNoteAmount || 0),
        outstanding,
        dueDate: inv.dueDate,
        invoiceDate: inv.invoiceDate,
        matchingStatus: inv.matchingStatus,
        isOverdue:
          outstanding > 0 && inv.dueDate && new Date(inv.dueDate) < new Date(),
      };
    });
};

exports.getTreasury = async () => {
  const [payments, payables, receivables, entries] = await Promise.all([
    PurchasePayment.find()
      .sort({ paymentDate: -1 })
      .populate("supplierId", "supplierNo name"),
    exports.getPayables(),
    exports.getReceivables(),
    FinanceEntry.find().sort({ occurredAt: -1, createdAt: -1 }).limit(20),
  ]);

  const supplierPayments = payments.map((p) => ({
    _id: String(p._id),
    reference: p.paymentNo,
    direction: "OUTFLOW",
    amount: roundAmount(p.amount),
    method: p.method,
    date: p.paymentDate,
    counterparty: p.supplierId?.name || "Fournisseur inconnu",
  }));

  const expectedCustomerInflows = receivables.map((item) => ({
    _id: item._id,
    reference: item.invoiceNo,
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
            return due >= now && due <= now + 30 * 24 * 60 * 60 * 1000;
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

exports.getEntries = async () =>
  FinanceEntry.find().sort({ occurredAt: -1, createdAt: -1 }).limit(100);

exports.getJournal = async () => {
  const [autoEntries, manualEntries] = await Promise.all([
    FinanceEntry.find().sort({ occurredAt: -1, createdAt: -1 }).limit(500),
    ManualJournalEntry.find().sort({ occurredAt: -1, createdAt: -1 }).limit(500),
  ]);
  return [
    ...autoEntries.map(toJournalEntry),
    ...manualEntries.map(toManualJournalEntry),
  ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
};

exports.getAccounts = async () => {
  const journalEntries = await exports.getJournal();
  return buildAccountSummaries(journalEntries);
};

exports.getAccountLedger = async (accountCode) => {
  const accounts = await exports.getAccounts();
  const account = accounts.find((item) => item.accountCode === accountCode);
  if (!account) throw Object.assign(new Error("Compte introuvable"), { statusCode: 404 });
  return account;
};

exports.getReports = async () => {
  const accounts = await exports.getAccounts();
  const getBalance = (code) =>
    accounts.find((item) => item.accountCode === code)?.balance || 0;

  const balanceSheet = {
    assets: {
      receivables: roundAmount(Math.max(0, getBalance("411"))),
      cash: roundAmount(Math.max(0, getBalance("531"))),
      bank: roundAmount(Math.max(0, getBalance("512"))),
    },
    liabilities: {
      supplierPayables: roundAmount(Math.max(0, Math.abs(getBalance("401")))),
      tvaCollectee: roundAmount(Math.max(0, Math.abs(getBalance("4457")))),
      fodecCollecte: roundAmount(Math.max(0, Math.abs(getBalance("44581")))),
      timbreADecaisser: roundAmount(Math.max(0, Math.abs(getBalance("4371")))),
      rsADecaisser: roundAmount(Math.max(0, Math.abs(getBalance("4028")))),
    },
  };
  balanceSheet.assets.total = roundAmount(
    balanceSheet.assets.receivables + balanceSheet.assets.cash + balanceSheet.assets.bank
  );
  balanceSheet.liabilities.total = roundAmount(
    balanceSheet.liabilities.supplierPayables +
      balanceSheet.liabilities.tvaCollectee +
      balanceSheet.liabilities.fodecCollecte +
      balanceSheet.liabilities.timbreADecaisser +
      balanceSheet.liabilities.rsADecaisser
  );

  const profitAndLoss = {
    revenue: {
      salesRevenue: roundAmount(Math.abs(getBalance("706"))),
      purchaseCredits: roundAmount(Math.abs(getBalance("609"))),
    },
    expenses: {
      purchasesExpense: roundAmount(Math.max(0, getBalance("607"))),
      fodecAchats: roundAmount(Math.max(0, getBalance("60800"))),
      timbreFiscal: roundAmount(Math.max(0, getBalance("6371"))),
    },
    tax: {
      tvaCollectee: roundAmount(Math.abs(getBalance("4457"))),
      tvaDeductible: roundAmount(Math.max(0, getBalance("4456"))),
      tvaNet: roundAmount(
        Math.abs(getBalance("4457")) - Math.max(0, getBalance("4456"))
      ),
      fodecCollecte: roundAmount(Math.abs(getBalance("44581"))),
      timbreADecaisser: roundAmount(Math.abs(getBalance("4371"))),
      rsADecaisser: roundAmount(Math.abs(getBalance("4028"))),
    },
  };
  profitAndLoss.revenue.total = roundAmount(
    profitAndLoss.revenue.salesRevenue + profitAndLoss.revenue.purchaseCredits
  );
  profitAndLoss.expenses.total = roundAmount(
    profitAndLoss.expenses.purchasesExpense +
      profitAndLoss.expenses.fodecAchats +
      profitAndLoss.expenses.timbreFiscal
  );
  profitAndLoss.netResult = roundAmount(
    profitAndLoss.revenue.total - profitAndLoss.expenses.total
  );

  return { balanceSheet, profitAndLoss, accounts };
};

exports.getTvaDeclaration = async (year, month) => {
  const start = new Date(Number(year), Number(month) - 1, 1);
  const end = new Date(Number(year), Number(month), 1);
  const dateFilter = { occurredAt: { $gte: start, $lt: end } };

  const [autoEntries, manualEntries] = await Promise.all([
    FinanceEntry.find(dateFilter),
    ManualJournalEntry.find(dateFilter),
  ]);

  const journalEntries = [
    ...autoEntries.map(toJournalEntry),
    ...manualEntries.map(toManualJournalEntry),
  ];

  const accounts = buildAccountSummaries(journalEntries);
  const getBalance = (code) => accounts.find((a) => a.accountCode === code)?.balance || 0;

  const tvaCollectee = roundAmount(Math.abs(getBalance("4457")));
  const tvaDeductible = roundAmount(Math.max(0, getBalance("4456")));

  return {
    period: { year: Number(year), month: Number(month) },
    tvaCollectee,
    tvaDeductible,
    tvaNet: roundAmount(tvaCollectee - tvaDeductible),
    fodecCollecte: roundAmount(Math.abs(getBalance("44581"))),
    timbreADecaisser: roundAmount(Math.abs(getBalance("4371"))),
    rsADecaisser: roundAmount(Math.abs(getBalance("4028"))),
    salesRevenue: roundAmount(Math.abs(getBalance("706"))),
    purchasesHt: roundAmount(Math.max(0, getBalance("607"))),
  };
};

// ─── Company Settings ─────────────────────────────────────────────────────────

// ─── Calendar ─────────────────────────────────────────────────────────────────

exports.getCalendar = async (year, month) => {
  const start = new Date(Number(year), Number(month) - 1, 1);
  const end = new Date(Number(year), Number(month), 1);

  const entries = await FinanceEntry.find({
    occurredAt: { $gte: start, $lt: end },
    entryType: { $in: ["REGLEMENT_RECU", "PAYABLE_PAYMENT"] },
  });

  const days = {};

  for (const entry of entries) {
    const d = new Date(entry.occurredAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!days[key]) {
      days[key] = { inflows: 0, outflows: 0, net: 0, inflowCount: 0, outflowCount: 0 };
    }
    if (entry.entryType === "REGLEMENT_RECU") {
      days[key].inflows = roundAmount(days[key].inflows + Number(entry.amount || 0));
      days[key].inflowCount++;
    } else {
      days[key].outflows = roundAmount(days[key].outflows + Number(entry.amount || 0));
      days[key].outflowCount++;
    }
  }

  for (const key of Object.keys(days)) {
    days[key].net = roundAmount(days[key].inflows - days[key].outflows);
  }

  return { year: Number(year), month: Number(month), days };
};

exports.getCompanySettings = async () => {
  let settings = await CompanySettings.findOne();
  if (!settings) {
    settings = await CompanySettings.create({
      companyName: "EMM TN",
      address: "Route de Gabès Km 6, Sfax, Tunisie",
      phone: "+(216) 98 241 790",
      email: "info@emmtn.com",
    });
  }
  return settings;
};

exports.updateCompanySettings = async (payload) => {
  let settings = await CompanySettings.findOne();
  if (!settings) settings = new CompanySettings();
  const fields = ["companyName", "mf", "rne", "address", "phone", "email", "rib", "iban", "bank", "agence"];
  for (const field of fields) {
    if (payload[field] !== undefined) settings[field] = String(payload[field]).trim();
  }
  await settings.save();
  return settings;
};
