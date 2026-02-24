import { DeployFunction } from "hardhat-deploy/types";

import { COW_DAO_SAFE, allocationModuleDeployFunction } from "../ts";

const deployCowDaoAuthenticator: DeployFunction =
  allocationModuleDeployFunction(COW_DAO_SAFE);

export default deployCowDaoAuthenticator;
