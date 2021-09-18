import { engine } from '../../engine';
import { deployedContract, Migration } from '../../engine/Types';

const { signer, contracts } = engine;
const { deploy, execute, deployProxy, upgradeProxy } = engine.executionFunctions;

type InitialState = {};

type NextState = {};

const migration: Migration = {
    up: async (initialState: InitialState): Promise<NextState> => {
        return {};
    },

    healthCheck: async (initialState: any, newState: any) => {
        throw new Error('');
    },

    down: async (initialState: InitialState, newState: NextState): Promise<InitialState> => {
        return initialState;
    }
};

export default migration;
