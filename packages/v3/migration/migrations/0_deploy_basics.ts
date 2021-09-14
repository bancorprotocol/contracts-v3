import { engine } from '../engine';
import { deployedContract, Migration } from '../engine/types';

const { signer, contracts } = engine;
const { deploy, execute, deployProxy, upgradeProxy } = engine.executionFunctions;

export type InitialState = unknown;

export type NextState = InitialState & {
    BNT: deployedContract;
    vBNT: deployedContract;
};

const migration: Migration = {
    up: async (initialState: InitialState): Promise<NextState> => {
        const BNTToken = await deploy(
            contracts.TestERC20Token,
            'Bancor Network Token',
            'BNT',
            '100000000000000000000000000'
        );

        const vBNTToken = await deploy(
            contracts.TestERC20Token,
            'Bancor Governance Token',
            'vBNT',
            '100000000000000000000000000'
        );

        return {
            BNT: BNTToken.address,
            vBNT: vBNTToken.address
        };
    },

    healthCheck: async (initialState: InitialState, state: NextState) => {
        const BNT = await contracts.ERC20.attach(state.BNT);
        const vBNT = await contracts.ERC20.attach(state.vBNT);
    },

    down: async (initialState: InitialState, newState: NextState): Promise<InitialState> => {
        return initialState;
    }
};
export default migration;
