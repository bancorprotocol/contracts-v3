import fs from 'fs';
import path from 'path';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { SystemState } from 'migration/engine/types';
import { migrateParamTask } from '../../tasks';
import { log } from '../../logger';
import { getDefaultParams, MIGRATION_DATA_FOLDER, MIGRATION_FOLDER } from '../../utils';

export const writeFetchState = (hre: HardhatRuntimeEnvironment) => {
    const pathToState = path.join(hre.config.paths.root, MIGRATION_DATA_FOLDER, hre.network.name);
    return {
        writeState: async (state: SystemState) => {
            fs.writeFileSync(path.join(pathToState, 'state.json'), JSON.stringify(state, null, 4));
        },
        fetchState: () => {
            return JSON.parse(fs.readFileSync(path.join(pathToState, 'state.json'), 'utf-8')) as SystemState;
        }
    };
};

export const getMigrateParams = async (hre: HardhatRuntimeEnvironment, args: migrateParamTask) => {
    const { signer, overrides, executionConfig, deployExecute } = await getDefaultParams(hre, args);

    // If reset, delete all the files in the corresponding network folder
    if (args.reset) {
        log.info(`Resetting ${hre.network.name} migratation folder`);
        fs.rmSync(path.join(hre.config.paths.root, MIGRATION_DATA_FOLDER, hre.network.name), {
            recursive: true
        });
    }

    // Deployment files
    let pathToDeploymentFiles = path.join(hre.config.paths.root, MIGRATION_DATA_FOLDER, hre.network.name);
    // If deployment folder doesn't exist, create it
    if (!fs.existsSync(pathToDeploymentFiles)) {
        fs.mkdirSync(pathToDeploymentFiles);
    }

    // Read all files into the folder and fetch any state file
    const allDeploymentFiles = fs.readdirSync(pathToDeploymentFiles);
    const deploymentFiles = allDeploymentFiles.filter((fileName: string) => fileName === 'state.json');

    const { writeState, fetchState } = writeFetchState(hre);

    // If there is no state file in the network's folder, create an empty one
    if (deploymentFiles.length === 0) {
        writeState({
            migrationState: {
                latestMigration: -1
            },
            networkState: {}
        });
    }
    const initialState = fetchState();

    // Migration files
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
        initialState,
        deployExecute,
        writeState,
        migrationsData,
        executionConfig,
        overrides
    };
};
