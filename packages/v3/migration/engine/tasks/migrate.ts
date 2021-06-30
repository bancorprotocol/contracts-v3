import { Migration } from '../types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { importCsjOrEsModule } from 'components/TasksUtils';
import { getMigrateParams } from '../utils';
import { log } from '../logger';
import { migrateParamTask } from '.';

export default async (args: migrateParamTask, hre: HardhatRuntimeEnvironment) => {
    const { signer, migrationsData, initialState, writeState, deployExecute } = await getMigrateParams(hre, args);

    let state = initialState;

    // If there is no migration to run, exit
    if (migrationsData.length === 0) {
        log.done(`Nothing to migrate ⚡️`);
        return;
    }

    let currentNetworkState: any = state.networkState;
    for (const migrationData of migrationsData) {
        const migration: Migration = importCsjOrEsModule(migrationData.fullPath);

        log.executing(`Executing ${migrationData.fileName}, timestamp: ${migrationData.migrationTimestamp}`);

        try {
            currentNetworkState = await migration.up(signer, currentNetworkState, deployExecute);

            // If healthcheck doesn't pass
            if (!(await migration.healthcheck(signer, currentNetworkState, deployExecute))) {
                log.error("Healthcheck didn't pass");
                // @TODO revert the migration here
                return;
            }

            // If healthcheck passed, update the state and write it to the system
            state = {
                migrationState: { latestMigration: migrationData.migrationTimestamp },
                networkState: currentNetworkState
            };
            writeState(state);
        } catch (e) {
            log.error('Migration execution failed');
            log.error(e);
            // @TODO revert the migration here
            return;
        }
    }
    log.done(`Migration(s) complete ⚡️`);
};
