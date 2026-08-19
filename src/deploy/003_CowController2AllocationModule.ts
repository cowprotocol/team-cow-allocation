import { DeployFunction } from "hardhat-deploy/types";

import {
  COW_CONTROLLER_2_SAFE,
  COW_CONTROLLER_2_ALLOCATION_DEPLOYMENT_NAME,
} from "../ts";

import { allocationModuleDeployFunction } from "./001_AllocationModule";

const deployCowController2AllocationModule: DeployFunction =
  allocationModuleDeployFunction({
    controller: COW_CONTROLLER_2_SAFE,
    deploymentName: COW_CONTROLLER_2_ALLOCATION_DEPLOYMENT_NAME,
  });

export default deployCowController2AllocationModule;
