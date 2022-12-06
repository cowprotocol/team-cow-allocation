import { promises as fs, createReadStream } from "fs";

import "@nomiclabs/hardhat-ethers";
import GnosisSafe from "@gnosis.pm/safe-contracts/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json";
import IERC20 from "@openzeppelin/contracts/build/contracts/IERC20Metadata.json";
import { parse } from "csv";
import { BigNumber, Contract, utils } from "ethers";
import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import NetworksJson from "../../networks.json";
import {
  buildAddClaimTransaction,
  AddClaimInput,
  buildEnableModuleTx,
} from "../ts";

import { generateTxBuilderFileContent } from "./startVesting/tx-builder";

interface Args {
  csv: string;
  allocationModule: string | undefined;
  outputFilePath: string;
}

const CSV_HEADERS = {
  beneficiary: "Address",
  amount: "Number of Tokens",
  start: "Start Date",
  duration: "Duration (days)",
} as const;

const COW_DECIMALS = 18;

const setupStartVestingTask: () => void = () => {
  task(
    "start-vesting",
    "Given a file containing a list of vesting streams, builds the transaction that needs to be executed in the team controller safe to start the new streams",
  )
    .addParam<string>(
      "csv",
      `A CSV file containing a list of entries with columns "${CSV_HEADERS.beneficiary}", "${CSV_HEADERS.amount}", "${CSV_HEADERS.start}", and "${CSV_HEADERS.duration}"`,
    )
    .addOptionalParam<string>(
      "allocationModule",
      `The address of the allocation module that will be used to build the transaction`,
    )
    .addOptionalParam<string>(
      "outputFilePath",
      `The path to the output file thet stores the transactions in a format that can be imported into the Safe transaction builder`,
      "./add_vesting_tx_builder.json",
    )
    .setAction(startVesting);
};

async function startVesting(
  { csv, allocationModule: allocationModuleAddress, outputFilePath }: Args,
  hre: HardhatRuntimeEnvironment,
) {
  const addClaimInputs = await parseCsv(csv);

  printSummary(addClaimInputs);

  const contracts = await validatedContracts(allocationModuleAddress, hre);

  const maybeModuleEnableTx = await generateTxEnablingModuleIfNeeded(contracts);

  const transactions = maybeModuleEnableTx.concat(
    addClaimInputs.map((s) =>
      buildAddClaimTransaction(contracts.allocationModule, s),
    ),
  );

  const txBuilderFileContent = generateTxBuilderFileContent(transactions, {
    name: "Start Vesting Transactions Batch",
    description:
      "A transaction that batches together multiple calls to the allocation modules for starting vesting positions",
    originSafe: contracts.teamController.address,
    chainId: (await hre.ethers.provider.getNetwork()).chainId,
  });
  await fs.writeFile(
    outputFilePath,
    JSON.stringify(txBuilderFileContent, undefined, 2),
  );
}

async function parseCsv(csvPath: string): Promise<AddClaimInput[]> {
  const result: AddClaimInput[] = [];

  const parser = createReadStream(csvPath).pipe(parse({ columns: true }));
  for await (const entry of parser) {
    result.push(parseEntry(entry));
  }

  return result;
}

interface ValidatedContracts {
  allocationModule: Contract;
  teamController: Contract;
}

async function validatedContracts(
  allocationModuleAddress: string | undefined,
  hre: HardhatRuntimeEnvironment,
): Promise<ValidatedContracts> {
  if (allocationModuleAddress === undefined) {
    allocationModuleAddress = NetworksJson.AllocationModule[1].address;
  }

  const allocationModule = await hre.ethers.getContractAt(
    "AllocationModule",
    utils.getAddress(allocationModuleAddress),
  );
  const token = (address: string) =>
    hre.ethers.getContractAt(IERC20.abi, address);
  const [cow, vcow, teamController] = await Promise.all([
    allocationModule.cow().then(token),
    allocationModule.vcow().then(token),
    allocationModule
      .controller()
      .then((address: string) =>
        hre.ethers.getContractAt(GnosisSafe.abi, address),
      ),
  ]);
  const [teamControllerCowBalance, teamControllerVcowBalance]: [
    BigNumber,
    BigNumber,
  ] = await Promise.all([
    cow.balanceOf(teamController.address),
    vcow.balanceOf(teamController.address),
  ]);
  if (teamControllerCowBalance.add(teamControllerVcowBalance).isZero()) {
    throw new Error("The team controller has no COW nor vCOW to allocate");
  }

  return { allocationModule, teamController };
}

async function generateTxEnablingModuleIfNeeded({
  allocationModule,
  teamController,
}: ValidatedContracts) {
  const isAllocationModuleEnabled = await teamController.isModuleEnabled(
    allocationModule.address,
  );

  if (!isAllocationModuleEnabled) {
    console.log(
      "The allocation module needs to be enabled in the team controller Safe before new vesting positions can be added.",
    );
    console.log(
      `A transaction that enables the allocation module was added at the start of the batch.`,
    );
  }
  return isAllocationModuleEnabled
    ? []
    : [await buildEnableModuleTx(allocationModule)];
  console.log();
}

function printSummary(addClaimInput: AddClaimInput[]) {
  console.table(
    addClaimInput.map((i) => {
      const amount = Number(
        utils.formatUnits(BigNumber.from(i.amount), COW_DECIMALS),
      );
      const usdCostAtLaunch = amount * 0.15;

      return {
        "Beneficiary address": i.beneficiary,
        Amount: amount.toLocaleString(),
        "USD cost at launch": usdCostAtLaunch.toLocaleString(),
        "Vesting start": new Date(secsToMillis(i.start)).toDateString(),
        "Vesting end": new Date(
          secsToMillis(i.start + i.duration),
        ).toDateString(),
      };
    }),
  );
  console.log();
}

function parseEntry(
  line: Record<typeof CSV_HEADERS[keyof typeof CSV_HEADERS], string>,
): AddClaimInput {
  return {
    beneficiary: utils.getAddress(line[CSV_HEADERS["beneficiary"]]),
    amount: utils.parseUnits(line[CSV_HEADERS["amount"]], COW_DECIMALS),
    start: millisToSecs(new Date(line[CSV_HEADERS["start"]]).getTime()),
    duration: daysToSeconds(Number(line[CSV_HEADERS["duration"]])),
  };
}

function millisToSecs(millis: number): number {
  return Math.floor(millis / 1000);
}
function secsToMillis(secs: number): number {
  return secs * 1000;
}

function daysToSeconds(days: number): number {
  return days * 24 * 3600;
}

export { setupStartVestingTask };
