import { Engine } from './Engine';
import { log } from './Logger';
import { Migration, SystemState } from './Types';
import { importCsjOrEsModule } from './Utils';
import fs from 'fs';
import path from 'path';
import { exit } from 'process';

export const migrateOneUp = async (
    migration: Migration,
    timestamp: number,
    oldNetworkState: any,
    currentNetworkState: any
) => {
    let newNetworkState: any;

    try {
        newNetworkState = await migration.up(currentNetworkState);

        try {
            await migration.healthCheck(oldNetworkState, newNetworkState);

            log.success('Health check success ✨ ');
        } catch (e: any) {
            log.error('Health check failed');
            log.error(e.stack);

            return undefined;
        }
    } catch (e: any) {
        log.error('Migration up failed');
        log.error(e.stack);
        log.error('Aborting.');

        exit(-1);
    }

    return {
        migrationState: { latestMigration: timestamp },
        networkState: newNetworkState
    };
};

export const migrateOneDown = async (
    migration: Migration,
    oldNetworkSystemState: SystemState,
    currentNetworkState: any
) => {
    let newNetworkState: any;
    try {
        newNetworkState = await migration.down(oldNetworkSystemState.networkState, currentNetworkState);
    } catch (e: any) {
        log.error('Migration down failed');
        log.error(e.stack);
        log.error('Aborting.');

        exit(-1);
    }

    return {
        migrationState: {
            latestMigration: oldNetworkSystemState.migrationState.latestMigration
        },
        networkState: newNetworkState
    };
};

export const migrate = async (engine: Engine) => {
    // if there is no migration to run, exit
    if (engine.migration.migrationsData.length === 0) {
        log.done(`Nothing to migrate ⚡️`);

        return;
    }

    engine.migration.stateSaves.push({ ...engine.migration.state });

    let index = 0;
    while (index++ < engine.migration.migrationsData.length) {
        const migrationData = engine.migration.migrationsData[index];

        const migration: Migration = importCsjOrEsModule(migrationData.fullPath);

        log.info(`Executing ${migrationData.fileName}, timestamp: ${migrationData.migrationTimestamp}`);

        // save the current migration data
        engine.migration.currentMigrationData = migrationData;

        const newSystemState = await migrateOneUp(
            migration,
            migrationData.migrationTimestamp,
            engine.migration.stateSaves[index].networkState,
            engine.migration.state.networkState
        );

        if (!newSystemState) {
            break;
        }

        // update migration state
        engine.migration.state = newSystemState;

        // add current state to saves
        engine.migration.stateSaves.push({ ...newSystemState });

        // write state to disk
        engine.IO.state.write(newSystemState);
    }

    // if the index of the latest migration is not equal to the length of the migrationsData array then an error occurred
    // an we should revert
    if (index !== engine.migration.migrationsData.length) {
        const migrationData = engine.migration.migrationsData[index];

        const migration: Migration = importCsjOrEsModule(migrationData.fullPath);

        log.info(`Reverting ${migrationData.fileName}, timestamp: ${migrationData.migrationTimestamp}`);

        const newSystemState = await migrateOneDown(
            migration,
            engine.migration.stateSaves[index],
            engine.migration.state.networkState
        );

        // update migration state
        engine.migration.state = newSystemState;

        // write state to disk
        engine.IO.state.write(engine.migration.state);

        // remove current migration deployment file
        fs.rmSync(
            path.join(engine.pathToNetworkDeploymentsFolder, engine.migration.currentMigrationData.fileName + '.json'),
            { force: true }
        );

        log.success(`${engine.migration.currentMigrationData.fileName} reverted`);
    }

    log.done(`\nMigration(s) complete ⚡️`);
};
