export const CONTRACT_NAME = "AllocationModule";

export interface DeployArgs {
  controller: string;
  virtualCowToken: string;
}

export function constructorInput({ controller, virtualCowToken }: DeployArgs) {
  return [controller, virtualCowToken];
}
