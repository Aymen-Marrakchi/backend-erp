const PurchaseOrder = require("../models/purchase-order.model");
const PurchaseRequest = require("../models/purchase-request.model");
const Tender = require("../models/tender.model");
const Supplier = require("../models/supplier.model");

async function generatePurchaseOrderNo() {
  const count = await PurchaseOrder.countDocuments();
  return `BC-${String(count + 1).padStart(4, "0")}`;
}

function computeTotals(lines) {
  const subtotalHt = lines.reduce((sum, line) => {
    const lineHt = line.quantity * line.unitPrice * (1 - (line.discountRate || 0) / 100);
    return sum + lineHt;
  }, 0);

  const totalVat = lines.reduce((sum, line) => {
    const lineHt = line.quantity * line.unitPrice * (1 - (line.discountRate || 0) / 100);
    return sum + lineHt * ((line.vatRate || 0) / 100);
  }, 0);

  return {
    subtotalHt,
    totalVat,
    totalTtc: subtotalHt + totalVat,
  };
}

const populatePurchaseOrder = (query) =>
  query
    .populate({
      path: "purchaseRequestId",
      populate: { path: "productId", select: "name sku" },
    })
    .populate({
      path: "tenderId",
      populate: [
        { path: "purchaseRequestId", populate: { path: "productId", select: "name sku" } },
        { path: "selectedSupplierId", select: "supplierNo name" },
      ],
    })
    .populate("supplierId", "supplierNo name paymentTerms category")
    .populate("lines.productId", "name sku")
    .populate("createdBy", "name email role");

exports.getAllPurchaseOrders = async () =>
  populatePurchaseOrder(PurchaseOrder.find()).sort({ createdAt: -1 });

exports.getPurchaseOrderById = async (id) => populatePurchaseOrder(PurchaseOrder.findById(id));

exports.createPurchaseOrder = async ({
  purchaseRequestId = null,
  tenderId = null,
  supplierId = null,
  lines = [],
  deliveryTerms = "",
  paymentTerms = "",
  createdBy = null,
}) => {
  let resolvedSupplierId = supplierId;
  let resolvedLines = lines;

  if (purchaseRequestId) {
    const purchaseRequest = await PurchaseRequest.findById(purchaseRequestId).populate("productId");
    if (!purchaseRequest) {
      throw Object.assign(new Error("Purchase request not found"), { statusCode: 404 });
    }
    if (purchaseRequest.status !== "APPROVED") {
      throw Object.assign(new Error("Only approved purchase requests can generate a purchase order"), {
        statusCode: 400,
      });
    }
    if (!resolvedLines.length) {
      resolvedLines = [
        {
          productId: purchaseRequest.productId._id,
          description: purchaseRequest.reason,
          quantity: purchaseRequest.requestedQuantity,
          unitPrice: Number(purchaseRequest.productId?.purchasePrice || 0),
          discountRate: 0,
          vatRate: 19,
        },
      ];
    }
  }

  if (tenderId) {
    const tender = await Tender.findById(tenderId)
      .populate({
        path: "purchaseRequestId",
        populate: { path: "productId", select: "name sku" },
      })
      .populate("selectedSupplierId", "supplierNo name");

    if (!tender) {
      throw Object.assign(new Error("Tender not found"), { statusCode: 404 });
    }
    if (tender.status !== "AWARDED" || !tender.selectedSupplierId) {
      throw Object.assign(new Error("Only awarded tenders can generate a purchase order"), {
        statusCode: 400,
      });
    }

    resolvedSupplierId = tender.selectedSupplierId._id;

    if (!resolvedLines.length) {
      const selectedOffer = tender.offers.find((offer) => offer.status === "SELECTED");
      const qty = tender.purchaseRequestId?.requestedQuantity || 1;
      resolvedLines = [
        {
          productId: tender.purchaseRequestId.productId._id,
          description: tender.purchaseRequestId.reason,
          quantity: qty,
          unitPrice: selectedOffer ? selectedOffer.amountHt / qty : 0,
          discountRate: 0,
          vatRate: 19,
        },
      ];
    }
  }

  if (!resolvedSupplierId) {
    throw Object.assign(new Error("Supplier is required"), { statusCode: 400 });
  }

  const supplier = await Supplier.findById(resolvedSupplierId);
  if (!supplier) {
    throw Object.assign(new Error("Supplier not found"), { statusCode: 404 });
  }
  if (supplier.isBlocked) {
    throw Object.assign(new Error("Blocked suppliers cannot receive purchase orders"), {
      statusCode: 400,
    });
  }
  if (!resolvedLines.length) {
    throw Object.assign(new Error("Add at least one purchase order line"), {
      statusCode: 400,
    });
  }

  const totals = computeTotals(resolvedLines);

  const purchaseOrder = await PurchaseOrder.create({
    orderNo: await generatePurchaseOrderNo(),
    purchaseRequestId,
    tenderId,
    supplierId: resolvedSupplierId,
    lines: resolvedLines,
    deliveryTerms,
    paymentTerms: paymentTerms || supplier.paymentTerms || "",
    ...totals,
    createdBy,
  });

  return exports.getPurchaseOrderById(purchaseOrder._id);
};

exports.updatePurchaseOrderStatus = async (id, status) => {
  const purchaseOrder = await PurchaseOrder.findById(id);
  if (!purchaseOrder) {
    throw Object.assign(new Error("Purchase order not found"), { statusCode: 404 });
  }

  const currentStatus = purchaseOrder.status;
  const allowedTransitions = {
    DRAFT: ["VALIDATED"],
    VALIDATED: ["SENT"],
    SENT: [],
    RECEIVED: ["CLOSED"],
    CLOSED: [],
  };

  if (!allowedTransitions[currentStatus]?.includes(status)) {
    if (currentStatus === "SENT" && status === "RECEIVED") {
      throw Object.assign(
        new Error("Use a purchase receipt to mark a purchase order as received"),
        { statusCode: 400 }
      );
    }
    throw Object.assign(
      new Error(`Cannot move purchase order from ${currentStatus} to ${status}`),
      { statusCode: 400 }
    );
  }

  purchaseOrder.status = status;
  if (status === "VALIDATED") {
    purchaseOrder.validationLevel += 1;
    purchaseOrder.validatedAt = new Date();
  }
  if (status === "SENT") {
    purchaseOrder.sentAt = new Date();
  }
  if (status === "RECEIVED") {
    purchaseOrder.receivedAt = new Date();
  }
  if (status === "CLOSED") {
    purchaseOrder.closedAt = new Date();
  }

  await purchaseOrder.save();
  return exports.getPurchaseOrderById(purchaseOrder._id);
};
