const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema(
  {
    matricule: { type: String, required: true, unique: true, trim: true, uppercase: true },
    capacityKg: { type: Number, required: true, min: 0 },
    capacityPackets: { type: Number, required: true, min: 0 },
    purchaseDate: { type: Date, required: true },
    lifeExpectancyDays: { type: Number, default: 3650, min: 1 },
    durabilityPercent: { type: Number, default: 100, min: 0, max: 100 },
    notes: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Vehicle", vehicleSchema);
