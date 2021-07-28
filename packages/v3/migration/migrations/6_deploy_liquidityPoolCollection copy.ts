import { NextState as InitialState } from './5_deploy_pendingWithdrawals';
import { deployedContract, Migration } from 'migration/engine/types';

export type NextState = InitialState & {
    LiquidityPoolCollection: deployedContract;
};

const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute, createProxy }): Promise<NextState> => {
        const proxyAdmin = await contracts.ProxyAdmin.attach(initialState.ProxyAdmin);

        const liquidityPoolCollection = await createProxy(
            proxyAdmin,
            contracts.LiquidityPoolCollection,
            'skipInit',
            initialState.NetworkSettings
        );
        return {
            ...initialState,

            LiquidityPoolCollection: liquidityPoolCollection.address
        };
    },

    healthCheck: async (signer, contracts, state: NextState, { deploy, execute }) => {
        const liquidityPoolCollection = await contracts.LiquidityPoolCollection.attach(state.LiquidityPoolCollection);

        if ((await liquidityPoolCollection.owner()) !== (await signer.getAddress())) return false;

        return true;
    }
};
export default migration;
