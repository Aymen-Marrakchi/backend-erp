const mongoose = require("mongoose");

const companySettingsSchema = new mongoose.Schema(
  {
    companyName: { type: String, default: "EMM TN", trim: true },
    mf: { type: String, default: "", trim: true },
    rne: { type: String, default: "", trim: true },
    address: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true },
    rib: { type: String, default: "", trim: true },
    iban: { type: String, default: "", trim: true },
    bank: { type: String, default: "", trim: true },
    agence: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CompanySettings", companySettingsSchema);
