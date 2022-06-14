import Contracts, {
    BancorNetworkInfo,
    BNTPool,
    ExternalProtectionVault,
    ExternalRewardsVault,
    IERC20,
    IPoolToken,
    MasterVault,
    NetworkSettings,
    PoolToken,
    TestBancorNetwork,
    TestBNTPool,
    TestPendingWithdrawals,
    TestPoolCollection,
    TestPoolMigrator
} from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import { PPM_RESOLUTION, RATE_MAX_DEVIATION_PPM, ZERO_ADDRESS } from '../../utils/Constants';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { toPPM, toWei } from '../../utils/Types';
import { expectRole, Roles } from '../helpers/AccessControl';
import {
    createSystem,
    createTestToken,
    depositToPool,
    initWithdraw,
    PoolSpec,
    setupFundedPool,
    TokenWithAddress
} from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { latest } from '../helpers/Time';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, utils } from 'ethers';
import { ethers } from 'hardhat';

const { formatBytes32String } = utils;

describe('BancorNetworkInfo', () => {
    let deployer: SignerWithAddress;

    const BNT_VIRTUAL_BALANCE = 1;
    const BASE_TOKEN_VIRTUAL_BALANCE = 2;
    const MIN_LIQUIDITY_FOR_TRADING = toWei(100_000);

    shouldHaveGap('BancorNetworkInfo');

    before(async () => {
        [deployer] = await ethers.getSigners();
    });

    describe('construction', () => {
        let network: TestBancorNetwork;
        let bnt: IERC20;
        let vbnt: IERC20;
        let networkInfo: BancorNetworkInfo;
        let networkSettings: NetworkSettings;
        let bntGovernance: TokenGovernance;
        let vbntGovernance: TokenGovernance;
        let bntPool: TestBNTPool;
        let bntPoolToken: IPoolToken;
        let poolMigrator: TestPoolMigrator;
        let masterVault: MasterVault;
        let externalProtectionVault: ExternalProtectionVault;
        let externalRewardsVault: ExternalRewardsVault;
        let pendingWithdrawals: TestPendingWithdrawals;

        beforeEach(async () => {
            ({
                network,
                bnt,
                vbnt,
                networkInfo,
                networkSettings,
                bntGovernance,
                vbntGovernance,
                bntPool,
                bntPoolToken,
                poolMigrator,
                masterVault,
                externalProtectionVault,
                externalRewardsVault,
                pendingWithdrawals
            } = await createSystem());
        });

        it('should revert when attempting to create with an invalid network contract', async () => {
            await expect(
                Contracts.BancorNetworkInfo.deploy(
                    ZERO_ADDRESS,
                    bntGovernance.address,
                    vbntGovernance.address,
                    networkSettings.address,
                    masterVault.address,
                    externalProtectionVault.address,
                    externalRewardsVault.address,
                    bntPool.address,
                    pendingWithdrawals.address,
                    poolMigrator.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid BNT governance contract', async () => {
            await expect(
                Contracts.BancorNetworkInfo.deploy(
                    network.address,
                    ZERO_ADDRESS,
                    vbntGovernance.address,
                    networkSettings.address,
                    masterVault.address,
                    externalProtectionVault.address,
                    externalRewardsVault.address,
                    bntPool.address,
                    pendingWithdrawals.address,
                    poolMigrator.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid vBNT governance contract', async () => {
            await expect(
                Contracts.BancorNetworkInfo.deploy(
                    network.address,
                    bntGovernance.address,
                    ZERO_ADDRESS,
                    networkSettings.address,
                    masterVault.address,
                    externalProtectionVault.address,
                    externalRewardsVault.address,
                    bntPool.address,
                    pendingWithdrawals.address,
                    poolMigrator.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid network settings contract', async () => {
            await expect(
                Contracts.BancorNetworkInfo.deploy(
                    network.address,
                    bntGovernance.address,
                    vbntGovernance.address,
                    ZERO_ADDRESS,
                    masterVault.address,
                    externalProtectionVault.address,
                    externalRewardsVault.address,
                    bntPool.address,
                    pendingWithdrawals.address,
                    poolMigrator.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid master vault contract', async () => {
            await expect(
                Contracts.BancorNetworkInfo.deploy(
                    network.address,
                    bntGovernance.address,
                    vbntGovernance.address,
                    networkSettings.address,
                    ZERO_ADDRESS,
                    externalProtectionVault.address,
                    externalRewardsVault.address,
                    bntPool.address,
                    pendingWithdrawals.address,
                    poolMigrator.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid external protection vault contract', async () => {
            await expect(
                Contracts.BancorNetworkInfo.deploy(
                    network.address,
                    bntGovernance.address,
                    vbntGovernance.address,
                    networkSettings.address,
                    masterVault.address,
                    ZERO_ADDRESS,
                    externalRewardsVault.address,
                    bntPool.address,
                    pendingWithdrawals.address,
                    poolMigrator.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid external rewards vault contract', async () => {
            await expect(
                Contracts.BancorNetworkInfo.deploy(
                    network.address,
                    bntGovernance.address,
                    vbntGovernance.address,
                    networkSettings.address,
                    masterVault.address,
                    externalProtectionVault.address,
                    ZERO_ADDRESS,
                    bntPool.address,
                    pendingWithdrawals.address,
                    poolMigrator.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid BNT pool contract', async () => {
            await expect(
                Contracts.BancorNetworkInfo.deploy(
                    network.address,
                    bntGovernance.address,
                    vbntGovernance.address,
                    networkSettings.address,
                    masterVault.address,
                    externalProtectionVault.address,
                    externalRewardsVault.address,
                    ZERO_ADDRESS,
                    pendingWithdrawals.address,
                    poolMigrator.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid pending withdrawals contract', async () => {
            await expect(
                Contracts.BancorNetworkInfo.deploy(
                    network.address,
                    bntGovernance.address,
                    vbntGovernance.address,
                    networkSettings.address,
                    masterVault.address,
                    externalProtectionVault.address,
                    externalRewardsVault.address,
                    bntPool.address,
                    ZERO_ADDRESS,
                    poolMigrator.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid pool migrator contract', async () => {
            await expect(
                Contracts.BancorNetworkInfo.deploy(
                    network.address,
                    bntGovernance.address,
                    vbntGovernance.address,
                    networkSettings.address,
                    masterVault.address,
                    externalProtectionVault.address,
                    externalRewardsVault.address,
                    bntPool.address,
                    pendingWithdrawals.address,
                    ZERO_ADDRESS
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(networkInfo.initialize()).to.be.revertedWithError(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            expect(await networkInfo.version()).to.equal(2);

            await expectRole(networkInfo, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
                deployer.address
            ]);

            expect(await networkInfo.network()).to.equal(network.address);
            expect(await networkInfo.bnt()).to.equal(bnt.address);
            expect(await networkInfo.bntGovernance()).to.equal(bntGovernance.address);
            expect(await networkInfo.vbnt()).to.equal(vbnt.address);
            expect(await networkInfo.vbntGovernance()).to.equal(vbntGovernance.address);
            expect(await networkInfo.networkSettings()).to.equal(networkSettings.address);
            expect(await networkInfo.masterVault()).to.equal(masterVault.address);
            expect(await networkInfo.externalProtectionVault()).to.equal(externalProtectionVault.address);
            expect(await networkInfo.externalRewardsVault()).to.equal(externalRewardsVault.address);
            expect(await networkInfo.bntPool()).to.equal(bntPool.address);
            expect(await networkInfo.poolToken(bnt.address)).to.equal(bntPoolToken.address);
            expect(await networkInfo.pendingWithdrawals()).to.equal(pendingWithdrawals.address);
            expect(await networkInfo.poolMigrator()).to.equal(poolMigrator.address);
        });
    });

    describe('trade amounts', () => {
        let network: TestBancorNetwork;
        let bnt: IERC20;
        let networkInfo: BancorNetworkInfo;
        let networkSettings: NetworkSettings;
        let poolCollection: TestPoolCollection;

        let sourceToken: TokenWithAddress;
        let targetToken: TokenWithAddress;

        let trader: SignerWithAddress;

        before(async () => {
            [, trader] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ network, bnt, networkInfo, networkSettings, poolCollection } = await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
        });

        const setupPools = async (source: PoolSpec, target: PoolSpec) => {
            ({ token: sourceToken } = await setupFundedPool(
                source,
                deployer,
                network,
                networkInfo,
                networkSettings,
                poolCollection
            ));

            ({ token: targetToken } = await setupFundedPool(
                target,
                deployer,
                network,
                networkInfo,
                networkSettings,
                poolCollection
            ));

            // increase BNT liquidity by the growth factor a few times
            for (let i = 0; i < 5; i++) {
                await depositToPool(deployer, sourceToken, 1, network);
            }

            await network.setTime(await latest());
        };

        interface TradeAmountsOverrides {
            sourceTokenAddress?: string;
            targetTokenAddress?: string;
        }
        const tradeOutputBySourceAmount = async (amount: number, overrides: TradeAmountsOverrides = {}) => {
            const { sourceTokenAddress = sourceToken.address, targetTokenAddress = targetToken.address } = overrides;

            return networkInfo.tradeOutputBySourceAmount(sourceTokenAddress, targetTokenAddress, amount);
        };

        const tradeInputByTargetAmount = async (amount: number, overrides: TradeAmountsOverrides = {}) => {
            const { sourceTokenAddress = sourceToken.address, targetTokenAddress = targetToken.address } = overrides;

            return networkInfo.tradeInputByTargetAmount(sourceTokenAddress, targetTokenAddress, amount);
        };

        const testTradesOutputs = (source: PoolSpec, target: PoolSpec) => {
            const isSourceNativeToken = source.tokenData.isNative();

            context(`when trading from ${source.tokenData.symbol()} to ${target.tokenData.symbol()}`, () => {
                const testAmount = 1000;

                beforeEach(async () => {
                    await setupPools(source, target);

                    if (!isSourceNativeToken) {
                        const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);

                        await reserveToken.transfer(await trader.getAddress(), testAmount);
                        await reserveToken.connect(trader).approve(network.address, testAmount);
                    }
                });

                it('should revert when attempting to query using an invalid source token', async () => {
                    await expect(
                        tradeOutputBySourceAmount(testAmount, { sourceTokenAddress: ZERO_ADDRESS })
                    ).to.be.revertedWithError('InvalidAddress');
                    await expect(
                        tradeInputByTargetAmount(testAmount, { sourceTokenAddress: ZERO_ADDRESS })
                    ).to.be.revertedWithError('InvalidAddress');
                });

                it('should revert when attempting to query using an invalid target token', async () => {
                    await expect(
                        tradeOutputBySourceAmount(testAmount, { targetTokenAddress: ZERO_ADDRESS })
                    ).to.be.revertedWithError('InvalidAddress');
                    await expect(
                        tradeInputByTargetAmount(testAmount, { targetTokenAddress: ZERO_ADDRESS })
                    ).to.be.revertedWithError('InvalidAddress');
                });

                it('should revert when attempting to  query using an invalid amount', async () => {
                    const amount = 0;

                    await expect(tradeOutputBySourceAmount(amount)).to.be.revertedWithError('ZeroValue');
                    await expect(tradeInputByTargetAmount(amount)).to.be.revertedWithError('ZeroValue');
                });

                it('should revert when attempting to query using unsupported tokens', async () => {
                    const reserveToken2 = await createTestToken();

                    await reserveToken2.transfer(await trader.getAddress(), testAmount);
                    await reserveToken2.connect(trader).approve(network.address, testAmount);

                    // unknown source token
                    await expect(
                        tradeOutputBySourceAmount(testAmount, { sourceTokenAddress: reserveToken2.address })
                    ).to.be.revertedWithError('InvalidToken');
                    await expect(
                        tradeInputByTargetAmount(testAmount, { sourceTokenAddress: reserveToken2.address })
                    ).to.be.revertedWithError('InvalidToken');

                    // unknown target token
                    await expect(
                        tradeOutputBySourceAmount(testAmount, { targetTokenAddress: reserveToken2.address })
                    ).to.be.revertedWithError('InvalidToken');
                    await expect(
                        tradeInputByTargetAmount(testAmount, { targetTokenAddress: reserveToken2.address })
                    ).to.be.revertedWithError('InvalidToken');
                });

                it('should revert when attempting to query using same source and target tokens', async () => {
                    await expect(
                        tradeOutputBySourceAmount(testAmount, { targetTokenAddress: sourceToken.address })
                    ).to.be.revertedWithError('InvalidToken');
                    await expect(
                        tradeInputByTargetAmount(testAmount, { targetTokenAddress: sourceToken.address })
                    ).to.be.revertedWithError('InvalidToken');
                });

                it('should return correct amounts', async () => {
                    const isSourceBNT = sourceToken.address === bnt.address;
                    const isTargetBNT = targetToken.address === bnt.address;

                    let targetAmount: BigNumber;
                    let sourceAmount: BigNumber;

                    if (isSourceBNT || isTargetBNT) {
                        ({ amount: targetAmount } = await poolCollection.tradeOutputAndFeeBySourceAmount(
                            sourceToken.address,
                            targetToken.address,
                            testAmount
                        ));

                        ({ amount: sourceAmount } = await poolCollection.tradeInputAndFeeByTargetAmount(
                            sourceToken.address,
                            targetToken.address,
                            testAmount
                        ));
                    } else {
                        const targetTradeOutput = await poolCollection.tradeOutputAndFeeBySourceAmount(
                            sourceToken.address,
                            bnt.address,
                            testAmount
                        );

                        ({ amount: targetAmount } = await poolCollection.tradeOutputAndFeeBySourceAmount(
                            bnt.address,
                            targetToken.address,
                            targetTradeOutput.amount
                        ));

                        const sourceTradeAmounts = await poolCollection.tradeInputAndFeeByTargetAmount(
                            bnt.address,
                            targetToken.address,
                            testAmount
                        );

                        ({ amount: sourceAmount } = await poolCollection.tradeInputAndFeeByTargetAmount(
                            sourceToken.address,
                            bnt.address,
                            sourceTradeAmounts.amount
                        ));
                    }

                    expect(
                        await networkInfo.tradeOutputBySourceAmount(
                            sourceToken.address,
                            targetToken.address,
                            testAmount
                        )
                    ).to.equal(targetAmount);

                    expect(
                        await networkInfo.tradeInputByTargetAmount(sourceToken.address, targetToken.address, testAmount)
                    ).to.equal(sourceAmount);
                });
            });
        };

        for (const [sourceSymbol, targetSymbol] of [
            [TokenSymbol.TKN, TokenSymbol.BNT],
            [TokenSymbol.TKN, TokenSymbol.ETH],
            [TokenSymbol.TKN1, TokenSymbol.TKN2],
            [TokenSymbol.BNT, TokenSymbol.ETH],
            [TokenSymbol.BNT, TokenSymbol.TKN],
            [TokenSymbol.ETH, TokenSymbol.BNT],
            [TokenSymbol.ETH, TokenSymbol.TKN]
        ]) {
            // perform a basic/sanity suite over a fixed input
            testTradesOutputs(
                {
                    tokenData: new TokenData(sourceSymbol),
                    balance: toWei(1_000_000),
                    requestedFunding: toWei(1_000_000).mul(1000),
                    bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                    baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
                },
                {
                    tokenData: new TokenData(targetSymbol),
                    balance: toWei(5_000_000),
                    requestedFunding: toWei(5_000_000).mul(1000),
                    bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                    baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
                }
            );
        }
    });

    describe('pending withdrawals', () => {
        let network: TestBancorNetwork;
        let networkInfo: BancorNetworkInfo;
        let networkSettings: NetworkSettings;
        let bnt: IERC20;
        let poolToken: PoolToken;
        let token: TokenWithAddress;
        let bntPoolToken: PoolToken;
        let pendingWithdrawals: TestPendingWithdrawals;
        let poolCollection: TestPoolCollection;

        let provider: SignerWithAddress;
        let poolTokenAmount: BigNumber;
        let bntPoolTokenAmount: BigNumber;

        const BALANCE = toWei(1_000_000);

        before(async () => {
            [, provider] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ network, networkInfo, networkSettings, bnt, bntPoolToken, poolCollection, pendingWithdrawals } =
                await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            await pendingWithdrawals.setTime(await latest());

            ({ poolToken, token } = await setupFundedPool(
                {
                    tokenData: new TokenData(TokenSymbol.TKN),
                    balance: BALANCE,
                    requestedFunding: BALANCE.mul(1000),
                    bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                    baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
                },
                provider,
                network,
                networkInfo,
                networkSettings,
                poolCollection
            ));

            poolTokenAmount = await poolToken.balanceOf(provider.address);

            await depositToPool(provider, bnt, toWei(1234), network);

            bntPoolTokenAmount = await bntPoolToken.balanceOf(provider.address);
        });

        it('should return withdrawal status', async () => {
            const { id, creationTime } = await initWithdraw(
                provider,
                network,
                pendingWithdrawals,
                poolToken,
                poolTokenAmount
            );

            expect(await networkInfo.isReadyForWithdrawal(id)).to.be.false;

            await pendingWithdrawals.setTime(creationTime + (await pendingWithdrawals.lockDuration()) + 1);

            expect(await networkInfo.isReadyForWithdrawal(id)).to.be.true;
        });

        it('should not return withdrawal amounts when the pool token is invalid', async () => {
            await expect(networkInfo.withdrawalAmounts(ZERO_ADDRESS, poolTokenAmount)).to.be.revertedWithError(
                'InvalidAddress'
            );
        });

        it('should not return withdrawal amounts when the pool token amount is zero', async () => {
            await expect(networkInfo.withdrawalAmounts(token.address, 0)).to.be.revertedWithError('ZeroValue');
        });

        it('should return withdrawal amounts', async () => {
            let { totalAmount, baseTokenAmount, bntAmount } = await networkInfo.withdrawalAmounts(
                token.address,
                poolTokenAmount
            );
            expect(totalAmount).to.equal(poolTokenAmount);
            expect(baseTokenAmount).to.equal(poolTokenAmount);
            expect(bntAmount).to.equal(0);

            ({ totalAmount, baseTokenAmount, bntAmount } = await networkInfo.withdrawalAmounts(
                bnt.address,
                bntPoolTokenAmount
            ));
            expect(totalAmount).to.equal(bntPoolTokenAmount);
            expect(baseTokenAmount).to.equal(0);
            expect(bntAmount).to.equal(bntPoolTokenAmount);
        });
    });

    describe('pool info', () => {
        const testPoolInfo = (tokenData: TokenData) => {
            let networkSettings: NetworkSettings;
            let network: TestBancorNetwork;

            let bnt: IERC20;
            let networkInfo: BancorNetworkInfo;
            let poolCollection: TestPoolCollection;
            let bntPool: BNTPool;
            let pool: string;
            let reserveToken: TokenWithAddress;

            const TRADING_FEE_PPM = toPPM(2);
            const BASE_TOKEN_LIQUIDITY = toWei(1_000_000_000);

            beforeEach(async () => {
                ({ networkSettings, network, bnt, networkInfo, bntPool, poolCollection } = await createSystem());

                await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

                // create a funded and enabled TKN pool
                ({ token: reserveToken } = await setupFundedPool(
                    {
                        tokenData: tokenData.isBNT() ? new TokenData(TokenSymbol.TKN) : tokenData,
                        balance: BASE_TOKEN_LIQUIDITY,
                        bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                        baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE,
                        tradingFeePPM: TRADING_FEE_PPM
                    },
                    deployer,
                    network,
                    networkInfo,
                    networkSettings,
                    poolCollection
                ));

                pool = tokenData.isBNT() ? bnt.address : reserveToken.address;
            });

            it('should return the pool token', async () => {
                if (tokenData.isBNT()) {
                    expect(await networkInfo.poolToken(pool)).to.equal(await bntPool.poolToken());
                } else {
                    expect(await networkInfo.poolToken(pool)).to.equal(await poolCollection.poolToken(pool));
                }
            });

            it('should return the staked balance', async () => {
                if (tokenData.isBNT()) {
                    expect(await networkInfo.stakedBalance(pool)).to.equal(await bntPool.stakedBalance());
                } else {
                    const { stakedBalance } = await poolCollection.poolLiquidity(pool);
                    expect(await networkInfo.stakedBalance(pool)).to.equal(stakedBalance);
                }
            });

            it('should return the trading liquidities', async () => {
                if (tokenData.isBNT()) {
                    await expect(networkInfo.tradingLiquidity(pool)).to.be.revertedWithError('InvalidParam');
                } else {
                    const liquidity = await poolCollection.poolLiquidity(pool);
                    const tradingLiquidity = await networkInfo.tradingLiquidity(pool);
                    expect(tradingLiquidity.bntTradingLiquidity).to.equal(liquidity.bntTradingLiquidity);
                    expect(tradingLiquidity.baseTokenTradingLiquidity).to.equal(liquidity.baseTokenTradingLiquidity);
                }
            });

            it('should return the trading fee', async () => {
                if (tokenData.isBNT()) {
                    await expect(networkInfo.tradingFeePPM(pool)).to.be.revertedWithError('InvalidParam');
                } else {
                    expect(await networkInfo.tradingFeePPM(pool)).to.equal(TRADING_FEE_PPM);

                    const newTradingFee = toPPM(50);
                    await poolCollection.setTradingFeePPM(pool, newTradingFee);

                    expect(await networkInfo.tradingFeePPM(pool)).to.equal(newTradingFee);
                }
            });

            it('should return whether trading is enabled', async () => {
                if (tokenData.isBNT()) {
                    expect(await networkInfo.tradingEnabled(pool)).to.be.true;
                } else {
                    expect(await networkInfo.tradingEnabled(pool)).to.be.true;

                    await poolCollection.disableTrading(pool);

                    expect(await networkInfo.tradingEnabled(pool)).to.be.false;
                }
            });

            it('should return whether depositing is enabled', async () => {
                if (tokenData.isBNT()) {
                    expect(await networkInfo.depositingEnabled(pool)).to.be.true;
                } else {
                    expect(await networkInfo.depositingEnabled(pool)).to.be.true;

                    await poolCollection.enableDepositing(pool, false);

                    expect(await networkInfo.depositingEnabled(pool)).to.be.false;
                }
            });

            it('should return whether the pool is stable', async () => {
                if (tokenData.isBNT()) {
                    expect(await networkInfo.isPoolStable(pool)).to.be.true;
                } else {
                    expect(await networkInfo.isPoolStable(pool)).to.be.true;

                    const liquidity = await poolCollection.poolLiquidity(pool);

                    await poolCollection.setAverageRatesT(pool, {
                        blockNumber: await poolCollection.currentBlockNumber(),
                        rate: {
                            n: liquidity.bntTradingLiquidity.mul(PPM_RESOLUTION),
                            d: liquidity.baseTokenTradingLiquidity.mul(
                                PPM_RESOLUTION + RATE_MAX_DEVIATION_PPM + toPPM(0.5)
                            )
                        },
                        invRate: {
                            n: liquidity.baseTokenTradingLiquidity,
                            d: liquidity.bntTradingLiquidity
                        }
                    });

                    expect(await networkInfo.isPoolStable(pool)).to.be.false;

                    await poolCollection.setAverageRatesT(pool, {
                        blockNumber: await poolCollection.currentBlockNumber(),
                        rate: {
                            n: liquidity.bntTradingLiquidity,
                            d: liquidity.baseTokenTradingLiquidity
                        },
                        invRate: {
                            n: liquidity.baseTokenTradingLiquidity.mul(
                                PPM_RESOLUTION + RATE_MAX_DEVIATION_PPM + toPPM(0.5)
                            ),
                            d: liquidity.bntTradingLiquidity.mul(PPM_RESOLUTION)
                        }
                    });

                    expect(await networkInfo.isPoolStable(pool)).to.be.false;
                }
            });

            for (const tokenAmount of [0, 1000, toWei(10_000), toWei(1_000_000)]) {
                context(`underlying amount of ${tokenAmount.toString()}`, () => {
                    beforeEach(async () => {
                        await poolCollection.requestFundingT(
                            formatBytes32String(''),
                            reserveToken.address,
                            BASE_TOKEN_LIQUIDITY.mul(1000)
                        );
                    });

                    it('should properly convert between underlying amount and pool token amount', async () => {
                        const poolTokenAmount = await networkInfo.underlyingToPoolToken(pool, tokenAmount);

                        expect(poolTokenAmount).to.equal(
                            tokenData.isBNT()
                                ? await bntPool.underlyingToPoolToken(tokenAmount)
                                : await poolCollection.underlyingToPoolToken(pool, tokenAmount)
                        );

                        const underlyingAmount = await networkInfo.poolTokenToUnderlying(pool, poolTokenAmount);

                        expect(underlyingAmount).to.be.equal(
                            tokenData.isBNT()
                                ? await bntPool.poolTokenToUnderlying(poolTokenAmount)
                                : await poolCollection.poolTokenToUnderlying(pool, poolTokenAmount)
                        );
                    });
                });
            }
        };

        for (const symbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
            context(symbol, () => {
                testPoolInfo(new TokenData(symbol));
            });
        }
    });
});
