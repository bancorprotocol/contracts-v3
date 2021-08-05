import { NextState as InitialState } from './3_deploy_vault';
import { deployedContract, Migration } from 'migration/engine/types';
import { NETWORK_TOKEN_POOL_TOKEN_NAME, NETWORK_TOKEN_POOL_TOKEN_SYMBOL } from 'test/helpers/Constants';

export type NextState = InitialState & {
    networkTokenPool: deployedContract;
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
            initialState.networkSettings,
            initialState.vault,
            networkTokenPoolToken.address
        );

        await execute(
            'Transfer token ownership to NetworkTokenPool',
            networkTokenPoolToken.transferOwnership,
            networkTokenPool.address
        );
        await execute('Initialize NetworkTokenPool', networkTokenPool.initialize);

        return {
            ...initialState,

            networkTokenPool: networkTokenPool.address,
            networkTokenPoolToken: networkTokenPoolToken.address
        };
    },

    healthCheck: async (signer, contracts, state: NextState, { deploy, execute }) => {},

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
