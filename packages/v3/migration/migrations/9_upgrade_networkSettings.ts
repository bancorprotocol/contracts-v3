import { engine } from '../../migration/engine';
import { Migration } from '../engine/types';
import { NextState as InitialState } from './8_deploy_initializeBancorNetwork';

const { signer, deploy, contracts, upgradeProxy } = engine;

export type NextState = InitialState;

const migration: Migration = {
    up: async (initialState: InitialState): Promise<NextState> => {
        const proxyAdmin = await contracts.ProxyAdmin.attach(initialState.proxyAdmin);
        const networkSettings = await upgradeProxy(
            proxyAdmin,
            contracts.NetworkSettings,
            initialState.networkSettings.proxyContract,
            'skipInit'
        );

        return {
            ...initialState,
            networkSettings: { ...initialState.networkSettings, logicContract: networkSettings.logicContractAddress }
        };
    },

    healthCheck: async (initialState: InitialState, state: NextState) => {
        const proxyAdmin = await contracts.ProxyAdmin.attach(state.proxyAdmin);

        const implementationAddress = await proxyAdmin.getProxyImplementation(state.networkSettings.proxyContract);
        if (
            implementationAddress !== state.networkSettings.logicContract ||
            implementationAddress === initialState.networkSettings.logicContract
        ) {
            throw new Error("Proxy haven't been properly upgraded");
        }
    },

    down: async (initialState: InitialState, newState: NextState): Promise<InitialState> => {
        return initialState;
    }
};
export default migration;
