import Contracts from '../../components/Contracts';
import {
    TestBancorNetwork,
    TestNetworkTokenPool,
    TestERC20Token,
    NetworkSettings,
    TestPoolCollection,
    PoolToken,
    BancorVault
} from '../../typechain';
import {
    NETWORK_TOKEN_POOL_TOKEN_SYMBOL,
    NETWORK_TOKEN_POOL_TOKEN_NAME,
    FEE_TYPES,
    ZERO_ADDRESS,
    PPM_RESOLUTION
} from '../helpers/Constants';
import { createSystem, createPool, createPoolCollection } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { toWei } from '../helpers/Types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, utils } from 'ethers';
import { ethers } from 'hardhat';

const { formatBytes32String } = utils;

describe('NetworkTokenPool', () => {
    let deployer: SignerWithAddress;
    let nonOwner: SignerWithAddress;
    let provider: SignerWithAddress;
    let provider2: SignerWithAddress;

    shouldHaveGap('NetworkTokenPool', '_pendingWithdrawals');

    before(async () => {
        [deployer, nonOwner, provider, provider2] = await ethers.getSigners();
    });

    describe('construction', () => {
        it('should revert when attempting to initialize with an invalid pending withdrawal contract', async () => {
            const { networkTokenPoolToken, network, vault } = await createSystem();

            const networkTokenPool = await Contracts.NetworkTokenPool.deploy(
                network.address,
                vault.address,
                networkTokenPoolToken.address
            );

            await expect(networkTokenPool.initialize(ZERO_ADDRESS)).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should revert when attempting to reinitialize', async () => {
            const { networkTokenPool, pendingWithdrawals } = await createSystem();

            await expect(networkTokenPool.initialize(pendingWithdrawals.address)).to.be.revertedWith(
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
                vault,
                pendingWithdrawals
            } = await createSystem();

            expect(await networkTokenPool.version()).to.equal(1);

            expect(await networkTokenPool.network()).to.equal(network.address);
            expect(await networkTokenPool.networkToken()).to.equal(networkToken.address);
            expect(await networkTokenPool.networkTokenGovernance()).to.equal(networkTokenGovernance.address);
            expect(await networkTokenPool.govToken()).to.equal(govToken.address);
            expect(await networkTokenPool.govTokenGovernance()).to.equal(govTokenGovernance.address);
            expect(await networkTokenPool.settings()).to.equal(networkSettings.address);
            expect(await networkTokenPool.vault()).to.equal(vault.address);
            expect(await networkTokenPool.pendingWithdrawals()).to.equal(pendingWithdrawals.address);

            expect(await networkTokenPool.stakedBalance()).to.equal(BigNumber.from(0));

            const poolToken = await Contracts.PoolToken.attach(await networkTokenPool.poolToken());
            expect(await poolToken.owner()).to.equal(networkTokenPool.address);
            expect(await poolToken.reserveToken()).to.equal(networkToken.address);
            expect(await poolToken.name()).to.equal(NETWORK_TOKEN_POOL_TOKEN_NAME);
            expect(await poolToken.symbol()).to.equal(NETWORK_TOKEN_POOL_TOKEN_SYMBOL);
        });
    });

    describe('request liquidity', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkToken: TestERC20Token;
        let networkTokenPool: TestNetworkTokenPool;
        let networkTokenPoolToken: PoolToken;
        let vault: BancorVault;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        const contextId = formatBytes32String('CTX');

        beforeEach(async () => {
            ({
                networkSettings,
                network,
                networkToken,
                networkTokenPool,
                networkTokenPoolToken,
                vault,
                poolCollection
            } = await createSystem());

            reserveToken = await Contracts.TestERC20Token.deploy('TKN', 'TKN', BigNumber.from(1_000_000));
        });

        it('should revert when attempting to request liquidity for a non-whitelisted pool', async () => {
            await expect(
                poolCollection.requestLiquidityT(
                    networkTokenPool.address,
                    contextId,
                    reserveToken.address,
                    BigNumber.from(1),
                    false
                )
            ).to.be.revertedWith('ERR_POOL_NOT_WHITELISTED');
        });

        it('should revert when attempting to request liquidity for an invalid pool', async () => {
            await expect(
                poolCollection.requestLiquidityT(
                    networkTokenPool.address,
                    contextId,
                    ZERO_ADDRESS,
                    BigNumber.from(1),
                    false
                )
            ).to.be.revertedWith('ERR_POOL_NOT_WHITELISTED');
        });

        it('should revert when attempting to request liquidity for a pool with no collection managing it', async () => {
            await networkSettings.addTokenToWhitelist(reserveToken.address);

            // we expect the call to revert with no message when attempting to call a function of a zero contract
            await expect(
                poolCollection.requestLiquidityT(
                    networkTokenPool.address,
                    contextId,
                    reserveToken.address,
                    BigNumber.from(1),
                    false
                )
            ).to.be.revertedWith('Transaction reverted: function call to a non-contract account');
        });

        it('should revert when attempting to request liquidity for a pool with an unknown collection managing it', async () => {
            const unknownPoolCollection = await createPoolCollection(network, 1000);
            const reserveToken2 = await Contracts.TestERC20Token.deploy('TKN', 'TKN', BigNumber.from(1_000_000));
            await createPool(reserveToken2, network, networkSettings, unknownPoolCollection);

            await expect(
                poolCollection.requestLiquidityT(
                    networkTokenPool.address,
                    contextId,
                    reserveToken2.address,
                    BigNumber.from(1),
                    false
                )
            ).to.be.revertedWith('ERR_UNKNOWN_POOL_COLLECTION');
        });

        context('with a whitelisted and registered pool', () => {
            const MAX_DEVIATION = BigNumber.from(10_000); // %1
            const MINTING_LIMIT: BigNumber = toWei(BigNumber.from(10_000_000));

            beforeEach(async () => {
                await createPool(reserveToken, network, networkSettings, poolCollection);

                await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION); // %1
                await networkSettings.setPoolMintingLimit(reserveToken.address, MINTING_LIMIT);
            });

            it('should revert when attempting to request liquidity for a pool from a different collection than the one managing it', async () => {
                const poolCollection2 = await createPoolCollection(network);
                await expect(
                    poolCollection2.requestLiquidityT(
                        networkTokenPool.address,
                        contextId,
                        reserveToken.address,
                        BigNumber.from(1),
                        false
                    )
                ).to.be.revertedWith('ERR_ACCESS_DENIED');
            });

            it('should revert when attempting to request a zero liquidity amount', async () => {
                await expect(
                    poolCollection.requestLiquidityT(
                        networkTokenPool.address,
                        contextId,
                        reserveToken.address,
                        BigNumber.from(0),
                        false
                    )
                ).to.be.revertedWith('ERR_ZERO_VALUE');
            });

            context('when spot rate is too far from average rate', () => {
                beforeEach(async () => {
                    const spotRate = { n: BigNumber.from(1_000_000), d: BigNumber.from(1) };

                    await poolCollection.setTradingLiquidityT(reserveToken.address, spotRate.n, spotRate.d);
                    await poolCollection.setAverageRateT(reserveToken.address, {
                        rate: {
                            n: spotRate.n.mul(PPM_RESOLUTION),
                            d: spotRate.d.mul(PPM_RESOLUTION.add(MAX_DEVIATION.add(BigNumber.from(1000))))
                        },
                        time: BigNumber.from(0)
                    });
                });

                it('should revert when requesting liquidity', async () => {
                    await expect(
                        poolCollection.requestLiquidityT(
                            networkTokenPool.address,
                            contextId,
                            reserveToken.address,
                            BigNumber.from(1),
                            false
                        )
                    ).to.be.revertedWith('ERR_INVALID_RATE');
                });
            });

            context('when spot rate is close enough to the average rate', () => {
                const testRequest = async (
                    amount: BigNumber,
                    expectedAmount: BigNumber,
                    skipLimitCheck: boolean = false
                ) => {
                    const prevStakedBalance = await networkTokenPool.stakedBalance();
                    const prevMintedAmount = await networkTokenPool.mintedAmounts(reserveToken.address);

                    const prevNetworkTokenPoolTokenTotalSupply = await networkTokenPoolToken.totalSupply();
                    const prevNetworkTokenPoolPoolTokenAmount = await networkTokenPoolToken.balanceOf(
                        networkTokenPool.address
                    );
                    const prevVaultPoolTokenAmount = await networkTokenPoolToken.balanceOf(vault.address);

                    const prevNetworkTokenTotalSupply = await networkToken.totalSupply();
                    const prevNetworkTokenPoolNetworkTokenAmount = await networkToken.balanceOf(
                        networkTokenPool.address
                    );
                    const prevVaultNetworkTokenAmount = await networkToken.balanceOf(vault.address);

                    let expectedPoolTokenAmount;
                    if (prevNetworkTokenPoolTokenTotalSupply.isZero()) {
                        expectedPoolTokenAmount = expectedAmount;
                    } else {
                        expectedPoolTokenAmount = expectedAmount
                            .mul(prevNetworkTokenPoolTokenTotalSupply)
                            .div(prevStakedBalance);
                    }

                    const receiveAmount = await poolCollection.callStatic.requestLiquidityT(
                        networkTokenPool.address,
                        contextId,
                        reserveToken.address,
                        amount,
                        skipLimitCheck
                    );
                    expect(receiveAmount).to.equal(expectedAmount);

                    const res = await poolCollection.requestLiquidityT(
                        networkTokenPool.address,
                        contextId,
                        reserveToken.address,
                        amount,
                        skipLimitCheck
                    );

                    await expect(res)
                        .to.emit(networkTokenPool, 'LiquidityRequested')
                        .withArgs(contextId, reserveToken.address, amount, expectedAmount, expectedPoolTokenAmount);

                    expect(await networkTokenPool.stakedBalance()).to.equal(prevStakedBalance.add(expectedAmount));
                    expect(await networkTokenPool.mintedAmounts(reserveToken.address)).to.equal(
                        prevMintedAmount.add(expectedAmount)
                    );

                    expect(await networkTokenPoolToken.totalSupply()).to.equal(
                        prevNetworkTokenPoolTokenTotalSupply.add(expectedPoolTokenAmount)
                    );
                    expect(await networkTokenPoolToken.balanceOf(networkTokenPool.address)).to.equal(
                        prevNetworkTokenPoolPoolTokenAmount.add(expectedPoolTokenAmount)
                    );
                    expect(await networkTokenPoolToken.balanceOf(vault.address)).to.equal(prevVaultPoolTokenAmount);

                    expect(await networkToken.totalSupply()).to.equal(prevNetworkTokenTotalSupply.add(expectedAmount));
                    expect(await networkToken.balanceOf(networkTokenPool.address)).to.equal(
                        prevNetworkTokenPoolNetworkTokenAmount
                    );
                    expect(await networkToken.balanceOf(vault.address)).to.equal(
                        prevVaultNetworkTokenAmount.add(expectedAmount)
                    );
                };

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
                    beforeEach(async () => {
                        const amount = MINTING_LIMIT.sub(toWei(BigNumber.from(1_000_000)));
                        await testRequest(amount, amount);
                    });

                    it('should allow requesting partial liquidity amount', async () => {
                        for (const amount of [
                            BigNumber.from(10),
                            BigNumber.from(100_000),
                            toWei(BigNumber.from(2_000_000)),
                            toWei(BigNumber.from(1_500_000))
                        ]) {
                            const remaining = (await networkSettings.poolMintingLimit(reserveToken.address)).sub(
                                await networkTokenPool.mintedAmounts(reserveToken.address)
                            );
                            const expectAmount = BigNumber.min(remaining, amount);

                            await testRequest(amount, expectAmount);
                        }
                    });

                    it('should allow explicitly requesting full liquidity', async () => {
                        for (const amount of [
                            BigNumber.from(10),
                            BigNumber.from(100_000),
                            toWei(BigNumber.from(2_000_000)),
                            toWei(BigNumber.from(1_500_000))
                        ]) {
                            await testRequest(amount, amount, true);
                        }
                    });

                    context('when the minting limit is lowered retroactively', () => {
                        beforeEach(async () => {
                            await testRequest(BigNumber.from(100_000), BigNumber.from(100_000));

                            await networkSettings.setPoolMintingLimit(reserveToken.address, BigNumber.from(1));
                        });

                        it('should ignore requesting liquidity', async () => {
                            for (const amount of [
                                BigNumber.from(10),
                                BigNumber.from(100_000),
                                toWei(BigNumber.from(2_000_000)),
                                toWei(BigNumber.from(1_500_000))
                            ]) {
                                await testRequest(amount, BigNumber.from(0));
                            }
                        });

                        it('should allow explicitly requesting full liquidity', async () => {
                            for (const amount of [
                                BigNumber.from(10),
                                BigNumber.from(100_000),
                                toWei(BigNumber.from(2_000_000)),
                                toWei(BigNumber.from(1_500_000))
                            ]) {
                                await testRequest(amount, amount, true);
                            }
                        });
                    });
                });

                context('when at the minting limit', () => {
                    beforeEach(async () => {
                        await testRequest(MINTING_LIMIT, MINTING_LIMIT);
                    });

                    it('should ignore requesting liquidity', async () => {
                        for (const amount of [
                            BigNumber.from(10),
                            BigNumber.from(100_000),
                            toWei(BigNumber.from(2_000_000)),
                            toWei(BigNumber.from(1_500_000))
                        ]) {
                            await testRequest(amount, BigNumber.from(0));
                        }
                    });

                    it('should allow explicitly requesting full liquidity amount', async () => {
                        for (const amount of [
                            BigNumber.from(10),
                            BigNumber.from(100_000),
                            toWei(BigNumber.from(2_000_000)),
                            toWei(BigNumber.from(1_500_000))
                        ]) {
                            await testRequest(amount, amount, true);
                        }
                    });
                });
            });
        });
    });

    describe('renounce liquidity', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkToken: TestERC20Token;
        let networkTokenPool: TestNetworkTokenPool;
        let networkTokenPoolToken: PoolToken;
        let vault: BancorVault;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        const contextId = formatBytes32String('CTX');

        beforeEach(async () => {
            ({
                networkSettings,
                network,
                networkToken,
                networkTokenPool,
                networkTokenPoolToken,
                vault,
                poolCollection
            } = await createSystem());

            reserveToken = await Contracts.TestERC20Token.deploy('TKN', 'TKN', BigNumber.from(1_000_000));
        });

        it('should revert when attempting to renounce liquidity for a non-whitelisted pool', async () => {
            await expect(
                poolCollection.renounceLiquidityT(
                    networkTokenPool.address,
                    contextId,
                    reserveToken.address,
                    BigNumber.from(1)
                )
            ).to.be.revertedWith('ERR_POOL_NOT_WHITELISTED');
        });

        it('should revert when attempting to renounce liquidity for an invalid pool', async () => {
            await expect(
                poolCollection.renounceLiquidityT(networkTokenPool.address, contextId, ZERO_ADDRESS, BigNumber.from(1))
            ).to.be.revertedWith('ERR_POOL_NOT_WHITELISTED');
        });

        it('should revert when attempting to renounce liquidity for a pool with no collection managing it', async () => {
            await networkSettings.addTokenToWhitelist(reserveToken.address);

            // we expect the call to revert with no message when attempting to call a function of a zero contract
            await expect(
                poolCollection.renounceLiquidityT(
                    networkTokenPool.address,
                    contextId,
                    reserveToken.address,
                    BigNumber.from(1)
                )
            ).to.be.revertedWith('Transaction reverted: function call to a non-contract account');
        });

        it('should revert when attempting to renounce liquidity for a pool with an unknown collection managing it', async () => {
            const unknownPoolCollection = await createPoolCollection(network, 1000);
            const reserveToken2 = await Contracts.TestERC20Token.deploy('TKN', 'TKN', BigNumber.from(1_000_000));

            await createPool(reserveToken2, network, networkSettings, unknownPoolCollection);

            await expect(
                poolCollection.renounceLiquidityT(
                    networkTokenPool.address,
                    contextId,
                    reserveToken2.address,
                    BigNumber.from(1)
                )
            ).to.be.revertedWith('ERR_UNKNOWN_POOL_COLLECTION');
        });

        context('with a whitelisted and registered pool', () => {
            const MAX_DEVIATION = BigNumber.from(10_000); // %1
            const MINTING_LIMIT: BigNumber = toWei(BigNumber.from(10_000_000));

            beforeEach(async () => {
                await createPool(reserveToken, network, networkSettings, poolCollection);

                await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION); // %1
                await networkSettings.setPoolMintingLimit(reserveToken.address, MINTING_LIMIT);
            });

            it('should revert when attempting to renounce liquidity for a pool from a different collection than the one managing it', async () => {
                const poolCollection2 = await createPoolCollection(network);
                await expect(
                    poolCollection2.renounceLiquidityT(
                        networkTokenPool.address,
                        contextId,
                        reserveToken.address,
                        BigNumber.from(1)
                    )
                ).to.be.revertedWith('ERR_ACCESS_DENIED');
            });

            it('should revert when attempting to renounce a zero liquidity amount', async () => {
                await expect(
                    poolCollection.renounceLiquidityT(
                        networkTokenPool.address,
                        contextId,
                        reserveToken.address,
                        BigNumber.from(0)
                    )
                ).to.be.revertedWith('ERR_ZERO_VALUE');
            });

            it('should revert when attempting to renounce liquidity when no liquidity was ever requested', async () => {
                await expect(
                    poolCollection.renounceLiquidityT(
                        networkTokenPool.address,
                        contextId,
                        reserveToken.address,
                        BigNumber.from(1)
                    )
                ).to.be.revertedWith('ERR_AMOUNT_TOO_HIGH');
            });

            context('with requested liquidity', () => {
                const requestedAmount = toWei(BigNumber.from(1_000_000));

                beforeEach(async () => {
                    await poolCollection.requestLiquidityT(
                        networkTokenPool.address,
                        contextId,
                        reserveToken.address,
                        requestedAmount,
                        false
                    );
                });

                const testRenounce = async (amount: BigNumber) => {
                    const prevStakedBalance = await networkTokenPool.stakedBalance();
                    const prevMintedAmount = await networkTokenPool.mintedAmounts(reserveToken.address);

                    const prevNetworkTokenPoolTokenTotalSupply = await networkTokenPoolToken.totalSupply();
                    const prevNetworkTokenPoolPoolTokenAmount = await networkTokenPoolToken.balanceOf(
                        networkTokenPool.address
                    );
                    const prevVaultPoolTokenAmount = await networkTokenPoolToken.balanceOf(vault.address);

                    const prevNetworkTokenTotalSupply = await networkToken.totalSupply();
                    const prevNetworkTokenPoolNetworkTokenAmount = await networkToken.balanceOf(
                        networkTokenPool.address
                    );
                    const prevVaultNetworkTokenAmount = await networkToken.balanceOf(vault.address);

                    let expectedPoolTokenAmount = amount
                        .mul(prevNetworkTokenPoolTokenTotalSupply)
                        .div(prevStakedBalance);

                    const res = await poolCollection.renounceLiquidityT(
                        networkTokenPool.address,
                        contextId,
                        reserveToken.address,
                        amount
                    );

                    await expect(res)
                        .to.emit(networkTokenPool, 'LiquidityRenounced')
                        .withArgs(contextId, reserveToken.address, amount, expectedPoolTokenAmount);

                    expect(await networkTokenPool.stakedBalance()).to.equal(prevStakedBalance.sub(amount));
                    expect(await networkTokenPool.mintedAmounts(reserveToken.address)).to.equal(
                        prevMintedAmount.sub(amount)
                    );

                    expect(await networkTokenPoolToken.totalSupply()).to.equal(
                        prevNetworkTokenPoolTokenTotalSupply.sub(expectedPoolTokenAmount)
                    );
                    expect(await networkTokenPoolToken.balanceOf(networkTokenPool.address)).to.equal(
                        prevNetworkTokenPoolPoolTokenAmount.sub(expectedPoolTokenAmount)
                    );
                    expect(await networkTokenPoolToken.balanceOf(vault.address)).to.equal(prevVaultPoolTokenAmount);

                    expect(await networkToken.totalSupply()).to.equal(prevNetworkTokenTotalSupply.sub(amount));
                    expect(await networkToken.balanceOf(networkTokenPool.address)).to.equal(
                        prevNetworkTokenPoolNetworkTokenAmount
                    );
                    expect(await networkToken.balanceOf(vault.address)).to.equal(
                        prevVaultNetworkTokenAmount.sub(amount)
                    );
                };

                it('should revert when attempting to renounce more liquidity than requested', async () => {
                    await expect(
                        poolCollection.renounceLiquidityT(
                            networkTokenPool.address,
                            contextId,
                            reserveToken.address,
                            requestedAmount.add(BigNumber.from(1))
                        )
                    ).to.be.revertedWith('ERR_AMOUNT_TOO_HIGH');
                });

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
            });
        });
    });

    describe('deposit liquidity', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkToken: TestERC20Token;
        let govToken: TestERC20Token;
        let networkTokenPool: TestNetworkTokenPool;
        let networkTokenPoolToken: PoolToken;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({
                networkSettings,
                network,
                networkToken,
                govToken,
                networkTokenPool,
                networkTokenPoolToken,
                poolCollection
            } = await createSystem());

            reserveToken = await Contracts.TestERC20Token.deploy('TKN', 'TKN', BigNumber.from(1_000_000));
        });

        it('should revert when attempting to deposit from a non-network', async () => {
            const amount = BigNumber.from(1);
            let nonNetwork = nonOwner;

            await expect(
                networkTokenPool.connect(nonNetwork).depositFor(provider.address, amount, false, BigNumber.from(0))
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should revert when attempting to deposit a zero amount', async () => {
            const amount = BigNumber.from(0);

            await expect(
                network.depositForT(networkTokenPool.address, provider.address, amount, false, BigNumber.from(0))
            ).to.be.revertedWith('ERR_ZERO_VALUE');
        });

        it('should revert when attempting to deposit for an invalid provider', async () => {
            const amount = BigNumber.from(1);

            await expect(
                network.depositForT(networkTokenPool.address, ZERO_ADDRESS, amount, false, BigNumber.from(0))
            ).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should revert when attempting to deposit when no liquidity was requested', async () => {
            const amount = BigNumber.from(1);

            await expect(
                network.depositForT(networkTokenPool.address, provider.address, amount, false, BigNumber.from(0))
            ).to.be.revertedWith('ERR_AMOUNT_TOO_HIGH');
        });

        context('with a whitelisted and registered pool', () => {
            const MAX_DEVIATION = BigNumber.from(10_000); // %1
            const MINTING_LIMIT: BigNumber = toWei(BigNumber.from(10_000_000));

            beforeEach(async () => {
                await createPool(reserveToken, network, networkSettings, poolCollection);

                await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION); // %1
                await networkSettings.setPoolMintingLimit(reserveToken.address, MINTING_LIMIT);
            });

            context('with requested liquidity', () => {
                beforeEach(async () => {
                    const requestedAmount = toWei(BigNumber.from(1_000_000));
                    const contextId = formatBytes32String('CTX');

                    await poolCollection.requestLiquidityT(
                        networkTokenPool.address,
                        contextId,
                        reserveToken.address,
                        requestedAmount,
                        false
                    );
                });

                const testDeposit = async (
                    provider: SignerWithAddress,
                    amount: BigNumber,
                    isMigrating: boolean,
                    originalPoolTokenAmount: BigNumber
                ) => {
                    // since this is only a unit test, we will simulate a proper transfer of the network token amount
                    // from the network to the network token pool
                    await networkToken.connect(deployer).transfer(networkTokenPool.address, amount);

                    const prevStakedBalance = await networkTokenPool.stakedBalance();

                    const prevNetworkTokenPoolTokenTotalSupply = await networkTokenPoolToken.totalSupply();
                    const prevNetworkTokenPoolPoolTokenAmount = await networkTokenPoolToken.balanceOf(
                        networkTokenPool.address
                    );
                    const prevProviderPoolTokenAmount = await networkTokenPoolToken.balanceOf(provider.address);

                    const prevNetworkTokenTotalSupply = await networkToken.totalSupply();
                    const prevNetworkTokenPoolNetworkTokenAmount = await networkToken.balanceOf(
                        networkTokenPool.address
                    );
                    const prevProviderNetworkTokenAmount = await networkToken.balanceOf(provider.address);

                    const prevGovTotalSupply = await govToken.totalSupply();
                    const prevNetworkTokenPoolGovTokenAmount = await govToken.balanceOf(networkTokenPool.address);
                    const prevProviderGovTokenAmount = await govToken.balanceOf(provider.address);

                    let expectedPoolTokenAmount = amount
                        .mul(prevNetworkTokenPoolTokenTotalSupply)
                        .div(prevStakedBalance);

                    let expectedGovTokenAmount = expectedPoolTokenAmount;
                    if (isMigrating && expectedPoolTokenAmount.gt(originalPoolTokenAmount)) {
                        expectedGovTokenAmount = expectedGovTokenAmount.sub(originalPoolTokenAmount);
                    }

                    const depositAmounts = await network.callStatic.depositForT(
                        networkTokenPool.address,
                        provider.address,
                        amount,
                        isMigrating,
                        originalPoolTokenAmount
                    );
                    expect(depositAmounts.networkTokenAmount).to.equal(amount);
                    expect(depositAmounts.poolTokenAmount).to.equal(expectedPoolTokenAmount);
                    expect(depositAmounts.govTokenAmount).to.equal(expectedGovTokenAmount);

                    await network.depositForT(
                        networkTokenPool.address,
                        provider.address,
                        amount,
                        isMigrating,
                        originalPoolTokenAmount
                    );

                    expect(await networkTokenPool.stakedBalance()).to.equal(prevStakedBalance);

                    expect(await networkTokenPoolToken.totalSupply()).to.equal(prevNetworkTokenPoolTokenTotalSupply);
                    expect(await networkTokenPoolToken.balanceOf(networkTokenPool.address)).to.equal(
                        prevNetworkTokenPoolPoolTokenAmount.sub(expectedPoolTokenAmount)
                    );
                    expect(await networkTokenPoolToken.balanceOf(provider.address)).to.equal(
                        prevProviderPoolTokenAmount.add(expectedPoolTokenAmount)
                    );

                    expect(await networkToken.totalSupply()).to.equal(prevNetworkTokenTotalSupply.sub(amount));
                    expect(await networkToken.balanceOf(networkTokenPool.address)).to.equal(
                        prevNetworkTokenPoolNetworkTokenAmount.sub(amount)
                    );
                    expect(await networkToken.balanceOf(provider.address)).to.equal(prevProviderNetworkTokenAmount);

                    expect(await govToken.totalSupply()).to.equal(prevGovTotalSupply.add(expectedGovTokenAmount));
                    expect(await govToken.balanceOf(networkTokenPool.address)).to.equal(
                        prevNetworkTokenPoolGovTokenAmount
                    );
                    expect(await govToken.balanceOf(provider.address)).to.equal(
                        prevProviderGovTokenAmount.add(expectedGovTokenAmount)
                    );
                };

                it('should revert when attempting to deposit without sending the network tokens first', async () => {
                    const amount = BigNumber.from(1);

                    await expect(
                        network.depositForT(
                            networkTokenPool.address,
                            provider.address,
                            amount,
                            false,
                            BigNumber.from(0)
                        )
                    ).to.be.revertedWith('ERC20: burn amount exceeds balance');
                });

                it('should revert when attempting to deposit too much liquidity', async () => {
                    const maxAmount = (await networkTokenPoolToken.balanceOf(networkTokenPool.address))
                        .mul(await networkTokenPool.stakedBalance())
                        .div(await networkTokenPoolToken.totalSupply());

                    await expect(
                        network.depositForT(
                            networkTokenPool.address,
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
