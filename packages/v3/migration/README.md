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

## Migrations

The `migration` folder is home for all migrations file.

A migration file is a typescript file that expose a particular object respecting a strict interface:

```ts
export interface Migration {
    up: (signer: Signer, contracts: Contracts, oldState: any, { deploy, execute }: deployExecuteType) => Promise<{}>;
    healthcheck: (
        signer: Signer,
        contracts: Contracts,
        newState: any,
        { deploy, execute }: deployExecuteType
    ) => Promise<boolean>;
}
```

## Engine

The engine expose one small task, and one main task `migrate`.

### Migrate

Migrate the system from point A to point B.

`yarn hh migrate --help` for more info on params.

Algorithm:

##### Fetch `{ signer, migrationsData, initialState, writeState, deployExecute }`

`signer`: Can either be a normal signer or a Ledger signer. This object is passed to the migration script.

`migrationsData`: A list of migrationData to be executed (counting only the migration that haven't been already run - using the timestamp as reference). A migrationData is:

```ts
{
    fullPath: string;
    fileName: string;
    migrationTimestamp: number;
}
```

`initialState`: The state of the global system on a particular network. It's fetched from the `state.json` file mentionned above. The property `networkState` of this object is passed to the migration script.

`writeState`: A function that will replace the current state of the network with the one provided.

`deployExecute`: An object that have 2 functions, `deploy` and `execute`. This object is passed to the migration script.

##### Running the migration

1. If there is no migrationData in the list, exit.

2. Run every migration in a loop as follow:
   -> Importing the migration file.
   -> Executing the `up` function of that migration file.
   ---> If `up` throw, exit. // @TODO add call to `down` functionnality (this is going to be complicated here).
   -> Executing the `healthcheck` function of that migration file.
   ---> If healthcheck returns false, exit. // @TODO add call to `down` functionnality.
   -> Update the latestMigration to the current migration's timestamp.
   -> Update the networkState to the new networkState

###### createMigration

Create a migration file based from a template.

`yarn hh create-migration --help` for more info on params.

```ts
import { Migration, deployedContract } from 'migration/engine/types';

export type State = {
    BNT: deployedContract;
};

const migration: Migration = {
    up: async (signer, contracts, _, { deploy, execute }): Promise<State> => {
        const BNT = await deploy('BNTContract', contracts.TestERC20Token.deploy, 'BNT', 'BNT', 1000000);
        return {
            BNT: {
                address: BNT.address,
                tx: BNT.deployTransaction.hash
            }
        };
    },

    healthcheck: async (signer, contracts, state: State, { deploy, execute }) => {
        return true;
    }
};
export default migration;
```
