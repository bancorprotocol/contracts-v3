/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function */
import { engine } from '../engine';
import { deployedContract, Migration } from '../engine/Types';
import { utils, BigNumber } from 'ethers';

const { signer, signerAddress, legacyContracts } = engine;
const { deploy, execute, deployProxy, upgradeProxy } = engine.executionFunctions;

export type InitialState = unknown;

export type NextState = InitialState & {
    networkToken: deployedContract;
    govToken: deployedContract;
};

const DEFAULT_DECIMALS = BigNumber.from(18);
const TOTAL_SUPPLY = utils.parseEther('100000000');

const migration: Migration = {
    up: async (initialState: InitialState): Promise<NextState> => {
        const networkToken = await deploy(
            legacyContracts.NetworkToken,
            'Bancor Network Token',
            'BNT',
            DEFAULT_DECIMALS
        );
        await networkToken.issue(signerAddress, TOTAL_SUPPLY);

        const govToken = await deploy(legacyContracts.GovToken, 'Bancor Governance Token', 'vBNT', DEFAULT_DECIMALS);
        await govToken.issue(signerAddress, TOTAL_SUPPLY);

        return {
            networkToken: networkToken.address,
            govToken: govToken.address
        };
    },

    healthCheck: async (initialState: InitialState, state: NextState) => {
        const networkToken = await legacyContracts.NetworkToken.attach(state.networkToken);
        const govToken = await legacyContracts.GovToken.attach(state.govToken);

        // verifies ownership
        if ((await networkToken.owner()) !== signerAddress) {
            throw new Error('Invalid owner');
        }

        if ((await govToken.owner()) !== signerAddress) {
            throw new Error('Invalid owner');
        }

        // verifies supply
        if (!(await networkToken.totalSupply()).eq(TOTAL_SUPPLY)) {
            throw new Error('Invalid total supply');
        }

        if (!(await govToken.totalSupply()).eq(TOTAL_SUPPLY)) {
            throw new Error('Invalid total supply');
        }
    },

    down: async (initialState: InitialState, newState: NextState): Promise<InitialState> => {
        throw new Error('NOT_IMPLEMENTED');
    }
};

export default migration;
