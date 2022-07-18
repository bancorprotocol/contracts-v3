import Contracts, {
    BancorNetworkInfo,
    ExternalRewardsVault,
    IERC20,
    IPoolToken,
    MasterVault,
    NetworkSettings,
    PoolToken,
    TestAutoCompoundingRewards,
    TestBancorNetwork,
    TestBNTPool,
    TestERC20Token,
    TestFlashLoanRecipient,
    TestPendingWithdrawals,
    TestPoolCollection,
    TestStandardRewards
} from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import { Profiler } from '../../components/Profiler';
import { TradeAmountAndFeeStructOutput } from '../../typechain-types/contracts/pools/PoolCollection';
import {
    EXP2_INPUT_TOO_HIGH,
    MAX_UINT256,
    PPM_RESOLUTION,
    RewardsDistributionType,
    ZERO_ADDRESS
} from '../../utils/Constants';
import { NATIVE_TOKEN_ADDRESS, TokenData, TokenSymbol } from '../../utils/TokenData';
import { max, toPPM, toWei } from '../../utils/Types';
import {
    createAutoCompoundingRewards,
    createPool,
    createStandardRewards,
    createSystem,
    createTestToken,
    createToken,
    depositToPool,
    initWithdraw,
    PoolSpec,
    setupFundedPool,
    specToString,
    TokenWithAddress
} from '../helpers/Factory';
import { duration, latest } from '../helpers/Time';
import { transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, BigNumberish, ContractTransaction, utils } from 'ethers';
import { ethers } from 'hardhat';
import humanizeDuration from 'humanize-duration';
import { camelCase } from 'lodash';

const { formatBytes32String } = utils;

