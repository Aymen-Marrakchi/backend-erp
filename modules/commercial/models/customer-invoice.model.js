const mongoose = require("mongoose");

const invoiceLineSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "StockProduct", required: true },
    description: { type: String, default: "", trim: true },
    quantity: { type: Number, required: true, min: 1 },
    inputUnitPrice: { type: Number, required: true, min: 0 },
    baseUnitHt: { type: Number, default: 0, min: 0 },
    subtotalHt: { type: Number, default: 0, min: 0 },
    totalVat: { type: Number, default: 0, min: 0 },
    totalFodec: { type: Number, default: 0, min: 0 },
    totalBeforeStamp: { type: Number, default: 0, min: 0 },
  },
  { _id: true }
);

const paymentSchema = new mongoose.Schema(
  {
    method: { type: String, enum: ["ESPECE", "CHEQUE", "VIREMENT", "KUMBIL"], required: true },
    amount: { type: Number, required: true, min: 0 },
    paidAt: { type: Date, default: Date.now },
    status: { type: String, enum: ["PENDING", "CLEARED", "REJECTED"], default: "CLEARED" },
    reference: { type: String, default: "", trim: true },
    dueDate: { type: Date, default: null },
    installmentIndex: { type: Number, default: null, min: 0 },
    notes: { type: String, default: "", trim: true },
  },
  { _id: true }
);

const installmentSchema = new mongoose.Schema(
  {
    dueDate: { type: Date, required: true },
    plannedAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    paidAt: { type: Date, default: null },
    status: { type: String, enum: ["PENDING", "PARTIAL", "PAID"], default: "PENDING" },
  },
  { _id: true }
);

const reminderSchema = new mongoose.Schema(
  {
    sentAt: { type: Date, default: Date.now },
    channel: { type: String, enum: ["EMAIL", "PHONE", "MANUAL"], default: "MANUAL" },
    note: { type: String, default: "", trim: true },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { _id: true }
);

const customerInvoiceSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, required: true, unique: true, trim: true, uppercase: true },
    salesOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalesOrder",
      required: true,
      unique: true,
      index: true,
    },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null, index: true },
    customerName: { type: String, required: true, trim: true },
    pricingMode: { type: String, enum: ["HT_BASED", "TTC_BASED"], default: "HT_BASED" },
    applyTva: { type: Boolean, default: true },
    applyFodec: { type: Boolean, default: true },
    tvaRate: { type: Number, default: 19, min: 0 },
    fodecRate: { type: Number, default: 1, min: 0 },
    timbreFiscal: { type: Number, default: 1, min: 0 },
    paymentMethod: {
      type: String,
      enum: ["UNSET", "ESPECE", "CHEQUE", "VIREMENT", "KUMBIL"],
      default: "UNSET",
      index: true,
    },
    legalizationStatus: {
      type: String,
      enum: ["NON_LEGALISEE", "LEGALISEE"],
      default: "NON_LEGALISEE",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["NON_PAYEE", "PARTIELLEMENT_PAYEE", "PENDING_CHEQUE", "PAYEE"],
      default: "NON_PAYEE",
      index: true,
    },
    issueDate: { type: Date, default: Date.now },
    dueDate: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    legalizedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    reminderCount: { type: Number, default: 0, min: 0 },
    lastReminderAt: { type: Date, default: null },
    amountPaid: { type: Number, default: 0, min: 0 },
    subtotalHt: { type: Number, default: 0, min: 0 },
    totalVat: { type: Number, default: 0, min: 0 },
    totalFodec: { type: Number, default: 0, min: 0 },
    totalBeforeStamp: { type: Number, default: 0, min: 0 },
    totalTtc: { type: Number, default: 0, min: 0 },
    lines: [invoiceLineSchema],
    installments: [installmentSchema],
    payments: [paymentSchema],
    reminders: [reminderSchema],
    notes: { type: String, default: "", trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CustomerInvoice", customerInvoiceSchema);
