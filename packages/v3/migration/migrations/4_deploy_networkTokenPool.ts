import { NextState as InitialState } from './3_deploy_vault';
import { deployedContract, Migration } from 'migration/engine/types';

export type NextState = InitialState & {
    NetworkTokenPool: deployedContract;
};

const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute, createProxy }): Promise<NextState> => {
        const proxyAdmin = await contracts.ProxyAdmin.attach(initialState.ProxyAdmin);

        const networkTokenPool = await createProxy(
            proxyAdmin,
            contracts.NetworkTokenPool,
            [],
            initialState.NetworkSettings,
            initialState.Vault
        );
        return {
            ...initialState,

            NetworkTokenPool: networkTokenPool.address
        };
    },

    healthCheck: async (signer, contracts, state: NextState, { deploy, execute }) => {
        const ProxyAdmin = await contracts.ProxyAdmin.attach(state.ProxyAdmin);

        if ((await ProxyAdmin.owner()) !== (await signer.getAddress())) return false;

        return true;
    }
};
export default migration;
