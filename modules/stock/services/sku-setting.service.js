const SkuSetting = require("../models/sku-setting.model");

exports.getAllSkuSettings = async () => {
  return SkuSetting.find().sort({ createdAt: -1 });
};

exports.getSkuSettingById = async (id) => {
  return SkuSetting.findById(id);
};

exports.createSkuSetting = async ({ skuName, skuMax, createdBy = null }) => {
  const exists = await SkuSetting.findOne({ skuName: skuName.trim() });
  if (exists) {
    throw Object.assign(new Error("SKU setting name already exists"), { statusCode: 400 });
  }

  return SkuSetting.create({
    skuName: skuName.trim(),
    skuMax,
    createdBy,
  });
};

exports.updateSkuSetting = async (id, { skuName, skuMax }) => {
  const existing = await SkuSetting.findById(id);
  if (!existing) {
    throw Object.assign(new Error("SKU setting not found"), { statusCode: 404 });
  }

  if (skuName && skuName.trim() !== existing.skuName) {
    const duplicate = await SkuSetting.findOne({ skuName: skuName.trim() });
    if (duplicate) {
      throw Object.assign(new Error("SKU setting name already exists"), { statusCode: 400 });
    }
  }

  existing.skuName = skuName?.trim() ?? existing.skuName;
  existing.skuMax = skuMax ?? existing.skuMax;

  await existing.save();
  return existing;
};

exports.deleteSkuSetting = async (id) => {
  const existing = await SkuSetting.findById(id);
  if (!existing) {
    throw Object.assign(new Error("SKU setting not found"), { statusCode: 404 });
  }

  await SkuSetting.findByIdAndDelete(id);
  return { message: "SKU setting deleted successfully" };
};