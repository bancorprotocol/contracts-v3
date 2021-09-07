import { engine } from '../../migration/engine';
import { deployedProxy, Migration } from '../engine/types';
import { NextState as InitialState } from './3_deploy_network';

const { signer, deploy, contracts, deployProxy } = engine;

export type NextState = InitialState & {
    vault: deployedProxy;
};

const migration: Migration = {
    up: async (initialState: InitialState): Promise<NextState> => {
        const proxyAdmin = await contracts.ProxyAdmin.attach(initialState.proxyAdmin);

        const bancorVault = await deployProxy(proxyAdmin, contracts.BancorVault, [], initialState.BNT.token);

        return {
            ...initialState,

            vault: {
                proxyContract: bancorVault.proxy.address,
                logicContract: bancorVault.logicContractAddress
            }
        };
    },

    healthCheck: async (initialState: InitialState, state: NextState) => {
        const bancorVault = await contracts.BancorVault.attach(state.vault.proxyContract);

        if (!(await bancorVault.hasRole(await bancorVault.ROLE_ADMIN(), await signer.getAddress())))
            throw new Error('Invalid Owner');
    },

    down: async (initialState: InitialState, newState: NextState): Promise<InitialState> => {
        return initialState;
    }
};
export default migration;
