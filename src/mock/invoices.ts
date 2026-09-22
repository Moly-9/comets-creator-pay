import type { Invoice } from "../types";

export const invoicesByCreator = (invoices: Invoice[], creatorId: string): Invoice[] =>
  structuredClone(invoices.filter((invoice) => invoice.creatorId === creatorId));
