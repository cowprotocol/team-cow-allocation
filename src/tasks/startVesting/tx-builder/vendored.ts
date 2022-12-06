/**
 * The content of this file is the result of trying to copy all needed component to vendor the official transaction
 * builder function to compute a tx-builder file that can be imported from the web interface.
 * There should be no change except formatting, exports, using ethers for keccak, and hardcoding the version number.
 * Pointer to relevant original files:
 * - https://raw.githubusercontent.com/safe-global/safe-react-apps/547337cba6e4824cf987226793691f6f88386f21/apps/tx-builder/src/typings/models.ts
 * - https://raw.githubusercontent.com/safe-global/safe-react-apps/547337cba6e4824cf987226793691f6f88386f21/apps/tx-builder/src/store/transactionLibraryContext.tsx#L256-L282
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { ChainInfo, SafeInfo } from "@gnosis.pm/safe-apps-sdk";
import { utils } from "ethers";

export interface BatchFile {
  version: string;
  chainId: string;
  createdAt: number;
  meta: BatchFileMeta;
  transactions: BatchTransaction[];
}

export interface BatchFileMeta {
  txBuilderVersion?: string;
  checksum?: string;
  createdFromSafeAddress?: string;
  createdFromOwnerAddress?: string;
  name: string;
  description?: string;
}

export interface BatchTransaction {
  to: string;
  value: string;
  data?: string;
  contractMethod?: ContractMethod;
  contractInputsValues?: { [key: string]: string };
}

export interface ProposedTransaction {
  id: number;
  contractInterface: ContractInterface | null;
  description: {
    to: string;
    value: string;
    customTransactionData?: string;
    contractMethod?: ContractMethod;
    contractFieldsValues?: Record<string, string>;
    contractMethodIndex?: string;
    nativeCurrencySymbol?: string;
    networkPrefix?: string;
  };
  raw: { to: string; value: string; data: string };
}

export interface ContractInterface {
  methods: ContractMethod[];
}

export interface ContractMethod {
  inputs: ContractInput[];
  name: string;
  payable: boolean;
}

export interface ContractInput {
  internalType: string;
  name: string;
  type: string;
  components?: ContractInput[];
}

export const generateBatchFile = ({
  name,
  description,
  transactions,
  chainInfo,
  safe,
}: {
  name: string;
  description: string;
  transactions: ProposedTransaction[];
  chainInfo: ChainInfo | undefined;
  safe: SafeInfo;
}): BatchFile => {
  return {
    version: "1.0",
    chainId: chainInfo?.chainId || "",
    createdAt: Date.now(),
    meta: {
      name,
      description,
      txBuilderVersion: "1.13.1",
      createdFromSafeAddress: safe.safeAddress,
      createdFromOwnerAddress: "",
    },
    transactions: convertToBatchTransactions(transactions),
  };
};

export const convertToBatchTransactions = (
  transactions: ProposedTransaction[],
): BatchTransaction[] => {
  return transactions.map(
    ({ description }: ProposedTransaction): BatchTransaction => ({
      to: description.to,
      value: description.value,
      data: description.customTransactionData,
      contractMethod: description.contractMethod,
      contractInputsValues: description.contractFieldsValues,
    }),
  );
};

// JSON spec does not allow undefined so stringify removes the prop
// That's a problem for calculating the checksum back so this function avoid the issue
export const stringifyReplacer = (_: string, value: any) =>
  value === undefined ? null : value;

const serializeJSONObject = (json: any): string => {
  if (Array.isArray(json)) {
    return `[${json.map((el) => serializeJSONObject(el)).join(",")}]`;
  }

  if (typeof json === "object" && json !== null) {
    let acc = "";
    const keys = Object.keys(json).sort();
    acc += `{${JSON.stringify(keys, stringifyReplacer)}`;

    for (let i = 0; i < keys.length; i++) {
      acc += `${serializeJSONObject(json[keys[i]])},`;
    }

    return `${acc}}`;
  }

  return `${JSON.stringify(json, stringifyReplacer)}`;
};

const calculateChecksum = (batchFile: BatchFile): string | undefined => {
  const serialized = serializeJSONObject({
    ...batchFile,
    meta: { ...batchFile.meta, name: null },
  });
  const sha = utils.id(serialized);

  return sha || undefined;
};

export const addChecksum = (batchFile: BatchFile): BatchFile => {
  return {
    ...batchFile,
    meta: {
      ...batchFile.meta,
      checksum: calculateChecksum(batchFile),
    },
  };
};

export const validateChecksum = (batchFile: BatchFile): boolean => {
  const targetObj = { ...batchFile };
  const checksum = targetObj.meta.checksum;
  delete targetObj.meta.checksum;

  return calculateChecksum(targetObj) === checksum;
};
