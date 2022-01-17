import Contracts from '../../components/Contracts';
import { Profiler } from '../../components/Profiler';
import {
    BancorNetworkInfo,
    IERC20,
    NetworkSettings,
    PoolToken,
    TestBancorNetwork,
    TestERC20Token,
    TestFlashLoanRecipient,
    TestPendingWithdrawals,
    TestPoolCollection
} from '../../typechain-types';
import { MAX_UINT256, PPM_RESOLUTION, ZERO_ADDRESS } from '../../utils/Constants';
import { permitContractSignature } from '../../utils/Permit';
import { TokenData, TokenSymbol, NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { toWei, toPPM } from '../../utils/Types';
import {
    createPool,
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
import { latest, duration } from '../helpers/Time';
import { createWallet, transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, ContractTransaction, utils, Wallet } from 'ethers';
import { ethers } from 'hardhat';
import { camelCase } from 'lodash';

const { formatBytes32String } = utils;

describe('Profile @profile', () => {
    const profiler = new Profiler();

    let deployer: SignerWithAddress;

    const FUNDING_RATE = { n: 1, d: 2 };
    const MAX_DEVIATION = toPPM(1);
    const FUNDING_LIMIT = toWei(10_000_000);
    const WITHDRAWAL_FEE = toPPM(5);
    const MIN_LIQUIDITY_FOR_TRADING = toWei(100_000);
    const CONTEXT_ID = formatBytes32String('CTX');

    before(async () => {
        [deployer] = await ethers.getSigners();
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

            await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
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
                    if (tokenData.isNativeToken()) {
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

                                value ||= tokenData.isNativeToken() ? amount : BigNumber.from(0);

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
                                    if (!tokenData.isNativeToken()) {
                                        beforeEach(async () => {
                                            const reserveToken = await Contracts.TestERC20Token.attach(token.address);
                                            await reserveToken.transfer(sender.address, amount.mul(COUNT));
                                        });
                                    }

                                    context('with an approval', () => {
                                        if (!tokenData.isNativeToken()) {
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

                                const { v, r, s } = await permitContractSignature(
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
                                            .depositPermitted(poolAddress, amount, DEADLINE, v, r, s);

                                    case Method.DepositForPermitted:
                                        return network
                                            .connect(sender)
                                            .depositForPermitted(
                                                providerAddress,
                                                poolAddress,
                                                amount,
                                                DEADLINE,
                                                v,
                                                r,
                                                s
                                            );
                                }
                            };

                            const testDepositAmount = async (amount: BigNumber) => {
                                const test = async () =>
                                    profiler.profile(`deposit ${tokenData.symbol()}`, deposit(amount));

                                context(`${amount} tokens`, () => {
                                    if (tokenData.isNetworkToken() || tokenData.isNativeToken()) {
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

        for (const symbol of [TokenSymbol.TKN]) {
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
        let poolCollection: TestPoolCollection;
        let pendingWithdrawals: TestPendingWithdrawals;
        let masterPoolToken: PoolToken;

        const setTime = async (time: number) => {
            await network.setTime(time);
            await pendingWithdrawals.setTime(time);
        };

        beforeEach(async () => {
            ({ network, networkSettings, networkToken, govToken, poolCollection, pendingWithdrawals, masterPoolToken } =
                await createSystem());

            await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
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

            context('during the withdrawal window duration', () => {
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
                    const withdrawalDuration =
                        (await pendingWithdrawals.lockDuration()) +
                        (await pendingWithdrawals.withdrawalWindowDuration());
                    await setTime(requests[0].creationTime + withdrawalDuration - 1);
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

                    it('should complete a withdraw', async () => {
                        await testMultipleWithdrawals();
                    });
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

        const MIN_LIQUIDITY_FOR_TRADING = toWei(100_000);
        const NETWORK_TOKEN_LIQUIDITY = toWei(100_000);
        const MIN_RETURN_AMOUNT = BigNumber.from(1);

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

            await depositToPool(deployer, networkToken, NETWORK_TOKEN_LIQUIDITY, network);

            await network.setTime(await latest());
        };

        interface TradeOverrides {
            value?: BigNumber;
            minReturnAmount?: BigNumber;
            deadline?: BigNumber;
            beneficiary?: string;
            sourceTokenAddress?: string;
            targetTokenAddress?: string;
        }

        const trade = async (amount: BigNumber, overrides: TradeOverrides = {}) => {
            let {
                value,
                minReturnAmount = MIN_RETURN_AMOUNT,
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

        interface TradePermittedOverrides {
            minReturnAmount?: BigNumber;
            deadline?: BigNumber;
            beneficiary?: string;
            sourceTokenAddress?: string;
            targetTokenAddress?: string;
            approvedAmount?: BigNumber;
        }

        const tradePermitted = async (amount: BigNumber, overrides: TradePermittedOverrides = {}) => {
            const {
                minReturnAmount = MIN_RETURN_AMOUNT,
                deadline = MAX_UINT256,
                beneficiary = ZERO_ADDRESS,
                sourceTokenAddress = sourceToken.address,
                targetTokenAddress = targetToken.address,
                approvedAmount = amount
            } = overrides;

            const { v, r, s } = await permitContractSignature(
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
                    v,
                    r,
                    s
                );
        };

        const performTrade = async (
            beneficiaryAddress: string,
            amount: BigNumber,
            trade: (
                amount: BigNumber,
                options: TradeOverrides | TradePermittedOverrides
            ) => Promise<ContractTransaction>
        ) => {
            const isSourceNativeToken = sourceToken.address === NATIVE_TOKEN_ADDRESS;
            const isTargetNativeToken = targetToken.address === NATIVE_TOKEN_ADDRESS;

            const minReturnAmount = MIN_RETURN_AMOUNT;
            const deadline = MAX_UINT256;

            const sourceSymbol = isSourceNativeToken ? TokenSymbol.ETH : await (sourceToken as TestERC20Token).symbol();
            const targetSymbol = isTargetNativeToken ? TokenSymbol.ETH : await (targetToken as TestERC20Token).symbol();

            await profiler.profile(
                `trade ${await sourceSymbol} -> ${targetSymbol}`,
                trade(amount, { minReturnAmount, beneficiary: beneficiaryAddress, deadline })
            );
        };

        const testTrades = (source: PoolSpec, target: PoolSpec, amount: BigNumber) => {
            const isSourceNativeToken = source.tokenData.isNativeToken();

            context(`trade ${amount} tokens from ${specToString(source)} to ${specToString(target)}`, () => {
                const TRADES_COUNT = 2;

                const test = async () => {
                    if (!isSourceNativeToken) {
                        const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);
                        await reserveToken.connect(trader).approve(network.address, amount);
                    }

                    await performTrade(ZERO_ADDRESS, amount, trade);
                };

                beforeEach(async () => {
                    await setupPools(source, target);

                    if (!isSourceNativeToken) {
                        const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);
                        await reserveToken.transfer(trader.address, amount.mul(BigNumber.from(TRADES_COUNT)));
                    }
                });

                it('should complete multiple trades', async () => {
                    for (let i = 0; i < TRADES_COUNT; i++) {
                        await test();
                    }
                });
            });
        };

        const testPermittedTrades = (source: PoolSpec, target: PoolSpec, amount: BigNumber) => {
            const isSourceNativeToken = source.tokenData.isNativeToken();
            const isSourceNetworkToken = source.tokenData.isNetworkToken();

            context(`trade permitted ${amount} tokens from ${specToString(source)} to ${specToString(target)}`, () => {
                const test = async () => performTrade(ZERO_ADDRESS, amount, tradePermitted);

                beforeEach(async () => {
                    await setupPools(source, target);

                    if (!isSourceNativeToken) {
                        const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);
                        await reserveToken.transfer(trader.address, amount);
                    }
                });

                if (isSourceNetworkToken || isSourceNativeToken) {
                    return;
                }

                it('should complete a trade', async () => {
                    await test();
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
                toWei(100_000)
            );

            for (const sourceBalance of [toWei(1_000_000), toWei(50_000_000)]) {
                for (const targetBalance of [toWei(1_000_000), toWei(50_000_000)]) {
                    for (const amount of [10_000, toWei(500_000)]) {
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
        let networkToken: IERC20;
        let poolCollection: TestPoolCollection;
        let recipient: TestFlashLoanRecipient;
        let token: TokenWithAddress;

        const amount = toWei(123_456);

        const MIN_LIQUIDITY_FOR_TRADING = toWei(100_000);

        beforeEach(async () => {
            ({ network, networkInfo, networkSettings, networkToken, poolCollection } = await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
            await networkSettings.setFundingLimit(networkToken.address, MAX_UINT256);

            recipient = await Contracts.TestFlashLoanRecipient.deploy(network.address);
        });

        const testFlashLoan = async (tokenData: TokenData, flashLoanFeePPM: number) => {
            const feeAmount = amount.mul(flashLoanFeePPM).div(PPM_RESOLUTION);

            beforeEach(async () => {
                ({ token } = await setupFundedPool(
                    {
                        tokenData,
                        balance: amount,
                        requestedLiquidity: amount.mul(1000),
                        fundingRate: FUNDING_RATE
                    },
                    deployer,
                    network,
                    networkInfo,
                    networkSettings,
                    poolCollection
                ));

                await networkSettings.setFlashLoanFeePPM(flashLoanFeePPM);

                await transfer(deployer, token, recipient.address, feeAmount);
                await recipient.snapshot(token.address);
            });

            const test = async () => {
                const data = '0x1234';
                await profiler.profile(
                    `flash-loan ${tokenData.symbol()}`,
                    network.flashLoan(token.address, amount, recipient.address, data)
                );
            };

            context('returning just about right', () => {
                beforeEach(async () => {
                    await recipient.setAmountToReturn(amount.add(feeAmount));
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

        const MIN_LIQUIDITY_FOR_TRADING = toWei(100_000);

        beforeEach(async () => {
            ({ network, networkToken, networkInfo, networkSettings, poolCollection, pendingWithdrawals } =
                await createSystem());

            provider = await createWallet();

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
            await networkSettings.setFundingLimit(networkToken.address, MAX_UINT256);

            await pendingWithdrawals.setTime(await latest());

            ({ poolToken } = await setupFundedPool(
                {
                    tokenData: new TokenData(TokenSymbol.TKN),
                    balance: toWei(1_000_000),
                    requestedLiquidity: toWei(1_000_000).mul(1000),
                    fundingRate: { n: 1, d: 2 }
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
            const { v, r, s } = await permitContractSignature(
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
                    .initWithdrawalPermitted(poolToken.address, poolTokenAmount, MAX_UINT256, v, r, s)
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

            it('should reinitiate a pending withdrawal request', async () => {
                const newTime = (await latest()) + duration.weeks(1);
                await pendingWithdrawals.setTime(newTime);

                await profiler.profile('reinit withdrawal', network.connect(provider).reinitWithdrawal(id));
            });
        });
    });
});
