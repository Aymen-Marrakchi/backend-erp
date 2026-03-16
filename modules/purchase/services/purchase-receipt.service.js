const PurchaseReceipt = require("../models/purchase-receipt.model");
const PurchaseOrder = require("../models/purchase-order.model");
const stockMovementService = require("../../stock/services/stock-movement.service");

async function generateReceiptNo() {
  const count = await PurchaseReceipt.countDocuments();
  return `BR-${String(count + 1).padStart(4, "0")}`;
}

const populateReceipt = (query) =>
  query
    .populate({
      path: "purchaseOrderId",
      populate: [
        { path: "supplierId", select: "supplierNo name" },
        { path: "lines.productId", select: "name sku" },
      ],
    })
    .populate("supplierId", "supplierNo name")
    .populate("lines.productId", "name sku")
    .populate("createdBy", "name email role");

exports.getAllReceipts = async () =>
  populateReceipt(PurchaseReceipt.find()).sort({ createdAt: -1 });

exports.getReceiptById = async (id) => populateReceipt(PurchaseReceipt.findById(id));

exports.createReceipt = async ({
  purchaseOrderId,
  lines = [],
  notes = "",
  createdBy = null,
}) => {
  const purchaseOrder = await PurchaseOrder.findById(purchaseOrderId).populate("supplierId");
  if (!purchaseOrder) {
    throw Object.assign(new Error("Purchase order not found"), { statusCode: 404 });
  }

  if (!["SENT", "RECEIVED"].includes(purchaseOrder.status)) {
    throw Object.assign(new Error("Only sent purchase orders can be received"), {
      statusCode: 400,
    });
  }

  if (!lines.length) {
    throw Object.assign(new Error("Add at least one receipt line"), { statusCode: 400 });
  }

  const receiptLines = [];
  let hasRejected = false;

  for (const line of lines) {
    const poLine = purchaseOrder.lines.id(line.purchaseOrderLineId);
    if (!poLine) {
      throw Object.assign(new Error("Purchase order line not found"), { statusCode: 404 });
    }

    const remainingQty = Math.max(0, poLine.quantity - (poLine.receivedQuantity || 0));
    if (line.receivedQuantity <= 0 || line.receivedQuantity > remainingQty) {
      throw Object.assign(
        new Error(`Received quantity must be between 1 and ${remainingQty}`),
        { statusCode: 400 }
      );
    }

    if (line.acceptedQuantity < 0 || line.acceptedQuantity > line.receivedQuantity) {
      throw Object.assign(
        new Error("Accepted quantity must be between 0 and received quantity"),
        { statusCode: 400 }
      );
    }

    poLine.receivedQuantity = (poLine.receivedQuantity || 0) + line.acceptedQuantity;

    if (line.acceptedQuantity > 0) {
      await stockMovementService.createEntry({
        productId: poLine.productId,
        quantity: line.acceptedQuantity,
        lotRef: line.lotRef || "",
        sourceModule: "PURCHASE",
        sourceType: "PURCHASE_RECEIPT",
        sourceId: purchaseOrder._id.toString(),
        reference: purchaseOrder.orderNo,
        reason: "Purchase receipt accepted quantity",
        notes: line.discrepancyNotes || notes,
        createdBy,
      });
    }

    if (line.qualityStatus === "REJECTED" || line.acceptedQuantity < line.receivedQuantity) {
      hasRejected = true;
    }

    receiptLines.push({
      purchaseOrderLineId: poLine._id,
      productId: poLine.productId,
      orderedQuantity: poLine.quantity,
      previouslyReceivedQuantity: poLine.receivedQuantity - line.acceptedQuantity,
      receivedQuantity: line.receivedQuantity,
      acceptedQuantity: line.acceptedQuantity,
      qualityStatus: line.qualityStatus || "ACCEPTED",
      discrepancyNotes: line.discrepancyNotes || "",
      lotRef: line.lotRef || "",
    });
  }

  const allReceived = purchaseOrder.lines.every(
    (line) => (line.receivedQuantity || 0) >= line.quantity
  );

  purchaseOrder.status = allReceived ? "RECEIVED" : "SENT";
  if (allReceived) {
    purchaseOrder.receivedAt = new Date();
  }
  await purchaseOrder.save();

  const receipt = await PurchaseReceipt.create({
    receiptNo: await generateReceiptNo(),
    purchaseOrderId: purchaseOrder._id,
    supplierId: purchaseOrder.supplierId._id,
    lines: receiptLines,
    receiptStatus: hasRejected ? "LITIGATION" : allReceived ? "FULL" : "PARTIAL",
    notes,
    createdBy,
  });

  return exports.getReceiptById(receipt._id);
};
