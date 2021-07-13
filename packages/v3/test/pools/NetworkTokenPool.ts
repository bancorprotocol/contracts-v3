import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import { shouldHaveGap } from 'test/helpers/Proxy';
import { createSystem } from 'test/helpers/Factory';

let accounts: SignerWithAddress[];
let nonOwner: SignerWithAddress;

describe('NetworkTokenPool', () => {
    shouldHaveGap('NetworkTokenPool', '_stakedBalance');

    before(async () => {
        accounts = await ethers.getSigners();

        [, nonOwner] = accounts;
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
