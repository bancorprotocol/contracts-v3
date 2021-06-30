import { lazyAction } from 'components/TasksUtils';
import { task, types } from 'hardhat/config';

const PATH_TO_ENGINE_TASKS_FOLDER = 'migration/engine/tasks/';

export type defaultParamTask = {
    ledger: boolean;
    ledgerPath: string;
    gasPrice: number;
    confirmationToWait: number;
};

export type migrateParamTask = defaultParamTask & {
    reset: boolean;
};
task('migrate', 'Migrate the network')
    .addFlag('ledger', 'Signing from a ledger')
    .addParam('ledgerPath', 'Ledger path', "m/44'/60'/0'/0", types.string)
    .addParam('gasPrice', 'GasPrice in gwei', 0, types.int)
    .addParam('confirmationToWait', 'Number of confirmation to wait', 1, types.int)
    .addFlag('reset', 'Reset the migration data')
    .setAction(lazyAction(PATH_TO_ENGINE_TASKS_FOLDER + 'migrate.ts'));

export type createMigrationParamTask = {
    migrationName: string;
};
task('createMigration', 'Create a migration file')
    .addPositionalParam('migrationName', 'Name of the migration name')
    .setAction(lazyAction(PATH_TO_ENGINE_TASKS_FOLDER + 'createMigration.ts'));
