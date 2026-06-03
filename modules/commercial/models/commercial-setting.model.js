const mongoose = require("mongoose");

const commercialSettingSchema = new mongoose.Schema(
  {
    fuelPricePerLiter: { type: Number, default: 0, min: 0 },
    fuelPer10Km: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CommercialSetting", commercialSettingSchema);
