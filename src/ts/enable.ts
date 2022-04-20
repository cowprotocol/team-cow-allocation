import { MetaTransaction } from "@gnosis.pm/safe-contracts";
import GnosisSafe from "@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json";
import { Contract, utils } from "ethers";

import { Operation } from "./lib/safe";

const gnosisSafeIface = new utils.Interface(GnosisSafe.abi);

export async function buildEnableModuleTx(
  module: Contract,
): Promise<MetaTransaction> {
  const controller = utils.getAddress(await module.controller());
  return {
    to: controller,
    operation: Operation.Call,
    value: 0,
    data: gnosisSafeIface.encodeFunctionData("enableModule", [module.address]),
  };
}
