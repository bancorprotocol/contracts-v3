import { Engine } from './engine';
import { log } from './logger';
import { Migration, SystemState } from './types';
import { importCsjOrEsModule } from './utils';

export const migrate = async (engine: Engine) => {
    // if there is no migration to run, exit
    if (engine.migration.migrationsData.length === 0) {
        log.done(`Nothing to migrate ⚡️`);
        return;
    }

    engine.migration.stateSaves.push({ ...engine.migration.state });

    let index = 0;
    for (; index < engine.migration.migrationsData.length; index++) {
        const migrationData = engine.migration.migrationsData[index];

        const migration: Migration = importCsjOrEsModule(migrationData.fullPath);

        log.info(`Executing ${migrationData.fileName}, timestamp: ${migrationData.migrationTimestamp}`);

        try {
            engine.migration.state.networkState = await migration.up(engine.migration.state.networkState);

            try {
                await migration.healthCheck(
                    engine.migration.stateSaves[index].networkState,
                    engine.migration.state.networkState
                );
                log.success('Health check success ✨ ');
            } catch (e) {
                log.error('Health check failed');
                log.error(e.stack);
                break;
            }

            // if health check passed, update the state and write it to the system
            engine.migration.state = {
                migrationState: { latestMigration: migrationData.migrationTimestamp },
                networkState: engine.migration.state.networkState
            };
            engine.IO.state.write(engine.migration.state);
            engine.migration.stateSaves.push({ ...engine.migration.state });
        } catch (e) {
            log.error('Migration execution failed');
            log.error(e.stack);
            log.error('Aborting.');
            return;
        }
    }

    // if the index of the latest migration is not equal to the length of the migrationsData array then an error occured an we should revert
    if (index != engine.migration.migrationsData.length) {
        log.warning('Reverting ...');

        const migrationData = engine.migration.migrationsData[index];
        log.info(`Reverting ${migrationData.fileName}, timestamp: ${migrationData.migrationTimestamp}`);

        const migration: Migration = importCsjOrEsModule(migrationData.fullPath);

        engine.migration.state.networkState = await migration.down(
            engine.migration.stateSaves[index].networkState,
            engine.migration.state.networkState
        );

        // if revert passed, update the state and write it to the system
        engine.migration.state.migrationState = {
            latestMigration: engine.migration.stateSaves[index].migrationState.latestMigration
        };

        engine.IO.state.write(engine.migration.state);
        log.success(`${migrationData.fileName} reverted`);
    }

    log.done(`\nMigration(s) complete ⚡️`);
};
