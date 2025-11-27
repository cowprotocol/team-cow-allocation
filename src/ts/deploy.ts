export const CONTRACT_NAME = "AllocationModule";
export const DAO_ALLOCATION_CONTRACT_NAME = "CowDaoAllocationModule";

export interface DeployArgs {
  controller: string;
  virtualCowToken: string;
}

export function constructorInput({ controller, virtualCowToken }: DeployArgs) {
  return [controller, virtualCowToken];
}
