import { NextState as InitialState } from './4_deploy_networkTokenPool';
import { OwnerNotSetOrCorrect } from 'migration/engine/errors/errors';
import { deployedContract, Migration } from 'migration/engine/types';

export type NextState = InitialState & {
    PendingWithdrawals: deployedContract;
};

const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute, deployProxy }): Promise<NextState> => {
        const proxyAdmin = await contracts.ProxyAdmin.attach(initialState.ProxyAdmin);

        const pendingWithdrawals = await deployProxy(
            proxyAdmin,
            contracts.PendingWithdrawals,
            [],
            initialState.NetworkSettings,
            initialState.NetworkTokenPool
        );
        return {
            ...initialState,

            PendingWithdrawals: pendingWithdrawals.address
        };
    },

    healthCheck: async (signer, contracts, state: NextState, { deploy, execute }) => {
        const pendingWithdrawals = await contracts.PendingWithdrawals.attach(state.PendingWithdrawals);

        if ((await pendingWithdrawals.owner()) !== (await signer.getAddress())) throw new OwnerNotSetOrCorrect();
    }
};
export default migration;
