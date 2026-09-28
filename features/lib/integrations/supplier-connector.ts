/**
 * Feature 19 — supplier API/EDI connector.
 *
 * There is no real supplier API in this build. `SandboxConnector` stands in
 * for one: it validates and "accepts" the structured order and returns a
 * message ID, but contacts no one. Every screen that uses it says "Sandbox".
 * A real connector would implement the same `SupplierConnector` interface.
 */
import type { Database, PurchaseOrder, SupplierConnection, SupplierOrderPayload } from "@/features/types";
import { itemCodeFor, lineIdentity } from "@/features/lib/rules/procurement";

export interface TransmitResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export interface SupplierConnector {
  readonly sandbox: boolean;
  check(connection: SupplierConnection): { ok: boolean; error?: string };
  transmit(connection: SupplierConnection, payload: SupplierOrderPayload): TransmitResult;
}

/**
 * Build the order exactly as it would go over the wire. Electronic orders
 * need a store item code for every pack, so an unmapped pack is an error
 * rather than something the supplier has to guess.
 */
export function buildSupplierOrder(db: Database, po: PurchaseOrder): { payload: SupplierOrderPayload } | { error: string; lineId?: string } {
  const branch = db.branches.find((b) => b.id === po.branchId);
  if (!branch) return { error: "The order has no branch." };
  const lines: SupplierOrderPayload["lines"] = [];
  for (const l of po.lines.filter((x) => x.status !== "cancelled")) {
    const id = lineIdentity(db, l);
    const packs: SupplierOrderPayload["lines"][number]["packs"] = [];
    for (const p of l.packs) {
      const itemCode = itemCodeFor(db, { product: l.product, packSize: p.size, branchId: po.branchId });
      if (!itemCode) return { error: `${l.id} (${l.product}, ${p.size}) has no store item code. Map it under Product Mapping, or send this order manually.`, lineId: l.id };
      packs.push({ size: p.size, count: p.count, itemCode });
    }
    lines.push({
      lineId: l.id, manufacturer: id.manufacturer, productLine: id.productLine, product: l.product, colourName: id.colourName, colourNumber: id.colourNumber,
      sheen: l.sheen, tintBase: id.tintBase, tintFormula: l.tintFormula, gallons: l.gallons, packs,
    });
  }
  if (lines.length === 0) return { error: "The order has no open lines to send." };
  return {
    payload: {
      poId: po.id, supplierId: po.supplierId, storeNumber: branch.storeNumber, accountNumber: branch.accountNumber, jobRef: po.jobId,
      fulfilment: po.fulfilment ?? "pickup", requestedDate: po.deliveryDate, pickupContact: po.pickupContact, pickupPhone: po.pickupPhone, lines,
    },
  };
}

/** Simulated API/EDI endpoint. Deterministic, so tests and demos repeat. */
export const SandboxConnector: SupplierConnector = {
  sandbox: true,
  check(connection) {
    if (connection.type !== "api_edi") return { ok: false, error: "Not an API/EDI connection." };
    if (!connection.credentialsOnFile) return { ok: false, error: "No credentials on file." };
    return { ok: true };
  },
  transmit(connection, payload) {
    const c = this.check(connection);
    if (!c.ok) return { ok: false, error: c.error };
    if (!payload.accountNumber) return { ok: false, error: "Supplier rejected the order: no account number." };
    return { ok: true, messageId: `SBX-${payload.poId}-${payload.lines.length}L` };
  },
};

export function connectorFor(connection: SupplierConnection | undefined): SupplierConnector | undefined {
  // Live connections go through the server (app/api/suppliers); only the sandbox runs in the browser.
  return connection?.type === "api_edi" && connection.mode !== "live" ? SandboxConnector : undefined;
}

/** Server environment variable that holds one live-connection setting (never its value). */
export function envName(supplierId: string, key: "ENDPOINT_URL" | "API_KEY" | "WEBHOOK_SECRET"): string {
  return `SUPPLIER_${supplierId.replace(/[^A-Za-z0-9]/g, "_").toUpperCase()}_${key}`;
}
