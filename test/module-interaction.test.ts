import IERC20 from "@openzeppelin/contracts/build/contracts/IERC20Metadata.json";
import { expect } from "chai";
import { BigNumberish, Contract, ContractFactory, utils } from "ethers";
import { ethers, waffle } from "hardhat";

import {
  constructorInput,
  CONTRACT_NAME,
  buildEnableModuleTx,
  buildAddClaimTransaction,
} from "../src/ts";

import { execSafeTransaction, GnosisSafeManager } from "./lib/safe";
import { setTime } from "./lib/time";

const VCOW_ABI = [
  "function cowToken() public returns (address)",
  "function swap(uint256) external",
];

const [, deployer, owner, claimant] = waffle.provider.getWallets();

describe("AllocationModule interaction with controller safe", () => {
  let allocationModule: Contract;
  let controller: Contract;
  let cow: Contract;
  let vcow: Contract;
  let AllocationModuleFactory: ContractFactory;
  let safeManager: GnosisSafeManager;

  beforeEach(async function () {
    safeManager = await GnosisSafeManager.init(deployer);

    controller = await safeManager.newSafe([owner.address], 1);
    cow = await waffle.deployMockContract(deployer, IERC20.abi);
    vcow = await waffle.deployMockContract(deployer, VCOW_ABI);
    await vcow.mock.cowToken.returns(cow.address);

    AllocationModuleFactory = await ethers.getContractFactory(CONTRACT_NAME);
    allocationModule = await AllocationModuleFactory.deploy(
      ...constructorInput({
        controller: controller.address,
        virtualCowToken: vcow.address,
      }),
    );

    await execSafeTransaction(
      controller,
      await buildEnableModuleTx(allocationModule),
      [owner],
    );
  });

  describe("claiming", function () {
    const amount = utils.parseUnits("100", 18);
    const duration = 1000;
    let start: number;

    beforeEach(async function () {
      start = (await ethers.provider.getBlock("latest")).timestamp + 31337;

      await execSafeTransaction(
        controller,
        await buildAddClaimTransaction(allocationModule, {
          amount,
          start,
          duration,
          beneficiary: claimant.address,
        }),
        [owner],
      );
    });

    function requiredMockForSwapping(amount: BigNumberish) {
      return vcow.mock.swap.withArgs(amount).returns();
    }
    function requiredMockForTransferring(amount: BigNumberish) {
      return cow.mock.transfer.withArgs(claimant.address, amount).returns(true);
    }

    it("does not revert", async function () {
      const testedAmount = amount.div(4);
      await requiredMockForSwapping(testedAmount);
      await requiredMockForTransferring(testedAmount);
      await setTime(start + duration / 4);
      await expect(allocationModule.connect(claimant).claimAllCow()).not.to.be
        .reverted;
    });

    it("swaps vCOW to COW", async function () {
      await setTime(start + duration / 4);
      // Reverts because the swap mock is triggered but not initialized.
      await expect(
        allocationModule.connect(claimant).claimAllCow(),
      ).to.be.revertedWith("RevertedVcowSwap");
    });

    it("transfers COW to beneficiary", async function () {
      const testedAmount = amount.div(4);
      await requiredMockForSwapping(testedAmount);
      // Reverts because the transfer mock is triggered but not initialized.
      await setTime(start + duration / 4);
      await expect(
        allocationModule.connect(claimant).claimAllCow(),
      ).to.be.revertedWith("RevertedCowTransfer");
    });
  });
});
