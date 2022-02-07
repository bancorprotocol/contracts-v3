import Contracts, {
    BancorNetworkInfo,
    ExternalRewardsVault,
    IERC20,
    IVault,
    MasterVault,
    NetworkSettings,
    PoolToken,
    TestAutoCompoundingStakingRewards,
    TestBancorNetwork,
    TestERC20Token,
    TestFlashLoanRecipient,
    TestMasterPool,
    TestPendingWithdrawals,
    TestPoolCollection
} from '../../components/Contracts';
import {
    DSToken,
    LiquidityProtectionSettings,
    LiquidityProtectionStore,
    TestCheckpointStore,
    TestLiquidityProtection,
    TestStandardPoolConverter,
    TokenGovernance
} from '../../components/LegacyContracts';
import { Profiler } from '../../components/Profiler';
import { TradeAmountsStructOutput } from '../../typechain-types/TestPoolCollection';
import {
    MAX_UINT256,
    PPM_RESOLUTION,
    ZERO_ADDRESS,
    StakingRewardsDistributionType,
    ExponentialDecay
} from '../../utils/Constants';
import { permitContractSignature } from '../../utils/Permit';
import { TokenData, TokenSymbol, NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { toWei, toPPM } from '../../utils/Types';
import { Roles } from '../helpers/AccessControl';
import {
    createPool,
    createStakingRewards,
    createSystem,
    createToken,
    createTestToken,
    depositToPool,
    initWithdraw,
    setupFundedPool,
    PoolSpec,
    specToString,
    TokenWithAddress
} from '../helpers/Factory';
import { createLegacySystem } from '../helpers/LegacyFactory';
import { latest, duration } from '../helpers/Time';
import { max, createWallet, transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, BigNumberish, ContractTransaction, utils, Wallet } from 'ethers';
import { ethers } from 'hardhat';
import humanizeDuration from 'humanize-duration';
import { camelCase } from 'lodash';

const { formatBytes32String } = utils;

describe('Profile @profile', () => {
    const profiler = new Profiler();

    let deployer: SignerWithAddress;
    let stakingRewardsProvider: SignerWithAddress;

    const FUNDING_RATE = { n: 1, d: 2 };
    const FUNDING_LIMIT = toWei(10_000_000);
    const DEPOSIT_LIMIT = toWei(1_000_000_000);
    const WITHDRAWAL_FEE = toPPM(5);
    const MIN_LIQUIDITY_FOR_TRADING = toWei(1000);
    const CONTEXT_ID = formatBytes32String('CTX');
    const MIN_RETURN_AMOUNT = BigNumber.from(1);
    const MAX_SOURCE_AMOUNT = MAX_UINT256;

    before(async () => {
        [deployer, stakingRewardsProvider] = await ethers.getSigners();
    });

    after(async () => {
        profiler.printSummary();
    });

    describe('deposit', () => {
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let networkToken: IERC20;
        let poolCollection: TestPoolCollection;
        let pendingWithdrawals: TestPendingWithdrawals;

        beforeEach(async () => {
            ({ network, networkSettings, networkToken, poolCollection, pendingWithdrawals } = await createSystem());

            await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);
            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
        });

        const testDeposits = (tokenData: TokenData) => {
            let token: TokenWithAddress;

            const INITIAL_LIQUIDITY = MIN_LIQUIDITY_FOR_TRADING.mul(FUNDING_RATE.d).div(FUNDING_RATE.n).mul(2);

            beforeEach(async () => {
                if (tokenData.isNetworkToken()) {
                    token = networkToken;
                } else {
                    token = await createToken(tokenData);

                    await createPool(token, network, networkSettings, poolCollection);

                    await networkSettings.setFundingLimit(token.address, MAX_UINT256);
                    await poolCollection.setDepositLimit(token.address, MAX_UINT256);

                    // ensure that the trading is enabled with sufficient funding
                    if (tokenData.isNative()) {
                        await network.deposit(token.address, INITIAL_LIQUIDITY, { value: INITIAL_LIQUIDITY });
                    } else {
                        const reserveToken = await Contracts.TestERC20Token.attach(token.address);
                        await reserveToken.approve(network.address, INITIAL_LIQUIDITY);

                        await network.deposit(token.address, INITIAL_LIQUIDITY);
                    }

                    await poolCollection.enableTrading(token.address, FUNDING_RATE);
                }

                await setTime(await latest());
            });

            const setTime = async (time: number) => {
                await network.setTime(time);
                await pendingWithdrawals.setTime(time);
            };

            const testDeposit = () => {
                context('regular deposit', () => {
                    enum Method {
                        Deposit,
                        DepositFor
                    }

                    let provider: SignerWithAddress;

                    before(async () => {
                        [, provider] = await ethers.getSigners();
                    });

                    for (const method of [Method.Deposit, Method.DepositFor]) {
                        context(`using ${camelCase(Method[method])} method`, () => {
                            let sender: SignerWithAddress;

                            before(async () => {
                                switch (method) {
                                    case Method.Deposit:
                                        sender = provider;

                                        break;

                                    case Method.DepositFor:
                                        sender = deployer;

                                        break;
                                }
                            });

                            interface Overrides {
                                value?: BigNumber;
                                poolAddress?: string;
                            }

                            const deposit = async (amount: BigNumber, overrides: Overrides = {}) => {
                                let { value, poolAddress = token.address } = overrides;

                                value ||= tokenData.isNative() ? amount : BigNumber.from(0);

                                switch (method) {
                                    case Method.Deposit:
                                        return network.connect(sender).deposit(poolAddress, amount, { value });

                                    case Method.DepositFor:
                                        return network
                                            .connect(sender)
                                            .depositFor(provider.address, poolAddress, amount, { value });
                                }
                            };

                            const testDepositAmount = async (amount: BigNumber) => {
                                const COUNT = 3;

                                const testMultipleDeposits = async () => {
                                    for (let i = 0; i < COUNT; i++) {
                                        await test(amount);
                                    }
                                };

                                const test = async (amount: BigNumber) =>
                                    await profiler.profile(`deposit ${tokenData.symbol()}`, deposit(amount));

                                context(`${amount} tokens`, () => {
                                    if (!tokenData.isNative()) {
                                        beforeEach(async () => {
                                            const reserveToken = await Contracts.TestERC20Token.attach(token.address);
                                            await reserveToken.transfer(sender.address, amount.mul(COUNT));
                                        });
                                    }

                                    context('with an approval', () => {
                                        if (!tokenData.isNative()) {
                                            beforeEach(async () => {
                                                const reserveToken = await Contracts.TestERC20Token.attach(
                                                    token.address
                                                );
                                                await reserveToken
                                                    .connect(sender)
                                                    .approve(network.address, amount.mul(COUNT));
                                            });
                                        }

                                        if (tokenData.isNetworkToken()) {
                                            context('with requested funding', () => {
                                                beforeEach(async () => {
                                                    const reserveToken = await createTestToken();

                                                    await createPool(
                                                        reserveToken,
                                                        network,
                                                        networkSettings,
                                                        poolCollection
                                                    );
                                                    await networkSettings.setFundingLimit(
                                                        reserveToken.address,
                                                        FUNDING_LIMIT
                                                    );

                                                    await poolCollection.requestFundingT(
                                                        CONTEXT_ID,
                                                        reserveToken.address,
                                                        amount.mul(COUNT)
                                                    );
                                                });

                                                it('should complete multiple deposits', async () => {
                                                    await testMultipleDeposits();
                                                });
                                            });
                                        } else {
                                            it('should complete multiple deposits', async () => {
                                                await testMultipleDeposits();
                                            });
                                        }
                                    });
                                });
                            };

                            for (const amount of [10, 10_000, toWei(1_000_000)]) {
                                testDepositAmount(BigNumber.from(amount));
                            }
                        });
                    }
                });
            };

            const testDepositPermitted = () => {
                context('permitted deposit', () => {
                    enum Method {
                        DepositPermitted,
                        DepositForPermitted
                    }

                    const DEADLINE = MAX_UINT256;

                    let provider: Wallet;
                    let providerAddress: string;

                    beforeEach(async () => {
                        provider = await createWallet();
                        providerAddress = await provider.getAddress();
                    });

                    for (const method of [Method.DepositPermitted, Method.DepositForPermitted]) {
                        context(`using ${camelCase(Method[method])} method`, () => {
                            let sender: Wallet;
                            let senderAddress: string;

                            beforeEach(async () => {
                                switch (method) {
                                    case Method.DepositPermitted:
                                        sender = provider;

                                        break;

                                    case Method.DepositForPermitted:
                                        sender = await createWallet();

                                        break;
                                }

                                senderAddress = await sender.getAddress();
                            });

                            interface Overrides {
                                poolAddress?: string;
                            }

                            const deposit = async (amount: BigNumber, overrides: Overrides = {}) => {
                                const { poolAddress = token.address } = overrides;

                                const signature = await permitContractSignature(
                                    sender,
                                    poolAddress,
                                    network,
                                    networkToken,
                                    amount,
                                    DEADLINE
                                );

                                switch (method) {
                                    case Method.DepositPermitted:
                                        return network
                                            .connect(sender)
                                            .depositPermitted(
                                                poolAddress,
                                                amount,
                                                DEADLINE,
                                                signature.v,
                                                signature.r,
                                                signature.s
                                            );

                                    case Method.DepositForPermitted:
                                        return network
                                            .connect(sender)
                                            .depositForPermitted(
                                                providerAddress,
                                                poolAddress,
                                                amount,
                                                DEADLINE,
                                                signature.v,
                                                signature.r,
                                                signature.s
                                            );
                                }
                            };

                            const testDepositAmount = async (amount: BigNumber) => {
                                const test = async () =>
                                    profiler.profile(`deposit ${tokenData.symbol()}`, deposit(amount));

                                context(`${amount} tokens`, () => {
                                    if (tokenData.isNetworkToken() || tokenData.isNative()) {
                                        return;
                                    }

                                    beforeEach(async () => {
                                        const reserveToken = await Contracts.TestERC20Token.attach(token.address);
                                        await reserveToken.transfer(senderAddress, amount);
                                    });

                                    context('when there is no available network token funding', () => {
                                        beforeEach(async () => {
                                            await networkSettings.setFundingLimit(token.address, 0);
                                        });

                                        context('with a whitelisted token', async () => {
                                            it('should complete a deposit', async () => {
                                                await test();
                                            });
                                        });
                                    });

                                    context('when there is enough available network token funding', () => {
                                        beforeEach(async () => {
                                            await networkSettings.setFundingLimit(token.address, MAX_UINT256);
                                        });

                                        context('when spot rate is stable', () => {
                                            it('should complete a deposit', async () => {
                                                await test();
                                            });
                                        });
                                    });
                                });
                            };

                            for (const amount of [10, 10_000, toWei(1_000_000)]) {
                                testDepositAmount(BigNumber.from(amount));
                            }
                        });
                    }
                });
            };

            testDeposit();
            testDepositPermitted();
        };

        for (const symbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
            context(symbol, () => {
                testDeposits(new TokenData(symbol));
            });
        }
    });

    describe('withdraw', () => {
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let networkToken: IERC20;
        let govToken: IERC20;
        let masterVault: MasterVault;
        let poolCollection: TestPoolCollection;
        let pendingWithdrawals: TestPendingWithdrawals;
        let masterPoolToken: PoolToken;

        const setTime = async (time: number) => {
            await network.setTime(time);
            await pendingWithdrawals.setTime(time);
        };

        beforeEach(async () => {
            ({
                network,
                networkSettings,
                networkToken,
                govToken,
                masterVault,
                poolCollection,
                pendingWithdrawals,
                masterPoolToken
            } = await createSystem());

            await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);
            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            await setTime(await latest());
        });

        interface Request {
            id: BigNumber;
            poolTokenAmount: BigNumber;
            creationTime: number;
        }

        const testWithdraw = async (tokenData: TokenData) => {
            let provider: SignerWithAddress;
            let poolToken: PoolToken;
            let token: TokenWithAddress;
            let requests: Request[];

            const INITIAL_LIQUIDITY = toWei(222_222_222);
            const COUNT = 3;

            before(async () => {
                [, provider] = await ethers.getSigners();
            });

            beforeEach(async () => {
                if (tokenData.isNetworkToken()) {
                    token = networkToken;
                    poolToken = masterPoolToken;

                    const reserveToken = await createTestToken();
                    await createPool(reserveToken, network, networkSettings, poolCollection);
                    await networkSettings.setFundingLimit(reserveToken.address, MAX_UINT256);

                    await poolCollection.requestFundingT(CONTEXT_ID, reserveToken.address, INITIAL_LIQUIDITY);
                } else {
                    token = await createToken(tokenData);
                    poolToken = await createPool(token, network, networkSettings, poolCollection);

                    await networkSettings.setFundingLimit(token.address, MAX_UINT256);
                    await poolCollection.setDepositLimit(token.address, MAX_UINT256);
                }

                await depositToPool(provider, token, INITIAL_LIQUIDITY, network);

                const totalPoolTokenAmount = await poolToken.balanceOf(provider.address);
                const poolTokenAmount = totalPoolTokenAmount.div(COUNT);

                requests = [];

                for (let i = 0; i < COUNT; i++) {
                    const { id, creationTime } = await initWithdraw(
                        provider,
                        network,
                        pendingWithdrawals,
                        poolToken,
                        poolTokenAmount
                    );

                    requests.push({
                        id,
                        poolTokenAmount,
                        creationTime
                    });
                }

                if (!tokenData.isNetworkToken()) {
                    await poolCollection.enableTrading(token.address, FUNDING_RATE);
                }
            });

            context('after the lock duration', () => {
                const test = async (index: number) =>
                    profiler.profile(
                        `withdraw ${tokenData.symbol()}`,
                        network.connect(provider).withdraw(requests[index].id)
                    );

                const testMultipleWithdrawals = async () => {
                    for (let i = 0; i < COUNT; i++) {
                        await test(i);
                    }
                };

                beforeEach(async () => {
                    await setTime(requests[0].creationTime + (await pendingWithdrawals.lockDuration()) + 1);
                });

                context('with approvals', () => {
                    beforeEach(async () => {
                        if (tokenData.isNetworkToken()) {
                            await govToken.connect(provider).approve(
                                network.address,
                                requests.reduce((res, r) => res.add(r.poolTokenAmount), BigNumber.from(0))
                            );
                        }
                    });

                    if (tokenData.isNetworkToken()) {
                        it('should complete multiple withdrawals', async () => {
                            await testMultipleWithdrawals();
                        });
                    } else {
                        context(
                            'when the matched target network liquidity is above the minimum liquidity for trading',
                            () => {
                                beforeEach(async () => {
                                    const extraLiquidity = MIN_LIQUIDITY_FOR_TRADING.mul(FUNDING_RATE.d)
                                        .div(FUNDING_RATE.n)
                                        .mul(10_000);

                                    await transfer(deployer, token, masterVault, extraLiquidity);

                                    await network.depositToPoolCollectionForT(
                                        poolCollection.address,
                                        CONTEXT_ID,
                                        provider.address,
                                        token.address,
                                        extraLiquidity
                                    );
                                });

                                it('should complete a withdraw', async () => {
                                    await testMultipleWithdrawals();
                                });
                            }
                        );

                        context(
                            'when the matched target network liquidity is below the minimum liquidity for trading',
                            () => {
                                beforeEach(async () => {
                                    await networkSettings.setMinLiquidityForTrading(MAX_UINT256);
                                });

                                it('should complete multiple withdrawals', async () => {
                                    await testMultipleWithdrawals();
                                });
                            }
                        );
                    }
                });
            });
        };

        for (const symbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
            context(symbol, () => {
                testWithdraw(new TokenData(symbol));
            });
        }
    });

    describe('trade', () => {
        let network: TestBancorNetwork;
        let networkInfo: BancorNetworkInfo;
        let networkSettings: NetworkSettings;
        let networkToken: IERC20;
        let poolCollection: TestPoolCollection;

        let sourceToken: TokenWithAddress;
        let targetToken: TokenWithAddress;

        let trader: Wallet;

        beforeEach(async () => {
            ({ network, networkInfo, networkSettings, networkToken, poolCollection } = await createSystem());

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

            // increase the network token liquidity by the growth factor a few times
            for (let i = 0; i < 5; i++) {
                await depositToPool(deployer, sourceToken, 1, network);
            }

            await network.setTime(await latest());
        };

        interface TradeOverrides {
            value?: BigNumberish;
            limit?: BigNumberish;
            deadline?: BigNumberish;
            beneficiary?: string;
            sourceTokenAddress?: string;
            targetTokenAddress?: string;
        }

        const trade = async (amount: BigNumberish, overrides: TradeOverrides = {}) => {
            let {
                value,
                limit: minReturnAmount = MIN_RETURN_AMOUNT,
                deadline = MAX_UINT256,
                beneficiary = ZERO_ADDRESS,
                sourceTokenAddress = sourceToken.address,
                targetTokenAddress = targetToken.address
            } = overrides;

            value ||= sourceTokenAddress === NATIVE_TOKEN_ADDRESS ? amount : BigNumber.from(0);

            return network
                .connect(trader)
                .trade(sourceTokenAddress, targetTokenAddress, amount, minReturnAmount, deadline, beneficiary, {
                    value
                });
        };

        const tradeExact = async (amount: BigNumberish, overrides: TradeOverrides = {}) => {
            let {
                value,
                limit: maxSourceAmount,
                deadline = MAX_UINT256,
                beneficiary = ZERO_ADDRESS,
                sourceTokenAddress = sourceToken.address,
                targetTokenAddress = targetToken.address
            } = overrides;

            // fetch the required source amount if it wasn't provided
            maxSourceAmount ||= await networkInfo.tradeSourceAmount(sourceTokenAddress, targetTokenAddress, amount);

            // for an exact trade, the send value (i.e., the amount to trade) is represented by the maximum source
            // amount
            if (!value) {
                value = BigNumber.from(0);

                if (sourceTokenAddress === NATIVE_TOKEN_ADDRESS) {
                    value = BigNumber.from(maxSourceAmount);
                }
            }

            return network
                .connect(trader)
                .tradeExact(sourceTokenAddress, targetTokenAddress, amount, maxSourceAmount, deadline, beneficiary, {
                    value
                });
        };

        interface TradePermittedOverrides {
            limit?: BigNumberish;
            deadline?: BigNumberish;
            beneficiary?: string;
            sourceTokenAddress?: string;
            targetTokenAddress?: string;
            approvedAmount?: BigNumberish;
        }

        const tradePermitted = async (amount: BigNumberish, overrides: TradePermittedOverrides = {}) => {
            const {
                limit: minReturnAmount = MIN_RETURN_AMOUNT,
                deadline = MAX_UINT256,
                beneficiary = ZERO_ADDRESS,
                sourceTokenAddress = sourceToken.address,
                targetTokenAddress = targetToken.address,
                approvedAmount = amount
            } = overrides;

            const signature = await permitContractSignature(
                trader,
                sourceTokenAddress,
                network,
                networkToken,
                approvedAmount,
                deadline
            );

            return network
                .connect(trader)
                .tradePermitted(
                    sourceTokenAddress,
                    targetTokenAddress,
                    amount,
                    minReturnAmount,
                    deadline,
                    beneficiary,
                    signature.v,
                    signature.r,
                    signature.s
                );
        };

        const tradeExactPermitted = async (amount: BigNumberish, overrides: TradePermittedOverrides = {}) => {
            let {
                limit: maxSourceAmount,
                deadline = MAX_UINT256,
                beneficiary = ZERO_ADDRESS,
                sourceTokenAddress = sourceToken.address,
                targetTokenAddress = targetToken.address,
                approvedAmount
            } = overrides;

            // fetch the required source amount if it wasn't provided
            maxSourceAmount ||= await networkInfo.tradeSourceAmount(sourceTokenAddress, targetTokenAddress, amount);
            approvedAmount ||= maxSourceAmount;

            const signature = await permitContractSignature(
                trader,
                sourceTokenAddress,
                network,
                networkToken,
                approvedAmount,
                deadline
            );

            return network
                .connect(trader)
                .tradeExactPermitted(
                    sourceTokenAddress,
                    targetTokenAddress,
                    amount,
                    maxSourceAmount,
                    deadline,
                    beneficiary,
                    signature.v,
                    signature.r,
                    signature.s
                );
        };

        const performTrade = async (
            beneficiaryAddress: string,
            amount: BigNumber,
            tradeFunc: (
                amount: BigNumberish,
                options: TradeOverrides | TradePermittedOverrides
            ) => Promise<ContractTransaction>
        ) => {
            const isSourceNativeToken = sourceToken.address === NATIVE_TOKEN_ADDRESS;
            const isTargetNativeToken = targetToken.address === NATIVE_TOKEN_ADDRESS;
            const isSourceNetworkToken = sourceToken.address === networkToken.address;
            const isTargetNetworkToken = targetToken.address === networkToken.address;

            const regularTrade = [trade, tradePermitted].includes(tradeFunc as any);
            const permitted = [tradePermitted, tradeExactPermitted].includes(tradeFunc as any);

            const deadline = MAX_UINT256;
            let limit: BigNumber;

            if (regularTrade) {
                limit = MIN_RETURN_AMOUNT;
            } else {
                let sourceTradeAmounts: TradeAmountsStructOutput;
                if (isSourceNetworkToken || isTargetNetworkToken) {
                    sourceTradeAmounts = await network.callStatic.tradeExactPoolCollectionT(
                        poolCollection.address,
                        CONTEXT_ID,
                        sourceToken.address,
                        targetToken.address,
                        amount,
                        MAX_SOURCE_AMOUNT
                    );
                } else {
                    const targetTradeAmounts = await network.callStatic.tradeExactPoolCollectionT(
                        poolCollection.address,
                        CONTEXT_ID,
                        networkToken.address,
                        targetToken.address,
                        amount,
                        MAX_SOURCE_AMOUNT
                    );

                    sourceTradeAmounts = await network.callStatic.tradeExactPoolCollectionT(
                        poolCollection.address,
                        CONTEXT_ID,
                        sourceToken.address,
                        networkToken.address,
                        targetTradeAmounts.amount,
                        MAX_SOURCE_AMOUNT
                    );
                }

                // set the maximum source amount to twice the actually required amount in order to test that only the
                // required amount was debited
                limit = sourceTradeAmounts.amount.mul(2);
            }

            const sourceSymbol = isSourceNativeToken ? TokenSymbol.ETH : await (sourceToken as TestERC20Token).symbol();
            const targetSymbol = isTargetNativeToken ? TokenSymbol.ETH : await (targetToken as TestERC20Token).symbol();

            await profiler.profile(
                `${permitted ? 'permitted ' : ''}${
                    regularTrade ? 'regular' : 'exact'
                } trade ${sourceSymbol} -> ${targetSymbol}`,
                tradeFunc(amount, { limit, beneficiary: beneficiaryAddress, deadline })
            );
        };

        const approve = async (amount: BigNumberish, regularTrade: boolean) => {
            const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);

            let sourceAmount;
            if (regularTrade) {
                sourceAmount = amount;
            } else {
                sourceAmount = await networkInfo.tradeSourceAmount(sourceToken.address, targetToken.address, amount);
            }

            await reserveToken.transfer(await trader.getAddress(), sourceAmount);
            await reserveToken.connect(trader).approve(network.address, sourceAmount);
        };

        const testTrades = (source: PoolSpec, target: PoolSpec, amount: BigNumber) => {
            const isSourceNativeToken = source.tokenData.isNative();

            context(`trade ${amount} tokens from ${specToString(source)} to ${specToString(target)}`, () => {
                beforeEach(async () => {
                    await setupPools(source, target);
                });

                for (const regularTrade of [true, false]) {
                    context(`${regularTrade ? 'regular' : 'exact'} trade`, () => {
                        const tradeFunc = regularTrade ? trade : tradeExact;

                        const TRADES_COUNT = 2;

                        it('should complete multiple trades', async () => {
                            const currentBlockNumber = await poolCollection.currentBlockNumber();

                            for (let i = 0; i < TRADES_COUNT; i++) {
                                if (!isSourceNativeToken) {
                                    await approve(amount, regularTrade);
                                }

                                await performTrade(ZERO_ADDRESS, amount, tradeFunc);

                                await poolCollection.setBlockNumber(currentBlockNumber + i + 1);
                            }
                        });
                    });
                }
            });
        };

        const testPermittedTrades = (source: PoolSpec, target: PoolSpec, amount: BigNumber) => {
            const isSourceNativeToken = source.tokenData.isNative();
            const isSourceNetworkToken = source.tokenData.isNetworkToken();

            if (isSourceNativeToken || isSourceNetworkToken) {
                return;
            }

            context(`trade permitted ${amount} tokens from ${specToString(source)} to ${specToString(target)}`, () => {
                beforeEach(async () => {
                    await setupPools(source, target);
                });

                for (const regularTrade of [true, false]) {
                    context(`permitted ${regularTrade ? 'regular' : 'exact'} trade`, () => {
                        const tradeFunc = regularTrade ? tradePermitted : tradeExactPermitted;

                        beforeEach(async () => {
                            await approve(amount, regularTrade);
                        });

                        it('should complete a permitted trade', async () => {
                            await performTrade(ZERO_ADDRESS, amount, tradeFunc);
                        });
                    });
                }
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
            const sourceTokenData = new TokenData(sourceSymbol);
            const targetTokenData = new TokenData(targetSymbol);

            testPermittedTrades(
                {
                    tokenData: sourceTokenData,
                    balance: toWei(1_000_000),
                    requestedLiquidity: toWei(1_000_000).mul(1000),
                    fundingRate: FUNDING_RATE
                },
                {
                    tokenData: targetTokenData,
                    balance: toWei(5_000_000),
                    requestedLiquidity: toWei(5_000_000).mul(1000),
                    fundingRate: FUNDING_RATE
                },
                toWei(1000)
            );

            for (const sourceBalance of [toWei(1_000_000), toWei(50_000_000)]) {
                for (const targetBalance of [toWei(1_000_000), toWei(50_000_000)]) {
                    for (const amount of [toWei(100)]) {
                        const TRADING_FEES = [0, 5];
                        for (const tradingFeePercent of TRADING_FEES) {
                            // if either the source or the target token is the network token - only test fee in one of
                            // the directions
                            if (sourceTokenData.isNetworkToken() || targetTokenData.isNetworkToken()) {
                                testTrades(
                                    {
                                        tokenData: new TokenData(sourceSymbol),
                                        balance: sourceBalance,
                                        requestedLiquidity: sourceBalance.mul(1000),
                                        tradingFeePPM: sourceTokenData.isNetworkToken()
                                            ? undefined
                                            : toPPM(tradingFeePercent),
                                        fundingRate: FUNDING_RATE
                                    },
                                    {
                                        tokenData: new TokenData(targetSymbol),
                                        balance: targetBalance,
                                        requestedLiquidity: targetBalance.mul(1000),
                                        tradingFeePPM: targetTokenData.isNetworkToken()
                                            ? undefined
                                            : toPPM(tradingFeePercent),
                                        fundingRate: FUNDING_RATE
                                    },
                                    BigNumber.from(amount)
                                );
                            } else {
                                for (const tradingFeePercent2 of TRADING_FEES) {
                                    testTrades(
                                        {
                                            tokenData: new TokenData(sourceSymbol),
                                            balance: sourceBalance,
                                            requestedLiquidity: sourceBalance.mul(1000),
                                            tradingFeePPM: toPPM(tradingFeePercent),
                                            fundingRate: FUNDING_RATE
                                        },
                                        {
                                            tokenData: new TokenData(targetSymbol),
                                            balance: targetBalance,
                                            requestedLiquidity: targetBalance.mul(1000),
                                            tradingFeePPM: toPPM(tradingFeePercent2),
                                            fundingRate: FUNDING_RATE
                                        },
                                        BigNumber.from(amount)
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    describe('flash-loans', () => {
        let network: TestBancorNetwork;
        let networkInfo: BancorNetworkInfo;
        let networkSettings: NetworkSettings;
        let poolCollection: TestPoolCollection;
        let recipient: TestFlashLoanRecipient;
        let token: TokenWithAddress;

        const BALANCE = toWei(100_000_000);
        const LOAN_AMOUNT = toWei(123_456);

        beforeEach(async () => {
            ({ network, networkInfo, networkSettings, poolCollection } = await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            recipient = await Contracts.TestFlashLoanRecipient.deploy(network.address);
        });

        const testFlashLoan = async (tokenData: TokenData, flashLoanFeePPM: number) => {
            const FEE_AMOUNT = LOAN_AMOUNT.mul(flashLoanFeePPM).div(PPM_RESOLUTION);

            beforeEach(async () => {
                ({ token } = await setupFundedPool(
                    {
                        tokenData,
                        balance: BALANCE,
                        requestedLiquidity: BALANCE.mul(1000),
                        fundingRate: FUNDING_RATE
                    },
                    deployer,
                    network,
                    networkInfo,
                    networkSettings,
                    poolCollection
                ));

                await networkSettings.setFlashLoanFeePPM(flashLoanFeePPM);

                await transfer(deployer, token, recipient.address, FEE_AMOUNT);
                await recipient.snapshot(token.address);
            });

            const test = async () => {
                const data = '0x1234';
                await profiler.profile(
                    `flash-loan ${tokenData.symbol()}`,
                    network.flashLoan(token.address, LOAN_AMOUNT, recipient.address, data)
                );
            };

            context('returning just about right', () => {
                beforeEach(async () => {
                    await recipient.setAmountToReturn(LOAN_AMOUNT.add(FEE_AMOUNT));
                });

                it('should succeed requesting a flash-loan', async () => {
                    await test();
                });
            });
        };

        for (const symbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
            for (const flashLoanFee of [0, 1, 10]) {
                context(`${symbol} with fee=${flashLoanFee}%`, () => {
                    testFlashLoan(new TokenData(symbol), toPPM(flashLoanFee));
                });
            }
        }
    });

    describe('pending withdrawals', () => {
        let poolToken: PoolToken;
        let networkInfo: BancorNetworkInfo;
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkToken: IERC20;
        let pendingWithdrawals: TestPendingWithdrawals;
        let poolCollection: TestPoolCollection;

        let provider: Wallet;
        let poolTokenAmount: BigNumber;

        const BALANCE = toWei(1_000_000);

        beforeEach(async () => {
            ({ network, networkToken, networkInfo, networkSettings, poolCollection, pendingWithdrawals } =
                await createSystem());

            provider = await createWallet();

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            await pendingWithdrawals.setTime(await latest());

            ({ poolToken } = await setupFundedPool(
                {
                    tokenData: new TokenData(TokenSymbol.TKN),
                    balance: BALANCE,
                    requestedLiquidity: BALANCE.mul(1000),
                    fundingRate: FUNDING_RATE
                },
                provider as any as SignerWithAddress,
                network,
                networkInfo,
                networkSettings,
                poolCollection
            ));

            poolTokenAmount = await poolToken.balanceOf(provider.address);
        });

        it('should initiate a withdrawal request', async () => {
            await poolToken.connect(provider).approve(network.address, poolTokenAmount);

            await profiler.profile(
                'init withdrawal',
                network.connect(provider).initWithdrawal(poolToken.address, poolTokenAmount)
            );
        });

        it('should initiate a permitted withdrawal request', async () => {
            const signature = await permitContractSignature(
                provider as Wallet,
                poolToken.address,
                network,
                networkToken,
                poolTokenAmount,
                MAX_UINT256
            );

            await profiler.profile(
                'init withdrawal permitted',
                network
                    .connect(provider)
                    .initWithdrawalPermitted(
                        poolToken.address,
                        poolTokenAmount,
                        MAX_UINT256,
                        signature.v,
                        signature.r,
                        signature.s
                    )
            );
        });

        context('with an initiated withdrawal request', () => {
            let id: BigNumber;

            beforeEach(async () => {
                ({ id } = await initWithdraw(provider, network, pendingWithdrawals, poolToken, poolTokenAmount));
            });

            it('should cancel a pending withdrawal request', async () => {
                await profiler.profile('cancel withdrawal', network.connect(provider).cancelWithdrawal(id));
            });
        });
    });

    describe('process rewards', () => {
        let network: TestBancorNetwork;
        let networkInfo: BancorNetworkInfo;
        let networkSettings: NetworkSettings;
        let masterPool: TestMasterPool;
        let networkToken: IERC20;
        let poolCollection: TestPoolCollection;
        let externalRewardsVault: ExternalRewardsVault;

        let autoCompoundingStakingRewards: TestAutoCompoundingStakingRewards;

        const prepareSimplePool = async (
            tokenData: TokenData,
            providerStake: BigNumberish,
            totalRewards: BigNumberish
        ) => {
            // deposit initial stake so that the participating user would have some initial amount of pool tokens
            const { token, poolToken } = await setupFundedPool(
                {
                    tokenData,
                    balance: providerStake,
                    requestedLiquidity: tokenData.isNetworkToken() ? max(providerStake, totalRewards).mul(1000) : 0,
                    fundingRate: FUNDING_RATE
                },
                deployer,
                network,
                networkInfo,
                networkSettings,
                poolCollection
            );

            // if we're rewarding the network token - no additional funding is needed
            if (!tokenData.isNetworkToken()) {
                // deposit pool tokens as staking rewards
                await depositToPool(stakingRewardsProvider, token, totalRewards, network);

                await transfer(
                    stakingRewardsProvider,
                    poolToken,
                    externalRewardsVault,
                    await poolToken.balanceOf(stakingRewardsProvider.address)
                );
            }

            return { token, poolToken };
        };

        const testRewards = (
            tokenData: TokenData,
            distributionType: StakingRewardsDistributionType,
            providerStake: BigNumberish,
            totalRewards: BigNumberish
        ) => {
            let token: TokenWithAddress;
            let rewardsVault: IVault;

            beforeEach(async () => {
                ({
                    network,
                    networkInfo,
                    networkSettings,
                    networkToken,
                    masterPool,
                    poolCollection,
                    externalRewardsVault
                } = await createSystem());

                await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

                ({ token } = await prepareSimplePool(tokenData, providerStake, totalRewards));

                rewardsVault = tokenData.isNetworkToken() ? masterPool : externalRewardsVault;

                autoCompoundingStakingRewards = await createStakingRewards(
                    network,
                    networkSettings,
                    networkToken,
                    masterPool,
                    externalRewardsVault
                );
            });

            const testProgram = (programDuration: number) => {
                context(StakingRewardsDistributionType[distributionType], () => {
                    let startTime: number;

                    beforeEach(async () => {
                        startTime = await latest();

                        await autoCompoundingStakingRewards.createProgram(
                            token.address,
                            rewardsVault.address,
                            totalRewards,
                            distributionType,
                            startTime,
                            distributionType === StakingRewardsDistributionType.Flat ? startTime + programDuration : 0
                        );
                    });

                    const testMultipleDistributions = (step: number, totalSteps: number) => {
                        context(
                            `in ${totalSteps} steps of ${humanizeDuration(step * 1000, { units: ['d'] })} long steps`,
                            () => {
                                it('should distribute rewards', async () => {
                                    for (let i = 0, time = startTime; i < totalSteps; i++, time += step) {
                                        await autoCompoundingStakingRewards.setTime(time);

                                        await profiler.profile(
                                            `${
                                                distributionType === StakingRewardsDistributionType.Flat
                                                    ? 'flat'
                                                    : 'exponential decay'
                                            } program / process ${tokenData.symbol()} rewards`,
                                            autoCompoundingStakingRewards.processRewards(token.address)
                                        );
                                    }
                                });
                            }
                        );
                    };

                    switch (distributionType) {
                        case StakingRewardsDistributionType.Flat:
                            for (const percent of [6, 25]) {
                                testMultipleDistributions(
                                    Math.floor((programDuration * percent) / 100),
                                    Math.floor(100 / percent)
                                );
                            }

                            break;

                        case StakingRewardsDistributionType.ExponentialDecay:
                            for (const step of [duration.hours(1), duration.weeks(1)]) {
                                for (const totalSteps of [5]) {
                                    testMultipleDistributions(step, totalSteps);
                                }
                            }

                            break;

                        default:
                            throw new Error(`Unsupported type ${distributionType}`);
                    }
                });
            };

            switch (distributionType) {
                case StakingRewardsDistributionType.Flat:
                    for (const programDuration of [duration.weeks(12)]) {
                        context(
                            `program duration of ${humanizeDuration(programDuration * 1000, { units: ['d'] })}`,
                            () => {
                                testProgram(programDuration);
                            }
                        );
                    }

                    break;

                case StakingRewardsDistributionType.ExponentialDecay:
                    for (const programDuration of [ExponentialDecay.MAX_DURATION]) {
                        context(
                            `program duration of ${humanizeDuration(programDuration * 1000, { units: ['y'] })}`,
                            () => {
                                testProgram(programDuration);
                            }
                        );
                    }

                    break;

                default:
                    throw new Error(`Unsupported type ${distributionType}`);
            }
        };

        const testRewardsMatrix = (providerStake: BigNumberish, totalReward: BigNumberish) => {
            const distributionTypes = Object.values(StakingRewardsDistributionType).filter(
                (v) => typeof v === 'number'
            ) as number[];

            for (const symbol of [TokenSymbol.BNT, TokenSymbol.TKN, TokenSymbol.ETH]) {
                for (const distributionType of distributionTypes) {
                    context(
                        `total ${totalReward} ${symbol} rewards, with initial provider stake of ${providerStake}`,
                        () => {
                            testRewards(new TokenData(symbol), distributionType, providerStake, totalReward);
                        }
                    );
                }
            }
        };

        testRewardsMatrix(toWei(100_000), toWei(200_000));
    });

    describe('migrate liquidity', () => {
        let networkTokenGovernance: TokenGovernance;
        let govTokenGovernance: TokenGovernance;
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let networkToken: IERC20;
        let poolCollection: TestPoolCollection;
        let masterVault: MasterVault;

        beforeEach(async () => {
            ({
                networkTokenGovernance,
                govTokenGovernance,
                network,
                networkSettings,
                networkToken,
                poolCollection,
                masterVault
            } = await createSystem());

            await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);
            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
        });

        const testLiquidityMigration = (
            totalSupply: BigNumber,
            reserve1Amount: BigNumber,
            reserve2Amount: BigNumber
        ) => {
            let now: number;
            let checkpointStore: TestCheckpointStore;
            let liquidityProtectionSettings: LiquidityProtectionSettings;
            let liquidityProtectionStore: LiquidityProtectionStore;
            let liquidityProtection: TestLiquidityProtection;
            let converter: TestStandardPoolConverter;
            let poolToken: DSToken;
            let baseToken: IERC20;
            let owner: SignerWithAddress;
            let provider: SignerWithAddress;

            const INITIAL_LIQUIDITY = MIN_LIQUIDITY_FOR_TRADING.mul(FUNDING_RATE.d).div(FUNDING_RATE.n).mul(2);

            const addProtectedLiquidity = async (
                poolTokenAddress: string,
                token: IERC20,
                tokenAddress: string,
                amount: BigNumber,
                isNativeToken: boolean,
                from: SignerWithAddress
            ) => {
                let value = BigNumber.from(0);
                if (isNativeToken) {
                    value = amount;
                } else {
                    await token.connect(from).approve(liquidityProtection.address, amount);
                }

                return liquidityProtection
                    .connect(from)
                    .addLiquidity(poolTokenAddress, tokenAddress, amount, { value });
            };

            const getProtection = async (protectionId: BigNumber) => {
                const protection = await liquidityProtectionStore.protectedLiquidity(protectionId);
                return {
                    provider: protection[0],
                    poolToken: protection[1],
                    reserveToken: protection[2],
                    poolAmount: protection[3],
                    reserveAmount: protection[4],
                    reserveRateN: protection[5],
                    reserveRateD: protection[6],
                    timestamp: protection[7]
                };
            };

            const setTime = async (time: number) => {
                now = time;

                for (const t of [converter, checkpointStore, liquidityProtection]) {
                    if (t) {
                        await t.setTime(now);
                    }
                }
            };

            const initLegacySystem = async (isNativeToken: boolean) => {
                [owner, provider] = await ethers.getSigners();

                baseToken = (await createToken(
                    new TokenData(isNativeToken ? TokenSymbol.ETH : TokenSymbol.TKN)
                )) as IERC20;

                ({
                    checkpointStore,
                    liquidityProtectionStore,
                    liquidityProtectionSettings,
                    liquidityProtection,
                    poolToken,
                    converter
                } = await createLegacySystem(
                    owner,
                    network,
                    masterVault,
                    networkToken,
                    networkTokenGovernance,
                    govTokenGovernance,
                    baseToken
                ));

                await networkTokenGovernance.mint(owner.address, totalSupply);

                await liquidityProtectionSettings.setMinNetworkTokenLiquidityForMinting(100);
                await liquidityProtectionSettings.setMinNetworkCompensation(3);

                await network.grantRole(Roles.BancorNetwork.ROLE_MIGRATION_MANAGER, liquidityProtection.address);
                await networkTokenGovernance.grantRole(Roles.TokenGovernance.ROLE_MINTER, liquidityProtection.address);
                await govTokenGovernance.grantRole(Roles.TokenGovernance.ROLE_MINTER, liquidityProtection.address);

                await createPool(baseToken, network, networkSettings, poolCollection);

                await networkSettings.setFundingLimit(baseToken.address, FUNDING_LIMIT);
                await poolCollection.setDepositLimit(baseToken.address, DEPOSIT_LIMIT);

                // ensure that the trading is enabled with sufficient funding
                if (isNativeToken) {
                    await network.deposit(baseToken.address, INITIAL_LIQUIDITY, { value: INITIAL_LIQUIDITY });
                } else {
                    const reserveToken = await Contracts.TestERC20Token.attach(baseToken.address);
                    await reserveToken.approve(network.address, INITIAL_LIQUIDITY);

                    await network.deposit(baseToken.address, INITIAL_LIQUIDITY);
                }

                await poolCollection.enableTrading(baseToken.address, FUNDING_RATE);

                await networkToken.approve(converter.address, reserve2Amount);

                let value = BigNumber.from(0);
                if (isNativeToken) {
                    value = reserve1Amount;
                } else {
                    await baseToken.approve(converter.address, reserve1Amount);
                }

                await converter.addLiquidity(
                    [baseToken.address, networkToken.address],
                    [reserve1Amount, reserve2Amount],
                    1,
                    {
                        value
                    }
                );

                await liquidityProtectionSettings.addPoolToWhitelist(poolToken.address);

                await setTime(await latest());
            };

            for (const isNative of [false, true]) {
                describe(`base token (${isNative ? 'ETH' : 'ERC20'})`, () => {
                    beforeEach(async () => {
                        await initLegacySystem(isNative);

                        await addProtectedLiquidity(
                            poolToken.address,
                            baseToken,
                            baseToken.address,
                            BigNumber.from(1000),
                            isNative,
                            owner
                        );
                    });

                    it('verifies that the caller can migrate positions', async () => {
                        const protectionId = (await liquidityProtectionStore.protectedLiquidityIds(owner.address))[0];
                        await liquidityProtection.setTime(now + duration.seconds(1));
                        await profiler.profile(
                            'migratePositions',
                            liquidityProtection.migratePositions([protectionId])
                        );
                    });

                    it('verifies that the owner can migrate system pool tokens', async () => {
                        await liquidityProtection.setTime(now + duration.seconds(1));
                        await profiler.profile(
                            'migrateSystemPoolTokens',
                            liquidityProtection.migrateSystemPoolTokens([poolToken.address])
                        );
                    });
                });
            }

            describe('network token', () => {
                beforeEach(async () => {
                    await initLegacySystem(false);

                    const amount = BigNumber.from(100_000);
                    await baseToken.transfer(provider.address, amount);
                    await baseToken.connect(provider).approve(network.address, amount);
                    await network.connect(provider).deposit(baseToken.address, amount);

                    const amount1 = BigNumber.from(5000);
                    await baseToken.transfer(provider.address, amount1);
                    await addProtectedLiquidity(
                        poolToken.address,
                        baseToken,
                        baseToken.address,
                        amount1,
                        false,
                        provider
                    );

                    const amount2 = BigNumber.from(1000);
                    await addProtectedLiquidity(
                        poolToken.address,
                        networkToken,
                        networkToken.address,
                        amount2,
                        false,
                        owner
                    );
                });

                it('verifies that the caller can migrate positions', async () => {
                    const protectionId = (await liquidityProtectionStore.protectedLiquidityIds(owner.address))[0];
                    await liquidityProtection.setTime(now + duration.seconds(1));
                    await profiler.profile('migratePositions', liquidityProtection.migratePositions([protectionId]));
                });
            });
        };

        for (const { totalSupply, reserve1Amount, reserve2Amount } of [
            {
                totalSupply: BigNumber.from(10_000_000),
                reserve1Amount: BigNumber.from(1_000_000),
                reserve2Amount: BigNumber.from(2_500_000)
            },
            {
                totalSupply: toWei(10_000_000),
                reserve1Amount: BigNumber.from(1_000_000),
                reserve2Amount: BigNumber.from(2_500_000)
            },
            {
                totalSupply: BigNumber.from(10_000_000),
                reserve1Amount: toWei(1_000_000),
                reserve2Amount: toWei(2_500_000)
            },
            {
                totalSupply: toWei(10_000_000),
                reserve1Amount: toWei(1_000_000),
                reserve2Amount: toWei(2_500_000)
            }
        ]) {
            context(
                `totalSupply = ${totalSupply}, reserve1Amount = ${reserve1Amount}, reserve2Amount = ${reserve2Amount}`,
                () => {
                    testLiquidityMigration(totalSupply, reserve1Amount, reserve2Amount);
                }
            );
        }
    });
});
