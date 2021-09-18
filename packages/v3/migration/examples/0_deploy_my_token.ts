/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function */
import { engine } from '../engine';
import { deployedContract, Migration } from '../engine/Types';
import { BigNumber } from 'ethers';

const { signer, contracts } = engine;
const { deploy, execute, deployProxy, upgradeProxy } = engine.executionFunctions;

export type InitialState = unknown;

export type NextState = InitialState & {
    myToken: deployedContract;
};

const TOTAL_SUPPLY = BigNumber.from('100000000000000000000000000');

const migration: Migration = {
    up: async (initialState: InitialState): Promise<NextState> => {
        const myToken = await deploy(contracts.TestERC20Token, 'My Token', 'MYTKN', TOTAL_SUPPLY);
        return {
            myToken: myToken.address
        };
    },

    healthCheck: async (initialState: InitialState, state: NextState) => {
        const myToken = await contracts.TestERC20Token.attach(state.myToken);

        if (!(await myToken.totalSupply()).eq(TOTAL_SUPPLY)) {
            throw new Error("Total supply isn't correct");
        }
    },

    down: async (initialState: InitialState, newState: NextState): Promise<InitialState> => {
        return initialState;
    }
};

export default migration;
