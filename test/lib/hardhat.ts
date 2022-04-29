import { HardhatRuntimeEnvironment } from "hardhat/types";

export async function createSnapshot(
  hre: HardhatRuntimeEnvironment,
): Promise<unknown> {
  return await hre.network.provider.request({
    method: "evm_snapshot",
    params: [],
  });
}
export async function restoreSnapshot(
  hre: HardhatRuntimeEnvironment,
  snapshot: unknown,
) {
  await hre.network.provider.request({
    method: "evm_revert",
    params: [snapshot],
  });
}
