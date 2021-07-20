import { ContractRegistry__factory, TokenGovernance__factory } from '@bancor/contracts-v2/typechain';
import { fetchV2ContractState } from 'components/v2Helpers/v2';
import { deployedContract, Migration } from 'migration/engine/types';
import { TestERC20Token__factory } from 'typechain';

export type InitialState = {
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
    up: async (signer, contracts, V2State: InitialState, { deploy, execute }): Promise<State> => {
        const ContractRegistry = ContractRegistry__factory.connect(V2State.ContractRegistry, signer);
        // Fetch basic info from config
        const BNT = TestERC20Token__factory.connect(V2State.BNT.token, signer);
        const vBNT = TestERC20Token__factory.connect(V2State.vBNT.token, signer);
        const BNTGov = TokenGovernance__factory.connect(V2State.BNT.governance, signer);
        const vBNTGov = TokenGovernance__factory.connect(V2State.vBNT.governance, signer);

        // Fetch V2 contracts from basic info
        const V2ContractState = await fetchV2ContractState(ContractRegistry, signer);

        // Deploy V3 contracts
        const BancorVault = await deploy('BancorVault', contracts.BancorVault.deploy, BNT.address);

        return {
            ...V2State,

            BancorVault: BancorVault.address
        };
    },

    healthcheck: async (signer, contracts, state: State, { deploy, execute }) => {
        return true;
    }
};
export default migration;
