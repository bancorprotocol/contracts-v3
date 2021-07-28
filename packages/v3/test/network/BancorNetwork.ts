import { expect } from 'chai';
import { ethers } from 'hardhat';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import Contracts from '../../components/Contracts';
import { BancorNetwork, TokenHolderUpgradeable } from '../../typechain';

import { ZERO_ADDRESS } from '../helpers/Constants';
import { shouldHaveGap } from '../helpers/Proxy';
import { createSystem, createTokenHolder } from '../helpers/Factory';

let nonOwner: SignerWithAddress;
let newOwner: SignerWithAddress;
let dummy: SignerWithAddress;

describe('BancorNetwork', () => {
    shouldHaveGap('BancorNetwork', '_externalProtectionWallet');

    before(async () => {
        [, nonOwner, newOwner, dummy] = await ethers.getSigners();
    });

    describe('construction', () => {
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

    describe('external protection wallet', () => {
        let newExternalProtectionWallet: TokenHolderUpgradeable;
        let network: BancorNetwork;

        beforeEach(async () => {
            ({ network } = await createSystem());

            newExternalProtectionWallet = await createTokenHolder();
        });

        it('should revert when a non-owner attempts to set the external protection wallet', async () => {
            await expect(
                network.connect(nonOwner).setExternalProtectionWallet(newExternalProtectionWallet.address)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should revert when setting external protection wallet to an invalid address', async () => {
            await expect(network.setExternalProtectionWallet(ZERO_ADDRESS)).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should be to able to set and update the external protection wallet', async () => {
            await newExternalProtectionWallet.transferOwnership(network.address);

            const res = await network.setExternalProtectionWallet(newExternalProtectionWallet.address);
            await expect(res)
                .to.emit(network, 'ExternalProtectionWalletUpdated')
                .withArgs(ZERO_ADDRESS, newExternalProtectionWallet.address);
            expect(await network.externalProtectionWallet()).to.equal(newExternalProtectionWallet.address);
            expect(await newExternalProtectionWallet.owner()).to.equal(network.address);

            const newExternalProtectionWallet2 = await createTokenHolder();
            await newExternalProtectionWallet2.transferOwnership(network.address);

            const res2 = await network.setExternalProtectionWallet(newExternalProtectionWallet2.address);
            await expect(res2)
                .to.emit(network, 'ExternalProtectionWalletUpdated')
                .withArgs(newExternalProtectionWallet.address, newExternalProtectionWallet2.address);
            expect(await network.externalProtectionWallet()).to.equal(newExternalProtectionWallet2.address);
            expect(await newExternalProtectionWallet2.owner()).to.equal(network.address);
        });

        it('should revert when attempting to set the external protection wallet without transferring its ownership', async () => {
            await expect(network.setExternalProtectionWallet(newExternalProtectionWallet.address)).to.be.revertedWith(
                'ERR_ACCESS_DENIED'
            );
        });

        it('should revert when a non-owner attempts to transfer the ownership of the protection wallet', async () => {
            await expect(
                network.connect(newOwner).transferExternalProtectionWalletOwnership(newOwner.address)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should allow explicitly transferring the ownership', async () => {
            await newExternalProtectionWallet.transferOwnership(network.address);
            await network.setExternalProtectionWallet(newExternalProtectionWallet.address);
            expect(await newExternalProtectionWallet.owner()).to.equal(network.address);

            await network.transferExternalProtectionWalletOwnership(newOwner.address);
            await newExternalProtectionWallet.connect(newOwner).acceptOwnership();
            expect(await newExternalProtectionWallet.owner()).to.equal(newOwner.address);
        });
    });
});
