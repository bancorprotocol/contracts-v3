import Contracts from '../../components/Contracts';
import { NETWORK_TOKEN_POOL_TOKEN_SYMBOL, NETWORK_TOKEN_POOL_TOKEN_NAME } from '../helpers/Constants';
import { createSystem } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

describe('NetworkTokenPool', () => {
    let nonOwner: SignerWithAddress;

    shouldHaveGap('NetworkTokenPool', '_stakedBalance');

    before(async () => {
        [, nonOwner] = await ethers.getSigners();
    });

    describe('construction', () => {
        it('should revert when attempting to reinitialize', async () => {
            const { networkTokenPool } = await createSystem();

            await expect(networkTokenPool.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            const {
                networkTokenPool,
                network,
                networkToken,
                networkTokenGovernance,
                govToken,
                govTokenGovernance,
                vault
            } = await createSystem();

            expect(await networkTokenPool.version()).to.equal(1);

            expect(await networkTokenPool.network()).to.equal(network.address);
            expect(await networkTokenPool.networkToken()).to.equal(networkToken.address);
            expect(await networkTokenPool.networkTokenGovernance()).to.equal(networkTokenGovernance.address);
            expect(await networkTokenPool.govToken()).to.equal(govToken.address);
            expect(await networkTokenPool.govTokenGovernance()).to.equal(govTokenGovernance.address);
            expect(await networkTokenPool.vault()).to.equal(vault.address);
            expect(await networkTokenPool.stakedBalance()).to.equal(BigNumber.from(0));

            const poolToken = await Contracts.PoolToken.attach(await networkTokenPool.poolToken());
            expect(await poolToken.owner()).to.equal(networkTokenPool.address);
            expect(await poolToken.reserveToken()).to.equal(networkToken.address);
            expect(await poolToken.name()).to.equal(NETWORK_TOKEN_POOL_TOKEN_NAME);
            expect(await poolToken.symbol()).to.equal(NETWORK_TOKEN_POOL_TOKEN_SYMBOL);
        });
    });
});
