import { engine } from '../../migration/engine';
import { NETWORK_TOKEN_POOL_TOKEN_NAME, NETWORK_TOKEN_POOL_TOKEN_SYMBOL } from '../../test/helpers/Constants';
import { deployedContract, deployedProxy, Migration } from '../engine/types';
import { NextState as InitialState } from './4_deploy_vault';

const { signer, deploy, contracts, deployProxy, execute } = engine;

export type NextState = InitialState & {
    networkTokenPool: deployedProxy;
    networkPoolToken: deployedContract;
};

const migration: Migration = {
    up: async (initialState: InitialState): Promise<NextState> => {
        const proxyAdmin = await contracts.ProxyAdmin.attach(initialState.proxyAdmin);

        const networkPoolToken = await contracts.PoolToken.deploy(
            NETWORK_TOKEN_POOL_TOKEN_NAME,
            NETWORK_TOKEN_POOL_TOKEN_SYMBOL,
            initialState.BNT.token
        );

        const networkTokenPool = await deployProxy(
            proxyAdmin,
            contracts.NetworkTokenPool,
            'skipInit',
            initialState.bancorNetwork.proxyContract,
            initialState.vault.proxyContract,
            networkPoolToken.address
        );

        await execute(
            'Transfer token ownership to NetworkTokenPool',
            networkPoolToken.transferOwnership,
            networkTokenPool.proxy.address
        );

        return {
            ...initialState,

            networkTokenPool: {
                proxyContract: networkTokenPool.proxy.address,
                logicContract: networkTokenPool.logicContractAddress
            },
            networkPoolToken: networkPoolToken.address
        };
    },

    healthCheck: async (initialState: InitialState, state: NextState) => {},

    down: async (initialState: InitialState, newState: NextState): Promise<InitialState> => {
        return initialState;
    }
};
export default migration;
