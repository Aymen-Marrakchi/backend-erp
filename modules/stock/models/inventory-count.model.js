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
      // IN_PROGRESS: stock manager adding lines
      // SENT_TO_DEPOT: sent to depot manager for review
      // PENDING_APPROVAL: depot submitted reasons, waiting stock manager
      // CLOSED: all lines approved, stock adjusted
      enum: ["IN_PROGRESS", "SENT_TO_DEPOT", "PENDING_APPROVAL", "CLOSED"],
      default: "IN_PROGRESS",
    },
    depotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Depot",
      default: null,
      index: true,
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