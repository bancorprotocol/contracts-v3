import { engine } from '../../migration/engine';
import { deployedContract, Migration } from '../engine/types';
import { NextState as InitialState } from './6_deploy_pendingWithdrawals';

const { signer, contracts } = engine;
const { deploy, execute, deployProxy, upgradeProxy } = engine.executionFunctions;

export type NextState = InitialState & {
    poolCollection: deployedContract;
};

const migration: Migration = {
    up: async (initialState: InitialState): Promise<NextState> => {
        const poolCollection = await deploy(contracts.PoolCollection, initialState.bancorNetwork.proxyContract);
        return {
            ...initialState,

            poolCollection: poolCollection.address
        };
    },

    healthCheck: async (initialState: InitialState, state: NextState) => {
        const poolCollection = await contracts.PoolCollection.attach(state.poolCollection);

        if ((await poolCollection.owner()) !== (await signer.getAddress())) throw new Error('Invalid Owner');
    },

    down: async (initialState: InitialState, newState: NextState): Promise<InitialState> => {
        return initialState;
    }
};
export default migration;
