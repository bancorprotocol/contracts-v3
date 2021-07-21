import { ContractRegistry__factory, TokenGovernance__factory } from '@bancor/contracts-v2/typechain';
import { fetchV2ContractState } from 'components/v2Helpers/v2';
import { deployedContract, Migration } from 'migration/engine/types';
import { TestERC20Token__factory } from 'typechain';
import { State as InitialState } from './0_deploy_proxyAdmin';

export type State = {
    BNT: { token: deployedContract; governance: deployedContract };
    vBNT: { token: deployedContract; governance: deployedContract };

    ContractRegistry: deployedContract;
    VortexBurner: deployedContract;

    BancorVault: deployedContract;
};

const migration: Migration = {
    up: async (signer, contracts, initialState: InitialState, { deploy, execute }): Promise<State> => {
        const ContractRegistry = ContractRegistry__factory.connect(initialState.ContractRegistry, signer);
        // Fetch basic info from config
        const BNT = TestERC20Token__factory.connect(initialState.BNT.token, signer);
        const vBNT = TestERC20Token__factory.connect(initialState.vBNT.token, signer);
        const BNTGov = TokenGovernance__factory.connect(initialState.BNT.governance, signer);
        const vBNTGov = TokenGovernance__factory.connect(initialState.vBNT.governance, signer);

        // Fetch V2 contracts from basic info
        const V2ContractState = await fetchV2ContractState(ContractRegistry, signer);

        // Deploy V3 contracts
        const BancorVault = await deploy('BancorVault', contracts.BancorVault.deploy, BNT.address);

        return {
            ...initialState,

            BancorVault: BancorVault.address
        };
    },

    healthcheck: async (signer, contracts, state: State, { deploy, execute }) => {
        return true;
    }
};
export default migration;
