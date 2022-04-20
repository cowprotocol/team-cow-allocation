import { MetaTransaction } from "@gnosis.pm/safe-contracts";
import { BigNumberish, Contract } from "ethers";

import { Operation } from "./lib/safe";

export interface VestingPosition {
  totalAmount: BigNumberish;
  claimedAmount: BigNumberish;
  start: number;
  end: number;
}

export interface AddClaimInput {
  beneficiary: string;
  duration: number;
  amount: BigNumberish;
}

export function addClaimInput({
  beneficiary,
  duration,
  amount,
}: AddClaimInput): unknown[] {
  return [beneficiary, duration, amount];
}

export function buildAddClaimTransaction(
  allocationModule: Contract,
  claim: AddClaimInput,
): MetaTransaction {
  return {
    to: allocationModule.address,
    data: allocationModule.interface.encodeFunctionData(
      "addClaim",
      addClaimInput(claim),
    ),
    operation: Operation.Call,
    value: 0,
  };
}
