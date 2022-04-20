import {
  buildSafeTransaction,
  executeTx,
  MetaTransaction,
  SafeSignature,
} from "@gnosis.pm/safe-contracts";
import GnosisSafe from "@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import IERC20 from "@openzeppelin/contracts/build/contracts/IERC20Metadata.json";
import { expect } from "chai";
import { constants, Contract, utils } from "ethers";
import hre, { deployments, ethers, waffle } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  TEAM_CONTROLLER_SAFE,
  COW_TOKEN,
  VIRTUAL_COW_TOKEN,
  CONTRACT_NAME,
  buildEnableModuleTx,
} from "../../src/ts";
import { Operation } from "../../src/ts/lib/safe";
import { customError } from "../lib/custom-errors";
import { setTime, setTimeAndMineBlock } from "../lib/time";

import {
  forkMainnet,
  resetMainnetFork,
  stopMainnetFork,
} from "./lib/chain-fork";

async function setSafeThresholdToOne(
  safe: Contract,
  hre: HardhatRuntimeEnvironment,
) {
  const THRESHOLD_STORAGE_SLOT = "0x4";
  await hre.network.provider.send("hardhat_setStorageAt", [
    safe.address,
    THRESHOLD_STORAGE_SLOT,
    "0x0000000000000000000000000000000000000000000000000000000000000001",
  ]);
}
async function execSafeTransaction(
  safe: Contract,
  tx: MetaTransaction,
  signer: SignerWithAddress,
) {
  const safeTransaction = buildSafeTransaction({
    ...tx,
    nonce: await safe.nonce(),
  });

  // Generate a pre-validated signature. As long as the sender of the transaction is the owner specified in the
  // signature, the signature is valid.
  // https://docs.gnosis-safe.io/contracts/signatures#pre-validated-signatures
  // The threshold has been changed to 1 so that this single signature is enough to execute the transaction.
  const sigs: SafeSignature[] = [
    {
      signer: signer.address,
      data: utils.hexlify(
        utils.concat([
          utils.hexZeroPad(signer.address, 32),
          constants.HashZero,
          "0x01",
        ]),
      ),
    },
  ];

  return await executeTx(safe, safeTransaction, sigs);
}

const [employeeOne, employeeTwo] = waffle.provider.getWallets();

