import { createMigrationParamTask } from '..';
import { MIGRATION_DIR } from '../engine/Constants';
import { log } from '../engine/Logger';
import fs from 'fs';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import path from 'path';

const SAMPLE_MIGRATION_PATH = path.resolve(__dirname, '../examples/0_deploy_my_token');

export default async (args: createMigrationParamTask, hre: HardhatRuntimeEnvironment) => {
    const migrationName = args.wordList.join('_');

    const migrationTimestamp = Date.now();
    const fileName = `${migrationTimestamp}${migrationName}.ts`;
    const pathToNewMigrationFile = path.join(hre.config.paths.root, MIGRATION_DIR, fileName);

    fs.writeFileSync(pathToNewMigrationFile, fs.readFileSync(SAMPLE_MIGRATION_PATH, 'utf-8'));

    log.done(`Migration file created ⚡️`);
};
