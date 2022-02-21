import Contracts, {
    BancorNetworkInfo,
    MasterVault,
    ExternalProtectionVault,
    ExternalRewardsVault,
    IERC20,
    IPoolToken,
    NetworkSettings,
    PoolToken,
    TestBancorNetwork,
    TestMasterPool,
    TestPendingWithdrawals,
    TestPoolCollection,
    TestPoolCollectionUpgrader,
    MasterPool
} from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import { ZERO_ADDRESS, MAX_UINT256 } from '../../utils/Constants';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { toWei } from '../../utils/Types';
import { expectRole, Roles } from '../helpers/AccessControl';
import {
    createSystem,
    createTestToken,
    createPool,
    createToken,
    depositToPool,
    setupFundedPool,
    PoolSpec,
    initWithdraw,
    TokenWithAddress
} from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { latest } from '../helpers/Time';
import { createWallet } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Wallet, utils } from 'ethers';
import { ethers } from 'hardhat';

const { formatBytes32String } = utils;

describe('BancorNetworkInfo', () => {
    let deployer: SignerWithAddress;

    const BNT_FUNDING_RATE = 1;
    const BASE_TOKEN_FUNDING_RATE = 2;
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
        let masterPool: TestMasterPool;
        let masterPoolToken: IPoolToken;
        let poolCollectionUpgrader: TestPoolCollectionUpgrader;
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
                masterPool,
                masterPoolToken,
                poolCollectionUpgrader,
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
                    masterPool.address,
                    pendingWithdrawals.address,
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
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
                    masterPool.address,
                    pendingWithdrawals.address,
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid VBNT governance contract', async () => {
            await expect(
                Contracts.BancorNetworkInfo.deploy(
                    network.address,
                    bntGovernance.address,
                    ZERO_ADDRESS,
                    networkSettings.address,
                    masterVault.address,
                    externalProtectionVault.address,
                    externalRewardsVault.address,
                    masterPool.address,
                    pendingWithdrawals.address,
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
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
                    masterPool.address,
                    pendingWithdrawals.address,
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
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
                    masterPool.address,
                    pendingWithdrawals.address,
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
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
                    masterPool.address,
                    pendingWithdrawals.address,
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
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
                    masterPool.address,
                    pendingWithdrawals.address,
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid master pool contract', async () => {
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
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
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
                    masterPool.address,
                    ZERO_ADDRESS,
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid pool collection upgrader contract', async () => {
            await expect(
                Contracts.BancorNetworkInfo.deploy(
                    network.address,
                    bntGovernance.address,
                    vbntGovernance.address,
                    networkSettings.address,
                    masterVault.address,
                    externalProtectionVault.address,
                    externalRewardsVault.address,
                    masterPool.address,
                    pendingWithdrawals.address,
                    ZERO_ADDRESS
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(networkInfo.initialize()).to.be.revertedWith('Initializable: contract is already initialized');
        });

        it('should be properly initialized', async () => {
            expect(await networkInfo.version()).to.equal(1);

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
            expect(await networkInfo.masterPool()).to.equal(masterPool.address);
            expect(await networkInfo.masterPoolToken()).to.equal(masterPoolToken.address);
            expect(await networkInfo.pendingWithdrawals()).to.equal(pendingWithdrawals.address);
            expect(await networkInfo.poolCollectionUpgrader()).to.equal(poolCollectionUpgrader.address);
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

        let trader: Wallet;

        beforeEach(async () => {
            ({ network, bnt, networkInfo, networkSettings, poolCollection } = await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
        });

        const setupPools = async (source: PoolSpec, target: PoolSpec) => {
            trader = await createWallet();

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

            // increase the BNT liquidity by the growth factor a few times
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

                it('should revert when attempting to query using an invalid source pool', async () => {
                    await expect(
                        tradeOutputBySourceAmount(testAmount, { sourceTokenAddress: ZERO_ADDRESS })
                    ).to.be.revertedWith('InvalidAddress');
                    await expect(
                        tradeInputByTargetAmount(testAmount, { sourceTokenAddress: ZERO_ADDRESS })
                    ).to.be.revertedWith('InvalidAddress');
                });

                it('should revert when attempting to query using an invalid target pool', async () => {
                    await expect(
                        tradeOutputBySourceAmount(testAmount, { targetTokenAddress: ZERO_ADDRESS })
                    ).to.be.revertedWith('InvalidAddress');
                    await expect(
                        tradeInputByTargetAmount(testAmount, { targetTokenAddress: ZERO_ADDRESS })
                    ).to.be.revertedWith('InvalidAddress');
                });

                it('should revert when attempting to  query using an invalid amount', async () => {
                    const amount = 0;

                    await expect(tradeOutputBySourceAmount(amount)).to.be.revertedWith('ZeroValue');
                    await expect(tradeInputByTargetAmount(amount)).to.be.revertedWith('ZeroValue');
                });

                it('should revert when attempting to query using unsupported tokens', async () => {
                    const reserveToken2 = await createTestToken();

                    await reserveToken2.transfer(await trader.getAddress(), testAmount);
                    await reserveToken2.connect(trader).approve(network.address, testAmount);

                    // unknown source token
                    await expect(
                        tradeOutputBySourceAmount(testAmount, { sourceTokenAddress: reserveToken2.address })
                    ).to.be.revertedWith('InvalidToken');
                    await expect(
                        tradeInputByTargetAmount(testAmount, { sourceTokenAddress: reserveToken2.address })
                    ).to.be.revertedWith('InvalidToken');

                    // unknown target token
                    await expect(
                        tradeOutputBySourceAmount(testAmount, { targetTokenAddress: reserveToken2.address })
                    ).to.be.revertedWith('InvalidToken');
                    await expect(
                        tradeInputByTargetAmount(testAmount, { targetTokenAddress: reserveToken2.address })
                    ).to.be.revertedWith('InvalidToken');
                });

                it('should revert when attempting to query using same source and target tokens', async () => {
                    await expect(
                        tradeOutputBySourceAmount(testAmount, { targetTokenAddress: sourceToken.address })
                    ).to.be.revertedWith('InvalidTokens');
                    await expect(
                        tradeInputByTargetAmount(testAmount, { targetTokenAddress: sourceToken.address })
                    ).to.be.revertedWith('InvalidTokens');
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
                    requestedLiquidity: toWei(1_000_000).mul(1000),
                    bntRate: BNT_FUNDING_RATE,
                    baseTokenRate: BASE_TOKEN_FUNDING_RATE
                },
                {
                    tokenData: new TokenData(targetSymbol),
                    balance: toWei(5_000_000),
                    requestedLiquidity: toWei(5_000_000).mul(1000),
                    bntRate: BNT_FUNDING_RATE,
                    baseTokenRate: BASE_TOKEN_FUNDING_RATE
                }
            );
        }
    });

    describe('pending withdrawals', () => {
        let poolToken: PoolToken;
        let networkInfo: BancorNetworkInfo;
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let pendingWithdrawals: TestPendingWithdrawals;
        let poolCollection: TestPoolCollection;

        let provider: SignerWithAddress;
        let poolTokenAmount: BigNumber;

        const BALANCE = toWei(1_000_000);

        before(async () => {
            [, provider] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ network, networkInfo, networkSettings, poolCollection, pendingWithdrawals } = await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            await pendingWithdrawals.setTime(await latest());

            ({ poolToken } = await setupFundedPool(
                {
                    tokenData: new TokenData(TokenSymbol.TKN),
                    balance: BALANCE,
                    requestedLiquidity: BALANCE.mul(1000),
                    bntRate: BNT_FUNDING_RATE,
                    baseTokenRate: BASE_TOKEN_FUNDING_RATE
                },
                provider,
                network,
                networkInfo,
                networkSettings,
                poolCollection
            ));

            poolTokenAmount = await poolToken.balanceOf(provider.address);
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
    });

    describe('pool token calculations', () => {
        const testPoolTokenCalculations = async (tokenData: TokenData) => {
            let networkSettings: NetworkSettings;
            let network: TestBancorNetwork;
            let bnt: IERC20;
            let networkInfo: BancorNetworkInfo;
            let poolCollection: TestPoolCollection;
            let masterPool: MasterPool;
            let pool: TokenWithAddress;
            let reserveToken: TokenWithAddress;
            let fundingManager: SignerWithAddress;

            const CONTEXT_ID = formatBytes32String('CTX');
            const BASE_TOKEN_LIQUIDITY = toWei(1_000_000_000);
            const BNT_LIQUIDITY = toWei(1_000_000_000);

            before(async () => {
                [, fundingManager] = await ethers.getSigners();
            });

            beforeEach(async () => {
                ({ networkSettings, network, bnt, networkInfo, masterPool, poolCollection } = await createSystem());

                if (tokenData.isBNT()) {
                    pool = bnt;
                    reserveToken = await createTestToken();

                    await createPool(reserveToken, network, networkSettings, poolCollection);

                    await networkSettings.setFundingLimit(reserveToken.address, MAX_UINT256);

                    await masterPool.grantRole(Roles.MasterPool.ROLE_FUNDING_MANAGER, fundingManager.address);
                    await masterPool
                        .connect(fundingManager)
                        .requestFunding(CONTEXT_ID, reserveToken.address, BNT_LIQUIDITY);
                } else {
                    reserveToken = await createToken(tokenData);
                    pool = reserveToken;

                    await createPool(reserveToken, network, networkSettings, poolCollection);

                    await poolCollection.setDepositLimit(reserveToken.address, MAX_UINT256);

                    await network.depositToPoolCollectionForT(
                        poolCollection.address,
                        CONTEXT_ID,
                        deployer.address,
                        reserveToken.address,
                        BASE_TOKEN_LIQUIDITY
                    );
                }

                await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
            });

            for (const tokenAmount of [0, 1000, toWei(10_000), toWei(1_000_000)]) {
                context(`underlying amount of ${tokenAmount.toString()}`, () => {
                    it('should properly convert between underlying amount and pool token amount', async () => {
                        const poolTokenAmount = await networkInfo.underlyingToPoolToken(pool.address, tokenAmount);

                        expect(poolTokenAmount).to.equal(
                            tokenData.isBNT()
                                ? await masterPool.underlyingToPoolToken(tokenAmount)
                                : await poolCollection.underlyingToPoolToken(pool.address, tokenAmount)
                        );

                        const underlyingAmount = await networkInfo.poolTokenToUnderlying(pool.address, poolTokenAmount);

                        expect(underlyingAmount).to.be.equal(
                            tokenData.isBNT()
                                ? await masterPool.poolTokenToUnderlying(poolTokenAmount)
                                : await poolCollection.poolTokenToUnderlying(pool.address, poolTokenAmount)
                        );
                    });
                });
            }
        };

        for (const symbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
            context(symbol, () => {
                testPoolTokenCalculations(new TokenData(symbol));
            });
        }
    });
});
