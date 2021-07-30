# Migration

## Data

The `data` folder consists of one designated folder per network.

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
`networkState`: Data that is passed to the migration file as initial state.

## Migrations

The `migrations` folder is home for all migrations file.

A migration file is a typescript file that expose a particular object respecting a strict interface:

```ts
export interface Migration {
    up: (
        signer: Signer,
        contracts: Contracts,
        initialState: any,
        { deploy, execute, deployProxy }: executionFunctions
    ) => Promise<{}>;
    healthCheck: (
        signer: Signer,
        contracts: Contracts,
        newState: any,
        { deploy, execute, deployProxy }: executionFunctions
    ) => Promise<any>;
}
```

## Engine

The engine is the backbone of the migration system, containing its logic.

It also expose tasks and subtasks.

### Tasks

##### Migrate

Migrate the system from point A to point B.

`yarn migrate --help` for more info on params.

### Subtasks

##### CreateMigration

Create a migration file based from a template.

`yarn create-migration --help` for more info on params.

# Getting started

## How to create a migration file ?

```
yarn hh create-migration migrationFileName
```

If you don't use this CLI to generate your migration files, bear in mind that they have to start by a number splitted from the rest of the name by the character '\_', like so: "999_testfile.ts".

## How to execute a migration on a network?

```
yarn hh migrate --network mainnet
```

1. `Migrate` will look for the network data folder. If not it will create one.

2. It will run every migration file from latestMigration timestamp to the latest in the migrations folder.

3. Update the state on the go.

## How to run the migration on a fork ?

Because of current Hardhat limitation it's not practical to launch a fork and run migration on it via the `hardhat.config.ts`. So we had to find a workaround.

To do so you have to execute the command by specifying the network in which you want to fork as an ENV variable. You'll also need to have the original network `state.json` file. Meaning that if you want to test a migration on a fork of the `mainnet` network you'll need to provide the correct state to the `mainnet` network folder.

In order for this to work you need to have in your `config.json` at the root of the `v3` repo in the `urls` object the url for the corresponding FORK value. Example: `"mainnet": "https://eth-mainnet.alchemyapi.io/v2/supersecretcode"` if you are forking mainnet, i.e: `FORK=mainnet yarn hh migrate`.

## What does a basic migration file looks like ?

```ts
import { deployedContract, Migration } from 'migration/engine/types';

export type InitialState = {};
export type State = {
    BNT: deployedContract;
};
const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute }): Promise<State> => {
        const BNT = await deploy(contracts.TestERC20Token, 'BNT', 'BNT', 1000000);
        return {
            ...initialState,

            BNT: BNT.address
        };
    },

    healthCheck: async (signer, contracts, state: State, { deploy, execute }) => {}
};
export default migration;
```
