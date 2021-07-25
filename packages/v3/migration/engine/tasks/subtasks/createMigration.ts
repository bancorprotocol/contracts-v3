import fs from 'fs';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { MIGRATION_FOLDER } from 'migration/config';
import { createMigrationParamTask } from 'migration/engine';
import { log } from 'migration/engine/logger/logger';
import path from 'path';

export default async (args: createMigrationParamTask, hre: HardhatRuntimeEnvironment) => {
    const templateMigrationFile = `import { deployedContract, Migration } from 'migration/engine/types';

export type InitialState = {};
    
export type State = {
    BNT: deployedContract;
};
    
const migration: Migration = {
    up: async (signer, contracts, V2State: InitialState, { deploy, execute }): Promise<State> => {
        const BNT = await deploy('BNTContract', contracts.TestERC20Token.deploy, 'BNT', 'BNT', 1000000);

        return {
            BNT: BNT.address
        };
    },

    healthCheck: async (signer, contracts, state: State, { deploy, execute }) => {
        return true;
    }
};

export default migration;
`;

    if (args.migrationName === '') {
        throw new Error('File name cannot be empty');
    }

    const migrationId = Date.now();

    const fileName = `${migrationId}_${args.migrationName}.ts`;

    const pathToNewMigrationFile = path.join(hre.config.paths.root, MIGRATION_FOLDER, fileName);
    fs.writeFileSync(pathToNewMigrationFile, templateMigrationFile);

    log.done(`Migration file created ⚡️`);
};
