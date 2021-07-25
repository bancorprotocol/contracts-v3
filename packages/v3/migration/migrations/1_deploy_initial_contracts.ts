import { deployedProxy, Migration } from 'migration/engine/types';
import { NextState as InitialState } from './0_deploy_proxyAdmin';

export type NextState = InitialState & {
    networkSettings: deployedProxy;
    bancorNetwork: deployedProxy;
    vault: deployedProxy;
    networkTokenPool: deployedProxy;
    pendingWithdrawals: deployedProxy;
    collection: deployedProxy;
};

const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute, createProxy }): Promise<NextState> => {
        const admin = await contracts.ProxyAdmin.attach(initialState.ProxyAdmin);

        const networkSettings = await createProxy(admin, contracts.NetworkSettings);
        await execute('Initialize NetworkSettings proxy', networkSettings.initialize);

        const bancorNetwork = await createProxy(admin, contracts.BancorNetwork, networkSettings.address);

        const vault = await createProxy(admin, contracts.BancorVault, initialState.BNT.token);
        await execute('Initialize Vault proxy', vault.initialize);

        const networkTokenPool = await createProxy(
            admin,
            contracts.NetworkTokenPool,
            networkSettings.address,
            vault.address
        );
        await execute('Initialize NetworkTokenPool proxy', networkTokenPool.initialize);

        const pendingWithdrawals = await createProxy(
            admin,
            contracts.PendingWithdrawals,
            networkSettings.address,
            networkTokenPool.address
        );
        await execute('Initialize PendingWithdrawals proxy', pendingWithdrawals.initialize);

        const collection = await createProxy(admin, contracts.LiquidityPoolCollection, networkSettings.address);

        await execute('Initialize Network proxy', bancorNetwork.initialize, pendingWithdrawals.address);

        return {
            ...initialState,

            networkSettings: networkSettings.address,
            bancorNetwork: bancorNetwork.address,
            vault: vault.address,
            networkTokenPool: networkTokenPool.address,
            pendingWithdrawals: pendingWithdrawals.address,
            collection: collection.address
        };
    },

    healthCheck: async (signer, contracts, state: NextState, { deploy, execute }) => {
        return true;
    }
};
export default migration;
