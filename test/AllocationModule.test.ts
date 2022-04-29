import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import IERC20 from "@openzeppelin/contracts/build/contracts/IERC20Metadata.json";
import { expect } from "chai";
import { MockContract } from "ethereum-waffle";
import {
  BigNumber,
  BigNumberish,
  constants,
  Contract,
  ContractFactory,
  utils,
} from "ethers";
import { Interface } from "ethers/lib/utils";
import hre, { artifacts, ethers, network, waffle } from "hardhat";

import {
  constructorInput,
  CONTRACT_NAME,
  VestingPosition,
  addClaimInput,
} from "../src/ts";
import { Operation } from "../src/ts/lib/safe";

import { customError, RevertMessage } from "./lib/custom-errors";
import { createSnapshot, restoreSnapshot } from "./lib/hardhat";
import { setTime, setTimeAndMineBlock } from "./lib/time";

const VCOW_ABI = [
  "function cowToken() public returns (address)",
  "function swap(uint256) external",
];

const [defaultWallet, deployer, claimant] = waffle.provider.getWallets();

describe("AllocationModule", () => {
  let allocationModule: Contract;
  let controller: {
    contract: MockContract;
    signer: SignerWithAddress;
    address: string;
  };
  const cow = { address: utils.getAddress("0x" + "0ca0".repeat(10)) };
  let vcow: Contract;
  const cowIface: Interface = new Interface(IERC20.abi);
  const vcowIface: Interface = new Interface(VCOW_ABI);
  let AllocationModuleFactory: ContractFactory;

  beforeEach(async function () {
    vcow = await waffle.deployMockContract(deployer, VCOW_ABI);
    await vcow.mock.cowToken.returns(cow.address);

    // The controller is both a contract and an executor. We deploy a contract first, and then impersonate it to be able
    // to send transactions from this address.
    const controllerContract = await waffle.deployMockContract(
      deployer,
      (
        await artifacts.readArtifact("ModuleController")
      ).abi,
    );
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [controllerContract.address],
    });
    await network.provider.send("hardhat_setBalance", [
      controllerContract.address,
      utils.parseEther("1000").toHexString(), // Note: remove zero padding if changing amount.
    ]);
    controller = {
      address: controllerContract.address,
      contract: controllerContract,
      signer: await ethers.getSigner(controllerContract.address),
    };

    AllocationModuleFactory = await ethers.getContractFactory(CONTRACT_NAME);
    allocationModule = await AllocationModuleFactory.deploy(
      ...constructorInput({
        controller: controller.address,
        virtualCowToken: vcow.address,
      }),
    );
  });

  it("has only known public functions acting on the state", async function () {
    const { functions } = AllocationModuleFactory.interface;
    const knownPublicFunctions = [
      "addClaim(address,uint32,uint32,uint96)",
      "stopClaim(address)",
      "claimAllCow()",
      "claimCow(uint96)",
    ];
    const actualPublicFunctions = Object.keys(functions).filter(
      (name) => !["view", "pure"].includes(functions[name].stateMutability),
    );
    for (const f of actualPublicFunctions) {
      expect(knownPublicFunctions).to.include(f);
    }
  });

  describe("deployment parameters", function () {
    it("controller", async function () {
      expect(await allocationModule.controller()).to.equal(controller.address);
    });

    it("vcow", async function () {
      expect(await allocationModule.vcow()).to.equal(vcow.address);
    });

    it("cow", async function () {
      expect(await allocationModule.cow()).to.equal(cow.address);
    });
  });

  describe("addClaim", function () {
    const beneficiary = "0x" + "42".repeat(20);
    const start = 31337;
    const duration = 1337;
    const amount = utils.parseUnits("42", 18);

    it("creates a new vesting position", async function () {
      await allocationModule
        .connect(controller.signer)
        .addClaim(...addClaimInput({ beneficiary, start, duration, amount }));

      const vestingPosition: VestingPosition =
        await allocationModule.allocation(beneficiary);
      expect(vestingPosition.totalAmount).to.equal(amount);
      expect(vestingPosition.claimedAmount).to.equal(constants.Zero);
      expect(vestingPosition.start).to.equal(start);
      expect(vestingPosition.end).to.equal(start + duration);
    });

    it("emits event", async function () {
      await expect(
        allocationModule
          .connect(controller.signer)
          .addClaim(...addClaimInput({ beneficiary, start, duration, amount })),
      )
        .to.emit(allocationModule, "ClaimAdded")
        .withArgs(beneficiary, start, duration, amount);
    });

    it("reverts if not sent by controller", async function () {
      await expect(
        allocationModule
          .connect(defaultWallet)
          .addClaim(...addClaimInput({ beneficiary, start, duration, amount })),
      ).to.be.revertedWith(customError("NotAController"));
    });

    it("reverts if duration is zero", async function () {
      await expect(
        allocationModule
          .connect(controller.signer)
          .addClaim(
            ...addClaimInput({ beneficiary, start, duration: 0, amount }),
          ),
      ).to.be.revertedWith(customError("DurationMustNotBeZero"));
    });

    it("reverts if beneficiary already has a claim", async function () {
      await allocationModule
        .connect(controller.signer)
        .addClaim(...addClaimInput({ beneficiary, start, duration, amount }));

      await expect(
        allocationModule
          .connect(controller.signer)
          .addClaim(...addClaimInput({ beneficiary, start, duration, amount })),
      ).to.be.revertedWith(customError("HasClaimAlready"));
    });
  });

  const amount = utils.parseUnits("100", 18);
  const duration = 1000;

  async function requiredNewAllocation() {
    const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
    const start = timestamp + 1337;

    await allocationModule.connect(controller.signer).addClaim(
      ...addClaimInput({
        beneficiary: claimant.address,
        start,
        duration,
        amount,
      }),
    );

    return { start };
  }
  function requiredMockForSwapping(amount: BigNumberish) {
    return controller.contract.mock.execTransactionFromModule
      .withArgs(
        vcow.address,
        0,
        vcowIface.encodeFunctionData("swap", [amount]),
        Operation.Call,
      )
      .returns(true);
  }
  function requiredMockForTransferring(amount: BigNumberish) {
    return controller.contract.mock.execTransactionFromModule
      .withArgs(
        cow.address,
        0,
        cowIface.encodeFunctionData("transfer", [
          claimant.address,
          BigNumber.from(amount),
        ]),
        Operation.Call,
      )
      .returns(true);
  }
  async function testClaimFunction(claimFunction: "claimAllCow" | "claimCow") {
    describe("shared claim functionalities", function () {
      const claimInputFromAmount = (amount: BigNumberish) =>
        claimFunction === "claimCow" ? [amount] : [];

      it("reverts if claimant has no claim", async function () {
        await expect(
          allocationModule
            .connect(claimant)
            [claimFunction](...claimInputFromAmount(amount)),
        ).to.be.revertedWith(customError("NoClaimAssigned"));
      });

      describe("with allocated claim", function () {
        let claimStart: number;

        beforeEach(async function () {
          ({ start: claimStart } = await requiredNewAllocation());
        });

        describe("reverts if swapping vCOW to COW reverts", function () {
          it("at vCOW level", async function () {
            await controller.contract.mock.execTransactionFromModule
              .withArgs(
                vcow.address,
                0,
                vcowIface.encodeFunctionData("swap", [amount.div(2)]),
                Operation.Call,
              )
              .returns(false);
            await setTime(claimStart + duration / 2);
            await expect(
              allocationModule
                .connect(claimant)
                [claimFunction](...claimInputFromAmount(amount.div(2))),
            ).to.be.revertedWith(customError("RevertedVcowSwap"));
          });

          it("at the controller level", async function () {
            await controller.contract.mock.execTransactionFromModule
              .withArgs(
                vcow.address,
                0,
                vcowIface.encodeFunctionData("swap", [amount.div(2)]),
                Operation.Call,
              )
              .reverts();
            await setTime(claimStart + duration / 2);
            await expect(
              allocationModule
                .connect(claimant)
                [claimFunction](...claimInputFromAmount(amount.div(2))),
            ).to.be.revertedWith(RevertMessage.MockRevert);
          });
        });

        describe("reverts if transferring COW reverts", function () {
          beforeEach(async function () {
            await requiredMockForSwapping(amount.div(2));
          });

          it("at COW level", async function () {
            await controller.contract.mock.execTransactionFromModule
              .withArgs(
                cow.address,
                0,
                cowIface.encodeFunctionData("transfer", [
                  claimant.address,
                  amount.div(2),
                ]),
                Operation.Call,
              )
              .returns(false);
            await setTime(claimStart + duration / 2);
            await expect(
              allocationModule
                .connect(claimant)
                [claimFunction](...claimInputFromAmount(amount.div(2))),
            ).to.be.revertedWith(customError("RevertedCowTransfer"));
          });

          it("at the controller level", async function () {
            await controller.contract.mock.execTransactionFromModule
              .withArgs(
                cow.address,
                0,
                cowIface.encodeFunctionData("transfer", [
                  claimant.address,
                  amount.div(2),
                ]),
                Operation.Call,
              )
              .reverts();
            await setTime(claimStart + duration / 2);
            await expect(
              allocationModule
                .connect(claimant)
                [claimFunction](...claimInputFromAmount(amount.div(2))),
            ).to.be.revertedWith(RevertMessage.MockRevert);
          });
        });

        describe("if swapping and transferring succeeds", function () {
          it("does not revert", async function () {
            const testedAmount = amount.div(2);
            await requiredMockForSwapping(testedAmount);
            await requiredMockForTransferring(testedAmount);
            await setTime(claimStart + duration / 2);
            await expect(
              allocationModule
                .connect(claimant)
                [claimFunction](...claimInputFromAmount(testedAmount)),
            ).not.to.be.reverted;
          });

          it("swaps vCOW to COW", async function () {
            const testedAmount = amount.div(2);
            // Without a mock, it fails with "uninitialized mock". We aready test the mock parameters, so we know that the
            // swap parameters are correct.
            await setTime(claimStart + duration / 2);
            await expect(
              allocationModule
                .connect(claimant)
                [claimFunction](...claimInputFromAmount(testedAmount)),
            ).to.be.revertedWith(RevertMessage.UninitializedMock);
          });

          it("transfers COW", async function () {
            const testedAmount = amount.div(2);
            // Without a mock, it fails with "uninitialized mock". We aready test the mock parameters, so we know that
            // the swap parameters are correct.
            await requiredMockForSwapping(testedAmount);
            await setTime(claimStart + duration / 2);
            await expect(
              allocationModule
                .connect(claimant)
                [claimFunction](...claimInputFromAmount(testedAmount)),
            ).to.be.revertedWith(RevertMessage.UninitializedMock);
          });

          it("updates the already claimed amount", async function () {
            const testedAmount = amount.div(2);
            await requiredMockForSwapping(testedAmount);
            await requiredMockForTransferring(testedAmount);
            await setTime(claimStart + duration / 2);
            await allocationModule
              .connect(claimant)
              [claimFunction](...claimInputFromAmount(testedAmount));
            const vestingPosition: VestingPosition =
              await allocationModule.allocation(claimant.address);
            expect(vestingPosition.claimedAmount).to.equal(testedAmount);
          });

          it("keeps track of previously claimed amounts", async function () {
            const halfAmount = amount.div(2);
            await requiredMockForSwapping(halfAmount);
            await requiredMockForTransferring(halfAmount);
            await setTime(claimStart + duration / 2);
            await allocationModule
              .connect(claimant)
              [claimFunction](...claimInputFromAmount(halfAmount));
            const firstVestingPosition: VestingPosition =
              await allocationModule.allocation(claimant.address);
            expect(firstVestingPosition.claimedAmount).to.equal(halfAmount);

            // On the second claim at 3/4 of the duration, it only gives out the yet unclaimed 1/4 of the amount.
            const quarterAmount = amount.div(4);
            await requiredMockForSwapping(quarterAmount);
            await requiredMockForTransferring(quarterAmount);
            await setTime(claimStart + (duration * 3) / 4);
            await allocationModule
              .connect(claimant)
              [claimFunction](...claimInputFromAmount(quarterAmount));
            const secondVestingPosition: VestingPosition =
              await allocationModule.allocation(claimant.address);
            expect(secondVestingPosition.claimedAmount).to.equal(
              halfAmount.add(quarterAmount),
            );
          });

          it("caps the amount to the max claimed amount", async function () {
            await requiredMockForSwapping(amount);
            await requiredMockForTransferring(amount);
            await setTime(claimStart + 2 * duration);
            await allocationModule
              .connect(claimant)
              [claimFunction](...claimInputFromAmount(amount));
            const firstVestingPosition: VestingPosition =
              await allocationModule.allocation(claimant.address);
            expect(firstVestingPosition.claimedAmount).to.equal(amount);
          });

          it("emits ClaimRedeemed event", async function () {
            const testedAmount = amount.div(2);
            await requiredMockForSwapping(testedAmount);
            await requiredMockForTransferring(testedAmount);
            await setTime(claimStart + duration / 2);
            await expect(
              allocationModule
                .connect(claimant)
                [claimFunction](...claimInputFromAmount(testedAmount)),
            )
              .to.emit(allocationModule, "ClaimRedeemed")
              .withArgs(claimant.address, testedAmount);
          });

          it("can be redeemed if current timestamp does not fit a uint32", async function () {
            // This test sets the network time to a very large value. We restore the snapshot to undo these changes.
            const snapshot = await createSnapshot(hre);
            await requiredMockForSwapping(amount);
            await requiredMockForTransferring(amount);
            await setTime(2 ** 32);
            await expect(
              allocationModule
                .connect(claimant)
                [claimFunction](...claimInputFromAmount(amount)),
            ).not.to.be.reverted;
            await restoreSnapshot(hre, snapshot);
          });
        });
      });

      describe("with an added claim that has already started", function () {
        it("accounts for the already vested time", async function () {
          const timestamp = (await ethers.provider.getBlock("latest"))
            .timestamp;
          const start = timestamp - duration / 4;
          await allocationModule.connect(controller.signer).addClaim(
            ...addClaimInput({
              beneficiary: claimant.address,
              start,
              duration,
              amount,
            }),
          );

          const testedAmount = amount.div(2);
          await requiredMockForSwapping(testedAmount);
          await requiredMockForTransferring(testedAmount);
          await setTime(timestamp + duration / 4);
          // Note: if the computed amount was incorrect, the mocks above would not be set correctly.
          await expect(
            allocationModule
              .connect(claimant)
              [claimFunction](...claimInputFromAmount(testedAmount)),
          ).not.to.be.reverted;
        });
      });
    });
  }

  describe("claimAllCow", function () {
    testClaimFunction("claimAllCow");

    it("returns the claimed amount", async function () {
      const { start: claimStart } = await requiredNewAllocation();
      const testedAmount = amount.div(2);
      await requiredMockForSwapping(testedAmount);
      await requiredMockForTransferring(testedAmount);
      await setTimeAndMineBlock(claimStart + duration / 2);
      expect(
        await allocationModule.connect(claimant).callStatic.claimAllCow(),
      ).to.equal(testedAmount);
    });

    it("claims zero COW before the start", async function () {
      const { start: claimStart } = await requiredNewAllocation();
      await setTimeAndMineBlock(claimStart - 500);
      expect(
        await allocationModule.connect(claimant).callStatic.claimAllCow(),
      ).to.equal(constants.Zero);
      await expect(allocationModule.connect(claimant).claimAllCow()).not.to.be
        .reverted;
    });
  });

  describe("claimCow", function () {
    testClaimFunction("claimCow");

    it("can be used with less than the maximum allowed amount", async function () {
      const { start: claimStart } = await requiredNewAllocation();
      const testedAmount = 1;
      await requiredMockForSwapping(testedAmount);
      await requiredMockForTransferring(testedAmount);
      await setTime(claimStart + duration / 2);
      await expect(allocationModule.connect(claimant).claimCow(testedAmount))
        .not.to.be.reverted;
    });

    it("reverts if claiming more than the maximum allowed amount in the vesting period", async function () {
      const { start: claimStart } = await requiredNewAllocation();
      const testedAmount = amount.div(2).add(1);
      await setTime(claimStart + duration / 2);
      await expect(
        allocationModule.connect(claimant).claimCow(testedAmount),
      ).to.be.revertedWith(customError("NotEnoughVestedTokens"));
    });

    it("reverts if claiming more than the maximum allowed amount after the vesting period", async function () {
      const { start: claimStart } = await requiredNewAllocation();
      const testedAmount = amount.add(1);
      await setTime(claimStart + 2 * duration);
      await expect(
        allocationModule.connect(claimant).claimCow(testedAmount),
      ).to.be.revertedWith(customError("NotEnoughVestedTokens"));
    });

    it("reverts if claiming a nonzero amount before the start of the vesting period", async function () {
      const { start: claimStart } = await requiredNewAllocation();
      const testedAmount = constants.One;
      await setTime(claimStart - 500);
      await expect(
        allocationModule.connect(claimant).claimCow(testedAmount),
      ).to.be.revertedWith(customError("NotEnoughVestedTokens"));
    });
  });

  describe("stopClaim", function () {
    it("reverts if not sent by controller", async function () {
      await expect(
        allocationModule.connect(defaultWallet).stopClaim(claimant.address),
      ).to.be.revertedWith(customError("NotAController"));
    });

    it("reverts if stopped address has no claim", async function () {
      await expect(
        allocationModule.connect(controller.signer).stopClaim(claimant.address),
      ).to.be.revertedWith(customError("NoClaimAssigned"));
    });

    describe("with valid claim", function () {
      let claimStart: number;
      beforeEach(async function () {
        ({ start: claimStart } = await requiredNewAllocation());
      });

      describe("does not revert", async function () {
        it("before the claim is redeemable", async function () {
          await setTime(claimStart - 500);
          await expect(
            allocationModule
              .connect(controller.signer)
              .stopClaim(claimant.address),
          ).not.to.be.reverted;
        });

        it("after the claim is redeemable", async function () {
          const testedAmount = amount.div(2);
          await requiredMockForSwapping(testedAmount);
          await requiredMockForTransferring(testedAmount);
          await setTime(claimStart + duration / 2);
          await expect(
            allocationModule
              .connect(controller.signer)
              .stopClaim(claimant.address),
          ).not.to.be.reverted;
        });
      });

      it("deletes the vesting", async function () {
        const testedAmount = amount.div(2);
        await requiredMockForSwapping(testedAmount);
        await requiredMockForTransferring(testedAmount);
        await setTime(claimStart + duration / 2);

        // Compare with the vesting position of a user without any claim
        const emptyVestingPosition: VestingPosition =
          await allocationModule.allocation("0x" + "42".repeat(20));
        const vestingPositionBefore: VestingPosition =
          await allocationModule.allocation(claimant.address);
        expect(vestingPositionBefore).not.to.deep.equal(emptyVestingPosition);

        await allocationModule
          .connect(controller.signer)
          .stopClaim(claimant.address);
        const vestingPositionAfter: VestingPosition =
          await allocationModule.allocation(claimant.address);
        expect(vestingPositionAfter).to.deep.equal(emptyVestingPosition);
      });

      it("emits ClaimStopped event", async function () {
        const testedAmount = amount.div(2);
        await requiredMockForSwapping(testedAmount);
        await requiredMockForTransferring(testedAmount);
        await setTime(claimStart + duration / 2);
        await expect(
          allocationModule
            .connect(controller.signer)
            .stopClaim(claimant.address),
        )
          .to.emit(allocationModule, "ClaimStopped")
          .withArgs(claimant.address);
      });

      describe("sends tokens that were vested so far to the beneficiary", function () {
        it("swapping vCOW to COW", async function () {
          // Without a mock, it fails with "uninitialized mock". We aready test the mock parameters, so we know that the
          // swap parameters are correct.
          await setTime(claimStart + duration / 2);
          await expect(
            allocationModule
              .connect(controller.signer)
              .stopClaim(claimant.address),
          ).to.be.revertedWith(RevertMessage.UninitializedMock);
        });

        it("transferring COW", async function () {
          const testedAmount = amount.div(2);
          // Without a mock, it fails with "uninitialized mock". We aready test the mock parameters, so we know that
          // the swap parameters are correct.
          await requiredMockForSwapping(testedAmount);
          await setTime(claimStart + duration / 2);
          await expect(
            allocationModule
              .connect(controller.signer)
              .stopClaim(claimant.address),
          ).to.be.revertedWith(RevertMessage.UninitializedMock);
        });
      });
    });
  });
});
