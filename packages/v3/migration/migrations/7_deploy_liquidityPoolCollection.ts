import { InvalidOwner } from '../engine/errors/errors';
import { deployedContract, Migration } from '../engine/types';
import { NextState as InitialState } from './6_deploy_pendingWithdrawals';

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

    healthCheck: async (signer, contracts, initialState: InitialState, state: NextState, { deploy, execute }) => {
        const poolCollection = await contracts.PoolCollection.attach(state.poolCollection);

        if ((await poolCollection.owner()) !== (await signer.getAddress())) throw new InvalidOwner();
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
