import type { FileRef, Invoice, InvoiceExtractedData, PayoutAccount, UserProfile } from "../../types";

export type RecognitionDemoContext = {
  invoice: Invoice;
  profile: UserProfile;
  account?: PayoutAccount;
};

/** Replace this boundary with a server-side AI document service in production. */
export interface ExternalInvoiceRecognitionAdapter {
  recognize(file: FileRef, context?: RecognitionDemoContext): Promise<InvoiceExtractedData>;
}

export const demoInvoiceValues = (context: RecognitionDemoContext): InvoiceExtractedData => {
  const [currency = "", amount = ""] = context.invoice.amount.split(/\s+/, 2);
  return {
    invoiceFrom: context.profile.legalName,
    billTo: "COMETS INTERNATIONAL LIMITED",
    invoiceDate: context.invoice.issuedAt,
    description: "",
    currency,
    total: amount.replace(/,/g, ""),
    paymentDetails: {},
    invoiceFromMatchesProfile: true,
    billToMatchesComets: true,
  };
};

/** Deterministic sample values, deliberately NOT parsed from the uploaded PDF/image. */
export class MockAiRecognitionAdapter implements ExternalInvoiceRecognitionAdapter {
  async recognize(_file: FileRef, context?: RecognitionDemoContext): Promise<InvoiceExtractedData> {
    if (context) return demoInvoiceValues(context);
    return {
      invoiceFrom: "",
      billTo: "",
      invoiceDate: "",
      description: "",
      currency: "",
      total: "",
      paymentDetails: {},
      invoiceFromMatchesProfile: false,
      billToMatchesComets: false,
    };
  }
}
