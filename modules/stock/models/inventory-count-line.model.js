const mongoose = require("mongoose");

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
    systemQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    countedQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    varianceQuantity: {
      type: Number,
      required: true,
      default: 0,
    },
    lotRef: {
      type: String,
      default: "",
      trim: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["COUNTED", "VARIANCE_FOUND", "VALIDATED"],
      default: "COUNTED",
    },
    countedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    countedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

inventoryCountLineSchema.pre("validate", function () {
  this.varianceQuantity = this.countedQuantity - this.systemQuantity;
  this.status = this.varianceQuantity === 0 ? "VALIDATED" : "VARIANCE_FOUND";
});

module.exports = mongoose.model("InventoryCountLine", inventoryCountLineSchema);