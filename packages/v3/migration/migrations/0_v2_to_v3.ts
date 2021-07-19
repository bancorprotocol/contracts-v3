import { ContractRegistry__factory, TokenGovernance__factory } from '@bancor/contracts-v2/typechain';
import { TestERC20Token__factory } from 'typechain';
import { Migration, deployedContract } from 'migration/engine/types';
import { fetchV2ContractState } from 'components/v2Helpers/v2';

export type OldState = {
    BNT: { token: deployedContract; governance: deployedContract };
    vBNT: { token: deployedContract; governance: deployedContract };

    ContractRegistry: deployedContract;
    VortexBurner: deployedContract;
};

export type State = {
    BNT: { token: deployedContract; governance: deployedContract };
    vBNT: { token: deployedContract; governance: deployedContract };

    ContractRegistry: deployedContract;
    VortexBurner: deployedContract;

    BancorVault: deployedContract;
};

const migration: Migration = {
    up: async (signer, contracts, V2State: OldState, { deploy, execute }): Promise<State> => {
        const ContractRegistry = ContractRegistry__factory.connect(V2State.ContractRegistry.address, signer);

        const BNT = TestERC20Token__factory.connect(V2State.BNT.token.address, signer);
        const vBNT = TestERC20Token__factory.connect(V2State.vBNT.token.address, signer);

        const BNTGov = TokenGovernance__factory.connect(V2State.BNT.governance.address, signer);
        const vBNTGov = TokenGovernance__factory.connect(V2State.vBNT.governance.address, signer);

        // Fetch V2 contracts
        const V2ContractState = await fetchV2ContractState(ContractRegistry, signer);

        const BancorVault = await deploy('BancorVault', contracts.BancorVault.deploy, BNT.address);

        return {
            ...V2State,

            BancorVault: {
                address: BancorVault.address
            }
        };
    },

    healthcheck: async (signer, contracts, state: State, { deploy, execute }) => {
        return true;
    }
};
export default migration;
