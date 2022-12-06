import { MetaTransaction } from "@gnosis.pm/safe-contracts";
import { BigNumber } from "ethers";

import { Operation } from "../../ts/lib/safe";

interface BatchFileDetails {
  name: string;
  description: string;
  chainId: number;
}

// The following function is a slightly modified version of the following from the Safe's smart-contract task
// collection.
// https://github.com/5afe/safe-tasks/blob/52067e3ac5b8a1db3a4ab54fec0ee628c0bd4f3a/src/execution/utils.ts#L26-L37
export function generateTxBuilderFileContent(
  txs: MetaTransaction[],
  { name, description, chainId }: BatchFileDetails,
) {
  return {
    version: "1.0",
    chainId: chainId.toString(),
    createdAt: new Date().getTime(),
    meta: {
      name,
      description,
    },
    transactions: txs.map(({ to, data, value, operation }) => {
      if (operation != Operation.Call) {
        throw new Error(
          "Only normal contract calls can be built with the transaction builder",
        );
      }
      return {
        to,
        data,
        value: BigNumber.from(value).toString(),
      };
    }),
  };
}
