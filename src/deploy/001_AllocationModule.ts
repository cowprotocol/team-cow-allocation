import { DeployFunction } from "hardhat-deploy/types";

import { allocationModuleDeployFunction, TEAM_CONTROLLER_SAFE } from "../ts";

const deployAuthenticator: DeployFunction =
  allocationModuleDeployFunction(TEAM_CONTROLLER_SAFE);

export default deployAuthenticator;
