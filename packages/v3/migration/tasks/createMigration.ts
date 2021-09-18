import { createMigrationParamTask } from '..';
import { MIGRATION_DIR } from '../engine/Constants';
import { log } from '../engine/Logger';
import fs from 'fs';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import path from 'path';

export default async (args: createMigrationParamTask, hre: HardhatRuntimeEnvironment) => {
    const templateMigrationFile = `import { engine } from '../engine';
import { deployedContract, Migration } from '../engine/Types';
import { BigNumber } from 'ethers';

const { signer, contracts } = engine;
const { deploy, execute, deployProxy, upgradeProxy } = engine.executionFunctions;

export type InitialState = unknown;

export type NextState = InitialState & {
    myToken: deployedContract;
};

const migration: Migration = {
    up: async (initialState: InitialState): Promise<NextState> => {
        const myToken = await deploy(contracts.TestERC20Token, 'My Token', 'MYTKN', '100000000000000000000000000');
        return {
            myToken: myToken.address
        };
    },

    healthCheck: async (initialState: InitialState, state: NextState) => {
        const myToken = await contracts.TestERC20Token.attach(state.myToken);

        if (!((await myToken.totalSupply()) !== BigNumber.from('100000000000000000000000000'))) {
            throw new Error("Total supply isnt' correct");
        }
    },

    down: async (initialState: InitialState, newState: NextState): Promise<InitialState> => {
        return initialState;
    }
};

export default migration;
`;

    let migrationName = '';
    for (const a of args.wordList) {
        migrationName += '_' + a;
    }

    const migrationTimestamp = Date.now();

    const fileName = `${migrationTimestamp}${migrationName}.ts`;

    const pathToNewMigrationFile = path.join(hre.config.paths.root, MIGRATION_DIR, fileName);
    fs.writeFileSync(pathToNewMigrationFile, templateMigrationFile);

    log.done(`Migration file created ⚡️`);
};
