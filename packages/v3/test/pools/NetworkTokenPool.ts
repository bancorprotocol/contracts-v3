import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import { TestERC20Token, NetworkSettings, PendingWithdrawals, BancorNetwork, BancorVault } from 'typechain';

import { shouldHaveGap } from 'test/helpers/Proxy';
import {
    createNetworkToken,
    createNetworkSettings,
    createBancorVault,
    createPendingWithdrawals,
    createBancorNetwork,
    createNetworkTokenPool
} from 'test/helpers/Factory';

const DEFAULT_TRADING_FEE_PPM = BigNumber.from(2000);
const POOL_TYPE = BigNumber.from(1);

let accounts: SignerWithAddress[];
let nonOwner: SignerWithAddress;

let networkToken: TestERC20Token;
let vault: BancorVault;
let networkSettings: NetworkSettings;
let pendingWithdrawals: PendingWithdrawals;
let network: BancorNetwork;

describe('NetworkTokenPool', () => {
    shouldHaveGap('NetworkTokenPool', '_stakedBalance');

    before(async () => {
        accounts = await ethers.getSigners();

        [, nonOwner] = accounts;
    });

    beforeEach(async () => {
        networkToken = await createNetworkToken();
        vault = await createBancorVault(networkToken);
        networkSettings = await createNetworkSettings();
        pendingWithdrawals = await createPendingWithdrawals();
        network = await createBancorNetwork(networkSettings, pendingWithdrawals);
    });

    describe('construction', async () => {
        it('should revert when attempting to reinitialize', async () => {
            const networkTokenPool = await createNetworkTokenPool(network, vault);

            await expect(networkTokenPool.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            const networkTokenPool = await createNetworkTokenPool(network, vault);

            expect(await networkTokenPool.version()).to.equal(1);

            expect(await networkTokenPool.network()).to.equal(network.address);
            expect(await networkTokenPool.vault()).to.equal(vault.address);
            expect(await networkTokenPool.stakedBalance()).to.equal(BigNumber.from(0));
        });
    });
});
