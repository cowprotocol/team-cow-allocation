import hre from "hardhat";

export async function setTime(timestamp: number): Promise<number> {
  return await hre.ethers.provider.send("evm_setNextBlockTimestamp", [
    timestamp,
  ]);
}

export async function setTimeAndMineBlock(timestamp: number): Promise<number> {
  await setTime(timestamp);
  return await hre.ethers.provider.send("evm_mine", []);
}
