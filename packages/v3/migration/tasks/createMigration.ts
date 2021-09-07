import { createMigrationParamTask } from '../../migration';
import { MIGRATION_FOLDER } from '../../migration/engine/engine';
import { log } from '../engine/logger';
import fs from 'fs';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import path from 'path';

export default async (args: createMigrationParamTask, hre: HardhatRuntimeEnvironment) => {
    const templateMigrationFile = `import { engine } from '../../migration/engine';
import { deployedContract, Migration } from '../../migration/engine/types';
    
const { signer, contracts } = engine;
const { deploy, execute, deployProxy, upgradeProxy } = engine.executionFunctions;
    
export type InitialState = {};
    
export type NextState = InitialState & {
    BNT: { token: deployedContract; governance: deployedContract };
};
    
const migration: Migration = {
    up: async (initialState: InitialState): Promise<NextState> => {
        const BNTToken = await deploy(
            contracts.TestERC20Token,
            'Bancor Network Token',
            'BNT',
            '100000000000000000000000000'
        );
    
        const BNTGovernance = await deploy(contracts.TokenGovernance, BNTToken.address);
    
        return {
            ...initialState,

            BNT: {
                token: BNTToken.address,
                governance: BNTGovernance.address
            }
        };
    },
    
    healthCheck: async (initialState: InitialState, state: NextState) => {
        const BNTGovernance = await contracts.TokenGovernance.attach(state.BNT.governance);
        if (!(await BNTGovernance.hasRole(await BNTGovernance.ROLE_SUPERVISOR(), await signer.getAddress())))
            throw new Error('Invalid Role');
    },
    
    down: async (initialState: InitialState, newState: NextState): Promise<InitialState> => {
        return initialState;
    }
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
