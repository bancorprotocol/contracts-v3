import { InvalidRole } from '../engine/errors/errors';
import { deployedContract, Migration } from '../engine/types';
import { NextState as InitialState } from './2_deploy_networkSettings';

export type NextState = InitialState & {
    bancorNetwork: deployedContract;
};

const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute, deployProxy }): Promise<NextState> => {
        const proxyAdmin = await contracts.ProxyAdmin.attach(initialState.proxyAdmin);

        const bancorNetwork = await deployProxy(
            proxyAdmin,
            contracts.BancorNetwork,
            'skipInit',
            initialState.BNT.token,
            initialState.networkSettings
        );

        return {
            ...initialState,

            bancorNetwork: bancorNetwork.address
        };
    },

    healthCheck: async (signer, contracts, initialState: InitialState, state: NextState, { deploy, execute }) => {},

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
