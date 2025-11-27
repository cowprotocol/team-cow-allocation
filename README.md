# COW Allocation Module

The allocation module distributes COW and vCOW tokens from a Safe multisig.

This module has two known use cases:
- Send vCOW tokens that were allocated to the CoW Protocol team safe to current and future contributors.
- Directly send COW tokens from the CoW DAO through a DAO proposal.

New claims can be created by the distributing safe.
When a claim is created, an address is assigned a specific vCOW/COW amount that will be vested linearly in the chosen amount of time.
A claimant can interact with the module to receive the tokens at any time.
The distributing Safe can terminate any vesting before the end of the vesting period.

The code in this project describes the module contract and tests all its functionalities.
It also takes care of deployment on mainnet and module activation for both the CoW Protocol team safe and CoW DAO.

## Setting up the project

```sh
yarn install --ci
yarn build
```

## Running Tests

All tests:

```sh
export INFURA_KEY='your infura key here'
yarn test
```

All tests except mainnet tests:

```sh
yarn test:no-mainnet
```

Only mainnet tests:

```sh
export INFURA_KEY='your infura key here'
yarn test:mainnet
```

### Test Coverage

The contracts code in this repo is fully covered by unit tests.
Test coverage can be checked by running the following command:

```sh
yarn coverage
```

A summary of coverage results are printed out to console. More detailed information is presented in the generated file `coverage/index.html`.

Contracts that are either vendored from other repositories or only used in tests are not included in coverage.

### Gas Reporter

Gas consumption can be estimated from the tests. Setting the `REPORT_GAS` flag when running tests shows details on the gas consumption of each method.

```sh
REPORT_GAS=1 yarn test
```

## Deployment

The contract can be deployed on mainnet by running:

```sh
export NODE_URL='your node RPC URL here'
yarn deploy --network mainnet
```

It will be associated with the mainnet safe address automatically.

This contract is designed to be a module for a Gnosis Safe, and before using it it needs to be activated in the controller safe.
Running the command above will print to screen instructions on how to enable the module.

## Verify deployed contract on Etherscan

After obtaining an Etherscan API key, run:

```sh
export ETHERSCAN_API_KEY=your key here
yarn verify:etherscan --network mainnet
```

## Add vesting

This repository provides a script to create new vesting position from a CSV file describing the allocations.
The script outputs a file that is compatible with the Safe transaction builder app and can be imported in the distributing safe context for execution. 

```sh
npx hardhat start-vesting --network mainnet --csv ./vesting_positions.csv
```

The format of the CSV file is as follows:

```csv
Address,Number of Tokens,Start Date,Duration (days)
0x1111111111111111111111111111111111111111,4000000,1 January 2021,1460
0x2222222222222222222222222222222222222222,2000000,2. February 2022,1095
```

Note that the date format is anything supported by Javascript's `Date`.

Try `npx hardhat start-vesting --help` for more options.
