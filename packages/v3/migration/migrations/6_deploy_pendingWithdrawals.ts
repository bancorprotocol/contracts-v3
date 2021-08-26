import { deployedContract, Migration } from '../engine/types';
import { NextState as InitialState } from './5_deploy_networkTokenPool';

export type NextState = InitialState & {
    pendingWithdrawals: deployedContract;
};

const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute, deployProxy }): Promise<NextState> => {
        const proxyAdmin = await contracts.ProxyAdmin.attach(initialState.proxyAdmin);

        const pendingWithdrawals = await deployProxy(
            proxyAdmin,
            contracts.TestPendingWithdrawals,
            [],
            initialState.bancorNetwork,
            initialState.networkTokenPool
        );
        return {
            ...initialState,

            pendingWithdrawals: pendingWithdrawals.address
        };
    },

    healthCheck: async (signer, contracts, initialState: InitialState, state: NextState, { deploy, execute }) => {
        const pendingWithdrawals = await contracts.PendingWithdrawals.attach(state.pendingWithdrawals);

        if ((await pendingWithdrawals.owner()) !== (await signer.getAddress())) throw 'Invalid Owner';
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
