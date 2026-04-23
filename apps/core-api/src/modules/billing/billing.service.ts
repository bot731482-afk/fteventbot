import { Injectable } from "@nestjs/common";

export type ProductCode = "VIEWS_X3" | "VIEWS_X5" | "VIEWS_X10" | "UNLIMITED_LIFETIME";

interface InvoiceState {
  invoiceId: string;
  userId: string;
  productCode: ProductCode;
  paid: boolean;
}

@Injectable()
export class BillingService {
  private readonly appliedInvoices = new Set<string>();

  async createInvoice(userId: string, productCode: ProductCode): Promise<InvoiceState> {
    return {
      invoiceId: `cb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      productCode,
      paid: false
    };
  }

  async applyPaidInvoice(input: InvoiceState): Promise<{ invoiceId: string; granted: string }> {
    if (this.appliedInvoices.has(input.invoiceId)) {
      return { invoiceId: input.invoiceId, granted: "idempotent-noop" };
    }
    this.appliedInvoices.add(input.invoiceId);
    if (input.productCode === "UNLIMITED_LIFETIME") {
      return { invoiceId: input.invoiceId, granted: "unlimited_lifetime" };
    }
    return { invoiceId: input.invoiceId, granted: "view_pack" };
  }
}
