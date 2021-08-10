import { migrateParamTask } from '..';
import { importCsjOrEsModule } from '../../components/TaskUtils';
import { SystemState } from '../../migration/engine/types';
import { MIGRATION_DATA_FOLDER, MIGRATION_FOLDER, NETWORK_NAME, MIGRATION_CONFIG } from '../engine/config';
import { initMigration } from '../engine/initialization';
import { log } from '../engine/logger/logger';
import { Migration } from '../engine/types';
import fs from 'fs';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import path from 'path';

export default async (args: migrateParamTask, hre: HardhatRuntimeEnvironment) => {
    const { signer, contracts, migrationsData, initialState, writeState, executionFunctions } = await initMigrate(
        hre,
        args
    );

    let currentState = initialState;

    // if there is no migration to run, exit
    if (migrationsData.length === 0) {
        log.done(`Nothing to migrate ⚡️`);
        return;
    }

    for (let index = 0; index < migrationsData.length; index++) {
        const migrationData = migrationsData[index];

        const migration: Migration = importCsjOrEsModule(migrationData.fullPath);

        log.executing(`Executing ${migrationData.fileName}, timestamp: ${migrationData.migrationTimestamp}`);

        // save oldState
        const oldState = currentState;
        try {
            currentState.networkState = await migration.up(
                signer,
                contracts,
                currentState.networkState,
                executionFunctions
            );

            try {
                await migration.healthCheck(signer, contracts, currentState.networkState, executionFunctions);
                log.success('Health check success ✨ ');
            } catch (e) {
                log.error('Health check failed: ' + e);
                // @TODO revert process here
                return;
            }

            // if health check passed, update the state and write it to the system
            currentState = {
                migrationState: { latestMigration: migrationData.migrationTimestamp },
                networkState: currentState.networkState
            };
            writeState(currentState);
        } catch (e) {
            log.error('Migration execution failed: ' + e);
            log.error('Aborting ...');
            return;
        }
    }

    log.done(`Migration(s) complete ⚡️`);
};

type migrationData = {
    fullPath: string;
    fileName: string;
    migrationTimestamp: number;
};
export const initMigrate = async (hre: HardhatRuntimeEnvironment, args: migrateParamTask) => {
    const { signer, contracts, executionSettings, executionFunctions } = await initMigration(args);

    const pathToState = path.join(hre.config.paths.root, MIGRATION_DATA_FOLDER, NETWORK_NAME);

    // if reset, delete all the files in the corresponding network folder
    if (args.reset) {
        log.info(`Resetting ${NETWORK_NAME} migratation folder`);
        fs.rmSync(pathToState, {
            recursive: true,
            force: true
        });
    }

    // if network folder doesn't exist, create it
    if (!fs.existsSync(pathToState)) {
        fs.mkdirSync(pathToState);
    }

    // read all files into the folder and fetch any state file
    const pathToStateFolder = fs.readdirSync(pathToState);
    const stateFile = pathToStateFolder.find((fileName: string) => fileName === 'state.json');

    const writeState = async (state: SystemState) => {
        fs.writeFileSync(path.join(pathToState, 'state.json'), JSON.stringify(state, null, 4));
    };
    const fetchState = (pathToState: string) => {
        return JSON.parse(fs.readFileSync(path.join(pathToState, 'state.json'), 'utf-8')) as SystemState;
    };

    let state = {
        migrationState: {
            latestMigration: -1
        },
        networkState: {}
    };

    // if network is a fork fetch info from original network
    if (args.reset && MIGRATION_CONFIG.isFork) {
        try {
            log.info(`Fetching initial state from ${MIGRATION_CONFIG.originalNetwork}`);
            state = fetchState(
                path.join(hre.config.paths.root, MIGRATION_DATA_FOLDER, MIGRATION_CONFIG.originalNetwork)
            );
        } catch (e) {
            log.error(
                `${MIGRATION_CONFIG.originalNetwork} doesn't have a config (needed if you want to fork it), aborting.`
            );
            process.exit();
        }
    }

    // if there is no state file in the network's folder, create an empty one
    if (!stateFile) {
        writeState(state);
    }
    const initialState = fetchState(pathToState);

    // generate migration files
    const pathToMigrationFiles = path.join(hre.config.paths.root, MIGRATION_FOLDER);
    const allMigrationFiles = fs.readdirSync(pathToMigrationFiles);
    const migrationFiles = allMigrationFiles.filter((fileName: string) => fileName.endsWith('.ts'));
    const migrationFilesPath = migrationFiles.map((fileName: string) => path.join(pathToMigrationFiles, fileName));
    const migrationsData: migrationData[] = [];
    for (const migrationFilePath of migrationFilesPath) {
        const fileName = path.basename(migrationFilePath);
        const migrationId = Number(fileName.split('_')[0]);
        if (migrationId > initialState.migrationState.latestMigration) {
            migrationsData.push({
                fullPath: migrationFilePath,
                fileName: fileName,
                migrationTimestamp: migrationId
            });
        }
    }

    // even if migrations should be automatically sorted by the dir fetching, sort again just in case
    migrationsData.sort((a, b) =>
        a.migrationTimestamp > b.migrationTimestamp ? 1 : b.migrationTimestamp > a.migrationTimestamp ? -1 : 0
    );

    return {
        signer,
        contracts,
        executionFunctions,
        executionSettings,
        initialState,
        writeState,
        migrationsData
    };
};
