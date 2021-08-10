import { OwnerNotSetOrCorrect } from '../engine/errors/errors';
import { Migration } from '../engine/types';
import { NextState as InitialState } from './7_deploy_liquidityPoolCollection';

export type NextState = InitialState;

const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute, deployProxy }): Promise<NextState> => {
        const bancorNetwork = await contracts.BancorNetwork.attach(initialState.bancorNetwork);

        await execute('Initialize BancorNetwork', bancorNetwork.initialize, initialState.pendingWithdrawals);

        return initialState;
    },

    healthCheck: async (signer, contracts, state: NextState, { deploy, execute }) => {
        const bancorNetwork = await contracts.BancorNetwork.attach(state.bancorNetwork);

        if ((await bancorNetwork.owner()) !== (await signer.getAddress())) throw new OwnerNotSetOrCorrect();
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
