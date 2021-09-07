import { engine } from '../../migration/engine';
import { Migration } from '../engine/types';
import { NextState as InitialState } from './7_deploy_liquidityPoolCollection';

const { signer, contracts } = engine;
const { deploy, execute, deployProxy, upgradeProxy } = engine.executionFunctions;

export type NextState = InitialState;

const migration: Migration = {
    up: async (initialState: InitialState): Promise<NextState> => {
        const bancorNetwork = await contracts.BancorNetwork.attach(initialState.bancorNetwork.proxyContract);

        await execute(
            'Initialize BancorNetwork',
            bancorNetwork.initialize,
            initialState.pendingWithdrawals.proxyContract
        );

        return initialState;
    },

    healthCheck: async (initialState: InitialState, state: NextState) => {
        const bancorNetwork = await contracts.BancorNetwork.attach(state.bancorNetwork.proxyContract);

        if ((await bancorNetwork.owner()) !== (await signer.getAddress())) throw new Error('Invalid Owner');
    },

    down: async (initialState: InitialState, newState: NextState): Promise<InitialState> => {
        return initialState;
    }
};
export default migration;
