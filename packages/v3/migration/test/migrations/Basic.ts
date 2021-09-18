import { engine } from '../../engine';
import { deployedContract, Migration } from '../../engine/Types';

const { signer, contracts } = engine;
const { deploy, execute, deployProxy, upgradeProxy } = engine.executionFunctions;

type InitialState = {};

type NextState = {
    BNT: deployedContract;
};

const migration: Migration = {
    up: async (initialState: InitialState): Promise<NextState> => {
        const BNT = await contracts.TestERC20Token.deploy('Bancor Network Token', 'BNT', 100000000000);

        return {
            BNT: BNT.address
        };
    },

    healthCheck: async (initialState: any, newState: any) => {},

    down: async (initialState: InitialState, newState: NextState): Promise<InitialState> => {
        return initialState;
    }
};

export default migration;
