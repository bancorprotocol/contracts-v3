/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function */
import { engine } from '../../engine';
import { deployedContract, Migration } from '../../engine/Types';

const { signer, contracts } = engine;
const { deploy, execute, deployProxy, upgradeProxy } = engine.executionFunctions;

type InitialState = Record<string, unknown>;

type NextState = Record<string, unknown>;

const migration: Migration = {
    up: async (initialState: InitialState): Promise<NextState> => {
        return {};
    },

    healthCheck: async (initialState: any, newState: any) => {
        throw new Error('ERROR');
    },

    down: async (initialState: InitialState, newState: NextState): Promise<InitialState> => {
        return initialState;
    }
};

export default migration;
