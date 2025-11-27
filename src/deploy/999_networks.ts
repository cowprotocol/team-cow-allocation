import { promises as fs } from "fs";
import path from "path";

import { DeployFunction, Deployment } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const NETWORKS_PATH = path.join(__dirname, "../../networks.json");
const INDENT = "  ";

type Networks = Record<string, Network>;
type Network = Record<number, Deployment>;

const updateNetworks: DeployFunction = async function ({
  deployments,
  getChainId,
  network,
}: HardhatRuntimeEnvironment) {
  if (network.name === "hardhat" || network.name === "localhost") {
    return;
  }

  console.log("updating 'networks.json'...");

  const chainId = parseInt(await getChainId());

  let networkFileContent;
  const FILE_DOES_NOT_EXIST = "ENOENT";
  try {
    networkFileContent = await fs.readFile(NETWORKS_PATH, "utf-8");
  } catch (e) {
    if (
      e !== null &&
      typeof e === "object" &&
      (e as Record<string, unknown>).code === FILE_DOES_NOT_EXIST
    ) {
      networkFileContent = "{}";
    } else {
      throw e;
    }
  }
  const networks: Networks = JSON.parse(networkFileContent);

  const updateRecord = (
    contractName: string,
    { address, transactionHash, numDeployments }: Deployment,
  ) => {
    const identifier =
      numDeployments === 1 ? contractName : `${contractName}-${numDeployments}`;
    networks[identifier] = networks[identifier] || {};
    const record = (networks[identifier][chainId] = {
      ...networks[identifier][chainId],
      address,
    });

    // NOTE: Preserve transaction hash in case there is no new deployment
    // because the contract bytecode did not change.
    record.transactionHash = transactionHash || record.transactionHash;
  };

  for (const [name, deployment] of Object.entries(await deployments.all())) {
    updateRecord(name, deployment);
  }

  await fs.writeFile(NETWORKS_PATH, JSON.stringify(networks, null, INDENT));
};

export default updateNetworks;
