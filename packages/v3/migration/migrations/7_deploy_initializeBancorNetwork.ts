import { NextState as InitialState } from './6_deploy_liquidityPoolCollection';
import { OwnerNotSetOrCorrect } from 'migration/engine/errors/errors';
import { Migration } from 'migration/engine/types';

export type NextState = InitialState;

const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute, createProxy }): Promise<NextState> => {
        const bancorNetwork = await contracts.BancorNetwork.attach(initialState.BancorNetwork);

        await execute('Initialize BancorNetwork', bancorNetwork.initialize, initialState.PendingWithdrawals);

        return initialState;
    },

    healthCheck: async (signer, contracts, state: NextState, { deploy, execute }) => {
        const bancorNetwork = await contracts.BancorNetwork.attach(state.BancorNetwork);

        if ((await bancorNetwork.owner()) !== (await signer.getAddress())) throw new OwnerNotSetOrCorrect();
    }
};
export default migration;
