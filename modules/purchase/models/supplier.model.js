const mongoose = require("mongoose");

const supplierSchema = new mongoose.Schema(
  {
    supplierNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    contactName: {
      type: String,
      default: "",
      trim: true,
    },
    email: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    address: {
      type: String,
      default: "",
      trim: true,
    },
    rib: {
      type: String,
      default: "",
      trim: true,
    },
    paymentTerms: {
      type: String,
      default: "",
      trim: true,
    },
    category: {
      type: String,
      default: "GENERAL",
      trim: true,
      uppercase: true,
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    isBlocked: {
      type: Boolean,
      default: false,
      index: true,
    },
    blockedReason: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Supplier", supplierSchema);
