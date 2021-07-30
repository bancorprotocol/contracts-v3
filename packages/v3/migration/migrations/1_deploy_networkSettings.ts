import { NextState as InitialState } from './0_deploy_proxyAdmin';
import { OwnerNotSetOrCorrect } from 'migration/engine/errors/errors';
import { deployedContract, Migration } from 'migration/engine/types';

export type NextState = InitialState & {
    NetworkSettings: deployedContract;
};

const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute, deployProxy }): Promise<NextState> => {
        const proxyAdmin = await contracts.ProxyAdmin.attach(initialState.ProxyAdmin);

        const networkSettings = await deployProxy(proxyAdmin, contracts.NetworkSettings, []);

        return {
            ...initialState,

            NetworkSettings: networkSettings.address
        };
    },

    healthCheck: async (signer, contracts, state: NextState, { deploy, execute }) => {
        const networkSettings = await contracts.NetworkSettings.attach(state.NetworkSettings);

        if ((await networkSettings.owner()) !== (await signer.getAddress())) throw new OwnerNotSetOrCorrect();
    }
};
export default migration;