describe('Profile @profile', () => {
    const profiler = new Profiler();

    let deployer: SignerWithAddress;
    let rewardsProvider: SignerWithAddress;

    const BNT_VIRTUAL_BALANCE = 1;
    const BASE_TOKEN_VIRTUAL_BALANCE = 2;
    const FUNDING_LIMIT = toWei(10_000_000);
    const WITHDRAWAL_FEE = toPPM(5);
    const MIN_LIQUIDITY_FOR_TRADING = toWei(1000);
    const CONTEXT_ID = formatBytes32String('CTX');
    const MIN_RETURN_AMOUNT = BigNumber.from(1);
    const MAX_SOURCE_AMOUNT = MAX_UINT256;

    before(async () => {
        [deployer, rewardsProvider] = await ethers.getSigners();
    });

    after(async () => {
        profiler.printSummary();
    });

    describe('deposit', () => {
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let bnt: IERC20;
        let poolCollection: TestPoolCollection;
        let pendingWithdrawals: TestPendingWithdrawals;

        beforeEach(async () => {
            ({ network, networkSettings, bnt, poolCollection, pendingWithdrawals } = await createSystem());

            await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);
            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
        });

        const testDeposits = (tokenData: TokenData) => {
            const INITIAL_LIQUIDITY = MIN_LIQUIDITY_FOR_TRADING.mul(BASE_TOKEN_VIRTUAL_BALANCE)
                .div(BNT_VIRTUAL_BALANCE)
                .mul(2);

            let token: TokenWithAddress;
            let provider: SignerWithAddress;

            before(async () => {
                [, provider] = await ethers.getSigners();
            });

            beforeEach(async () => {
                if (tokenData.isBNT()) {
                    token = bnt;
                } else {
                    token = await createToken(tokenData);

                    await createPool(token, network, networkSettings, poolCollection);

                    await networkSettings.setFundingLimit(token.address, MAX_UINT256);

                    // ensure that the trading is enabled with sufficient funding
                    if (tokenData.isNative()) {
                        await network.deposit(token.address, INITIAL_LIQUIDITY, { value: INITIAL_LIQUIDITY });
                    } else {
                        const reserveToken = await Contracts.TestERC20Token.attach(token.address);
                        await reserveToken.approve(network.address, INITIAL_LIQUIDITY);

                        await network.deposit(token.address, INITIAL_LIQUIDITY);
                    }

                    await poolCollection.enableTrading(token.address, BNT_VIRTUAL_BALANCE, BASE_TOKEN_VIRTUAL_BALANCE);
                }

                await setTime(await latest());
            });

            const setTime = async (time: number) => {
                await network.setTime(time);
                await pendingWithdrawals.setTime(time);
            };

            enum Method {
                Deposit,
                DepositFor
            }

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

                    const testDepositAmount = (amount: BigNumber) => {
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
                                        const reserveToken = await Contracts.TestERC20Token.attach(token.address);
                                        await reserveToken.connect(sender).approve(network.address, amount.mul(COUNT));
                                    });
                                }

                                if (tokenData.isBNT()) {
                                    context('with requested funding', () => {
                                        beforeEach(async () => {
                                            const reserveToken = await createTestToken();

                                            await createPool(reserveToken, network, networkSettings, poolCollection);
                                            await networkSettings.setFundingLimit(reserveToken.address, FUNDING_LIMIT);

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
        let bnt: IERC20;
        let vbnt: IERC20;
        let masterVault: MasterVault;
        let poolCollection: TestPoolCollection;
        let pendingWithdrawals: TestPendingWithdrawals;
        let bntPoolToken: PoolToken;

        const setTime = async (time: number) => {
            await network.setTime(time);
            await pendingWithdrawals.setTime(time);
        };

        beforeEach(async () => {
            ({ network, networkSettings, bnt, vbnt, masterVault, poolCollection, pendingWithdrawals, bntPoolToken } =
                await createSystem());

            await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);
            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            await setTime(await latest());
        });

        interface Request {
            id: BigNumber;
            poolTokenAmount: BigNumber;
            creationTime: number;
        }

        const testWithdraw = (tokenData: TokenData) => {
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
                if (tokenData.isBNT()) {
                    token = bnt;
                    poolToken = bntPoolToken;

                    const reserveToken = await createTestToken();
                    await createPool(reserveToken, network, networkSettings, poolCollection);
                    await networkSettings.setFundingLimit(reserveToken.address, MAX_UINT256);

                    await poolCollection.requestFundingT(CONTEXT_ID, reserveToken.address, INITIAL_LIQUIDITY);
                } else {
                    token = await createToken(tokenData);
                    poolToken = await createPool(token, network, networkSettings, poolCollection);

                    await networkSettings.setFundingLimit(token.address, MAX_UINT256);
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

                if (!tokenData.isBNT()) {
                    await poolCollection.enableTrading(token.address, BNT_VIRTUAL_BALANCE, BASE_TOKEN_VIRTUAL_BALANCE);
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
                        if (tokenData.isBNT()) {
                            await vbnt.connect(provider).approve(
                                network.address,
                                requests.reduce((res, r) => res.add(r.poolTokenAmount), BigNumber.from(0))
                            );
                        }
                    });

                    if (tokenData.isBNT()) {
                        it('should complete multiple withdrawals', async () => {
                            await testMultipleWithdrawals();
                        });
                    } else {
                        context(
                            'when the matched target network liquidity is above the minimum liquidity for trading',
                            () => {
                                beforeEach(async () => {
                                    const extraLiquidity = MIN_LIQUIDITY_FOR_TRADING.mul(BASE_TOKEN_VIRTUAL_BALANCE)
                                        .div(BNT_VIRTUAL_BALANCE)
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
        let bnt: IERC20;
        let poolCollection: TestPoolCollection;

        let sourceToken: TokenWithAddress;
        let targetToken: TokenWithAddress;

        let trader: SignerWithAddress;

        before(async () => {
            [, trader] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ network, networkInfo, networkSettings, bnt, poolCollection } = await createSystem());

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

        interface TradeOverrides {
            value?: BigNumberish;
            limit?: BigNumberish;
            deadline?: BigNumberish;
            beneficiary?: string;
            sourceTokenAddress?: string;
            targetTokenAddress?: string;
        }

        const tradeBySourceAmount = async (amount: BigNumberish, overrides: TradeOverrides = {}) => {
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
                .tradeBySourceAmount(
                    sourceTokenAddress,
                    targetTokenAddress,
                    amount,
                    minReturnAmount,
                    deadline,
                    beneficiary,
                    {
                        value
                    }
                );
        };

        const tradeByTargetAmount = async (amount: BigNumberish, overrides: TradeOverrides = {}) => {
            let {
                value,
                limit: maxSourceAmount,
                deadline = MAX_UINT256,
                beneficiary = ZERO_ADDRESS,
                sourceTokenAddress = sourceToken.address,
                targetTokenAddress = targetToken.address
            } = overrides;

            // fetch the required source amount if it wasn't provided
            maxSourceAmount ||= await networkInfo.tradeInputByTargetAmount(
                sourceTokenAddress,
                targetTokenAddress,
                amount
            );

            // when providing the target amount, the send value (i.e., the amount to trade) is represented by the
            // maximum source amount
            if (!value) {
                value = BigNumber.from(0);

                if (sourceTokenAddress === NATIVE_TOKEN_ADDRESS) {
                    value = BigNumber.from(maxSourceAmount);
                }
            }

            return network
                .connect(trader)
                .tradeByTargetAmount(
                    sourceTokenAddress,
                    targetTokenAddress,
                    amount,
                    maxSourceAmount,
                    deadline,
                    beneficiary,
                    {
                        value
                    }
                );
        };

        interface TradePermittedOverrides {
            limit?: BigNumberish;
            deadline?: BigNumberish;
            beneficiary?: string;
            sourceTokenAddress?: string;
            targetTokenAddress?: string;
            approvedAmount?: BigNumberish;
        }

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
            const isSourceBNT = sourceToken.address === bnt.address;
            const isTargetBNT = targetToken.address === bnt.address;

            const bySourceAmount = tradeBySourceAmount === tradeFunc;

            const deadline = MAX_UINT256;
            let limit: BigNumber;

            if (bySourceAmount) {
                limit = MIN_RETURN_AMOUNT;
            } else {
                let sourceTradeAmounts: TradeAmountAndFeeStructOutput;
                if (isSourceBNT || isTargetBNT) {
                    sourceTradeAmounts = await network.callStatic.tradeByTargetPoolCollectionT(
                        poolCollection.address,
                        CONTEXT_ID,
                        sourceToken.address,
                        targetToken.address,
                        amount,
                        MAX_SOURCE_AMOUNT
                    );
                } else {
                    const targetTradeOutput = await network.callStatic.tradeByTargetPoolCollectionT(
                        poolCollection.address,
                        CONTEXT_ID,
                        bnt.address,
                        targetToken.address,
                        amount,
                        MAX_SOURCE_AMOUNT
                    );

                    sourceTradeAmounts = await network.callStatic.tradeByTargetPoolCollectionT(
                        poolCollection.address,
                        CONTEXT_ID,
                        sourceToken.address,
                        bnt.address,
                        targetTradeOutput.amount,
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
                `trade by providing the ${
                    bySourceAmount ? 'source' : 'target'
                } amount ${sourceSymbol} -> ${targetSymbol}`,
                tradeFunc(amount, { limit, beneficiary: beneficiaryAddress, deadline })
            );
        };

        const approve = async (amount: BigNumberish, bySourceAmount: boolean) => {
            const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);

            let sourceAmount;
            if (bySourceAmount) {
                sourceAmount = amount;
            } else {
                sourceAmount = await networkInfo.tradeInputByTargetAmount(
                    sourceToken.address,
                    targetToken.address,
                    amount
                );
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

                for (const bySourceAmount of [true, false]) {
                    context(`by providing the ${bySourceAmount ? 'source' : 'target'} amount`, () => {
                        const tradeFunc = bySourceAmount ? tradeBySourceAmount : tradeByTargetAmount;

                        const TRADES_COUNT = 2;

                        it('should complete multiple trades', async () => {
                            const currentBlockNumber = await poolCollection.currentBlockNumber();

                            for (let i = 0; i < TRADES_COUNT; i++) {
                                if (!isSourceNativeToken) {
                                    await approve(amount, bySourceAmount);
                                }

                                await performTrade(ZERO_ADDRESS, amount, tradeFunc);

                                await poolCollection.setBlockNumber(currentBlockNumber + i + 1);
                            }
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

            for (const sourceBalance of [toWei(1_000_000), toWei(100_000_000)]) {
                for (const targetBalance of [toWei(1_000_000), toWei(100_000_000)]) {
                    for (const amount of [toWei(100)]) {
                        for (const tradingFeePercent of [0, 5]) {
                            // if either the source or the target token is BNT - only test fee in one of the
                            // directions
                            if (sourceTokenData.isBNT() || targetTokenData.isBNT()) {
                                testTrades(
                                    {
                                        tokenData: new TokenData(sourceSymbol),
                                        balance: sourceBalance,
                                        requestedFunding: sourceBalance.mul(1000),
                                        tradingFeePPM: sourceTokenData.isBNT() ? undefined : toPPM(tradingFeePercent),
                                        bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                                        baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
                                    },
                                    {
                                        tokenData: new TokenData(targetSymbol),
                                        balance: targetBalance,
                                        requestedFunding: targetBalance.mul(1000),
                                        tradingFeePPM: targetTokenData.isBNT() ? undefined : toPPM(tradingFeePercent),
                                        bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                                        baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
                                    },
                                    BigNumber.from(amount)
                                );
                            } else {
                                for (const tradingFeePercent2 of [0, 5]) {
                                    testTrades(
                                        {
                                            tokenData: new TokenData(sourceSymbol),
                                            balance: sourceBalance,
                                            requestedFunding: sourceBalance.mul(1000),
                                            tradingFeePPM: toPPM(tradingFeePercent),
                                            bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                                            baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
                                        },
                                        {
                                            tokenData: new TokenData(targetSymbol),
                                            balance: targetBalance,
                                            requestedFunding: targetBalance.mul(1000),
                                            tradingFeePPM: toPPM(tradingFeePercent2),
                                            bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                                            baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
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

        const testFlashLoan = (tokenData: TokenData, flashLoanFeePPM: number) => {
            const FEE_AMOUNT = LOAN_AMOUNT.mul(flashLoanFeePPM).div(PPM_RESOLUTION);

            beforeEach(async () => {
                ({ token } = await setupFundedPool(
                    {
                        tokenData,
                        balance: BALANCE,
                        requestedFunding: BALANCE.mul(1000),
                        bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                        baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
                    },
                    deployer,
                    network,
                    networkInfo,
                    networkSettings,
                    poolCollection
                ));

                await networkSettings.setFlashLoanFeePPM(token.address, flashLoanFeePPM);

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
                    requestedFunding: BALANCE.mul(1000),
                    bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                    baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
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

    describe('auto-compounding rewards', () => {
        const EXP_DECAY_HALF_LIFE = duration.days(561);
        const EXP_DECAY_MAX_DURATION = EXP2_INPUT_TOO_HIGH.mul(EXP_DECAY_HALF_LIFE).sub(1).ceil().toNumber();

        let network: TestBancorNetwork;
        let networkInfo: BancorNetworkInfo;
        let networkSettings: NetworkSettings;
        let bntPool: TestBNTPool;
        let bnt: IERC20;
        let poolCollection: TestPoolCollection;
        let externalRewardsVault: ExternalRewardsVault;

        let autoCompoundingRewards: TestAutoCompoundingRewards;

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
                    requestedFunding: tokenData.isBNT() ? max(providerStake, totalRewards).mul(1000) : 0,
                    bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                    baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
                },
                deployer,
                network,
                networkInfo,
                networkSettings,
                poolCollection
            );

            // if we're rewarding BNT - no additional funding is needed
            if (!tokenData.isBNT()) {
                // deposit pool tokens as staking rewards
                await depositToPool(rewardsProvider, token, totalRewards, network);

                await transfer(
                    rewardsProvider,
                    poolToken,
                    externalRewardsVault,
                    await poolToken.balanceOf(rewardsProvider.address)
                );
            }

            return { token, poolToken };
        };

        const testRewards = (
            tokenData: TokenData,
            distributionType: RewardsDistributionType,
            providerStake: BigNumberish,
            totalRewards: BigNumberish
        ) => {
            let token: TokenWithAddress;

            beforeEach(async () => {
                ({ network, networkInfo, networkSettings, bnt, bntPool, poolCollection, externalRewardsVault } =
                    await createSystem());

                await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

                ({ token } = await prepareSimplePool(tokenData, providerStake, totalRewards));

                autoCompoundingRewards = await createAutoCompoundingRewards(
                    network,
                    networkSettings,
                    bnt,
                    bntPool,
                    externalRewardsVault
                );
            });

            const testProgram = (programDuration: number) => {
                context(RewardsDistributionType[distributionType], () => {
                    let startTime: number;

                    beforeEach(async () => {
                        startTime = await latest();

                        if (distributionType === RewardsDistributionType.Flat) {
                            await autoCompoundingRewards.createFlatProgram(
                                token.address,
                                totalRewards,
                                startTime,
                                startTime + programDuration
                            );
                        } else {
                            await autoCompoundingRewards.createExpDecayProgram(
                                token.address,
                                totalRewards,
                                startTime,
                                EXP_DECAY_HALF_LIFE
                            );
                        }
                    });

                    const testMultipleDistributions = (step: number, totalSteps: number) => {
                        context(
                            `in ${totalSteps} steps of ${humanizeDuration(step * 1000, { units: ['d'] })} long steps`,
                            () => {
                                it('should distribute rewards', async () => {
                                    for (let i = 0, time = startTime; i < totalSteps; i++, time += step) {
                                        await autoCompoundingRewards.setTime(time);

                                        await profiler.profile(
                                            `${
                                                distributionType === RewardsDistributionType.Flat
                                                    ? 'flat'
                                                    : 'exponential decay'
                                            } program / process ${tokenData.symbol()} rewards`,
                                            autoCompoundingRewards.processRewards(token.address)
                                        );
                                    }
                                });
                            }
                        );
                    };

                    const testMultipleDistributionsAtOnce = (totalTime: number) => {
                        context(
                            `in 1 step of ${humanizeDuration(totalTime * 1000, { units: ['d'] })} long steps`,
                            () => {
                                it('should distribute rewards', async () => {
                                    await autoCompoundingRewards.setTime(startTime + totalTime);

                                    await profiler.profile(
                                        `${
                                            distributionType === RewardsDistributionType.Flat
                                                ? 'flat'
                                                : 'exponential decay'
                                        } program / auto-process ${tokenData.symbol()} rewards`,
                                        autoCompoundingRewards.autoProcessRewards()
                                    );
                                });
                            }
                        );
                    };

                    switch (distributionType) {
                        case RewardsDistributionType.Flat:
                            for (const percent of [6, 25]) {
                                testMultipleDistributions(
                                    Math.floor((programDuration * percent) / 100),
                                    Math.floor(100 / percent)
                                );
                                testMultipleDistributionsAtOnce(Math.floor((programDuration * percent) / 100));
                            }

                            break;

                        case RewardsDistributionType.ExpDecay:
                            for (const step of [duration.hours(1), duration.weeks(1)]) {
                                for (const totalSteps of [5]) {
                                    testMultipleDistributions(step, totalSteps);
                                    testMultipleDistributionsAtOnce(step * totalSteps);
                                }
                            }

                            break;

                        default:
                            throw new Error(`Unsupported type ${distributionType}`);
                    }
                });
            };

            switch (distributionType) {
                case RewardsDistributionType.Flat:
                    for (const programDuration of [duration.weeks(12)]) {
                        context(
                            `program duration of ${humanizeDuration(programDuration * 1000, { units: ['d'] })}`,
                            () => {
                                testProgram(programDuration);
                            }
                        );
                    }

                    break;

                case RewardsDistributionType.ExpDecay:
                    for (const programDuration of [EXP_DECAY_MAX_DURATION]) {
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
            const distributionTypes = Object.values(RewardsDistributionType).filter(
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

    describe('standard rewards', () => {
        let network: TestBancorNetwork;
        let networkInfo: BancorNetworkInfo;
        let networkSettings: NetworkSettings;
        let bntGovernance: TokenGovernance;
        let vbnt: IERC20;
        let bntPool: TestBNTPool;
        let poolCollection: TestPoolCollection;
        let standardRewards: TestStandardRewards;

        let now: number;

        let provider: SignerWithAddress;

        before(async () => {
            [, provider] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ network, networkInfo, networkSettings, bntGovernance, vbnt, bntPool, poolCollection } =
                await createSystem());

            standardRewards = await createStandardRewards(network, networkSettings, bntGovernance, vbnt, bntPool);

            now = await latest();

            await setTime(standardRewards, now);
        });

        const prepareSimplePool = async (poolData: TokenData, initialBalance: BigNumberish) => {
            // deposit initial stake so that the participating user would have some initial amount of pool tokens
            const { token, poolToken } = await setupFundedPool(
                {
                    tokenData: poolData,
                    balance: initialBalance,
                    requestedFunding: poolData.isBNT() ? BigNumber.from(initialBalance).mul(1000) : 0,
                    bntVirtualBalance: 1,
                    baseTokenVirtualBalance: 2
                },
                deployer,
                network,
                networkInfo,
                networkSettings,
                poolCollection
            );

            return { token, poolToken };
        };

        const createProgram = async (
            standardRewards: TestStandardRewards,
            pool: TokenWithAddress,
            totalRewards: BigNumberish,
            startTime: number,
            endTime: number
        ) => {
            const id = await standardRewards.nextProgramId();

            await standardRewards.createProgram(pool.address, totalRewards, startTime, endTime);

            return id;
        };

        const setTime = async (standardRewards: TestStandardRewards, time: number) => {
            await standardRewards.setTime(time);

            now = time;
        };

        const increaseTime = async (standardRewards: TestStandardRewards, duration: number) =>
            setTime(standardRewards, now + duration);

        interface ProgramSpec {
            poolSymbol: TokenSymbol;
            initialBalance: BigNumberish;
            providerStake: BigNumberish;
            totalRewards: BigNumberish;
            duration: number;
        }

        // setups a pool with the same rewards token as the pool itself so that it'd be possible staking rewards to the
        // same pool
        const setupProgram = async (programSpec: ProgramSpec) => {
            const poolData = new TokenData(programSpec.poolSymbol);

            const { token: pool, poolToken } = await prepareSimplePool(poolData, programSpec.initialBalance);

            const startTime = now;
            const endTime = startTime + programSpec.duration;

            const id = await createProgram(standardRewards, pool, programSpec.totalRewards, startTime, endTime);

            await transfer(deployer, pool, provider, programSpec.providerStake);
            await depositToPool(provider, pool, programSpec.providerStake, network);
            const providerPoolTokenAmount = await poolToken.balanceOf(provider.address);

            return {
                id: id.toNumber(),
                providerPoolTokenAmount,
                poolToken
            };
        };

        const programSpecToString = (programSpec: ProgramSpec) =>
            `(pool=${
                programSpec.poolSymbol
            }, initialBalance=${programSpec.initialBalance.toString()}, stake=[${programSpec.providerStake.toString()}]) (rewards=${
                programSpec.poolSymbol
            }, totalRewards=${programSpec.totalRewards.toString()}, duration=${humanizeDuration(
                programSpec.duration * 1000,
                { units: ['d'] }
            )})`;

        const testClaiming = (programSpec: ProgramSpec) => {
            let id: number;
            let providerPoolTokenAmount: BigNumber;
            let poolToken: IPoolToken;

            describe(`full tests ${programSpecToString(programSpec)}`, () => {
                beforeEach(async () => {
                    ({ id, providerPoolTokenAmount, poolToken } = await setupProgram(programSpec));

                    await poolToken.connect(provider).approve(standardRewards.address, providerPoolTokenAmount);
                });

                it('should properly claim rewards', async () => {
                    await profiler.profile(
                        `standard program / join ${programSpec.poolSymbol} [${programSpec.poolSymbol} rewards]`,
                        standardRewards.connect(provider).join(id, providerPoolTokenAmount.div(2))
                    );

                    await increaseTime(standardRewards, duration.days(1));

                    await profiler.profile(
                        `standard program / join ${programSpec.poolSymbol} [${programSpec.poolSymbol} rewards]`,
                        standardRewards.connect(provider).join(id, providerPoolTokenAmount.div(2))
                    );

                    await profiler.profile(
                        `standard program / claim ${programSpec.poolSymbol} [${programSpec.poolSymbol} rewards]`,
                        standardRewards.connect(provider).claimRewards([id])
                    );

                    await increaseTime(standardRewards, duration.days(1));

                    await profiler.profile(
                        `standard program / claim ${programSpec.poolSymbol} [${programSpec.poolSymbol} rewards]`,
                        standardRewards.connect(provider).claimRewards([id])
                    );

                    await profiler.profile(
                        `standard program / leave ${programSpec.poolSymbol} [${programSpec.poolSymbol} rewards]`,
                        standardRewards.connect(provider).leave(id, providerPoolTokenAmount.div(2))
                    );

                    await increaseTime(standardRewards, duration.days(1));

                    await profiler.profile(
                        `standard program / leave ${programSpec.poolSymbol} [${programSpec.poolSymbol} rewards]`,
                        standardRewards.connect(provider).leave(id, providerPoolTokenAmount.div(2))
                    );

                    await profiler.profile(
                        `standard program / claim ${programSpec.poolSymbol} [${programSpec.poolSymbol} rewards]`,
                        standardRewards.connect(provider).claimRewards([id])
                    );
                });

                it('should properly stake rewards', async () => {
                    await profiler.profile(
                        `standard program / join ${programSpec.poolSymbol} [${programSpec.poolSymbol} rewards]`,
                        standardRewards.connect(provider).join(id, providerPoolTokenAmount.div(2))
                    );

                    await increaseTime(standardRewards, duration.days(1));

                    await profiler.profile(
                        `standard program / join ${programSpec.poolSymbol} [${programSpec.poolSymbol} rewards]`,
                        standardRewards.connect(provider).join(id, providerPoolTokenAmount.div(2))
                    );

                    await profiler.profile(
                        `standard program / claim ${programSpec.poolSymbol} [${programSpec.poolSymbol} rewards]`,
                        standardRewards.connect(provider).stakeRewards([id])
                    );

                    await increaseTime(standardRewards, duration.days(1));

                    await profiler.profile(
                        `standard program / claim ${programSpec.poolSymbol} [${programSpec.poolSymbol} rewards]`,
                        standardRewards.connect(provider).stakeRewards([id])
                    );

                    await profiler.profile(
                        `standard program / leave ${programSpec.poolSymbol} [${programSpec.poolSymbol} rewards]`,
                        standardRewards.connect(provider).leave(id, providerPoolTokenAmount.div(2))
                    );

                    await increaseTime(standardRewards, duration.days(1));

                    await profiler.profile(
                        `standard program / leave ${programSpec.poolSymbol} [${programSpec.poolSymbol} rewards]`,
                        standardRewards.connect(provider).leave(id, providerPoolTokenAmount.div(2))
                    );

                    await profiler.profile(
                        `standard program / claim ${programSpec.poolSymbol} [${programSpec.poolSymbol} rewards]`,
                        standardRewards.connect(provider).stakeRewards([id])
                    );
                });
            });
        };

        for (const poolSymbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
            context(`${poolSymbol} pool with ${poolSymbol} rewards`, () => {
                testClaiming({
                    poolSymbol,
                    initialBalance: toWei(100_000),
                    providerStake: toWei(10_000),
                    duration: duration.weeks(12),
                    totalRewards: toWei(50_000)
                });
            });
        }
    });
});
