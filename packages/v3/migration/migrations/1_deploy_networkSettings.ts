import { NextState as InitialState } from './0_deploy_proxyAdmin';
import { deployedContract, Migration } from 'migration/engine/types';

export type NextState = InitialState & {
    NetworkSettings: deployedContract;
};

const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute, createProxy }): Promise<NextState> => {
        const proxyAdmin = await contracts.ProxyAdmin.attach(initialState.ProxyAdmin);

        const networkSettings = await createProxy(proxyAdmin, contracts.NetworkSettings, []);

        return {
            ...initialState,

            NetworkSettings: networkSettings.address
        };
    },

    healthCheck: async (signer, contracts, state: NextState, { deploy, execute }) => {
        const ProxyAdmin = await contracts.ProxyAdmin.attach(state.ProxyAdmin);

        if ((await ProxyAdmin.owner()) !== (await signer.getAddress())) return false;

        return true;
    }
};
export default migration;