describe("Mainnet: allocation module on team safe", () => {
  let allocationModule: Contract;
  let cow: Contract;
  let vcow: Contract;
  let teamManager: Contract;
  let teamManagerOwnerAddress: string;
  let teamManagerOwner: SignerWithAddress;

  before(async function () {
    await forkMainnet(hre);

    teamManager = new Contract(TEAM_CONTROLLER_SAFE, GnosisSafe.abi).connect(
      hre.ethers.provider,
    );
    cow = new Contract(COW_TOKEN, IERC20.abi).connect(hre.ethers.provider);
    vcow = new Contract(VIRTUAL_COW_TOKEN, IERC20.abi).connect(
      hre.ethers.provider,
    );

    teamManagerOwnerAddress = (await teamManager.getOwners())[0];
  });

  after(async function () {
    await stopMainnetFork(hre);
  });

  beforeEach(async function () {
    await resetMainnetFork(hre);
    // Set threshold to one, so that a transaction can directly be executed by a single owner
    await setSafeThresholdToOne(teamManager, hre);
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [teamManagerOwnerAddress],
    });
    teamManagerOwner = await hre.ethers.getSigner(teamManagerOwnerAddress);

    // Use hardhat-deploy to deploy on mainnet.
    const { AllocationModule } = await deployments.fixture();
    allocationModule = await ethers.getContractAt(
      CONTRACT_NAME,
      AllocationModule.address,
    );
  });

  it("distributes COW tokens to registered beneficiaries", async function () {
    // Generic executor that pre-fills tx with default values
    const teamExecTx = (
      tx: Pick<MetaTransaction, "data"> & Partial<MetaTransaction>,
    ) =>
      execSafeTransaction(
        teamManager.connect(teamManagerOwner),
        {
          value: 0,
          operation: Operation.Call,
          to: allocationModule.address,
          ...tx,
        },
        teamManagerOwner,
      );
    const teamExecInModule = (fnName: string, params: unknown[]) =>
      teamExecTx({
        data: allocationModule.interface.encodeFunctionData(fnName, params),
      });

    // Test assumption: the team manager holds enough vCow to make this test pass. This will likely not be true in the
    // future after most team vCOW has been allocated. On the other hand, these tests won't be needed anymore.
    const initialTeamManagerCow = await cow.balanceOf(teamManager.address);
    const initialTeamManagerVcow = await vcow.balanceOf(teamManager.address);

    // Enable module in team safe.
    await teamExecTx(await buildEnableModuleTx(allocationModule));

    expect(await teamManager.isModuleEnabled(allocationModule.address)).to.be
      .true;

    // Allocate claim to first employee.
    const durationOne = 400 * 24 * 3600; // 400 days
    const amountOne = utils.parseUnits("31337", 18);
    await teamExecInModule("addClaim", [
      employeeOne.address,
      durationOne,
      amountOne,
    ]);
    const startClaimOne = (await ethers.provider.getBlock("latest")).timestamp;

    // Employee one claims for the first time.
    await setTimeAndMineBlock(startClaimOne + durationOne / 8);
    const claimableAmountOne = amountOne.div(8);
    expect(await allocationModule.callStatic.claimAllCow()).to.equal(
      claimableAmountOne,
    );
    // Trying to claim an amount that is too large.
    // Note: cannot use claimableAmountOne.add(1) as mining a new block for the transaction increases the time.
    await expect(
      allocationModule.connect(employeeOne).claimCow(amountOne),
    ).to.be.revertedWith(customError("NotEnoughVestedTokens"));
    await allocationModule.connect(employeeOne).claimCow(claimableAmountOne);
    expect(await cow.balanceOf(employeeOne.address)).to.equal(
      claimableAmountOne,
    );
    expect(await cow.balanceOf(teamManager.address)).to.equal(
      initialTeamManagerCow,
    );
    expect(await vcow.balanceOf(teamManager.address)).to.equal(
      initialTeamManagerVcow.sub(claimableAmountOne),
    );

    // Add claim for second employee.
    const startClaimTwo = startClaimOne + durationOne / 4;
    await setTime(startClaimTwo);
    const durationTwo = 200 * 24 * 3600; // 200 days (ends before claim one, at durationOne*3/4)
    const amountTwo = utils.parseUnits("1337", 18);
    await teamExecInModule("addClaim", [
      employeeTwo.address,
      durationTwo,
      amountTwo,
    ]);

    // Stop vesting for employee one.
    await setTime(startClaimOne + durationOne / 2);
    await teamExecInModule("stopClaim", [employeeOne.address]);
    expect(await cow.balanceOf(employeeOne.address)).to.equal(amountOne.div(2));
    expect(await cow.balanceOf(teamManager.address)).to.equal(
      initialTeamManagerCow,
    );
    let vcowClaimedSoFar = amountOne.div(2);
    expect(await vcow.balanceOf(teamManager.address)).to.equal(
      initialTeamManagerVcow.sub(vcowClaimedSoFar),
    );
    await setTimeAndMineBlock(startClaimOne + (durationOne * 5) / 8);
    await expect(
      allocationModule.connect(employeeOne).claimAllCow(),
    ).to.be.revertedWith(customError("NoClaimAssigned"));

    // Employee two claims everything.
    await setTimeAndMineBlock(startClaimOne + (durationOne * 3) / 4);
    expect(
      await allocationModule.connect(employeeTwo).callStatic.claimAllCow(),
    ).to.equal(amountTwo);
    await allocationModule.connect(employeeTwo).claimAllCow();
    expect(await cow.balanceOf(employeeTwo.address)).to.equal(amountTwo);
    expect(await cow.balanceOf(teamManager.address)).to.equal(
      initialTeamManagerCow,
    );
    vcowClaimedSoFar = vcowClaimedSoFar.add(amountTwo);
    expect(await vcow.balanceOf(teamManager.address)).to.equal(
      initialTeamManagerVcow.sub(vcowClaimedSoFar),
    );

    // Employee two cannot claim anymore, now that its claim has been redeemed in full.
    await setTimeAndMineBlock(startClaimOne + 42 * durationOne);
    await expect(
      await allocationModule.connect(employeeTwo).callStatic.claimAllCow(),
    ).to.equal(constants.Zero);
  });
});
