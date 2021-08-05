import { NextState as InitialState } from './2_deploy_network';
import { OwnerNotSetOrCorrect } from 'migration/engine/errors/errors';
import { deployedContract, Migration } from 'migration/engine/types';

export type NextState = InitialState & {
    vault: deployedContract;
};

const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute, deployProxy }): Promise<NextState> => {
        const proxyAdmin = await contracts.ProxyAdmin.attach(initialState.proxyAdmin);

        const bancorVault = await deployProxy(proxyAdmin, contracts.BancorVault, [], initialState.BNT.token);

        return {
            ...initialState,

            vault: bancorVault.address
        };
    },

    healthCheck: async (signer, contracts, state: NextState, { deploy, execute }) => {
        const bancorVault = await contracts.BancorVault.attach(state.vault);

        if (!(await bancorVault.hasRole(await bancorVault.ROLE_ADMIN(), await signer.getAddress())))
            throw new OwnerNotSetOrCorrect();
    },

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
