import { NETWORK_TOKEN_POOL_TOKEN_NAME, NETWORK_TOKEN_POOL_TOKEN_SYMBOL } from '../../test/helpers/Constants';
import { deployedContract, deployedProxy, Migration } from '../engine/types';
import { NextState as InitialState } from './4_deploy_vault';

export type NextState = InitialState & {
    networkTokenPool: deployedProxy;
    networkTokenPoolToken: deployedContract;
};

const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute, deployProxy }): Promise<NextState> => {
        const proxyAdmin = await contracts.ProxyAdmin.attach(initialState.proxyAdmin);

        const networkTokenPoolToken = await contracts.PoolToken.deploy(
            NETWORK_TOKEN_POOL_TOKEN_NAME,
            NETWORK_TOKEN_POOL_TOKEN_SYMBOL,
            initialState.BNT.token
        );

        const networkTokenPool = await deployProxy(
            proxyAdmin,
            contracts.TestNetworkTokenPool,
            'skipInit',
            initialState.networkSettings.proxyContract,
            initialState.vault.proxyContract,
            networkTokenPoolToken.address
        );

        await execute(
            'Transfer token ownership to NetworkTokenPool',
            networkTokenPoolToken.transferOwnership,
            networkTokenPool.proxy.address
        );
        await execute('Initialize NetworkTokenPool', networkTokenPool.proxy.initialize);

        return {
            ...initialState,

            networkTokenPool: {
                proxyContract: networkTokenPool.proxy.address,
                logicContract: networkTokenPool.logicContractAddress
            },
            networkTokenPoolToken: networkTokenPoolToken.address
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
