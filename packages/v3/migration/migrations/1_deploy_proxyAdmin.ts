import { InvalidOwner } from '../engine/errors/errors';
import { deployedContract, Migration } from '../engine/types';
import { NextState as InitialState } from './0_deploy_basics';

export type NextState = InitialState & {
    proxyAdmin: deployedContract;
};

const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute }): Promise<NextState> => {
        const proxyAdmin = await deploy(contracts.ProxyAdmin);

        return {
            ...initialState,

            proxyAdmin: proxyAdmin.address
        };
    },

    healthCheck: async (signer, contracts, initialState: InitialState, state: NextState, { deploy, execute }) => {
        const proxyAdmin = await contracts.ProxyAdmin.attach(state.proxyAdmin);

        if ((await proxyAdmin.owner()) !== (await signer.getAddress())) throw new InvalidOwner();
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
