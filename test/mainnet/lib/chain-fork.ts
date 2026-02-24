import { HardhatRuntimeEnvironment, HttpNetworkConfig } from "hardhat/types";

import { createSnapshot, restoreSnapshot } from "../../lib/hardhat";

// https://hardhat.org/hardhat-network/guides/mainnet-forking.html

// Keep a snapshot of the state of the blockchain immediately after the fork.
// Restoring a snapshot is significantly quicker than creating a fresh fork.
let snapshotFreshFork: unknown;

// Changes the current testing network to be a fork of mainnet at the latest
// block.
export async function forkMainnet(
  hre: HardhatRuntimeEnvironment,
  blockNumber?: number,
) {
  await hre.network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          // Note: the node url should point to an archive node if we want to
          // fork on a specific block (or if a test takes very long to
          // complete). Until this becomes a requirement, we use our default
          // node for mainnet.
          jsonRpcUrl: (hre.config.networks["mainnet"] as HttpNetworkConfig).url,
          blockNumber,
        },
      },
    ],
  });
  snapshotFreshFork = await createSnapshot(hre);
}

export async function stopMainnetFork(hre: HardhatRuntimeEnvironment) {
  await hre.network.provider.request({
    method: "hardhat_reset",
    params: [],
  });
}

export async function resetMainnetFork(hre: HardhatRuntimeEnvironment) {
  await restoreSnapshot(hre, snapshotFreshFork);
}
