import { TransactionResponse } from "@ethersproject/abstract-provider";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import {
  buildSafeTransaction,
  executeTxWithSigners,
  MetaTransaction,
} from "@gnosis.pm/safe-contracts";
import GnosisSafe from "@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json";
import CompatibilityFallbackHandler from "@gnosis.pm/safe-contracts/build/artifacts/contracts/handler/CompatibilityFallbackHandler.sol/CompatibilityFallbackHandler.json";
import GnosisSafeProxyFactory from "@gnosis.pm/safe-contracts/build/artifacts/contracts/proxies/GnosisSafeProxyFactory.sol/GnosisSafeProxyFactory.json";
import { Signer, Contract, Wallet } from "ethers";
import { ethers, waffle } from "hardhat";

export class GnosisSafeManager {
  constructor(
    public readonly deployer: Signer,
    public readonly singleton: Contract,
    public readonly proxyFactory: Contract,
    public readonly fallbackHandler: Contract,
  ) {}

  public static async init(deployer: Signer): Promise<GnosisSafeManager> {
    const singleton = await waffle.deployContract(deployer, GnosisSafe);
    const proxyFactory = await waffle.deployContract(
      deployer,
      GnosisSafeProxyFactory,
    );
    const fallbackHandler = await waffle.deployContract(
      deployer,
      CompatibilityFallbackHandler,
    );
    return new GnosisSafeManager(
      deployer,
      singleton,
      proxyFactory,
      fallbackHandler,
    );
  }

  public async newSafe(owners: string[], threshold: number): Promise<Contract> {
    const proxyCreationInput = [this.singleton.address, "0x"];
    const proxyAddress = await this.proxyFactory.callStatic.createProxy(
      ...proxyCreationInput,
    );
    await this.proxyFactory.createProxy(...proxyCreationInput);
    const safe = await ethers.getContractAt(GnosisSafe.abi, proxyAddress);
    await safe.setup(
      owners,
      threshold,
      ethers.constants.AddressZero,
      "0x",
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      0,
      ethers.constants.AddressZero,
    );
    return safe;
  }
}

export async function execSafeTransaction(
  safe: Contract,
  transaction: MetaTransaction,
  signers: (Signer & TypedDataSigner)[],
): Promise<TransactionResponse> {
  const safeTransaction = buildSafeTransaction({
    ...transaction,
    nonce: await safe.nonce(),
  });

  // Hack: looking at the call stack of the imported function
  // `executeTxWithSigners`, it is enough that the signer's type is `Signer &
  // TypedDataSigner`. However, the Safe library function requires the signers'
  // type to be `Wallet`. We coerce the type to be able to use this function
  // with signers without reimplementing all execution and signing routines.
  return await executeTxWithSigners(safe, safeTransaction, signers as Wallet[]);
}
