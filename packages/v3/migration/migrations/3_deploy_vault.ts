import { NextState as InitialState } from './2_deploy_network';
import { deployedContract, Migration } from 'migration/engine/types';

export type NextState = InitialState & {
    Vault: deployedContract;
};

const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute, createProxy }): Promise<NextState> => {
        const proxyAdmin = await contracts.ProxyAdmin.attach(initialState.ProxyAdmin);

        const vault = await createProxy(proxyAdmin, contracts.BancorVault, [], initialState.BNT.token);

        return {
            ...initialState,

            Vault: vault.address
        };
    },

    healthCheck: async (signer, contracts, state: NextState, { deploy, execute }) => {
        const ProxyAdmin = await contracts.ProxyAdmin.attach(state.ProxyAdmin);

        if ((await ProxyAdmin.owner()) !== (await signer.getAddress())) return false;

        return true;
    }
};
export default migration;
