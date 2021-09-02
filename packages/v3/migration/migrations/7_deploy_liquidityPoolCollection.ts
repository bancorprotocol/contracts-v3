import { deployedContract, Migration } from '../engine/types';
import { NextState as InitialState } from './6_deploy_pendingWithdrawals';

export type NextState = InitialState & {
    poolCollection: deployedContract;
};

const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute, deployProxy }): Promise<NextState> => {
        const poolCollection = await deploy(contracts.PoolCollection, initialState.bancorNetwork.proxyContract);
        return {
            ...initialState,

            poolCollection: poolCollection.address
        };
    },

    healthCheck: async (
        signer,
        config,
        contracts,
        initialState: InitialState,
        state: NextState,
        { deploy, execute }
    ) => {
        const poolCollection = await contracts.PoolCollection.attach(state.poolCollection);

        if ((await poolCollection.owner()) !== (await signer.getAddress())) throw new Error('Invalid Owner');
    },

    down: async (
        signer,
        contracts,
        initialState: InitialState,
        newState: NextState,
        { deploy, execute }
    ): Promise<InitialState> => {
        return initialState;
    }
};
export default migration;
