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
        const BNTToken = await deploy(contracts.BNT, 'Bancor Network Token', 'BNT', 18);
        const vBNTToken = await deploy(contracts.vBNT, 'Bancor Governance Token', 'vBNT', 18);

        return {
            BNT: BNTToken.address,
            vBNT: vBNTToken.address
        };
    },

    healthCheck: async (initialState: InitialState, state: NextState) => {
        const BNT = await contracts.BNT.attach(state.BNT);
        const vBNT = await contracts.vBNT.attach(state.vBNT);

        if ((await BNT.owner()) !== (await signer.getAddress())) {
            throw new Error("BNT contract doesn't have the right owner");
        }

        if ((await vBNT.owner()) !== (await signer.getAddress())) {
            throw new Error("BNT contract doesn't have the right owner");
        }
    },

    down: async (initialState: InitialState, newState: NextState): Promise<InitialState> => {
        return initialState;
    }
};
export default migration;
