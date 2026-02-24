import { DeployFunction } from "hardhat-deploy/types";

import { COW_DAO_SAFE } from "../ts";

import { allocationModuleDeployFunction } from "./001_AllocationModule";

const deployCowDaoAuthenticator: DeployFunction =
  allocationModuleDeployFunction(COW_DAO_SAFE);

export default deployCowDaoAuthenticator;
