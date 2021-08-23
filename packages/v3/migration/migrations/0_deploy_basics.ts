import { InvalidOwner } from '../../migration/engine/errors/errors';
import { deployedContract, Migration } from '../../migration/engine/types';

export type InitialState = {};

export type NextState = InitialState & {
    BNT: { token: deployedContract; governance: deployedContract };
    vBNT: { token: deployedContract; governance: deployedContract };
};

const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute }): Promise<NextState> => {
        const BNTToken = await deploy(
            contracts.TestERC20Token,
            'Bancor Network Token',
            'BNT',
            '100000000000000000000000000'
        );

        const vBNTToken = await deploy(
            contracts.TestERC20Token,
            'Bancor Governance Token',
            'vBNT',
            '100000000000000000000000000'
        );

        const BNTGovernance = await deploy(contracts.TokenGovernance, BNTToken.address);
        const vBNTGovernance = await deploy(contracts.TokenGovernance, vBNTToken.address);

        return {
            ...initialState,

            BNT: {
                token: BNTToken.address,
                governance: BNTGovernance.address
            },
            vBNT: {
                token: vBNTToken.address,
                governance: vBNTGovernance.address
            }
        };
    },

    healthCheck: async (signer, contracts, state: NextState, { deploy, execute }) => {
        const BNTGovernance = await contracts.TokenGovernance.attach(state.BNT.governance);
        const vBNTGovernance = await contracts.TokenGovernance.attach(state.vBNT.governance);
        if (!(await BNTGovernance.hasRole(await BNTGovernance.ROLE_SUPERVISOR(), await signer.getAddress())))
            throw new InvalidOwner();
        if (!(await vBNTGovernance.hasRole(await BNTGovernance.ROLE_SUPERVISOR(), await signer.getAddress())))
            throw new InvalidOwner();
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
