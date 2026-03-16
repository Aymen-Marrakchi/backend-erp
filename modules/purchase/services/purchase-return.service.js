const PurchaseReturn = require("../models/purchase-return.model");
const PurchaseInvoice = require("../models/purchase-invoice.model");
const PurchaseReceipt = require("../models/purchase-receipt.model");
const Supplier = require("../models/supplier.model");
const stockMovementService = require("../../stock/services/stock-movement.service");
const financeService = require("../../finance/services/finance.service");

async function generateReturnNo() {
  const count = await PurchaseReturn.countDocuments();
  return `RTF-${String(count + 1).padStart(4, "0")}`;
}

const populateReturn = (query) =>
  query
    .populate("supplierId", "supplierNo name")
    .populate("purchaseInvoiceId", "invoiceNo totalTtc creditNoteAmount")
    .populate("purchaseReceiptId", "receiptNo receiptStatus")
    .populate("lines.productId", "name sku")
    .populate("createdBy", "name email role");

exports.getAllPurchaseReturns = async () =>
  populateReturn(PurchaseReturn.find()).sort({ createdAt: -1 });

exports.getPurchaseReturnById = async (id) =>
  populateReturn(PurchaseReturn.findById(id));

exports.createPurchaseReturn = async ({
  supplierId,
  purchaseInvoiceId,
  purchaseReceiptId,
  reason,
  lines = [],
  refundAmount = 0,
  notes = "",
  createdBy = null,
}) => {
  if (!lines.length) {
    throw Object.assign(new Error("Add at least one supplier return line"), { statusCode: 400 });
  }

  const supplier = await Supplier.findById(supplierId);
  if (!supplier) {
    throw Object.assign(new Error("Supplier not found"), { statusCode: 404 });
  }

  const invoice = await PurchaseInvoice.findById(purchaseInvoiceId);
  if (!invoice) {
    throw Object.assign(new Error("Purchase invoice not found"), { statusCode: 404 });
  }

  const receipt = await PurchaseReceipt.findById(purchaseReceiptId);
  if (!receipt) {
    throw Object.assign(new Error("Purchase receipt not found"), { statusCode: 404 });
  }

  if (invoice.supplierId.toString() !== supplierId || receipt.supplierId.toString() !== supplierId) {
    throw Object.assign(new Error("Supplier must match invoice and receipt"), {
      statusCode: 400,
    });
  }

  const existingReturns = await PurchaseReturn.find({
    purchaseReceiptId,
    status: { $in: ["CREATED", "REFUNDED", "REPLACED"] },
  });

  const returnedQtyByReceiptLine = new Map();
  for (const existingReturn of existingReturns) {
    for (const line of existingReturn.lines) {
      const key = line.purchaseReceiptLineId.toString();
      returnedQtyByReceiptLine.set(key, (returnedQtyByReceiptLine.get(key) || 0) + line.quantity);
    }
  }

  const returnLines = [];
  for (const line of lines) {
    const receiptLine = receipt.lines.id(line.purchaseReceiptLineId);
    if (!receiptLine) {
      throw Object.assign(new Error("Receipt line not found"), { statusCode: 404 });
    }

    const alreadyReturned = returnedQtyByReceiptLine.get(line.purchaseReceiptLineId) || 0;
    const maxReturnable = receiptLine.acceptedQuantity - alreadyReturned;
    if (line.quantity <= 0 || line.quantity > maxReturnable) {
      throw Object.assign(
        new Error(`Return quantity must be between 1 and ${maxReturnable}`),
        { statusCode: 400 }
      );
    }

    await stockMovementService.createExit({
      productId: receiptLine.productId,
      quantity: line.quantity,
      lotRef: line.lotRef || receiptLine.lotRef || "",
      sourceModule: "PURCHASE",
      sourceType: "PURCHASE_RETURN",
      sourceId: purchaseReceiptId.toString(),
      reference: receipt.receiptNo,
      reason: "Supplier return stock deduction",
      notes,
      createdBy,
    });

    returnLines.push({
      productId: receiptLine.productId,
      purchaseReceiptLineId: receiptLine._id,
      quantity: line.quantity,
      lotRef: line.lotRef || receiptLine.lotRef || "",
    });
  }

  const purchaseReturn = await PurchaseReturn.create({
    returnNo: await generateReturnNo(),
    supplierId,
    purchaseInvoiceId,
    purchaseReceiptId,
    reason,
    lines: returnLines,
    refundAmount,
    notes,
    createdBy,
  });

  if (refundAmount > 0) {
    invoice.creditNoteAmount = (invoice.creditNoteAmount || 0) + refundAmount;
    await invoice.save();
  }

  await financeService.recordPurchaseReturnCredit({ purchaseReturn, invoice });

  return exports.getPurchaseReturnById(purchaseReturn._id);
};

exports.updatePurchaseReturnStatus = async (id, status) => {
  const purchaseReturn = await PurchaseReturn.findById(id);
  if (!purchaseReturn) {
    throw Object.assign(new Error("Purchase return not found"), { statusCode: 404 });
  }

  const allowedTransitions = {
    CREATED: ["REFUNDED", "REPLACED", "CLOSED"],
    REFUNDED: ["CLOSED"],
    REPLACED: ["CLOSED"],
    CLOSED: [],
  };

  if (!allowedTransitions[purchaseReturn.status]?.includes(status)) {
    throw Object.assign(
      new Error(`Cannot move purchase return from ${purchaseReturn.status} to ${status}`),
      { statusCode: 400 }
    );
  }

  purchaseReturn.status = status;
  await purchaseReturn.save();
  return exports.getPurchaseReturnById(purchaseReturn._id);
};
