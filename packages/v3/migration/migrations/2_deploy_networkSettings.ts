import { engine } from '../../migration/engine';
import { deployedProxy, Migration } from '../engine/types';
import { NextState as InitialState } from './1_deploy_proxyAdmin';

const { signer, deploy, contracts, deployProxy } = engine;

export type NextState = InitialState & {
    networkSettings: deployedProxy;
};

const migration: Migration = {
    up: async (initialState: InitialState): Promise<NextState> => {
        const proxyAdmin = await contracts.ProxyAdmin.attach(initialState.proxyAdmin);

        const networkSettings = await deployProxy(proxyAdmin, contracts.NetworkSettings, []);

        return {
            ...initialState,

            networkSettings: {
                proxyContract: networkSettings.proxy.address,
                logicContract: networkSettings.logicContractAddress
            }
        };
    },

    healthCheck: async (initialState: InitialState, state: NextState) => {
        const networkSettings = await contracts.NetworkSettings.attach(state.networkSettings.proxyContract);

        if ((await networkSettings.owner()) !== (await signer.getAddress())) throw new Error('Invalid Owner');
    },

    down: async (initialState: InitialState, newState: NextState): Promise<InitialState> => {
        return initialState;
    }
};
export default migration;
