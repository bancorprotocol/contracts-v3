import { migrateParamTask } from '../..';
import { MIGRATION_DATA_FOLDER, MIGRATION_FOLDER, NETWORK_NAME, MIGRATION_CONFIG } from '../config';
import { initMigration } from '../initialization';
import { log } from '../logger/logger';
import fs from 'fs';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { SystemState } from 'migration/engine/types';
import path from 'path';

export const initMigrate = async (hre: HardhatRuntimeEnvironment, args: migrateParamTask) => {
    const { signer, contracts, executionSettings, executionFunctions } = await initMigration(args);

    const pathToState = path.join(hre.config.paths.root, MIGRATION_DATA_FOLDER, NETWORK_NAME);

    // If reset, delete all the files in the corresponding network folder
    if (args.reset) {
        log.info(`Resetting ${NETWORK_NAME} migratation folder`);
        fs.rmSync(pathToState, {
            recursive: true,
            force: true
        });
    }

    // If network folder doesn't exist, create it
    if (!fs.existsSync(pathToState)) {
        fs.mkdirSync(pathToState);
    }

    // Read all files into the folder and fetch any state file
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

    // If network is a fork fetch info from original network
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

    // If there is no state file in the network's folder, create an empty one
    if (!stateFile) {
        writeState(state);
    }
    const initialState = fetchState(pathToState);

    // Generate migration files
    const pathToMigrationFiles = path.join(hre.config.paths.root, MIGRATION_FOLDER);
    const allMigrationFiles = fs.readdirSync(pathToMigrationFiles);
    const migrationFiles = allMigrationFiles.filter((fileName: string) => fileName.endsWith('.ts'));
    const migrationFilesPath = migrationFiles.map((fileName: string) => path.join(pathToMigrationFiles, fileName));
    const migrationsData: {
        fullPath: string;
        fileName: string;
        migrationTimestamp: number;
    }[] = [];
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

    // Even if migrations should be automatically sorted by the dir fetching, sort again just in case
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
