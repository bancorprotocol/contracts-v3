import { expect } from 'chai';
import { ethers } from 'hardhat';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import Contracts from 'components/Contracts';
import { BancorNetwork, TokenHolderUpgradeable } from 'typechain';

import { ZERO_ADDRESS } from 'test/helpers/Constants';
import { shouldHaveGap } from 'test/helpers/Proxy';
import { createSystem, createTokenHolder } from 'test/helpers/Factory';

let accounts: SignerWithAddress[];
let nonOwner: SignerWithAddress;
let dummy: SignerWithAddress;

describe('BancorNetwork', () => {
    shouldHaveGap('BancorNetwork', '_externalProtectionWallet');

    before(async () => {
        accounts = await ethers.getSigners();

        [, nonOwner, dummy] = accounts;
    });

    describe('construction', async () => {
        it('should revert when attempting to reinitialize', async () => {
            const { network } = await createSystem();

            await expect(network.initialize(dummy.address)).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should revert when initialized with an invalid network settings contract', async () => {
            await expect(Contracts.BancorNetwork.deploy(ZERO_ADDRESS)).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should be properly initialized', async () => {
            const { network, networkSettings, pendingWithdrawals } = await createSystem();

            expect(await network.version()).to.equal(1);

            expect(await network.settings()).to.equal(networkSettings.address);
            expect(await network.pendingWithdrawals()).to.equal(pendingWithdrawals.address);
            expect(await network.externalProtectionWallet()).to.equal(ZERO_ADDRESS);
            expect(await network.poolCollections()).to.be.empty;
            expect(await network.liquidityPools()).to.be.empty;
        });
    });

    describe('external protection wallet', async () => {
        let newExternalProtectionWallet: TokenHolderUpgradeable;
        let network: BancorNetwork;

        beforeEach(async () => {
            ({ network } = await createSystem());

            newExternalProtectionWallet = await createTokenHolder();
        });

        it('should revert when a non-owner attempts to set the external protection wallet', async () => {
            await expect(
                network.connect(nonOwner).setProtectionWallet(newExternalProtectionWallet.address)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should revert when setting external protection wallet to an invalid address', async () => {
            await expect(network.setProtectionWallet(ZERO_ADDRESS)).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should be to able to set and update the external protection wallet', async () => {
            await newExternalProtectionWallet.transferOwnership(network.address);

            const res = await network.setProtectionWallet(newExternalProtectionWallet.address);
            await expect(res)
                .to.emit(network, 'ExternalProtectionWalletUpdated')
                .withArgs(ZERO_ADDRESS, newExternalProtectionWallet.address);
            expect(await network.externalProtectionWallet()).to.equal(newExternalProtectionWallet.address);
            expect(await newExternalProtectionWallet.owner()).to.equal(network.address);

            const newExternalProtectionWallet2 = await createTokenHolder();
            await newExternalProtectionWallet2.transferOwnership(network.address);

            const res2 = await network.setProtectionWallet(newExternalProtectionWallet2.address);
            await expect(res2)
                .to.emit(network, 'ExternalProtectionWalletUpdated')
                .withArgs(newExternalProtectionWallet.address, newExternalProtectionWallet2.address);
            expect(await network.externalProtectionWallet()).to.equal(newExternalProtectionWallet2.address);
            expect(await newExternalProtectionWallet2.owner()).to.equal(network.address);
        });

        it('should revert when attempting to set the external protection wallet without transferring its ownership', async () => {
            await expect(network.setProtectionWallet(newExternalProtectionWallet.address)).to.be.revertedWith(
                'ERR_ACCESS_DENIED'
            );
        });

        it('should revert when a non-owner attempts to transfer the ownership of the external protection wallet', async () => {
            const newOwner = accounts[4];

            await expect(
                network.connect(newOwner).transferProtectionWalletOwnership(newOwner.address)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should allow explicitly transferring the ownership', async () => {
            const newOwner = accounts[4];

            await newExternalProtectionWallet.transferOwnership(network.address);
            await network.setProtectionWallet(newExternalProtectionWallet.address);
            expect(await newExternalProtectionWallet.owner()).to.equal(network.address);

            await network.transferProtectionWalletOwnership(newOwner.address);
            await newExternalProtectionWallet.connect(newOwner).acceptOwnership();
            expect(await newExternalProtectionWallet.owner()).to.equal(newOwner.address);
        });
    });
});
