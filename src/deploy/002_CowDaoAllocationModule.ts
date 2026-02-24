import { DeployFunction } from "hardhat-deploy/types";

import { COW_DAO_SAFE, DAO_ALLOCATION_DEPLOYMENT_NAME } from "../ts";

import { allocationModuleDeployFunction } from "./001_AllocationModule";

const deployCowDaoAuthenticator: DeployFunction =
  allocationModuleDeployFunction({
    controller: COW_DAO_SAFE,
    deploymentName: DAO_ALLOCATION_DEPLOYMENT_NAME,
  });

export default deployCowDaoAuthenticator;
