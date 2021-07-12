import { expect } from 'chai';
import { ethers } from 'hardhat';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import { BancorNetwork, NetworkSettings, PendingWithdrawals, TokenHolderUpgradeable } from 'typechain';

import { ZERO_ADDRESS } from 'test/helpers/Constants';
import { shouldHaveGap } from 'test/helpers/Proxy';
import {
    createTokenHolder,
    createNetworkSettings,
    createPendingWithdrawals,
    createBancorNetwork
} from 'test/helpers/Factory';

let accounts: SignerWithAddress[];
let nonOwner: SignerWithAddress;

let networkSettings: NetworkSettings;
let pendingWithdrawals: PendingWithdrawals;

describe('BancorNetwork', () => {
    shouldHaveGap('BancorNetwork', '_insuranceWallet');

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
            expect(await network.insuranceWallet()).to.equal(ZERO_ADDRESS);
            expect(await network.poolCollections()).to.be.empty;
            expect(await network.liquidityPools()).to.be.empty;
        });
    });

    describe('insurance wallet', async () => {
        let newInsuranceWallet: TokenHolderUpgradeable;
        let network: BancorNetwork;

        beforeEach(async () => {
            network = await createBancorNetwork(networkSettings, pendingWithdrawals);

            newInsuranceWallet = await createTokenHolder();
        });

        it('should revert when a non-owner attempts to set the insurance wallet', async () => {
            await expect(network.connect(nonOwner).setInsuranceWallet(newInsuranceWallet.address)).to.be.revertedWith(
                'ERR_ACCESS_DENIED'
            );
        });

        it('should revert when setting insurance wallet to an invalid address', async () => {
            await expect(network.setInsuranceWallet(ZERO_ADDRESS)).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should be to able to set and update the insurance wallet', async () => {
            const res = await network.setInsuranceWallet(newInsuranceWallet.address);
            await expect(res)
                .to.emit(network, 'InsuranceWalletUpdated')
                .withArgs(ZERO_ADDRESS, newInsuranceWallet.address);
            expect(await network.insuranceWallet()).to.equal(newInsuranceWallet.address);

            const anotherwInsuranceWallet = await createTokenHolder();

            const res2 = await network.setInsuranceWallet(anotherwInsuranceWallet.address);
            await expect(res2)
                .to.emit(network, 'InsuranceWalletUpdated')
                .withArgs(newInsuranceWallet.address, anotherwInsuranceWallet.address);
        });
    });
});
