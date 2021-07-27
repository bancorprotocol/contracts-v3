import { NextState as InitialState } from './1_deploy_networkSettings';
import { deployedContract, Migration } from 'migration/engine/types';

export type NextState = InitialState & {
    BancorNetwork: deployedContract;
};

const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute, createProxy }): Promise<NextState> => {
        const proxyAdmin = await contracts.ProxyAdmin.attach(initialState.ProxyAdmin);

        const bancorNetwork = await createProxy(
            proxyAdmin,
            contracts.BancorNetwork,
            'skipInit',
            initialState.NetworkSettings
        );

        return {
            ...initialState,

            BancorNetwork: bancorNetwork.address
        };
    },

    healthCheck: async (signer, contracts, state: NextState, { deploy, execute }) => {
        const ProxyAdmin = await contracts.ProxyAdmin.attach(state.ProxyAdmin);

        if ((await ProxyAdmin.owner()) !== (await signer.getAddress())) return false;

        return true;
    }
};
export default migration;
