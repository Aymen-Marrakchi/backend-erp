const mongoose = require("mongoose");

const reasonEntrySchema = new mongoose.Schema(
  {
    reason: { type: String, required: true, trim: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    action: {
      type: String,
      enum: ["DEPOT_REASON", "APPROVED", "REJECTED"],
      required: true,
    },
  },
  { timestamps: true, _id: false }
);

const inventoryCountLineSchema = new mongoose.Schema(
  {
    inventoryCountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryCount",
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockProduct",
      required: true,
      index: true,
    },
    systemQuantity: { type: Number, required: true, min: 0 },
    countedQuantity: { type: Number, required: true, min: 0 },
    varianceQuantity: { type: Number, required: true, default: 0 },
    lotRef: { type: String, default: "", trim: true },
    notes: { type: String, default: "", trim: true },

    // Workflow status
    // PENDING:  waiting for depot manager to review
    // REVIEWED: depot manager gave a reason
    // APPROVED: stock manager approved → stock adjusted
    // REJECTED: stock manager rejected → depot must re-reason
    status: {
      type: String,
      enum: ["PENDING", "REVIEWED", "APPROVED", "REJECTED"],
      default: "PENDING",
    },

    // Latest reason from depot manager
    depotReason: { type: String, default: "", trim: true },

    // Full audit trail of reasons + decisions
    reasonHistory: { type: [reasonEntrySchema], default: [] },

    countedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    countedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

inventoryCountLineSchema.pre("validate", function () {
  this.varianceQuantity = this.countedQuantity - this.systemQuantity;
});

module.exports = mongoose.model("InventoryCountLine", inventoryCountLineSchema);
