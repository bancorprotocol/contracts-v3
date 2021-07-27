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
        const ProxyAdmin = await deploy(contracts.ProxyAdmin);

        return {
            ...initialState,

            ProxyAdmin: ProxyAdmin.address
        };
    },

    healthCheck: async (signer, contracts, state: NextState, { deploy, execute }) => {
        const ProxyAdmin = await contracts.ProxyAdmin.attach(state.ProxyAdmin);

        if ((await ProxyAdmin.owner()) !== (await signer.getAddress())) return false;

        return true;
    }
};
export default migration;
