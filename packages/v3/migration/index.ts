import { task, types } from 'hardhat/config';
import path from 'path';
import { MIGRATION_TASKS_DIR } from './engine/Constants';
import { basicTaskLoader, migrationLoader } from './engine/Loaders';
import { defaultArgs } from './engine/Types';

export type migrateParamTask = defaultArgs;

task('migrate', 'Migrate the network')
    .addFlag('ledger', 'Signing from a ledger')
    .addParam('ledgerPath', 'Ledger path', "m/44'/60'/0'/0", types.string)
    .addParam('gasPrice', 'GasPrice in gwei', 0, types.int)
    .addParam('minBlockConfirmations', 'Number of confirmation to wait', 1, types.int)
    .addFlag('reset', 'Reset the migration data')
    .setAction(migrationLoader(path.join(MIGRATION_TASKS_DIR, 'migrate.ts')));

export type createMigrationParamTask = {
    wordList: string[];
};

task('create-migration', 'Create a migration file')
    .addVariadicPositionalParam('wordList', 'Name of the migration')
    .setAction(basicTaskLoader(path.join(MIGRATION_TASKS_DIR, 'CreateMigration.ts')));
