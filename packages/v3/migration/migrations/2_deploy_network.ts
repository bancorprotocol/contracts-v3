import { NextState as InitialState } from './1_deploy_networkSettings';
import { deployedContract, Migration } from 'migration/engine/types';

export type NextState = InitialState & {
    BancorNetwork: deployedContract;
};

const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute, deployProxy }): Promise<NextState> => {
        const proxyAdmin = await contracts.ProxyAdmin.attach(initialState.ProxyAdmin);

        const bancorNetwork = await deployProxy(
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

    healthCheck: async (signer, contracts, state: NextState, { deploy, execute }) => {}
};
export default migration;
