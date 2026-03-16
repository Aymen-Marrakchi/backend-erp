const Tender = require("../models/tender.model");
const PurchaseRequest = require("../models/purchase-request.model");
const Supplier = require("../models/supplier.model");

async function generateTenderNo() {
  const count = await Tender.countDocuments();
  return `AO-${String(count + 1).padStart(4, "0")}`;
}

const populateTender = (query) =>
  query
    .populate({
      path: "purchaseRequestId",
      populate: { path: "productId", select: "name sku" },
    })
    .populate("supplierIds", "supplierNo name category isBlocked")
    .populate("selectedSupplierId", "supplierNo name")
    .populate("offers.supplierId", "supplierNo name")
    .populate("createdBy", "name email role");

exports.getAllTenders = async () =>
  populateTender(Tender.find()).sort({ createdAt: -1 });

exports.getTenderById = async (id) => populateTender(Tender.findById(id));

exports.createTender = async ({
  purchaseRequestId,
  supplierIds = [],
  notes = "",
  createdBy = null,
}) => {
  const purchaseRequest = await PurchaseRequest.findById(purchaseRequestId);
  if (!purchaseRequest) {
    throw Object.assign(new Error("Purchase request not found"), { statusCode: 404 });
  }

  if (purchaseRequest.status !== "APPROVED") {
    throw Object.assign(new Error("Only approved purchase requests can create a tender"), {
      statusCode: 400,
    });
  }

  const existing = await Tender.findOne({
    purchaseRequestId,
    status: { $in: ["DRAFT", "SENT", "COMPARING", "AWARDED"] },
  });
  if (existing) {
    throw Object.assign(new Error("A tender already exists for this purchase request"), {
      statusCode: 400,
    });
  }

  const validSuppliers = await Supplier.find({
    _id: { $in: supplierIds },
    isBlocked: false,
  }).select("_id");

  const tender = await Tender.create({
    tenderNo: await generateTenderNo(),
    purchaseRequestId,
    supplierIds: validSuppliers.map((supplier) => supplier._id),
    notes,
    createdBy,
  });

  return exports.getTenderById(tender._id);
};

exports.sendTender = async (id) => {
  const tender = await Tender.findById(id);
  if (!tender) {
    throw Object.assign(new Error("Tender not found"), { statusCode: 404 });
  }

  if (tender.status !== "DRAFT") {
    throw Object.assign(new Error("Only draft tenders can be sent"), { statusCode: 400 });
  }

  if (!tender.supplierIds.length) {
    throw Object.assign(new Error("Add at least one supplier before sending the tender"), {
      statusCode: 400,
    });
  }

  tender.status = "SENT";
  tender.sentAt = new Date();
  await tender.save();
  return exports.getTenderById(tender._id);
};

exports.addOffer = async (id, { supplierId, amountHt, leadTimeDays, notes = "" }) => {
  const tender = await Tender.findById(id);
  if (!tender) {
    throw Object.assign(new Error("Tender not found"), { statusCode: 404 });
  }

  if (!["SENT", "COMPARING"].includes(tender.status)) {
    throw Object.assign(new Error("Offers can only be added after the tender is sent"), {
      statusCode: 400,
    });
  }

  const supplierAllowed = tender.supplierIds.some((entry) => String(entry) === String(supplierId));
  if (!supplierAllowed) {
    throw Object.assign(new Error("Supplier is not part of this tender"), { statusCode: 400 });
  }

  const existingOffer = tender.offers.find(
    (offer) => String(offer.supplierId) === String(supplierId)
  );

  if (existingOffer) {
    existingOffer.amountHt = amountHt;
    existingOffer.leadTimeDays = leadTimeDays;
    existingOffer.notes = notes;
    existingOffer.submittedAt = new Date();
  } else {
    tender.offers.push({
      supplierId,
      amountHt,
      leadTimeDays,
      notes,
    });
  }

  tender.status = "COMPARING";
  await tender.save();
  return exports.getTenderById(tender._id);
};

exports.selectOffer = async (id, offerId) => {
  const tender = await Tender.findById(id);
  if (!tender) {
    throw Object.assign(new Error("Tender not found"), { statusCode: 404 });
  }

  const offer = tender.offers.id(offerId);
  if (!offer) {
    throw Object.assign(new Error("Offer not found"), { statusCode: 404 });
  }

  tender.offers.forEach((entry) => {
    entry.status = String(entry._id) === String(offerId) ? "SELECTED" : "REJECTED";
  });
  tender.selectedSupplierId = offer.supplierId;
  tender.status = "AWARDED";
  tender.awardedAt = new Date();
  await tender.save();

  return exports.getTenderById(tender._id);
};
