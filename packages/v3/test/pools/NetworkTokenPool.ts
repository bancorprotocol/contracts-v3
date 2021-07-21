import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { createSystem } from 'test/helpers/Factory';
import { shouldHaveGap } from 'test/helpers/Proxy';

let nonOwner: SignerWithAddress;

describe('NetworkTokenPool', () => {
    shouldHaveGap('NetworkTokenPool', '_stakedBalance');

    before(async () => {
        [, nonOwner] = await ethers.getSigners();
    });

    describe('construction', async () => {
        it('should revert when attempting to reinitialize', async () => {
            const { networkTokenPool } = await createSystem();

            await expect(networkTokenPool.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            const { networkTokenPool, network, vault } = await createSystem();

            expect(await networkTokenPool.version()).to.equal(1);

            expect(await networkTokenPool.network()).to.equal(network.address);
            expect(await networkTokenPool.vault()).to.equal(vault.address);
            expect(await networkTokenPool.stakedBalance()).to.equal(BigNumber.from(0));
        });
    });
});
