import { NextState as InitialState } from './6_deploy_liquidityPoolCollection copy';
import { Migration } from 'migration/engine/types';

export type NextState = InitialState;

const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute, createProxy }): Promise<NextState> => {
        const bancorNetwork = await contracts.BancorNetwork.attach(initialState.BancorNetwork);

        await execute('Initialize BancorNetwork', bancorNetwork.initialize, initialState.PendingWithdrawals);

        return initialState;
    },

    healthCheck: async (signer, contracts, state: NextState, { deploy, execute }) => {
        const ProxyAdmin = await contracts.ProxyAdmin.attach(state.ProxyAdmin);

        if ((await ProxyAdmin.owner()) !== (await signer.getAddress())) return false;

        return true;
    }
};
export default migration;
