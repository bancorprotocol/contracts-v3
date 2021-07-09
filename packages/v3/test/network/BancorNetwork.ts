import { expect } from 'chai';
import { ethers } from 'hardhat';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import { NetworkSettings, PendingWithdrawals } from 'typechain';

import { ZERO_ADDRESS } from 'test/helpers/Constants';
import { shouldHaveGap } from 'test/helpers/Proxy';
import { createNetworkSettings, createPendingWithdrawals, createBancorNetwork } from 'test/helpers/Factory';

let accounts: SignerWithAddress[];
let nonOwner: SignerWithAddress;

let networkSettings: NetworkSettings;
let pendingWithdrawals: PendingWithdrawals;

describe('BancorNetwork', () => {
    shouldHaveGap('BancorNetwork', '_protectionWallet');

    before(async () => {
        accounts = await ethers.getSigners();

        [, nonOwner] = accounts;
    });

    beforeEach(async () => {
        networkSettings = await createNetworkSettings();
        pendingWithdrawals = await createPendingWithdrawals();
    });

    describe('construction', async () => {
        it('should revert when attempting to reinitialize', async () => {
            const network = await createBancorNetwork(networkSettings, pendingWithdrawals);

            await expect(network.initialize()).to.be.revertedWith('Initializable: contract is already initialized');
        });

        it('should be properly initialized', async () => {
            const network = await createBancorNetwork(networkSettings, pendingWithdrawals);

            expect(await network.version()).to.equal(1);

            expect(await network.settings()).to.equal(networkSettings.address);
            expect(await network.pendingWithdrawals()).to.equal(pendingWithdrawals.address);
            expect(await network.protectionWallet()).to.equal(ZERO_ADDRESS);
            expect(await network.poolCollections()).to.be.empty;
            expect(await network.liquidityPools()).to.be.empty;
        });
    });
});
