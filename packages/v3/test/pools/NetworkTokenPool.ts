import Contracts from '../../components/Contracts';
import { NetworkToken, GovToken } from '../../components/LegacyContracts';
import {
    BancorVault,
    NetworkSettings,
    PoolToken,
    PoolTokenFactory,
    TestBancorNetwork,
    TestERC20Token,
    TestNetworkTokenPool,
    TestPoolCollection,
    TestPoolCollectionUpgrader
} from '../../typechain';
import {
    FeeTypes,
    NETWORK_TOKEN_POOL_TOKEN_NAME,
    NETWORK_TOKEN_POOL_TOKEN_SYMBOL,
    PPM_RESOLUTION,
    ZERO_ADDRESS,
    TKN
} from '../helpers/Constants';
import { createPool, createPoolCollection, createSystem } from '../helpers/Factory';
import { mulDivF } from '../helpers/MathUtils';
import { shouldHaveGap } from '../helpers/Proxy';
import { toWei } from '../helpers/Types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, utils } from 'ethers';
import { ethers } from 'hardhat';

const { formatBytes32String } = utils;

describe('NetworkTokenPool', () => {
    let deployer: SignerWithAddress;
    let provider: SignerWithAddress;
    let provider2: SignerWithAddress;

    shouldHaveGap('NetworkTokenPool', '_stakedBalance');

    before(async () => {
        [deployer, provider, provider2] = await ethers.getSigners();
    });

    describe('construction', () => {
        it('should revert when attempting to initialize with an invalid network contract', async () => {
            const { networkPoolToken } = await createSystem();

            await expect(Contracts.NetworkTokenPool.deploy(ZERO_ADDRESS, networkPoolToken.address)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('should revert when attempting to initialize with an invalid network pool token contract', async () => {
            const { network } = await createSystem();

            await expect(Contracts.NetworkTokenPool.deploy(network.address, ZERO_ADDRESS)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('should revert when attempting to reinitialize', async () => {
            const { networkTokenPool } = await createSystem();

            await expect(networkTokenPool.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            const {
                networkTokenPool,
                networkSettings,
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
            expect(await networkTokenPool.settings()).to.equal(networkSettings.address);
            expect(await networkTokenPool.vault()).to.equal(vault.address);

            expect(await networkTokenPool.stakedBalance()).to.equal(BigNumber.from(0));

            const poolToken = await Contracts.PoolToken.attach(await networkTokenPool.poolToken());
            expect(await poolToken.owner()).to.equal(networkTokenPool.address);
            expect(await poolToken.reserveToken()).to.equal(networkToken.address);
            expect(await poolToken.name()).to.equal(NETWORK_TOKEN_POOL_TOKEN_NAME);
            expect(await poolToken.symbol()).to.equal(NETWORK_TOKEN_POOL_TOKEN_SYMBOL);
        });
    });

    describe('mint', () => {
        let network: TestBancorNetwork;
        let networkToken: NetworkToken;
        let networkTokenPool: TestNetworkTokenPool;
        let recipient: SignerWithAddress;

        before(async () => {
            [deployer, recipient] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ network, networkToken, networkTokenPool } = await createSystem());
        });

        it('should revert when attempting to mint from a non-network', async () => {
            const nonNetwork = deployer;

            await expect(
                networkTokenPool.connect(nonNetwork).mint(recipient.address, BigNumber.from(1))
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when attempting to mint to an invalid address', async () => {
            await expect(network.mintT(ZERO_ADDRESS, BigNumber.from(1))).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to mint an invalid amount', async () => {
            await expect(network.mintT(recipient.address, BigNumber.from(0))).to.be.revertedWith('ZeroValue');
        });

        it('should mint to the recipient', async () => {
            const amount = toWei(BigNumber.from(12345));

            const prevTotalSupply = await networkToken.totalSupply();
            const prevRecipientTokenBalance = await networkToken.balanceOf(recipient.address);

            await network.mintT(recipient.address, amount);

            expect(await networkToken.totalSupply()).to.equal(prevTotalSupply.add(amount));
            expect(await networkToken.balanceOf(recipient.address)).to.equal(prevRecipientTokenBalance.add(amount));
        });
    });

    describe('burnFromVault', () => {
        let network: TestBancorNetwork;
        let networkToken: NetworkToken;
        let networkTokenPool: TestNetworkTokenPool;
        let vault: BancorVault;

        const amount = toWei(BigNumber.from(12345));

        beforeEach(async () => {
            ({ network, networkToken, networkTokenPool, vault } = await createSystem());

            await networkToken.transfer(vault.address, amount);
        });

        it('should revert when attempting to burn from a non-network', async () => {
            const nonNetwork = deployer;

            await expect(networkTokenPool.connect(nonNetwork).burnFromVault(BigNumber.from(1))).to.be.revertedWith(
                'AccessDenied'
            );
        });

        it('should revert when attempting to burn an invalid amount', async () => {
            await expect(network.burnFromVaultT(BigNumber.from(0))).to.be.revertedWith('ZeroValue');
        });

        it('should revert when attempting to burn more than balance of the vault', async () => {
            await expect(network.burnFromVaultT(amount.add(BigNumber.from(1)))).to.be.revertedWith(
                'SafeERC20: low-level call failed'
            );
        });

        it('should burn from the vault', async () => {
            const amount = toWei(BigNumber.from(12345));

            const prevTotalSupply = await networkToken.totalSupply();
            const prevVaultTokenBalance = await networkToken.balanceOf(vault.address);

            await network.burnFromVaultT(amount);

            expect(await networkToken.totalSupply()).to.equal(prevTotalSupply.sub(amount));
            expect(await networkToken.balanceOf(vault.address)).to.equal(prevVaultTokenBalance.sub(amount));
        });
    });

    describe('is minting enabled', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkTokenPool: TestNetworkTokenPool;
        let poolTokenFactory: PoolTokenFactory;
        let poolCollection: TestPoolCollection;
        let poolCollectionUpgrader: TestPoolCollectionUpgrader;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ networkSettings, network, networkTokenPool, poolTokenFactory, poolCollection, poolCollectionUpgrader } =
                await createSystem());

            reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, BigNumber.from(1_000_000));
        });

        it('should return false for an invalid pool', async () => {
            expect(await networkTokenPool.isNetworkLiquidityEnabled(ZERO_ADDRESS, poolCollection.address)).to.be.false;
        });

        it('should return false for an invalid pool collection', async () => {
            expect(await networkTokenPool.isNetworkLiquidityEnabled(reserveToken.address, ZERO_ADDRESS)).to.be.false;
        });

        it('should return false for a non-whitelisted token', async () => {
            expect(await networkTokenPool.isNetworkLiquidityEnabled(reserveToken.address, poolCollection.address)).to.be
                .false;
        });

        context('with a whitelisted and registered pool', () => {
            const MAX_DEVIATION = BigNumber.from(10_000); // %1
            const MINTING_LIMIT = toWei(BigNumber.from(10_000_000));

            beforeEach(async () => {
                await createPool(reserveToken, network, networkSettings, poolCollection);

                await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
                await networkSettings.setPoolMintingLimit(reserveToken.address, MINTING_LIMIT);
            });

            context('when spot rate is unstable', () => {
                beforeEach(async () => {
                    const spotRate = { n: BigNumber.from(1_000_000), d: BigNumber.from(1) };

                    await poolCollection.setTradingLiquidityT(reserveToken.address, {
                        networkTokenTradingLiquidity: spotRate.n,
                        baseTokenTradingLiquidity: spotRate.d,
                        tradingLiquidityProduct: spotRate.n.mul(spotRate.d),
                        stakedBalance: BigNumber.from(0)
                    });
                    await poolCollection.setAverageRateT(reserveToken.address, {
                        rate: {
                            n: spotRate.n.mul(PPM_RESOLUTION),
                            d: spotRate.d.mul(PPM_RESOLUTION.add(MAX_DEVIATION.add(BigNumber.from(1000))))
                        },
                        time: BigNumber.from(0)
                    });
                });

                it('should return false', async () => {
                    expect(
                        await networkTokenPool.isNetworkLiquidityEnabled(reserveToken.address, poolCollection.address)
                    ).to.be.false;
                });
            });

            context('when spot rate is stable', () => {
                beforeEach(async () => {
                    const spotRate = {
                        n: toWei(BigNumber.from(1_000_000)),
                        d: toWei(BigNumber.from(10_000_000))
                    };

                    await poolCollection.setTradingLiquidityT(reserveToken.address, {
                        networkTokenTradingLiquidity: spotRate.n,
                        baseTokenTradingLiquidity: spotRate.d,
                        tradingLiquidityProduct: spotRate.n.mul(spotRate.d),
                        stakedBalance: toWei(BigNumber.from(1_000_000))
                    });

                    await poolCollection.setAverageRateT(reserveToken.address, {
                        rate: {
                            n: spotRate.n,
                            d: spotRate.d
                        },
                        time: await network.currentTime()
                    });
                });

                it('should return true', async () => {
                    expect(
                        await networkTokenPool.isNetworkLiquidityEnabled(reserveToken.address, poolCollection.address)
                    ).to.be.true;
                });

                it('should return false for another pool collection', async () => {
                    const poolCollection2 = await createPoolCollection(
                        network,
                        poolTokenFactory,
                        poolCollectionUpgrader
                    );

                    expect(
                        await networkTokenPool.isNetworkLiquidityEnabled(reserveToken.address, poolCollection2.address)
                    ).to.be.false;
                });
            });
        });
    });

    describe('request liquidity', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkToken: NetworkToken;
        let networkTokenPool: TestNetworkTokenPool;
        let networkPoolToken: PoolToken;
        let vault: BancorVault;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        const MAX_DEVIATION = BigNumber.from(10_000); // %1
        const MINTING_LIMIT = toWei(BigNumber.from(10_000_000));

        const contextId = formatBytes32String('CTX');

        beforeEach(async () => {
            ({ networkSettings, network, networkToken, networkTokenPool, networkPoolToken, vault, poolCollection } =
                await createSystem());

            reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, BigNumber.from(1_000_000));

            await createPool(reserveToken, network, networkSettings, poolCollection);

            await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
            await networkSettings.setPoolMintingLimit(reserveToken.address, MINTING_LIMIT);
        });

        const testRequest = async (amount: BigNumber, expectedAmount: BigNumber) => {
            const prevStakedBalance = await networkTokenPool.stakedBalance();
            const prevMintedAmount = await networkTokenPool.mintedAmount(reserveToken.address);
            const prevUnallocatedLiquidity = await networkTokenPool.unallocatedLiquidity(reserveToken.address);

            const prevPoolTokenTotalSupply = await networkPoolToken.totalSupply();
            const prevPoolPoolTokenBalance = await networkPoolToken.balanceOf(networkTokenPool.address);
            const prevVaultPoolTokenBalance = await networkPoolToken.balanceOf(vault.address);

            expect(prevVaultPoolTokenBalance).to.equal(BigNumber.from(0));

            const prevTokenTotalSupply = await networkToken.totalSupply();
            const prevPoolTokenBalance = await networkToken.balanceOf(networkTokenPool.address);
            const prevVaultTokenBalance = await networkToken.balanceOf(vault.address);

            let expectedPoolTokenAmount;
            if (prevPoolTokenTotalSupply.isZero()) {
                expectedPoolTokenAmount = expectedAmount;
            } else {
                expectedPoolTokenAmount = expectedAmount.mul(prevPoolTokenTotalSupply).div(prevStakedBalance);
            }

            const res = await network.requestLiquidityT(contextId, reserveToken.address, amount);

            await expect(res)
                .to.emit(networkTokenPool, 'LiquidityRequested')
                .withArgs(contextId, reserveToken.address, expectedAmount, expectedPoolTokenAmount);

            expect(await networkTokenPool.stakedBalance()).to.equal(prevStakedBalance.add(expectedAmount));
            expect(await networkTokenPool.mintedAmount(reserveToken.address)).to.equal(
                prevMintedAmount.add(expectedAmount)
            );
            expect(await networkTokenPool.unallocatedLiquidity(reserveToken.address)).to.equal(
                prevUnallocatedLiquidity.sub(expectedAmount)
            );

            expect(await networkPoolToken.totalSupply()).to.equal(
                prevPoolTokenTotalSupply.add(expectedPoolTokenAmount)
            );
            expect(await networkPoolToken.balanceOf(networkTokenPool.address)).to.equal(
                prevPoolPoolTokenBalance.add(expectedPoolTokenAmount)
            );
            expect(await networkPoolToken.balanceOf(vault.address)).to.equal(prevVaultPoolTokenBalance);

            expect(await networkToken.totalSupply()).to.equal(prevTokenTotalSupply.add(expectedAmount));
            expect(await networkToken.balanceOf(networkTokenPool.address)).to.equal(prevPoolTokenBalance);
            expect(await networkToken.balanceOf(vault.address)).to.equal(prevVaultTokenBalance.add(expectedAmount));
        };

        it('should revert when attempting to request liquidity from a non-network', async () => {
            const nonNetwork = deployer;

            await expect(
                networkTokenPool
                    .connect(nonNetwork)
                    .requestLiquidity(contextId, reserveToken.address, BigNumber.from(1))
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when attempting to request liquidity for an invalid pool', async () => {
            await expect(network.requestLiquidityT(contextId, ZERO_ADDRESS, BigNumber.from(1))).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('should revert when attempting to request a zero liquidity amount', async () => {
            await expect(
                network.requestLiquidityT(contextId, reserveToken.address, BigNumber.from(0))
            ).to.be.revertedWith('ZeroValue');
        });

        it('should allow requesting liquidity', async () => {
            for (const amount of [
                BigNumber.from(1),
                BigNumber.from(10_000),
                toWei(BigNumber.from(1_000_000)),
                toWei(BigNumber.from(500_000))
            ]) {
                await testRequest(amount, amount);
            }
        });

        context('when close to the minting limit', () => {
            const remaining = toWei(BigNumber.from(1_000_000));

            beforeEach(async () => {
                const amount = MINTING_LIMIT.sub(remaining);

                await testRequest(amount, amount);
            });

            it('should allow requesting liquidity up to the limit', async () => {
                for (const amount of [
                    toWei(BigNumber.from(10)),
                    toWei(BigNumber.from(100_000)),
                    toWei(BigNumber.from(899_990))
                ]) {
                    await testRequest(amount, amount);
                }
            });

            it('should revert when requesting more liquidity amount than the minting limit', async () => {
                for (const amount of [
                    remaining.add(BigNumber.from(1)),
                    remaining.add(toWei(BigNumber.from(2_000_000))),
                    toWei(BigNumber.from(2_000_000))
                ]) {
                    await expect(network.requestLiquidityT(contextId, reserveToken.address, amount)).to.be.revertedWith(
                        'MintingLimitExceeded'
                    );
                }
            });

            context('when the minting limit is lowered retroactively', () => {
                beforeEach(async () => {
                    await testRequest(BigNumber.from(100_000), BigNumber.from(100_000));

                    await networkSettings.setPoolMintingLimit(reserveToken.address, BigNumber.from(1));
                });

                it('should revert when requesting more liquidity amount than the minting limit', async () => {
                    for (const amount of [
                        BigNumber.from(10),
                        BigNumber.from(100_000),
                        toWei(BigNumber.from(2_000_000)),
                        toWei(BigNumber.from(1_500_000))
                    ]) {
                        await expect(
                            network.requestLiquidityT(contextId, reserveToken.address, amount)
                        ).to.be.revertedWith('MintingLimitExceeded');
                    }
                });
            });
        });

        context('when at the minting limit', () => {
            beforeEach(async () => {
                await testRequest(MINTING_LIMIT, MINTING_LIMIT);
            });

            it('should revert when requesting more liquidity amount than the minting limit', async () => {
                for (const amount of [
                    BigNumber.from(10),
                    BigNumber.from(100_000),
                    toWei(BigNumber.from(2_000_000)),
                    toWei(BigNumber.from(1_500_000))
                ]) {
                    await expect(network.requestLiquidityT(contextId, reserveToken.address, amount)).to.be.revertedWith(
                        'MintingLimitExceeded'
                    );
                }
            });
        });
    });

    describe('renounce liquidity', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkToken: NetworkToken;
        let networkTokenPool: TestNetworkTokenPool;
        let networkPoolToken: PoolToken;
        let vault: BancorVault;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        const MAX_DEVIATION = BigNumber.from(10_000); // %1
        const MINTING_LIMIT = toWei(BigNumber.from(10_000_000));

        const contextId = formatBytes32String('CTX');

        beforeEach(async () => {
            ({ networkSettings, network, networkToken, networkTokenPool, networkPoolToken, vault, poolCollection } =
                await createSystem());

            reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, BigNumber.from(1_000_000));

            await createPool(reserveToken, network, networkSettings, poolCollection);

            await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
            await networkSettings.setPoolMintingLimit(reserveToken.address, MINTING_LIMIT);
        });

        it('should revert when attempting to renounce liquidity from a non-network', async () => {
            const nonNetwork = deployer;

            await expect(
                networkTokenPool
                    .connect(nonNetwork)
                    .renounceLiquidity(contextId, reserveToken.address, BigNumber.from(1))
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when attempting to renounce liquidity for an invalid pool', async () => {
            await expect(network.renounceLiquidityT(contextId, ZERO_ADDRESS, BigNumber.from(1))).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('should revert when attempting to renounce a zero liquidity amount', async () => {
            await expect(
                network.renounceLiquidityT(contextId, reserveToken.address, BigNumber.from(0))
            ).to.be.revertedWith('ZeroValue');
        });

        it('should revert when attempting to renounce liquidity when no liquidity was ever requested', async () => {
            await expect(network.renounceLiquidityT(contextId, reserveToken.address, BigNumber.from(1))).to.be.reverted; // division by 0
        });

        context('with requested liquidity', () => {
            const requestedAmount = toWei(BigNumber.from(1_000_000));

            beforeEach(async () => {
                await network.requestLiquidityT(contextId, reserveToken.address, requestedAmount);
            });

            const testRenounce = async (amount: BigNumber) => {
                const prevStakedBalance = await networkTokenPool.stakedBalance();
                const prevMintedAmount = await networkTokenPool.mintedAmount(reserveToken.address);
                const prevUnallocatedLiquidity = await networkTokenPool.unallocatedLiquidity(reserveToken.address);

                const prevPoolTokenTotalSupply = await networkPoolToken.totalSupply();
                const prevPoolPoolTokenBalance = await networkPoolToken.balanceOf(networkTokenPool.address);
                const prevVaultPoolTokenBalance = await networkPoolToken.balanceOf(vault.address);

                expect(prevVaultPoolTokenBalance).to.equal(BigNumber.from(0));

                const prevTokenTotalSupply = await networkToken.totalSupply();
                const prevPoolTokenBalance = await networkToken.balanceOf(networkTokenPool.address);
                const prevVaultTokenBalance = await networkToken.balanceOf(vault.address);

                const renouncedAmount = BigNumber.min(prevMintedAmount, amount);
                const expectedPoolTokenAmount = renouncedAmount.mul(prevPoolTokenTotalSupply).div(prevStakedBalance);

                const res = await network.renounceLiquidityT(contextId, reserveToken.address, amount);

                await expect(res)
                    .to.emit(networkTokenPool, 'LiquidityRenounced')
                    .withArgs(contextId, reserveToken.address, amount, expectedPoolTokenAmount);

                expect(await networkTokenPool.stakedBalance()).to.equal(prevStakedBalance.sub(renouncedAmount));
                expect(await networkTokenPool.mintedAmount(reserveToken.address)).to.equal(
                    prevMintedAmount.sub(renouncedAmount)
                );

                expect(await networkTokenPool.unallocatedLiquidity(reserveToken.address)).to.equal(
                    prevUnallocatedLiquidity.gt(renouncedAmount)
                        ? prevUnallocatedLiquidity.add(renouncedAmount)
                        : MINTING_LIMIT
                );

                expect(await networkPoolToken.totalSupply()).to.equal(
                    prevPoolTokenTotalSupply.sub(expectedPoolTokenAmount)
                );
                expect(await networkPoolToken.balanceOf(networkTokenPool.address)).to.equal(
                    prevPoolPoolTokenBalance.sub(expectedPoolTokenAmount)
                );
                expect(await networkPoolToken.balanceOf(vault.address)).to.equal(prevVaultPoolTokenBalance);

                expect(await networkToken.totalSupply()).to.equal(prevTokenTotalSupply.sub(amount));
                expect(await networkToken.balanceOf(networkTokenPool.address)).to.equal(prevPoolTokenBalance);
                expect(await networkToken.balanceOf(vault.address)).to.equal(prevVaultTokenBalance.sub(amount));
            };

            it('should allow renouncing liquidity', async () => {
                for (const amount of [
                    BigNumber.from(1),
                    BigNumber.from(10_000),
                    toWei(BigNumber.from(200_000)),
                    toWei(BigNumber.from(300_000))
                ]) {
                    await testRenounce(amount);
                }
            });

            it('should allow renouncing more liquidity than the previously requested amount', async () => {
                // ensure that there is enough tokens in the vault
                const extra = toWei(BigNumber.from(1000));
                await networkToken.transfer(vault.address, extra);

                await testRenounce(requestedAmount.add(extra));
            });
        });
    });

    describe('deposit liquidity', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkToken: NetworkToken;
        let govToken: GovToken;
        let networkTokenPool: TestNetworkTokenPool;
        let networkPoolToken: PoolToken;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ networkSettings, network, networkToken, govToken, networkTokenPool, networkPoolToken, poolCollection } =
                await createSystem());

            reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, BigNumber.from(1_000_000));
        });

        it('should revert when attempting to deposit from a non-network', async () => {
            const amount = BigNumber.from(1);
            const nonNetwork = deployer;

            await expect(
                networkTokenPool.connect(nonNetwork).depositFor(provider.address, amount, false, BigNumber.from(0))
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when attempting to deposit a zero amount', async () => {
            const amount = BigNumber.from(0);

            await expect(
                network.depositToNetworkPoolForT(provider.address, amount, false, BigNumber.from(0))
            ).to.be.revertedWith('ZeroValue');
        });

        it('should revert when attempting to deposit for an invalid provider', async () => {
            const amount = BigNumber.from(1);

            await expect(
                network.depositToNetworkPoolForT(ZERO_ADDRESS, amount, false, BigNumber.from(0))
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to deposit when no liquidity was requested', async () => {
            const amount = BigNumber.from(1);

            await expect(network.depositToNetworkPoolForT(provider.address, amount, false, BigNumber.from(0))).to.be
                .reverted; // division by 0
        });

        context('with a whitelisted and registered pool', () => {
            const MAX_DEVIATION = BigNumber.from(10_000); // %1
            const MINTING_LIMIT = toWei(BigNumber.from(10_000_000));

            beforeEach(async () => {
                await createPool(reserveToken, network, networkSettings, poolCollection);

                await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION); // %1
                await networkSettings.setPoolMintingLimit(reserveToken.address, MINTING_LIMIT);
            });

            context('with requested liquidity', () => {
                beforeEach(async () => {
                    const requestedAmount = toWei(BigNumber.from(1_000_000));
                    const contextId = formatBytes32String('CTX');

                    await network.requestLiquidityT(contextId, reserveToken.address, requestedAmount);
                });

                const testDeposit = async (
                    provider: SignerWithAddress,
                    amount: BigNumber,
                    isMigrating: boolean,
                    originalGovTokenAmount: BigNumber
                ) => {
                    // since this is only a unit test, we will simulate a proper transfer of the network token amount
                    // from the network to the network token pool
                    await networkToken.connect(deployer).transfer(networkTokenPool.address, amount);

                    const prevStakedBalance = await networkTokenPool.stakedBalance();

                    const prevPoolTokenTotalSupply = await networkPoolToken.totalSupply();
                    const prevPoolPoolTokenBalance = await networkPoolToken.balanceOf(networkTokenPool.address);
                    const prevProviderPoolTokenBalance = await networkPoolToken.balanceOf(provider.address);

                    const prevTokenTotalSupply = await networkToken.totalSupply();
                    const prevPoolTokenBalance = await networkToken.balanceOf(networkTokenPool.address);
                    const prevProviderTokenBalance = await networkToken.balanceOf(provider.address);

                    const prevGovTotalSupply = await govToken.totalSupply();
                    const prevPoolGovTokenBalance = await govToken.balanceOf(networkTokenPool.address);
                    const prevProviderGovTokenBalance = await govToken.balanceOf(provider.address);

                    const expectedPoolTokenAmount = amount.mul(prevPoolTokenTotalSupply).div(prevStakedBalance);

                    let expectedGovTokenAmount = expectedPoolTokenAmount;
                    if (isMigrating) {
                        expectedGovTokenAmount = expectedGovTokenAmount.gt(originalGovTokenAmount)
                            ? expectedGovTokenAmount.sub(originalGovTokenAmount)
                            : BigNumber.from(0);
                    }

                    const depositAmounts = await network.callStatic.depositToNetworkPoolForT(
                        provider.address,
                        amount,
                        isMigrating,
                        originalGovTokenAmount
                    );
                    expect(depositAmounts.poolTokenAmount).to.equal(expectedPoolTokenAmount);
                    expect(depositAmounts.govTokenAmount).to.equal(expectedGovTokenAmount);

                    await network.depositToNetworkPoolForT(
                        provider.address,
                        amount,
                        isMigrating,
                        originalGovTokenAmount
                    );

                    expect(await networkTokenPool.stakedBalance()).to.equal(prevStakedBalance);

                    expect(await networkPoolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply);
                    expect(await networkPoolToken.balanceOf(networkTokenPool.address)).to.equal(
                        prevPoolPoolTokenBalance.sub(expectedPoolTokenAmount)
                    );
                    expect(await networkPoolToken.balanceOf(provider.address)).to.equal(
                        prevProviderPoolTokenBalance.add(expectedPoolTokenAmount)
                    );

                    expect(await networkToken.totalSupply()).to.equal(prevTokenTotalSupply.sub(amount));
                    expect(await networkToken.balanceOf(networkTokenPool.address)).to.equal(
                        prevPoolTokenBalance.sub(amount)
                    );
                    expect(await networkToken.balanceOf(provider.address)).to.equal(prevProviderTokenBalance);

                    expect(await govToken.totalSupply()).to.equal(prevGovTotalSupply.add(expectedGovTokenAmount));
                    expect(await govToken.balanceOf(networkTokenPool.address)).to.equal(prevPoolGovTokenBalance);
                    expect(await govToken.balanceOf(provider.address)).to.equal(
                        prevProviderGovTokenBalance.add(expectedGovTokenAmount)
                    );
                };

                it('should revert when attempting to deposit without sending the network tokens', async () => {
                    const amount = BigNumber.from(1);

                    await expect(
                        network.depositToNetworkPoolForT(provider.address, amount, false, BigNumber.from(0))
                    ).to.be.revertedWith('');
                });

                it('should revert when attempting to deposit too much liquidity', async () => {
                    const maxAmount = (await networkPoolToken.balanceOf(networkTokenPool.address))
                        .mul(await networkTokenPool.stakedBalance())
                        .div(await networkPoolToken.totalSupply());

                    await expect(
                        network.depositToNetworkPoolForT(
                            provider.address,
                            maxAmount.add(BigNumber.from(1)),
                            false,
                            BigNumber.from(0)
                        )
                    ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
                });

                it('should allow depositing liquidity', async () => {
                    for (const amount of [
                        BigNumber.from(1),
                        BigNumber.from(10_000),
                        toWei(BigNumber.from(20_000)),
                        toWei(BigNumber.from(30_000))
                    ]) {
                        await testDeposit(provider, amount, false, BigNumber.from(0));
                        await testDeposit(provider2, amount, false, BigNumber.from(0));
                    }
                });

                it('should compensate migrating providers when they are depositing liquidity', async () => {
                    for (const amount of [
                        BigNumber.from(1),
                        BigNumber.from(10_000),
                        toWei(BigNumber.from(20_000)),
                        toWei(BigNumber.from(30_000))
                    ]) {
                        await testDeposit(provider, amount, true, BigNumber.from(100));
                        await testDeposit(provider2, amount, true, BigNumber.from(100));
                    }
                });
            });
        });
    });

    describe('withdraw liquidity', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkToken: NetworkToken;
        let govToken: GovToken;
        let networkTokenPool: TestNetworkTokenPool;
        let networkPoolToken: PoolToken;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ networkSettings, network, networkToken, govToken, networkTokenPool, networkPoolToken, poolCollection } =
                await createSystem());

            reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, BigNumber.from(1_000_000));
        });

        it('should revert when attempting to withdraw from a non-network', async () => {
            const nonNetwork = deployer;

            await expect(
                networkTokenPool.connect(nonNetwork).withdraw(provider.address, BigNumber.from(1))
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when attempting to withdraw for an invalid provider', async () => {
            await expect(network.withdrawFromNetworkPoolT(ZERO_ADDRESS, BigNumber.from(1))).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('should revert when attempting to withdraw a zero amount', async () => {
            await expect(network.withdrawFromNetworkPoolT(provider.address, BigNumber.from(0))).to.be.revertedWith(
                'ZeroValue'
            );
        });

        it('should revert when attempting to withdraw before any deposits were made', async () => {
            await expect(network.withdrawFromNetworkPoolT(provider.address, BigNumber.from(1))).to.be.revertedWith(''); // division by 0
        });

        context('with a whitelisted and registered pool', () => {
            const MAX_DEVIATION = BigNumber.from(10_000); // %1
            const MINTING_LIMIT = toWei(BigNumber.from(10_000_000));
            const WITHDRAWAL_FEE = BigNumber.from(50_000); // 5%

            beforeEach(async () => {
                await createPool(reserveToken, network, networkSettings, poolCollection);

                await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
                await networkSettings.setPoolMintingLimit(reserveToken.address, MINTING_LIMIT);
                await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);
            });

            context('with requested liquidity', () => {
                beforeEach(async () => {
                    const requestedAmount = toWei(BigNumber.from(1_000_000));
                    const contextId = formatBytes32String('CTX');

                    await network.requestLiquidityT(contextId, reserveToken.address, requestedAmount);
                });

                context('with deposited liquidity', () => {
                    let depositAmounts: {
                        poolTokenAmount: BigNumber;
                        govTokenAmount: BigNumber;
                    };

                    beforeEach(async () => {
                        // since this is only a unit test, we will simulate a proper transfer of the network token amount
                        // from the network to the network token pool
                        const depositAmount = toWei(BigNumber.from(1_000_000));
                        await networkToken.connect(deployer).transfer(networkTokenPool.address, depositAmount);

                        depositAmounts = await network.callStatic.depositToNetworkPoolForT(
                            provider.address,
                            depositAmount,
                            false,
                            BigNumber.from(0)
                        );

                        await network.depositToNetworkPoolForT(
                            provider.address,
                            depositAmount,
                            false,
                            BigNumber.from(0)
                        );
                    });

                    const testWithdraw = async (provider: SignerWithAddress, poolTokenAmount: BigNumber) => {
                        await networkPoolToken.connect(provider).transfer(network.address, poolTokenAmount);
                        await network.approveT(networkPoolToken.address, networkTokenPool.address, poolTokenAmount);
                        await govToken.connect(provider).transfer(networkTokenPool.address, poolTokenAmount);

                        const prevStakedBalance = await networkTokenPool.stakedBalance();

                        const prevPoolTokenTotalSupply = await networkPoolToken.totalSupply();
                        const prevPoolPoolTokenBalance = await networkPoolToken.balanceOf(networkTokenPool.address);
                        const prevNetworkPoolTokenBalance = await networkPoolToken.balanceOf(network.address);
                        const prevProviderPoolTokenBalance = await networkPoolToken.balanceOf(provider.address);

                        const prevTokenTotalSupply = await networkToken.totalSupply();
                        const prevPoolTokenBalance = await networkToken.balanceOf(networkTokenPool.address);
                        const prevProviderTokenBalance = await networkToken.balanceOf(provider.address);

                        const prevGovTotalSupply = await govToken.totalSupply();
                        const prevPoolGovTokenBalance = await govToken.balanceOf(networkTokenPool.address);
                        const prevProviderGovTokenBalance = await govToken.balanceOf(provider.address);
                        const expectedTokenAmount = BigNumber.from(
                            mulDivF(
                                poolTokenAmount,
                                prevStakedBalance.mul(PPM_RESOLUTION.sub(WITHDRAWAL_FEE)),
                                prevPoolTokenTotalSupply.mul(PPM_RESOLUTION)
                            ).toFixed()
                        );

                        const withdrawalAmounts = await network.callStatic.withdrawFromNetworkPoolT(
                            provider.address,
                            poolTokenAmount
                        );

                        expect(withdrawalAmounts.networkTokenAmount).to.equal(expectedTokenAmount);
                        expect(withdrawalAmounts.poolTokenAmount).to.equal(poolTokenAmount);

                        await network.withdrawFromNetworkPoolT(provider.address, poolTokenAmount);

                        expect(await networkTokenPool.stakedBalance()).to.equal(prevStakedBalance);

                        expect(await networkPoolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply);
                        expect(await networkPoolToken.balanceOf(networkTokenPool.address)).to.equal(
                            prevPoolPoolTokenBalance.add(poolTokenAmount)
                        );

                        expect(await networkPoolToken.balanceOf(network.address)).to.equal(
                            prevNetworkPoolTokenBalance.sub(poolTokenAmount)
                        );
                        expect(await networkPoolToken.balanceOf(provider.address)).to.equal(
                            prevProviderPoolTokenBalance
                        );

                        expect(await networkToken.totalSupply()).to.equal(
                            prevTokenTotalSupply.add(expectedTokenAmount)
                        );
                        expect(await networkToken.balanceOf(networkTokenPool.address)).to.equal(prevPoolTokenBalance);
                        expect(await networkToken.balanceOf(provider.address)).to.equal(
                            prevProviderTokenBalance.add(expectedTokenAmount)
                        );

                        expect(await govToken.totalSupply()).to.equal(prevGovTotalSupply.sub(poolTokenAmount));
                        expect(await govToken.balanceOf(networkTokenPool.address)).to.equal(
                            prevPoolGovTokenBalance.sub(poolTokenAmount)
                        );
                        expect(await govToken.balanceOf(provider.address)).to.equal(prevProviderGovTokenBalance);
                    };

                    it('should revert when attempting to withdraw more than the deposited amount', async () => {
                        const extra = BigNumber.from(1);
                        const poolTokenAmount = depositAmounts.poolTokenAmount.add(extra);

                        await network.approveT(networkPoolToken.address, networkTokenPool.address, poolTokenAmount);
                        await govToken.connect(deployer).transfer(provider.address, extra);
                        await govToken.connect(provider).transfer(networkTokenPool.address, poolTokenAmount);

                        await expect(
                            network.withdrawFromNetworkPoolT(provider.address, poolTokenAmount)
                        ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
                    });

                    it('should revert when attempting to deposit without sending the governance tokens', async () => {
                        const poolTokenAmount = BigNumber.from(1000);

                        await networkPoolToken.connect(provider).transfer(network.address, poolTokenAmount);
                        await network.approveT(networkPoolToken.address, networkTokenPool.address, poolTokenAmount);

                        await expect(
                            network.withdrawFromNetworkPoolT(provider.address, poolTokenAmount)
                        ).to.be.revertedWith('ERR_UNDERFLOW');
                    });

                    it('should revert when attempting to deposit without approving the network tokens', async () => {
                        const poolTokenAmount = BigNumber.from(1000);
                        await govToken.connect(provider).transfer(networkTokenPool.address, poolTokenAmount);

                        await expect(
                            network.withdrawFromNetworkPoolT(provider.address, poolTokenAmount)
                        ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
                    });

                    it('should allow withdrawing liquidity', async () => {
                        for (const poolTokenAmount of [
                            BigNumber.from(100),
                            BigNumber.from(10_000),
                            toWei(BigNumber.from(20_000)),
                            toWei(BigNumber.from(30_000))
                        ]) {
                            await testWithdraw(provider, poolTokenAmount);
                        }
                    });
                });
            });
        });
    });

    describe('fee collection', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkTokenPool: TestNetworkTokenPool;
        let reserveToken: TestERC20Token;

        const MINTING_LIMIT = toWei(BigNumber.from(10_000_000));

        beforeEach(async () => {
            ({ networkSettings, networkTokenPool, network } = await createSystem());

            reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, BigNumber.from(1_000_000));

            await networkSettings.setPoolMintingLimit(reserveToken.address, MINTING_LIMIT);
        });

        it('should revert when attempting to notify about collected fee from a non-network', async () => {
            const nonNetwork = deployer;

            await expect(
                networkTokenPool
                    .connect(nonNetwork)
                    .onFeesCollected(reserveToken.address, BigNumber.from(1), FeeTypes.Trading)
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when attempting to notify about collected fee from an invalid pool', async () => {
            await expect(
                network.onNetworkTokenFeesCollectedT(ZERO_ADDRESS, BigNumber.from(1), FeeTypes.Trading)
            ).to.be.revertedWith('InvalidAddress');
        });

        for (const [name, type] of Object.entries(FeeTypes)) {
            for (const feeAmount of [BigNumber.from(0), BigNumber.from(12345), toWei(BigNumber.from(12345))]) {
                it(`should collect ${name} fees of ${feeAmount.toString()}`, async () => {
                    const prevStakedBalance = await networkTokenPool.stakedBalance();
                    const prevMintedAmount = await networkTokenPool.mintedAmount(reserveToken.address);
                    const prevUnallocatedLiquidity = await networkTokenPool.unallocatedLiquidity(reserveToken.address);
                    const expectedMintedAmount = type === FeeTypes.Trading ? feeAmount : 0;

                    await network.onNetworkTokenFeesCollectedT(reserveToken.address, feeAmount, type);

                    expect(await networkTokenPool.stakedBalance()).to.equal(prevStakedBalance.add(feeAmount));
                    expect(await networkTokenPool.mintedAmount(reserveToken.address)).to.equal(
                        prevMintedAmount.add(expectedMintedAmount)
                    );
                    expect(await networkTokenPool.unallocatedLiquidity(reserveToken.address)).to.equal(
                        prevUnallocatedLiquidity.sub(expectedMintedAmount)
                    );
                });
            }
        }
    });
});
