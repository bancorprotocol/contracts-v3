import { Engine } from './engine';
import { log } from './logger';
import { Migration } from './types';
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
        engine.migration.currentMigrationData = engine.migration.migrationsData[index];

        const migration: Migration = importCsjOrEsModule(engine.migration.currentMigrationData.fullPath);

        log.info(
            `Executing ${engine.migration.currentMigrationData.fileName}, timestamp: ${engine.migration.currentMigrationData.migrationTimestamp}`
        );

        try {
            engine.migration.state.networkState = await migration.up(engine.migration.state.networkState);

            try {
                await migration.healthCheck(
                    engine.migration.stateSaves[index].networkState,
                    engine.migration.state.networkState
                );
                log.success('Health check success ✨ ');
            } catch (e: any) {
                log.error('Health check failed');
                log.error(e.stack);
                break;
            }

            // if health check passed, update the state and write it to the system
            engine.migration.state = {
                migrationState: { latestMigration: engine.migration.currentMigrationData.migrationTimestamp },
                networkState: engine.migration.state.networkState
            };
            engine.IO.state.write(engine.migration.state);
            engine.migration.stateSaves.push({ ...engine.migration.state });
        } catch (e: any) {
            log.error('Migration execution failed');
            log.error(e.stack);
            log.error('Aborting.');
            return;
        }
    }

    // if the index of the latest migration is not equal to the length of the migrationsData array then an error occured an we should revert
    if (index !== engine.migration.migrationsData.length) {
        log.warning('Reverting ...');

        engine.migration.currentMigrationData = engine.migration.migrationsData[index];
        log.info(
            `Reverting ${engine.migration.currentMigrationData.fileName}, timestamp: ${engine.migration.currentMigrationData.migrationTimestamp}`
        );

        const migration: Migration = importCsjOrEsModule(engine.migration.currentMigrationData.fullPath);

        engine.migration.state.networkState = await migration.down(
            engine.migration.stateSaves[index].networkState,
            engine.migration.state.networkState
        );

        // if revert passed, update the state and write it to the system
        engine.migration.state.migrationState = {
            latestMigration: engine.migration.stateSaves[index].migrationState.latestMigration
        };

        engine.IO.state.write(engine.migration.state);
        log.success(`${engine.migration.currentMigrationData.fileName} reverted`);
    }

    log.done(`\nMigration(s) complete ⚡️`);
};
