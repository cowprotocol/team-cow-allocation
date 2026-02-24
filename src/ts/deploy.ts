import { Contract } from "ethers";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { VIRTUAL_COW_TOKEN } from "./constants";
import { buildEnableModuleTx } from "./enable";

export const CONTRACT_NAME = "AllocationModule";
export const TEAM_ALLOCATION_DEPLOYMENT_NAME = "AllocationModule";
export const DAO_ALLOCATION_DEPLOYMENT_NAME = "CowDaoAllocationModule";

export interface DeployArgs {
  controller: string;
  virtualCowToken: string;
}

export function constructorInput({ controller, virtualCowToken }: DeployArgs) {
  return [controller, virtualCowToken];
}

export function allocationModuleDeployFunction(
  controller: string,
): DeployFunction {
  return async ({
    deployments,
    getNamedAccounts,
    ethers,
  }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();
    const { deploy, log } = deployments;

    const { address, abi } = await deploy(DAO_ALLOCATION_DEPLOYMENT_NAME, {
      contract: CONTRACT_NAME,
      from: deployer,
      gasLimit: 2000000,
      log: true,
      args: constructorInput({
        controller: controller,
        virtualCowToken: VIRTUAL_COW_TOKEN,
      }),
    });

    log(
      `To enable this module in the safe ${controller}, execute a transaction with the following parameters:`,
    );
    const enableTx = await buildEnableModuleTx(
      new Contract(address, abi).connect(ethers.provider),
    );
    log(`To: ${enableTx.to}`);
    log(`Value: ${enableTx.value}`);
    log(`Data: ${enableTx.data}`);
  };
}
