# Migration

## Pre-requisites

In order to use this plugin, some keys needs to be set in our config.json file at the root of the v3 package:

```json
{
    "keys": {},
    "networks": {
        "networkName": {
            "url": "https://",
            "defaultAccount": ["defaultAccountPrivateKey"]
        }
    }
}
```

`networks` represents an object exposing a network name to an url and a default account (REQUIRED if no ledger is set via CLI). If you try to execute a migration to a network without having set those values it will fail.

`url` represents an endpoint to the network.

`accounts` represents the default migration user (REQUIRED if not using a Ledger).

## Features

### Hardware

-   [x] Ledger support

### Functions

-   [x] Deploy contracts (deploy)
-   [x] Contract interaction (execute)
-   [x] Deploy proxy (deployProxy)
-   [x] Upgrade proxy (upgradeProxy)

### Engine

-   [x] Revert if migration healthcheck fails
-   [x] Save ABI and Bytecode of each deployed contract

## Folders

### Data

The `data` folder consists of one designated folder per network.

#### state.json

In each network folder there is a `state.json` file. It represents the migration state and the network state:

```json
{
    "migrationState": {
        "latestMigration": -1
    },
    "networkState": {}
}
```

`latestMigration`: The timestamp of the latest ran migration.
`networkState`: Initial migration state.

#### deployments

There is also a `deployments` folder that will host, for each migration, the ABI and bytecode of any deployed contract.

### Migrations

The `migrations` folder is home to all migration files.

A migration file is a typescript file that exposes a particular object respecting a strict interface:

```ts
export interface Migration {
    up: (initialState: any) => Promise<any>;
    healthCheck: (initialState: any, newState: any) => Promise<any>;
    down: (initialState: any, newState: any) => Promise<any>;
}
```

### Exemples

A serie of migration files to inspire yourself from.

## Engine

The engine is the backbone of the migration system, containing its logic.

It also exposes tasks (task is a hardhat concept for CLI scripts).

### Tasks

#### Migrate

Migrates the system between different states.

Call `yarn migrate --help` for more info on params.

#### CreateMigration

Creates a migration file based on a template.

`yarn create-migration --help` for more info on params.

## Getting started

### How to create a migration file ?

```
yarn hh create-migration do migration for me pls
```

If you don't use this CLI to generate your migration files, bear in mind that the format is as follow: "X_testfile.ts" with X representing the timestamp of the migration (i.e its order).

### How to execute a migration on a network?

```
yarn hh migrate --network mainnet
```

1. `Migrate` will look for the network data folder or create one if it doesn't exist.

2. Run every migration file in the migrations folder by order of execution starting from the latestMigration timestamp.

3. Update the state on the go.

### How to run the migration on a fork ?

Because of current Hardhat limitation it's not practical to launch a fork and run migration on it via the `hardhat.config.ts`. So we had to find a workaround.

To fork the network `mainnet` you need to:

-   Have in your `config.json` file (at the root of the `v3` package) the url for the `mainnet` network, like so:

```
{
    ...,

    "networks": {
        "mainnet": {
            "url": "https://eth-mainnet.alchemyapi.io/v2/supersecretkey"
        }
    }
}
```

-   Provide the `state.json` file to the `mainnet` data folder.

-   Specify the network you want to fork as an ENV variable: `FORK=mainnet yarn hh migrate`

### What does a basic migration file looks like ?

```ts
import { engine } from '../../migration/engine';
import { deployedContract, Migration } from '../../migration/engine/types';

const { signer, contracts } = engine;
const { deploy, execute, deployProxy, upgradeProxy } = engine.executionFunctions;
export type InitialState = {};
export type NextState = InitialState & {
    BNT: { token: deployedContract; governance: deployedContract };
};
const migration: Migration = {
    up: async (initialState: InitialState): Promise<NextState> => {
        const BNTToken = await deploy(
            contracts.TestERC20Token,
            'Bancor Network Token',
            'BNT',
            '100000000000000000000000000'
        );
        const BNTGovernance = await deploy(contracts.TokenGovernance, BNTToken.address);
        return {
            ...initialState,
            BNT: {
                token: BNTToken.address,
                governance: BNTGovernance.address
            }
        };
    },
    healthCheck: async (initialState: InitialState, state: NextState) => {
        const BNTGovernance = await contracts.TokenGovernance.attach(state.BNT.governance);
        if (!(await BNTGovernance.hasRole(await BNTGovernance.ROLE_SUPERVISOR(), await signer.getAddress())))
            throw new Error('Invalid Role');
    },
    down: async (initialState: InitialState, newState: NextState): Promise<InitialState> => {
        return initialState;
    }
};
export default migration;
```
