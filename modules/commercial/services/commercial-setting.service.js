const CommercialSetting = require("../models/commercial-setting.model");

const getSingleton = async () => {
  let doc = await CommercialSetting.findOne();
  if (!doc) doc = await CommercialSetting.create({});
  return doc;
};

exports.get = async () => getSingleton();

exports.update = async (data) => {
  const doc = await getSingleton();
  if (data.fuelPricePerLiter !== undefined) {
    const val = Number(data.fuelPricePerLiter);
    if (isNaN(val) || val < 0)
      throw Object.assign(new Error("fuelPricePerLiter must be a non-negative number"), { statusCode: 400 });
    doc.fuelPricePerLiter = val;
  }
  if (data.fuelPer10Km !== undefined) {
    const val = Number(data.fuelPer10Km);
    if (isNaN(val) || val < 0)
      throw Object.assign(new Error("fuelPer10Km must be a non-negative number"), { statusCode: 400 });
    doc.fuelPer10Km = val;
  }
  await doc.save();
  return doc;
};
