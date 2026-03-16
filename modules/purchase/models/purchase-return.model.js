const mongoose = require("mongoose");

const purchaseReturnLineSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockProduct",
      required: true,
    },
    purchaseReceiptLineId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    lotRef: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: true }
);

const purchaseReturnSchema = new mongoose.Schema(
  {
    returnNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
      index: true,
    },
    purchaseInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseInvoice",
      required: true,
      index: true,
    },
    purchaseReceiptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseReceipt",
      required: true,
      index: true,
    },
    reason: {
      type: String,
      enum: ["DEFECT", "DELIVERY_ERROR", "NON_CONFORMITY"],
      required: true,
    },
    lines: [purchaseReturnLineSchema],
    refundAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["CREATED", "REFUNDED", "REPLACED", "CLOSED"],
      default: "CREATED",
      index: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PurchaseReturn", purchaseReturnSchema);
