import Contracts from '../../components/Contracts';
import { TestBancorNetwork, TestNetworkTokenPool, TestERC20Token } from '../../typechain';
import {
    NETWORK_TOKEN_POOL_TOKEN_SYMBOL,
    NETWORK_TOKEN_POOL_TOKEN_NAME,
    FEE_TYPES,
    ZERO_ADDRESS
} from '../helpers/Constants';
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

    describe('fee collection', () => {
        let network: TestBancorNetwork;
        let networkTokenPool: TestNetworkTokenPool;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ networkTokenPool, network } = await createSystem());

            reserveToken = await Contracts.TestERC20Token.deploy('TKN', 'TKN', BigNumber.from(1_000_000));
        });

        it('should revert when attempting to collect fees from a non-network', async () => {
            let nonNetwork = nonOwner;

            await expect(
                networkTokenPool
                    .connect(nonNetwork)
                    .onFeesCollected(reserveToken.address, BigNumber.from(1), FEE_TYPES.trading)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should revert when attempting to collect fees from an invalid pool', async () => {
            await expect(
                network.onNetworkTokenFeesCollectedT(
                    networkTokenPool.address,
                    ZERO_ADDRESS,
                    BigNumber.from(1),
                    FEE_TYPES.trading
                )
            ).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should revert when attempting to collect fees with an invalid amount', async () => {
            await expect(
                network.onNetworkTokenFeesCollectedT(
                    networkTokenPool.address,
                    reserveToken.address,
                    BigNumber.from(0),
                    FEE_TYPES.trading
                )
            ).to.be.revertedWith('ERR_ZERO_VALUE');
        });

        for (const [name, type] of Object.entries(FEE_TYPES)) {
            it(`should collect ${name} fees`, async () => {
                const feeAmount = BigNumber.from(12345);

                const prevStakedBalance = await networkTokenPool.stakedBalance();
                const prevMintingAmount = await networkTokenPool.mintedAmounts(reserveToken.address);

                await network.onNetworkTokenFeesCollectedT(
                    networkTokenPool.address,
                    reserveToken.address,
                    feeAmount,
                    type
                );

                expect(await networkTokenPool.stakedBalance()).to.equal(prevStakedBalance.add(feeAmount));
                expect(await networkTokenPool.mintedAmounts(reserveToken.address)).to.equal(
                    prevMintingAmount.add(type == FEE_TYPES.trading ? feeAmount : 0)
                );
            });
        }
    });
});
