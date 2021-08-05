import { NextState as InitialState } from './5_deploy_pendingWithdrawals';
import { OwnerNotSetOrCorrect } from 'migration/engine/errors/errors';
import { deployedContract, Migration } from 'migration/engine/types';

export type NextState = InitialState & {
    poolCollection: deployedContract;
};

const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute, deployProxy }): Promise<NextState> => {
        const poolCollection = await deploy(contracts.TestPoolCollection, initialState.bancorNetwork);
        return {
            ...initialState,

            poolCollection: poolCollection.address
        };
    },

    healthCheck: async (signer, contracts, state: NextState, { deploy, execute }) => {
        const poolCollection = await contracts.PoolCollection.attach(state.poolCollection);

        if ((await poolCollection.owner()) !== (await signer.getAddress())) throw new OwnerNotSetOrCorrect();
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
