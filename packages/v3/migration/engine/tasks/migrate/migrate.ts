import { Migration } from '../../types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { importCsjOrEsModule } from 'components/TaskUtils';
import { log } from '../../logger';
import { migrateParamTask } from '..';
import { getMigrateParams } from './migrateUtils';
import Contracts from 'components/Contracts';

export default async (args: migrateParamTask, hre: HardhatRuntimeEnvironment) => {
    const { signer, migrationsData, initialState, writeState, deployExecute } = await getMigrateParams(hre, args);

    let state = initialState;

    // if there is no migration to run, exit
    if (migrationsData.length === 0) {
        log.done(`Nothing to migrate ⚡️`);
        return;
    }

    let currentNetworkState: any = state.networkState;
    for (const migrationData of migrationsData) {
        const migration: Migration = importCsjOrEsModule(migrationData.fullPath);

        log.executing(`Executing ${migrationData.fileName}, timestamp: ${migrationData.migrationTimestamp}`);

        // Save oldState
        const oldState = currentNetworkState;

        const contracts = Contracts.connect(signer);
        try {
            currentNetworkState = await migration.up(signer, contracts, currentNetworkState, deployExecute);

            // if healthcheck doesn't pass
            if (!(await migration.healthcheck(signer, contracts, currentNetworkState, deployExecute))) {
                log.error('Healthcheck failed');
                // @TODO revert the migration here
                return;
            }

            // if healthcheck passed, update the state and write it to the system
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
