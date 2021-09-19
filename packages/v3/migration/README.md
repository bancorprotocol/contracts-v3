# Migration

## Pre-requisites

In order to use this plugin, some keys need to be set in the global `config.json` file at the root of the v3 package:

```json
{
    "keys": {},
    "networks": {
        "networkName": {
            "url": "https://",
            "defaultAccount": "defaultAccountPrivateKey"
        }
    }
}
```

`networks` represents a list of Hardhat network configurations.

## Features

### Hardware Wallets Support

-   [x] Ledger support

### Functionality

The user of the framework can:

-   [x] Deploy contracts (deploy)
-   [x] Interact with contracts (execute)
-   [x] Deploy a proxy contract (deployProxy)
-   [x] Upgrade a proxy contract (upgradeProxy)

The migration engine is responsible for:

-   Saving the ABI and bytecode of each deployed contract
-   Saving states between migrations
-   Saving the execution history of each migration
-   Reverting when a migration health-check fails

## Directories

### Data

The `data` directory consists of one designated directory per-network.

#### state.json

Each network directory contains the `state.json` file, which represents the state of the migration and the network:

```json
{
    "migrationState": {
        "latestMigration": -1
    },
    "networkState": {}
}
```

#### deployments

There is also a `deployments` directory that will host, for each migration, the ABI and bytecode of any deployed contract.

#### history.json

In each network directory there is a `history.json` file. It represents every execution done by the engine, e.g.:

```json
{
    "1631795969803_deploy_bnt_vbnt.ts": {
        "executions": [
            {
                "type": "DEPLOY",
                "params": ["Bancor Network Token", "BNT", 18],
                "description": "BNT",
                "tx": "0x6d9427f3aef3154b6247ef5377e85e9e1be5375b819f3def82bbf53755bf3d62"
            },
            {
                "type": "DEPLOY",
                "params": ["Bancor Governance Token", "vBNT", 18],
                "description": "vBNT",
                "tx": "0xdf31b607fc7ef31e72c45c2957ac7e84599824d64127bf80e2ccf68543e6e3af"
            }
        ]
    }
}
```

### Migrations

The `migrations` directory contains all migration files.

A migration file is a Typescript file that exposes a particular object respecting a strict interface:

```ts
export interface Migration {
    up: (initialState: any) => Promise<any>;
    healthCheck: (initialState: any, newState: any) => Promise<any>;
    down: (initialState: any, newState: any) => Promise<any>;
}
```

Please check the `examples` directory for reference.

## Engine

The engine is the backbone of the migration system, containing its logic. It also exposes Hardhat tasks.

### Tasks

#### Migrate

Migrates the system between different states.

Call `yarn migrate --help` for more info on params.

#### Create a New Migration

Creates a new migration file based on a starting template.

`yarn create-migration --help` for more info on params.

## Getting started

### How to Create a Migration File?

```bash
yarn hh create-migration do migration for me pls
```

### How to Execute a Migration on a Network?

```bash
yarn hh migrate --network mainnet
```

1. `Migrate` will look for the network data directory or create one if it doesn't exist.

2. Run every migration file in the migrations directory by order of execution starting from the latestMigration timestamp.

3. Update the state on the go.

### How to Run the Migration on a Fork?

Because of current Hardhat limitation it's not practical to launch a fork and run migration on it via the `hardhat.config.ts`. So we had to find a workaround.

To fork the network `mainnet` you need to:

-   Have in your `config.json` file (at the root of the `v3` package) the URL for the `mainnet` network, like so:

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

-   Provide the `state.json` file to the `mainnet` data directory.

-   Specify the network you want to fork as an ENV variable: `FORK=mainnet yarn hh migrate`
