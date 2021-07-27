import { NextState as InitialState } from './0_deploy_proxyAdmin';
import { deployedProxy, Migration } from 'migration/engine/types';

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

        const networkSettings = await createProxy(admin, contracts.NetworkSettings, []);

        const bancorNetwork = await createProxy(admin, contracts.BancorNetwork, 'skipInit', networkSettings.address);

        const vault = await createProxy(admin, contracts.BancorVault, [], initialState.BNT.token);

        const networkTokenPool = await createProxy(
            admin,
            contracts.NetworkTokenPool,
            [],
            networkSettings.address,
            vault.address
        );

        const pendingWithdrawals = await createProxy(
            admin,
            contracts.PendingWithdrawals,
            [],
            networkSettings.address,
            networkTokenPool.address
        );

        const collection = await createProxy(
            admin,
            contracts.LiquidityPoolCollection,
            'skipInit',
            networkSettings.address
        );

        await execute('Initialize BancorNetwork', bancorNetwork.initialize, pendingWithdrawals.address);

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
