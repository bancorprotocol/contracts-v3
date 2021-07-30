import fs from 'fs';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { createMigrationParamTask } from 'migration';
import { MIGRATION_FOLDER } from 'migration/engine/config';
import { log } from 'migration/engine/logger/logger';
import path from 'path';

export default async (args: createMigrationParamTask, hre: HardhatRuntimeEnvironment) => {
    const templateMigrationFile = `import { deployedContract, Migration } from 'migration/engine/types';

export type InitialState = {};
    
export type State = {
    BNT: deployedContract;
};
    
const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute }): Promise<State> => {
        const BNT = await deploy(contracts.TestERC20Token, 'BNT', 'BNT', 1000000);
    
        return {
            ...initialState,
    
            BNT: BNT.address
        };
    },
    
    healthCheck: async (signer, contracts, state: State, { deploy, execute }) => {}
};
    
export default migration;
    
`;

    if (args.migrationName === '') {
        throw new Error('File name cannot be empty');
    }

    const migrationTimestamp = Date.now();

    const fileName = `${migrationTimestamp}_${args.migrationName}.ts`;

    const pathToNewMigrationFile = path.join(hre.config.paths.root, MIGRATION_FOLDER, fileName);
    fs.writeFileSync(pathToNewMigrationFile, templateMigrationFile);

    log.done(`Migration file created ⚡️`);
};
