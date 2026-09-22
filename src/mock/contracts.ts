import type { Contract } from "../types";

export const contractsByCreator = (contracts: Contract[], creatorId: string): Contract[] =>
  structuredClone(contracts.filter((contract) => contract.creatorId === creatorId));
