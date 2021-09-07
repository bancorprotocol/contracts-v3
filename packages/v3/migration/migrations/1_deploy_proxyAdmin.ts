import { engine } from '../../migration/engine';
import { deployedContract, Migration } from '../engine/types';
import { NextState as InitialState } from './0_deploy_basics';

const { signer, contracts } = engine;
const { deploy, execute, deployProxy, upgradeProxy } = engine.executionFunctions;

export type NextState = InitialState & {
    proxyAdmin: deployedContract;
};

const migration: Migration = {
    up: async (initialState: InitialState): Promise<NextState> => {
        const proxyAdmin = await deploy(contracts.ProxyAdmin);

        return {
            ...initialState,

            proxyAdmin: proxyAdmin.address
        };
    },

    healthCheck: async (initialState: InitialState, state: NextState) => {
        const proxyAdmin = await contracts.ProxyAdmin.attach(state.proxyAdmin);

        if ((await proxyAdmin.owner()) !== (await signer.getAddress())) throw new Error('Invalid Owner');
    },

    down: async (initialState: InitialState, newState: NextState): Promise<InitialState> => {
        return initialState;
    }
};
export default migration;
