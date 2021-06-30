# Migration

## data

The `data` folder got a folder for each network used.

In each network folder there is a `state.json` file. It represents the migration state and the network state:

```json
{
    "migrationState": {
        "latestMigration": -1
    },
    "networkState": {}
}
```

## migrations

The `migration` folder is home for all migrations file.

A migration file is a typescript file that expose a particular object respecting a strict interface:

```ts
export interface Migration {
    up: (signer: Signer, oldState: any, { deploy, execute }: deployExecuteType) => Promise<{}>;
    healthcheck: (signer: Signer, newState: any, { deploy, execute }: deployExecuteType) => Promise<boolean>;
}
```

## engine

The engine expose 1 small task, and one main task `migrate`.

### migrate

Migrate the system from point A to point B.

`yarn hh migrate --help` for more info on params.

Algorithm:

##### Fetch `{ signer, migrationsData, initialState, writeState, deployExecute }`

`signer`: Can either be a normal signer or a ledger signer. This object is passed to the migration script.

`migrationsData`: An array of migrationData to be executed (counting only the migration that haven't been already run - using the timestamp as reference). A migrationData is:

```ts
{
    fullPath: string;
    fileName: string;
    migrationTimestamp: number;
}
```

`initialState`: The state of the global system on a particular network. It's fetch from the `state.json` file mentionned above. The property `networkState` of this object is passed to the migration script.

`writeState`: A function that will replace the current state of the network with the one provided.

`deployExecute`: An object that have 2 functions, `deploy` and `execute`. This object is passed to the migration script.

##### Running the migration

1. If there is no migrationsData in the array, exit.

2. Run every migration in a loop as follow:
   -> Importing the migration file.
   -> Executing the `up` function of that migration file.
   ---> If `up` throw, exit. // @TODO add `down` functionnality (this is going to be complicated here).
   -> Executing the `healthcheck` function of that migration file.
   ---> If healthcheck returns false, exit. // @TODO add `down` functionnality.
   -> Update the latestMigration to the current migration's timestamp.
   -> Update the networkState to the new networkState

###### createMigration

Create a migration file based from a template.

`yarn hh createMigration --help` for more info on params.

```ts
import Contracts from 'components/Contracts';
import { Migration } from 'migration/engine/types';

export type State = {};

const migration: Migration = {
    up: async (signer, _, { deploy, execute }): Promise<State> => {
        const contracts = Contracts.connect(signer);
        return {};
    },
    healthcheck: async (signer, state: State, { deploy, execute }) => {
        return true;
    }
};
export default migration;
```
