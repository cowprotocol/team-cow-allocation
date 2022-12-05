import { MetaTransaction } from "@gnosis.pm/safe-contracts";
import { BigNumber } from "ethers";

import { Operation } from "../../ts/lib/safe";

import {
  addChecksum,
  generateBatchFile,
  ProposedTransaction,
} from "./tx-builder/vendored";

interface BatchFileDetails {
  name: string;
  description: string;
  originSafe: string;
  chainId: number;
}

export function generateTxBuilderFileContent(
  txs: MetaTransaction[],
  { name, description, originSafe, chainId }: BatchFileDetails,
) {
  const unusedValueString = (key: string) =>
    `Entry ${key} is unused when generating the batch file`;
  return addChecksum(
    generateBatchFile({
      name,
      description,
      transactions: txs.map((tx, i) => toProposedTransaction(tx, i)),
      chainInfo: {
        chainId: chainId.toString(),
        chainName: unusedValueString("chainName"),
        shortName: unusedValueString("shortName"),
        nativeCurrency: {
          name: unusedValueString("nativeCurrency.name"),
          symbol: unusedValueString("nativeCurrency.symbol"),
          decimals: -1,
          logoUri: unusedValueString("nativeCurrency.logoUri"),
        },
        blockExplorerUriTemplate: {
          address: unusedValueString("blockExplorerUriTemplate.address"),
          txHash: unusedValueString("blockExplorerUriTemplate.txHash"),
          api: unusedValueString("blockExplorerUriTemplate.api"),
        },
      },
      safe: {
        safeAddress: originSafe,
        chainId: chainId,
        // The following are unfilled as they are unneded, however they can't be left out.
        threshold: -1,
        owners: [unusedValueString("safe.owners")],
        isReadOnly: false,
      },
    }),
  );
}

function toProposedTransaction(
  tx: MetaTransaction,
  id: number,
): ProposedTransaction {
  if (tx.operation != Operation.Call) {
    throw new Error("The transaction builder can only execute call operations");
  }
  const value = BigNumber.from(tx.value).toString();
  return {
    id,
    contractInterface: null,
    description: { to: tx.to, value, customTransactionData: tx.data },
    raw: {
      to: tx.to,
      value,
      data: tx.data,
    },
  };
}
