import { engine } from '../../migration/engine';
import { deployedProxy, Migration } from '../engine/types';
import { NextState as InitialState } from './2_deploy_networkSettings';

const { signer, contracts } = engine;
const { deploy, execute, deployProxy, upgradeProxy } = engine.executionFunctions;

export type NextState = InitialState & {
    bancorNetwork: deployedProxy;
};

const migration: Migration = {
    up: async (initialState: InitialState): Promise<NextState> => {
        const proxyAdmin = await contracts.ProxyAdmin.attach(initialState.proxyAdmin);

        const bancorNetwork = await deployProxy(
            proxyAdmin,
            contracts.BancorNetwork,
            'skipInit',
            initialState.BNT.governance,
            initialState.vBNT.governance,
            initialState.networkSettings.proxyContract
        );

        return {
            ...initialState,

            bancorNetwork: {
                proxyContract: bancorNetwork.proxy.address,
                logicContract: bancorNetwork.logicContractAddress
            }
        };
    },

    healthCheck: async (initialState: InitialState, state: NextState) => {},

    down: async (initialState: InitialState, newState: NextState): Promise<InitialState> => {
        return initialState;
    }
};
export default migration;
