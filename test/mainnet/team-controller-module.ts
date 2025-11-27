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
  addClaimInput,
  COW_DAO,
  DAO_ALLOCATION_CONTRACT_NAME,
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

const [userOne, userTwo] = waffle.provider.getWallets();

interface MainnetTestParam {
  name: string;
  contract: string;
  safe: string;
  forkBlock: number;
}
function testModule({
  name,
  contract,
  safe: safeAddress,
  forkBlock,
}: MainnetTestParam) {
  describe(`Mainnet: allocation module on ${name}`, () => {
    let allocationModule: Contract;
    let cow: Contract;
    let vcow: Contract;
    let safe: Contract;
    let safeOwnerAddress: string;
    let safeOwner: SignerWithAddress;

    before(async function () {
      await forkMainnet(hre, forkBlock);

      safe = new Contract(safeAddress, GnosisSafe.abi).connect(
        hre.ethers.provider,
      );
      cow = new Contract(COW_TOKEN, IERC20.abi).connect(hre.ethers.provider);
      vcow = new Contract(VIRTUAL_COW_TOKEN, IERC20.abi).connect(
        hre.ethers.provider,
      );

      safeOwnerAddress = (await safe.getOwners())[0];
    });

    after(async function () {
      await stopMainnetFork(hre);
    });

    beforeEach(async function () {
      await resetMainnetFork(hre);
      // Set threshold to one, so that a transaction can directly be executed by a single owner
      await setSafeThresholdToOne(safe, hre);
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [safeOwnerAddress],
      });
      safeOwner = await hre.ethers.getSigner(safeOwnerAddress);

      // Use hardhat-deploy to deploy on mainnet.
      const fixture = await deployments.fixture();
      allocationModule = await ethers.getContractAt(
        contract,
        fixture[contract].address,
      );
    });

    it("distributes COW tokens to registered beneficiaries", async function () {
      // Generic executor that pre-fills tx with default values
      const teamExecTx = (
        tx: Pick<MetaTransaction, "data"> & Partial<MetaTransaction>,
      ) =>
        execSafeTransaction(
          safe.connect(safeOwner),
          {
            value: 0,
            operation: Operation.Call,
            to: allocationModule.address,
            ...tx,
          },
          safeOwner,
        );
      const teamExecInModule = (fnName: string, params: unknown[]) =>
        teamExecTx({
          data: allocationModule.interface.encodeFunctionData(fnName, params),
        });
      const totalSafeBalance = async () => {
        return (await vcow.balanceOf(safe.address)).add(
          await cow.balanceOf(safe.address),
        );
      };

      // Test assumption: the safe holds enough vCOW or COW to make this test
      // pass. This depends on the fork block number.
      const initialSafeBalance = await totalSafeBalance();

      // Enable module in team safe.
      await teamExecTx(await buildEnableModuleTx(allocationModule));

      expect(await safe.isModuleEnabled(allocationModule.address)).to.be.true;

      // Allocate claim to first employee.
      const durationOne = 400 * 24 * 3600; // 400 days
      const amountOne = utils.parseUnits("31337", 18);
      const startClaimOne =
        (await ethers.provider.getBlock("latest")).timestamp + 31337;
      await teamExecInModule(
        "addClaim",
        addClaimInput({
          beneficiary: userOne.address,
          start: startClaimOne,
          duration: durationOne,
          amount: amountOne,
        }),
      );

      // Claims nothing before start
      await setTimeAndMineBlock(startClaimOne - 1337);
      expect(await allocationModule.callStatic.claimAllCow()).to.equal(
        constants.AddressZero,
      );

      // User one claims for the first time.
      await setTimeAndMineBlock(startClaimOne + durationOne / 8);
      const claimableAmountOne = amountOne.div(8);
      expect(await allocationModule.callStatic.claimAllCow()).to.equal(
        claimableAmountOne,
      );
      // Trying to claim an amount that is too large.
      // Note: cannot use claimableAmountOne.add(1) as mining a new block for the transaction increases the time.
      await expect(
        allocationModule.connect(userOne).claimCow(amountOne),
      ).to.be.revertedWith(customError("NotEnoughVestedTokens"));
      await allocationModule.connect(userOne).claimCow(claimableAmountOne);
      expect(await cow.balanceOf(userOne.address)).to.equal(claimableAmountOne);

      expect(await totalSafeBalance()).to.equal(
        initialSafeBalance.sub(claimableAmountOne),
      );

      // Add claim for second user.
      const startClaimTwo = startClaimOne + durationOne / 4;
      const durationTwo = 200 * 24 * 3600; // 200 days (ends before claim one, at durationOne*3/4)
      const amountTwo = utils.parseUnits("1337", 18);
      await teamExecInModule(
        "addClaim",
        addClaimInput({
          beneficiary: userTwo.address,
          start: startClaimTwo,
          duration: durationTwo,
          amount: amountTwo,
        }),
      );

      // Stop vesting for user one.
      await setTime(startClaimOne + durationOne / 2);
      await teamExecInModule("stopClaim", [userOne.address]);
      expect(await cow.balanceOf(userOne.address)).to.equal(amountOne.div(2));
      let vcowClaimedSoFar = amountOne.div(2);
      expect(await totalSafeBalance()).to.equal(
        initialSafeBalance.sub(vcowClaimedSoFar),
      );
      await setTimeAndMineBlock(startClaimOne + (durationOne * 5) / 8);
      await expect(
        allocationModule.connect(userOne).claimAllCow(),
      ).to.be.revertedWith(customError("NoClaimAssigned"));

      // User two claims everything.
      await setTimeAndMineBlock(startClaimOne + (durationOne * 3) / 4);
      expect(
        await allocationModule.connect(userTwo).callStatic.claimAllCow(),
      ).to.equal(amountTwo);
      await allocationModule.connect(userTwo).claimAllCow();
      expect(await cow.balanceOf(userTwo.address)).to.equal(amountTwo);
      vcowClaimedSoFar = vcowClaimedSoFar.add(amountTwo);
      expect(await totalSafeBalance()).to.equal(
        initialSafeBalance.sub(vcowClaimedSoFar),
      );

      // User two cannot claim anymore, now that its claim has been redeemed in full.
      await setTimeAndMineBlock(startClaimOne + 42 * durationOne);
      await expect(
        await allocationModule.connect(userTwo).callStatic.claimAllCow(),
      ).to.equal(constants.Zero);
    });
  });
}

// The involved safes need to have enough COW/vCOW to make the test pass at this block.
const MAINNET_BLOCK = 23890068;

testModule({
  name: "team allocation",
  contract: CONTRACT_NAME,
  safe: TEAM_CONTROLLER_SAFE,
  forkBlock: MAINNET_BLOCK,
});

testModule({
  name: "COW DAO allocation",
  contract: DAO_ALLOCATION_CONTRACT_NAME,
  safe: COW_DAO,
  forkBlock: MAINNET_BLOCK,
});
