import { engine } from '../../migration/engine';
import { deployedProxy, Migration } from '../engine/types';
import { NextState as InitialState } from './5_deploy_networkTokenPool';

const { signer, contracts } = engine;
const { deploy, execute, deployProxy, upgradeProxy } = engine.executionFunctions;

export type NextState = InitialState & {
    pendingWithdrawals: deployedProxy;
};

const migration: Migration = {
    up: async (initialState: InitialState): Promise<NextState> => {
        const proxyAdmin = await contracts.ProxyAdmin.attach(initialState.proxyAdmin);

        const pendingWithdrawals = await deployProxy(
            proxyAdmin,
            contracts.TestPendingWithdrawals,
            [],
            initialState.bancorNetwork.proxyContract,
            initialState.networkTokenPool.proxyContract
        );

        const networkTokenPool = await contracts.NetworkTokenPool.attach(initialState.networkTokenPool.proxyContract);
        await execute('Initialize NetworkTokenPool', networkTokenPool.initialize, pendingWithdrawals.proxy.address);

        return {
            ...initialState,

            pendingWithdrawals: {
                proxyContract: pendingWithdrawals.proxy.address,
                logicContract: pendingWithdrawals.logicContractAddress
            }
        };
    },

    healthCheck: async (initialState: InitialState, state: NextState) => {
        const pendingWithdrawals = await contracts.PendingWithdrawals.attach(state.pendingWithdrawals.proxyContract);

        if ((await pendingWithdrawals.owner()) !== (await signer.getAddress())) throw new Error('Invalid Owner');
    },

    down: async (initialState: InitialState, newState: NextState): Promise<InitialState> => {
        return initialState;
    }
};
export default migration;
