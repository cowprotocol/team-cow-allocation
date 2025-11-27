import { Contract } from "ethers";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  DAO_ALLOCATION_CONTRACT_NAME,
  constructorInput,
  COW_DAO,
  VIRTUAL_COW_TOKEN,
  buildEnableModuleTx,
} from "../ts";

const deployCowDaoAuthenticator: DeployFunction = async function ({
  deployments,
  getNamedAccounts,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deployer } = await getNamedAccounts();
  const { deploy, log } = deployments;

  const { address, abi } = await deploy(DAO_ALLOCATION_CONTRACT_NAME, {
    from: deployer,
    gasLimit: 2000000,
    log: true,
    args: constructorInput({
      controller: COW_DAO,
      virtualCowToken: VIRTUAL_COW_TOKEN,
    }),
  });

  log(
    "To enable this module in the CoW DAO safe, execute a transaction with the following parameters on CoW DAO:",
  );
  const enableTx = await buildEnableModuleTx(
    new Contract(address, abi).connect(ethers.provider),
  );
  log(`To: ${enableTx.to}`);
  log(`Value: ${enableTx.value}`);
  log(`Data: ${enableTx.data}`);
};

export default deployCowDaoAuthenticator;
