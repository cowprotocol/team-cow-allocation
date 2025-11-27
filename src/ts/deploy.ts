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
