import Contracts from '../../components/Contracts';
import { Profiler } from '../../components/Profiler';
import {
    BancorVault,
    IERC20,
    NetworkSettings,
    PoolToken,
    TestBancorNetwork,
    TestFlashLoanRecipient,
    TestNetworkTokenPool,
    TestPendingWithdrawals,
    TestPoolCollection
} from '../../typechain';
import { MAX_UINT256, NATIVE_TOKEN_ADDRESS, PPM_RESOLUTION, ZERO_ADDRESS } from '../helpers/Constants';
import { BNT, ETH, TKN } from '../helpers/Constants';
import { createPool, createSystem, depositToPool, setupSimplePool, PoolSpec } from '../helpers/Factory';
import { permitSignature } from '../helpers/Permit';
import { latest } from '../helpers/Time';
import { toDecimal, toWei } from '../helpers/Types';
import { createTokenBySymbol, createWallet, transfer, TokenWithAddress } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, ContractTransaction, Signer, utils, Wallet } from 'ethers';
import { ethers, waffle } from 'hardhat';
import { camelCase } from 'lodash';

const { formatBytes32String } = utils;

describe('@profile Profile', () => {
    const profiler = new Profiler();
    let deployer: SignerWithAddress;

    const INITIAL_RATE = { n: BigNumber.from(1), d: BigNumber.from(2) };

    before(async () => {
        [deployer] = await ethers.getSigners();
    });

    after(async () => {
        profiler.printSummary();
    });

    const networkPermitSignature = async (
        sender: Wallet,
        tokenAddress: string,
        network: TestBancorNetwork,
        amount: BigNumber,
        deadline: BigNumber
    ) => {
        if (
            tokenAddress === NATIVE_TOKEN_ADDRESS ||
            tokenAddress === ZERO_ADDRESS ||
            tokenAddress === (await network.networkToken())
        ) {
            return {
                v: BigNumber.from(0),
                r: formatBytes32String(''),
                s: formatBytes32String('')
            };
        }

        const reserveToken = await Contracts.TestERC20Token.attach(tokenAddress);
        const senderAddress = await sender.getAddress();

        const nonce = await reserveToken.nonces(senderAddress);

        return permitSignature(
            sender,
            await reserveToken.name(),
            reserveToken.address,
            network.address,
            amount,
            nonce,
            deadline
        );
    };

    const specToString = (spec: PoolSpec) => {
        if (spec.tradingFeePPM !== undefined) {
            return `${spec.symbol} (balance=${spec.balance}, fee=${feeToString(spec.tradingFeePPM)})`;
        }

        return `${spec.symbol} (balance=${spec.balance})`;
    };

    const initWithdraw = async (
        provider: SignerWithAddress,
        pendingWithdrawals: TestPendingWithdrawals,
        poolToken: PoolToken,
        amount: BigNumber
    ) => {
        await poolToken.connect(provider).approve(pendingWithdrawals.address, amount);
        await pendingWithdrawals.connect(provider).initWithdrawal(poolToken.address, amount);

        const withdrawalRequestIds = await pendingWithdrawals.withdrawalRequestIds(provider.address);
        const id = withdrawalRequestIds[withdrawalRequestIds.length - 1];
        const withdrawalRequest = await pendingWithdrawals.withdrawalRequest(id);
        const creationTime = withdrawalRequest.createdAt;

        return { id, creationTime };
    };

    const feeToString = (feePPM: number) => `${toDecimal(feePPM).mul(100).div(toDecimal(PPM_RESOLUTION))}%`;

    describe('deposit', () => {
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let networkToken: IERC20;
        let poolCollection: TestPoolCollection;
        let pendingWithdrawals: TestPendingWithdrawals;

        const MAX_DEVIATION = BigNumber.from(10_000); // %1
        const MINTING_LIMIT = toWei(BigNumber.from(10_000_000));
        const WITHDRAWAL_FEE = BigNumber.from(50_000); // 5%
        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(100_000));
        const DEPOSIT_LIMIT = toWei(BigNumber.from(100_000_000));

        const setup = async () => {
            ({ network, networkSettings, networkToken, poolCollection, pendingWithdrawals } = await createSystem());

            await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
            await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);
            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
        };

        beforeEach(async () => {
            await waffle.loadFixture(setup);
        });

        const testDeposits = (symbol: string) => {
            const isNetworkToken = symbol === BNT;
            const isETH = symbol === ETH;

            let token: TokenWithAddress;

            beforeEach(async () => {
                if (isNetworkToken) {
                    token = networkToken;
                } else {
                    token = await createTokenBySymbol(symbol);
                }

                if (!isNetworkToken) {
                    await createPool(token, network, networkSettings, poolCollection);

                    await networkSettings.setPoolMintingLimit(token.address, MINTING_LIMIT);

                    await poolCollection.setDepositLimit(token.address, DEPOSIT_LIMIT);
                    await poolCollection.setInitialRate(token.address, INITIAL_RATE);
                }

                await setTime((await latest()).toNumber());
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

                                value ||= isETH ? amount : BigNumber.from(0);

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
                                const test = async () => await profiler.profile(`deposit ${symbol}`, deposit(amount));

                                context(`${amount} tokens`, () => {
                                    if (!isETH) {
                                        beforeEach(async () => {
                                            const reserveToken = await Contracts.TestERC20Token.attach(token.address);
                                            await reserveToken.transfer(sender.address, amount);
                                        });
                                    }

                                    context('with an approval', () => {
                                        if (!isETH) {
                                            beforeEach(async () => {
                                                const reserveToken = await Contracts.TestERC20Token.attach(
                                                    token.address
                                                );
                                                await reserveToken.connect(sender).approve(network.address, amount);
                                            });
                                        }

                                        if (isNetworkToken) {
                                            context('with requested liquidity', () => {
                                                beforeEach(async () => {
                                                    const contextId = formatBytes32String('CTX');

                                                    const reserveToken = await createTokenBySymbol(TKN);

                                                    await createPool(
                                                        reserveToken,
                                                        network,
                                                        networkSettings,
                                                        poolCollection
                                                    );
                                                    await networkSettings.setPoolMintingLimit(
                                                        reserveToken.address,
                                                        MINTING_LIMIT
                                                    );

                                                    await network.requestLiquidityT(
                                                        contextId,
                                                        reserveToken.address,
                                                        amount
                                                    );
                                                });

                                                it('should complete a deposit', async () => {
                                                    await test();
                                                });
                                            });
                                        } else {
                                            context('when there is no unallocated network token liquidity', () => {
                                                beforeEach(async () => {
                                                    await networkSettings.setPoolMintingLimit(
                                                        token.address,
                                                        BigNumber.from(0)
                                                    );
                                                });

                                                context('with a whitelisted token', async () => {
                                                    it('should complete a deposit', async () => {
                                                        await test();
                                                    });
                                                });
                                            });

                                            context('when there is enough unallocated network token liquidity', () => {
                                                beforeEach(async () => {
                                                    await networkSettings.setPoolMintingLimit(
                                                        token.address,
                                                        MAX_UINT256
                                                    );
                                                });

                                                context('when spot rate is stable', () => {
                                                    it('should complete a deposit', async () => {
                                                        await test();
                                                    });
                                                });
                                            });
                                        }
                                    });
                                });
                            };

                            for (const amount of [
                                BigNumber.from(10),
                                BigNumber.from(10_000),
                                toWei(BigNumber.from(1_000_000))
                            ]) {
                                testDepositAmount(amount);
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

                                const { v, r, s } = await networkPermitSignature(
                                    sender,
                                    poolAddress,
                                    network,
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
                                const test = async () => profiler.profile(`deposit ${symbol}`, deposit(amount));

                                context(`${amount} tokens`, () => {
                                    if (isNetworkToken || isETH) {
                                        return;
                                    }

                                    beforeEach(async () => {
                                        const reserveToken = await Contracts.TestERC20Token.attach(token.address);
                                        await reserveToken.transfer(senderAddress, amount);
                                    });

                                    context('when there is no unallocated network token liquidity', () => {
                                        beforeEach(async () => {
                                            await networkSettings.setPoolMintingLimit(token.address, BigNumber.from(0));
                                        });

                                        context('with a whitelisted token', async () => {
                                            it('should complete a deposit', async () => {
                                                await test();
                                            });
                                        });
                                    });

                                    context('when there is enough unallocated network token liquidity', () => {
                                        beforeEach(async () => {
                                            await networkSettings.setPoolMintingLimit(token.address, MAX_UINT256);
                                        });

                                        context('when spot rate is stable', () => {
                                            it('should complete a deposit', async () => {
                                                await test();
                                            });
                                        });
                                    });
                                });
                            };

                            for (const amount of [
                                BigNumber.from(10),
                                BigNumber.from(10_000),
                                toWei(BigNumber.from(1_000_000))
                            ]) {
                                testDepositAmount(amount);
                            }
                        });
                    }
                });
            };

            testDeposit();
            testDepositPermitted();
        };

        for (const symbol of [BNT, ETH, TKN]) {
            context(symbol, () => {
                testDeposits(symbol);
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
        let networkPoolToken: PoolToken;

        const MAX_DEVIATION = BigNumber.from(10_000); // %1
        const MINTING_LIMIT = toWei(BigNumber.from(10_000_000));
        const WITHDRAWAL_FEE = BigNumber.from(50_000); // 5%
        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(100_000));

        const setTime = async (time: number) => {
            await network.setTime(time);
            await pendingWithdrawals.setTime(time);
        };

        const setup = async () => {
            ({
                network,
                networkSettings,
                networkToken,
                govToken,
                poolCollection,
                pendingWithdrawals,
                networkPoolToken
            } = await createSystem());

            await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
            await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);
            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            await setTime((await latest()).toNumber());
        };

        beforeEach(async () => {
            await waffle.loadFixture(setup);
        });

        const testWithdraw = async (symbol: string) => {
            const isNetworkToken = symbol === BNT;
            const isETH = symbol === ETH;

            context('with an initiated withdrawal request', () => {
                let provider: SignerWithAddress;
                let poolToken: PoolToken;
                let token: TokenWithAddress;
                let poolTokenAmount: BigNumber;
                let id: BigNumber;
                let creationTime: number;

                before(async () => {
                    [, provider] = await ethers.getSigners();
                });

                beforeEach(async () => {
                    if (isNetworkToken) {
                        token = networkToken;
                    } else {
                        token = await createTokenBySymbol(symbol);
                    }

                    // create a deposit
                    const amount = toWei(BigNumber.from(222_222_222));

                    if (isNetworkToken) {
                        poolToken = networkPoolToken;

                        const contextId = formatBytes32String('CTX');
                        const reserveToken = await createTokenBySymbol(TKN);
                        await networkSettings.setPoolMintingLimit(reserveToken.address, MAX_UINT256);

                        await network.requestLiquidityT(contextId, reserveToken.address, amount);
                    } else {
                        poolToken = await createPool(token, network, networkSettings, poolCollection);

                        await networkSettings.setPoolMintingLimit(token.address, MINTING_LIMIT);

                        await poolCollection.setDepositLimit(token.address, MAX_UINT256);
                        await poolCollection.setInitialRate(token.address, INITIAL_RATE);
                    }

                    await depositToPool(provider, token, amount, network);

                    poolTokenAmount = await poolToken.balanceOf(provider.address);

                    ({ id, creationTime } = await initWithdraw(
                        provider,
                        pendingWithdrawals,
                        poolToken,
                        await poolToken.balanceOf(provider.address)
                    ));
                });

                context('during the lock duration', () => {
                    beforeEach(async () => {
                        await setTime(creationTime + 1000);
                    });

                    context('after the withdrawal window duration', () => {
                        beforeEach(async () => {
                            const withdrawalDuration =
                                (await pendingWithdrawals.lockDuration()) +
                                (await pendingWithdrawals.withdrawalWindowDuration());
                            await setTime(creationTime + withdrawalDuration + 1);
                        });
                    });

                    context('during the withdrawal window duration', () => {
                        beforeEach(async () => {
                            const withdrawalDuration =
                                (await pendingWithdrawals.lockDuration()) +
                                (await pendingWithdrawals.withdrawalWindowDuration());
                            await setTime(creationTime + withdrawalDuration - 1);
                        });

                        context('with approvals', () => {
                            beforeEach(async () => {
                                if (isNetworkToken) {
                                    await govToken.connect(provider).approve(network.address, poolTokenAmount);
                                }
                            });

                            const test = async () =>
                                profiler.profile(`withdraw ${symbol}`, network.connect(provider).withdraw(id));

                            if (isNetworkToken) {
                                it('should complete a withdraw', async () => {
                                    await test();
                                });
                            } else {
                                context('when spot rate is unstable', () => {
                                    beforeEach(async () => {
                                        const spotRate = {
                                            n: toWei(BigNumber.from(1_000_000)),
                                            d: toWei(BigNumber.from(10_000_000))
                                        };

                                        const { stakedBalance } = await poolCollection.poolLiquidity(token.address);
                                        await poolCollection.setTradingLiquidityT(token.address, {
                                            networkTokenTradingLiquidity: spotRate.n,
                                            baseTokenTradingLiquidity: spotRate.d,
                                            tradingLiquidityProduct: spotRate.n.mul(spotRate.d),
                                            stakedBalance
                                        });
                                        await poolCollection.setAverageRateT(token.address, {
                                            rate: {
                                                n: spotRate.n.mul(PPM_RESOLUTION),
                                                d: spotRate.d.mul(
                                                    PPM_RESOLUTION.add(MAX_DEVIATION.add(BigNumber.from(5000)))
                                                )
                                            },
                                            time: BigNumber.from(0)
                                        });
                                    });
                                });

                                context('when spot rate is stable', () => {
                                    it('should complete a withdraw', async () => {
                                        await test();
                                    });
                                });
                            }
                        });
                    });
                });
            });
        };

        for (const symbol of [BNT, ETH, TKN]) {
            context(symbol, () => {
                testWithdraw(symbol);
            });
        }
    });

    describe('trade', () => {
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let networkToken: IERC20;
        let poolCollection: TestPoolCollection;

        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(100_000));
        const NETWORK_TOKEN_LIQUIDITY = toWei(BigNumber.from(100_000));
        const MIN_RETURN_AMOUNT = BigNumber.from(1);

        let sourceToken: TokenWithAddress;
        let targetToken: TokenWithAddress;

        let trader: Wallet;

        beforeEach(async () => {
            ({ network, networkSettings, networkToken, poolCollection } = await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
        });

        const setupPools = async (source: PoolSpec, target: PoolSpec) => {
            trader = await createWallet();

            ({ token: sourceToken } = await setupSimplePool(
                source,
                deployer,
                network,
                networkSettings,
                poolCollection
            ));

            ({ token: targetToken } = await setupSimplePool(
                target,
                deployer,
                network,
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

            const { v, r, s } = await networkPermitSignature(
                trader,
                sourceTokenAddress,
                network,
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

        const verifyTrade = async (
            trader: Signer | Wallet,
            beneficiaryAddress: string,
            amount: BigNumber,
            trade: (
                amount: BigNumber,
                options: TradeOverrides | TradePermittedOverrides
            ) => Promise<ContractTransaction>
        ) => {
            const isSourceETH = sourceToken.address === NATIVE_TOKEN_ADDRESS;
            const isTargetETH = targetToken.address === NATIVE_TOKEN_ADDRESS;
            const isSourceNetworkToken = sourceToken.address === networkToken.address;
            const isTargetNetworkToken = targetToken.address === networkToken.address;

            const traderAddress = await trader.getAddress();
            const minReturnAmount = MIN_RETURN_AMOUNT;
            const deadline = MAX_UINT256;

            const sourceSymbol = isSourceNetworkToken ? BNT : isSourceETH ? ETH : TKN;
            const targetSymbol = isTargetNetworkToken ? BNT : isTargetETH ? ETH : TKN;
            await profiler.profile(
                `trade ${sourceSymbol} -> ${targetSymbol}`,
                trade(amount, { minReturnAmount, beneficiary: beneficiaryAddress, deadline })
            );
        };

        interface TradeAmountsOverrides {
            sourceTokenAddress?: string;
            targetTokenAddress?: string;
        }

        const testTrades = (source: PoolSpec, target: PoolSpec, amount: BigNumber) => {
            const isSourceETH = source.symbol === ETH;

            context(`trade ${amount} tokens from ${specToString(source)} to ${specToString(target)}`, () => {
                const TRADES_COUNT = 2;

                const test = async () => {
                    if (!isSourceETH) {
                        const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);
                        await reserveToken.connect(trader).approve(network.address, amount);
                    }

                    await verifyTrade(trader, ZERO_ADDRESS, amount, trade);
                };

                beforeEach(async () => {
                    await setupPools(source, target);

                    if (!isSourceETH) {
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
            const isSourceETH = source.symbol === ETH;
            const isSourceNetworkToken = source.symbol === BNT;

            context(`trade permitted ${amount} tokens from ${specToString(source)} to ${specToString(target)}`, () => {
                const test = async () => verifyTrade(trader, ZERO_ADDRESS, amount, tradePermitted);

                beforeEach(async () => {
                    await setupPools(source, target);

                    if (!isSourceETH) {
                        const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);
                        await reserveToken.transfer(trader.address, amount);
                    }
                });

                if (isSourceNetworkToken || isSourceETH) {
                    return;
                }

                it('should complete a trade', async () => {
                    await test();
                });
            });
        };

        for (const [sourceSymbol, targetSymbol] of [
            [TKN, BNT],
            [TKN, ETH],
            [`${TKN}1`, `${TKN}2`],
            [BNT, ETH],
            [BNT, TKN],
            [ETH, BNT],
            [ETH, TKN]
        ]) {
            testPermittedTrades(
                {
                    symbol: sourceSymbol,
                    balance: toWei(BigNumber.from(1_000_000)),
                    initialRate: INITIAL_RATE
                },
                {
                    symbol: targetSymbol,
                    balance: toWei(BigNumber.from(5_000_000)),
                    initialRate: INITIAL_RATE
                },
                toWei(BigNumber.from(100_000))
            );

            for (const sourceBalance of [toWei(BigNumber.from(1_000_000)), toWei(BigNumber.from(50_000_000))]) {
                for (const targetBalance of [toWei(BigNumber.from(1_000_000)), toWei(BigNumber.from(50_000_000))]) {
                    for (const amount of [BigNumber.from(10_000), toWei(BigNumber.from(500_000))]) {
                        const TRADING_FEES = [0, 50_000];
                        for (const tradingFeePPM of TRADING_FEES) {
                            const isSourceNetworkToken = sourceSymbol === BNT;
                            const isTargetNetworkToken = targetSymbol === BNT;

                            // if either the source or the target token is the network token - only test fee in one of
                            // the directions
                            if (isSourceNetworkToken || isTargetNetworkToken) {
                                testTrades(
                                    {
                                        symbol: sourceSymbol,
                                        balance: sourceBalance,
                                        tradingFeePPM: isSourceNetworkToken ? undefined : tradingFeePPM,
                                        initialRate: INITIAL_RATE
                                    },
                                    {
                                        symbol: targetSymbol,
                                        balance: targetBalance,
                                        tradingFeePPM: isTargetNetworkToken ? undefined : tradingFeePPM,
                                        initialRate: INITIAL_RATE
                                    },
                                    amount
                                );
                            } else {
                                for (const tradingFeePPM2 of TRADING_FEES) {
                                    testTrades(
                                        {
                                            symbol: sourceSymbol,
                                            balance: sourceBalance,
                                            tradingFeePPM,
                                            initialRate: INITIAL_RATE
                                        },
                                        {
                                            symbol: targetSymbol,
                                            balance: targetBalance,
                                            tradingFeePPM: tradingFeePPM2,
                                            initialRate: INITIAL_RATE
                                        },
                                        amount
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
        let networkSettings: NetworkSettings;
        let networkToken: IERC20;
        let networkTokenPool: TestNetworkTokenPool;
        let poolCollection: TestPoolCollection;
        let bancorVault: BancorVault;
        let recipient: TestFlashLoanRecipient;
        let token: TokenWithAddress;

        const amount = toWei(BigNumber.from(123456));

        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(100_000));
        const ZERO_BYTES32 = formatBytes32String('');

        const setup = async () => {
            ({ network, networkSettings, networkToken, networkTokenPool, poolCollection, bancorVault } =
                await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
            await networkSettings.setPoolMintingLimit(networkToken.address, MAX_UINT256);

            recipient = await Contracts.TestFlashLoanRecipient.deploy(network.address);
        };

        beforeEach(async () => {
            await waffle.loadFixture(setup);
        });

        const testFlashLoan = async (symbol: string, flashLoanFeePPM: BigNumber) => {
            const feeAmount = amount.mul(flashLoanFeePPM).div(PPM_RESOLUTION);

            beforeEach(async () => {
                if (symbol === BNT) {
                    token = networkToken;

                    const reserveToken = await createTokenBySymbol(TKN);

                    await networkSettings.setPoolMintingLimit(reserveToken.address, MAX_UINT256);
                    await network.requestLiquidityT(ZERO_BYTES32, reserveToken.address, amount);

                    await depositToPool(deployer, networkToken, amount, network);
                } else {
                    ({ token } = await setupSimplePool(
                        {
                            symbol,
                            balance: amount,
                            initialRate: INITIAL_RATE
                        },
                        deployer,
                        network,
                        networkSettings,
                        poolCollection
                    ));
                }

                await networkSettings.setFlashLoanFeePPM(flashLoanFeePPM);

                await transfer(deployer, token, recipient.address, feeAmount);
                await recipient.snapshot(token.address);
            });

            const test = async () => {
                const data = '0x1234';
                await profiler.profile(
                    `flash-loan ${symbol}`,
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

        for (const symbol of [BNT, ETH, TKN]) {
            for (const flashLoanFeePPM of [0, 10_000, 100_000]) {
                context(`${symbol} with fee=${feeToString(flashLoanFeePPM)}`, () => {
                    testFlashLoan(symbol, BigNumber.from(flashLoanFeePPM));
                });
            }
        }
    });
});
