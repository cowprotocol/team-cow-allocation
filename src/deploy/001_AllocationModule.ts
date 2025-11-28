import { Contract } from "ethers";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  CONTRACT_NAME,
  constructorInput,
  TEAM_CONTROLLER_SAFE,
  VIRTUAL_COW_TOKEN,
  buildEnableModuleTx,
  TEAM_ALLOCATION_DEPLOYMENT_NAME,
} from "../ts";

const deployAuthenticator: DeployFunction = async function ({
  deployments,
  getNamedAccounts,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deployer } = await getNamedAccounts();
  const { deploy, log } = deployments;

  const { address, abi } = await deploy(TEAM_ALLOCATION_DEPLOYMENT_NAME, {
    contract: CONTRACT_NAME,
    from: deployer,
    gasLimit: 2000000,
    log: true,
    args: constructorInput({
      controller: TEAM_CONTROLLER_SAFE,
      virtualCowToken: VIRTUAL_COW_TOKEN,
    }),
  });

  log(
    "To enable this module in the team controller safe, execute a transaction with the following parameters on the team controller safe:",
  );
  const enableTx = await buildEnableModuleTx(
    new Contract(address, abi).connect(ethers.provider),
  );
  log(`To: ${enableTx.to}`);
  log(`Value: ${enableTx.value}`);
  log(`Data: ${enableTx.data}`);
};

export default deployAuthenticator;
