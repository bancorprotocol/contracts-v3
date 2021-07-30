import { OwnerNotSetOrCorrect } from 'migration/engine/errors/errors';
import { deployedContract, Migration } from 'migration/engine/types';

export type InitialState = {
    BNT: { token: deployedContract; governance: deployedContract };
    vBNT: { token: deployedContract; governance: deployedContract };
};

export type NextState = InitialState & {
    ProxyAdmin: deployedContract;
};

const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute }): Promise<NextState> => {
        const proxyAdmin = await deploy(contracts.ProxyAdmin);

        return {
            ...initialState,

            ProxyAdmin: proxyAdmin.address
        };
    },

    healthCheck: async (signer, contracts, state: NextState, { deploy, execute }) => {
        const proxyAdmin = await contracts.ProxyAdmin.attach(state.ProxyAdmin);

        if ((await proxyAdmin.owner()) !== (await signer.getAddress())) throw new OwnerNotSetOrCorrect();
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
