const mongoose = require("mongoose");

const inventoryCountSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["PERIODIC", "PERMANENT"],
      required: true,
    },
    status: {
      type: String,
      enum: ["DRAFT", "IN_PROGRESS", "PENDING_APPROVAL", "APPROVED", "REJECTED", "CLOSED"],
      default: "DRAFT",
    },
    startedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("InventoryCount", inventoryCountSchema);