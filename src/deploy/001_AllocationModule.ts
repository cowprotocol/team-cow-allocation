import { Contract } from "ethers";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  buildEnableModuleTx,
  constructorInput,
  CONTRACT_NAME,
  DAO_ALLOCATION_DEPLOYMENT_NAME,
  TEAM_CONTROLLER_SAFE,
  VIRTUAL_COW_TOKEN,
} from "../ts";

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

const deployAuthenticator: DeployFunction =
  allocationModuleDeployFunction(TEAM_CONTROLLER_SAFE);

export default deployAuthenticator;
