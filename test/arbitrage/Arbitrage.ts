import Contracts, {
    BancorNetworkInfo,
    MasterVault,
    NetworkSettings,
    TestArbitrage,
    TestBancorNetwork,
    TestFlashLoanRecipient,
    TestPoolCollection,
    IERC20,
    TestBNTPool
} from '../../components/Contracts';
import { NATIVE_TOKEN_ADDRESS, TokenData, TokenSymbol } from '../../utils/TokenData';
import { toPPM, toWei } from '../../utils/Types';
import { Roles } from '../helpers/AccessControl';
import { createSystem, createTestToken, depositToPool, PoolSpec, setupFundedPool, specToString, TokenWithAddress } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { getBalance, getTransactionCost, transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber, BigNumberish, ContractTransaction, utils } from 'ethers';
import { MAX_UINT256, PPM_RESOLUTION, ZERO_ADDRESS } from '../../utils/Constants';
const { solidityKeccak256, formatBytes32String } = utils;
import { latest } from '../helpers/Time';
import { TradeAmountAndFeeStructOutput } from '../../typechain-types/contracts/pools/PoolCollection';

describe('Arbitrage', () => {
    let deployer: SignerWithAddress;
    let nonOwner: SignerWithAddress;

    const BNT_VIRTUAL_BALANCE = 1;
    const BASE_TOKEN_VIRTUAL_BALANCE = 2;
    const MIN_LIQUIDITY_FOR_TRADING = toWei(1000);
    const CONTEXT_ID = formatBytes32String('CTX');
    const MIN_RETURN_AMOUNT = BigNumber.from(1);

    shouldHaveGap('BancorNetwork', '_bntPool');

    before(async () => {
        [deployer, nonOwner] = await ethers.getSigners();
    });

    describe('trade', () => {
        let network: TestBancorNetwork;
        let networkInfo: BancorNetworkInfo;
        let networkSettings: NetworkSettings;
        let bnt: IERC20;
        let bntPool: TestBNTPool;
        let poolCollection: TestPoolCollection;
        let masterVault: MasterVault;

        let sourceToken: TokenWithAddress;
        let targetToken: TokenWithAddress;

        let trader: SignerWithAddress;
        let emergencyStopper: SignerWithAddress;

        let arbitrage: TestArbitrage;

        before(async () => {
            [, trader, emergencyStopper] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ network, networkInfo, networkSettings, bnt, bntPool, poolCollection, masterVault, arbitrage } =
                await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            await network
                .connect(deployer)
                .grantRole(Roles.BancorNetwork.ROLE_EMERGENCY_STOPPER, emergencyStopper.address);
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

        const tradeBySourceAmount = async (amount: BigNumberish, overrides: TradeOverrides = {}, simulate = false) => {
            let {
                value,
                limit: minReturnAmount = MIN_RETURN_AMOUNT,
                deadline = MAX_UINT256,
                beneficiary = ZERO_ADDRESS,
                sourceTokenAddress = sourceToken.address,
                targetTokenAddress = targetToken.address
            } = overrides;

            value ||= sourceTokenAddress === NATIVE_TOKEN_ADDRESS ? amount : BigNumber.from(0);

            const method = simulate ? arbitrage.connect(trader).callStatic : arbitrage.connect(trader);

            return method.swap(
                amount, sourceToken.address, targetToken.address,
                {
                    value
                }
            )

            // const method = simulate ? network.connect(trader).callStatic : network.connect(trader);
            // return method.tradeBySourceAmount(
            //     sourceTokenAddress,
            //     targetTokenAddress,
            //     amount,
            //     minReturnAmount,
            //     deadline,
            //     beneficiary,
            //     {
            //         value
            //     }
            // );
        };

        const verifyTrade = async (
            trader: SignerWithAddress,
            beneficiaryAddress: string,
            amount: BigNumberish,
            tradeFunc: (
                amount: BigNumberish,
                options: TradeOverrides,
                simulate: boolean
            ) => Promise<ContractTransaction | BigNumber | void>
        ) => {
            const isSourceNativeToken = sourceToken.address === NATIVE_TOKEN_ADDRESS;
            const isTargetNativeToken = targetToken.address === NATIVE_TOKEN_ADDRESS;
            const isSourceBNT = sourceToken.address === bnt.address;
            const isTargetBNT = targetToken.address === bnt.address;

            const traderAddress = await trader.getAddress();
            const deadline = MAX_UINT256;
            const beneficiary = beneficiaryAddress !== ZERO_ADDRESS ? beneficiaryAddress : traderAddress;

            const prevTraderSourceTokenAmount = await getBalance(sourceToken, traderAddress);
            const prevVaultSourceTokenAmount = await getBalance(sourceToken, masterVault.address);

            const prevBeneficiaryTargetTokenAmount = await getBalance(targetToken, beneficiary);
            const prevVaultTargetTokenAmount = await getBalance(targetToken, masterVault.address);

            const prevTraderBNTAmount = await getBalance(bnt, traderAddress);
            const prevBeneficiaryBNTAmount = await getBalance(bnt, beneficiary);
            const prevVaultBNTAmount = await getBalance(bnt, masterVault.address);

            const prevBNTPoolStakedBalance = await bntPool.stakedBalance();

            let hop1!: TradeAmountAndFeeStructOutput;
            let hop2!: TradeAmountAndFeeStructOutput;

            let limit: BigNumber;

            limit = MIN_RETURN_AMOUNT;

            if (isSourceBNT || isTargetBNT) {
                hop1 = await network.callStatic.tradeBySourcePoolCollectionT(
                    poolCollection.address,
                    CONTEXT_ID,
                    sourceToken.address,
                    targetToken.address,
                    amount,
                    MIN_RETURN_AMOUNT
                );

                hop2 = hop1;
            } else {
                hop1 = await network.callStatic.tradeBySourcePoolCollectionT(
                    poolCollection.address,
                    CONTEXT_ID,
                    sourceToken.address,
                    bnt.address,
                    amount,
                    MIN_RETURN_AMOUNT
                );

                hop2 = await network.callStatic.tradeBySourcePoolCollectionT(
                    poolCollection.address,
                    CONTEXT_ID,
                    bnt.address,
                    targetToken.address,
                    hop1.amount,
                    MIN_RETURN_AMOUNT
                );
            }
        

            let sourceAmount: BigNumber;
            let targetAmount: BigNumber;
        
            // when providing the source amount, the input amount represents the source amount we are willing to trade
            sourceAmount = BigNumber.from(amount);
            targetAmount = await networkInfo.tradeOutputBySourceAmount(
                sourceToken.address,
                targetToken.address,
                amount
            );
            expect(targetAmount).to.equal(hop2.amount);

            let pendingNetworkFeeAmount = await network.pendingNetworkFeeAmount();
            if (isSourceBNT || isTargetBNT) {
                pendingNetworkFeeAmount = pendingNetworkFeeAmount.add(hop1.networkFeeAmount);
            } else {
                pendingNetworkFeeAmount = pendingNetworkFeeAmount.add(hop1.networkFeeAmount.add(hop2.networkFeeAmount));
            }

            const retVal = await tradeFunc(
                amount,
                {
                    limit,
                    beneficiary: beneficiaryAddress,
                    deadline
                },
                true
            );

            expect(retVal).to.equal(hop2.amount);

            const res = await tradeFunc(
                amount,
                {
                    limit,
                    beneficiary: beneficiaryAddress,
                    deadline
                },
                false
            );

            const transactionCost = await getTransactionCost(res as ContractTransaction);

            const contextId = solidityKeccak256(
                ['address', 'uint32', 'address', 'address', 'uint256', 'uint256', 'bool', 'uint256', 'address'],
                [
                    traderAddress,
                    await network.currentTime(),
                    sourceToken.address,
                    targetToken.address,
                    amount,
                    limit,
                    true,
                    deadline,
                    beneficiary
                ]
            );

            const bntPoolStakedBalance = await bntPool.stakedBalance();

            if (isSourceBNT) {
                await expect(res)
                    .to.emit(network, 'TokensTraded')
                    .withArgs(
                        contextId,
                        bnt.address,
                        targetToken.address,
                        sourceAmount,
                        targetAmount,
                        sourceAmount,
                        hop2.tradingFeeAmount,
                        0,
                        traderAddress
                    );
            } else if (isTargetBNT) {
                await expect(res)
                    .to.emit(network, 'TokensTraded')
                    .withArgs(
                        contextId,
                        sourceToken.address,
                        bnt.address,
                        sourceAmount,
                        targetAmount,
                        targetAmount,
                        hop2.tradingFeeAmount,
                        hop2.tradingFeeAmount,
                        traderAddress
                    );

                expect(bntPoolStakedBalance).to.equal(
                    prevBNTPoolStakedBalance.add(hop2.tradingFeeAmount.sub(hop2.networkFeeAmount))
                );
            } else {
                await expect(res)
                    .to.emit(network, 'TokensTraded')
                    .withArgs(
                        contextId,
                        sourceToken.address,
                        targetToken.address,
                        sourceAmount,
                        targetAmount,
                        // when providing the source amount, the source amount represents how much BNT we were required
                        // to trade, while when providing the target amount, it represents how many target tokens we
                        // have received by trading BNT for them
                        hop1.amount,
                        hop2.tradingFeeAmount,
                        hop1.tradingFeeAmount,
                        traderAddress
                    );

                expect(bntPoolStakedBalance).to.equal(
                    prevBNTPoolStakedBalance.add(hop1.tradingFeeAmount.sub(hop1.networkFeeAmount))
                );
            }

            expect(await network.pendingNetworkFeeAmount()).to.equal(pendingNetworkFeeAmount);

            // ensure that the correct amount was transferred from the trader to the vault
            expect(await getBalance(sourceToken, traderAddress)).to.equal(
                prevTraderSourceTokenAmount.sub(
                    sourceAmount.add(isSourceNativeToken ? transactionCost : BigNumber.from(0))
                )
            );
            expect(await getBalance(sourceToken, masterVault.address)).to.equal(
                prevVaultSourceTokenAmount.add(sourceAmount)
            );

            // ensure that the correct amount was sent back to the trader
            expect(await getBalance(targetToken, beneficiary)).to.equal(
                prevBeneficiaryTargetTokenAmount.add(
                    targetAmount.sub(
                        traderAddress === beneficiary && isTargetNativeToken ? transactionCost : BigNumber.from(0)
                    )
                )
            );
            expect(await getBalance(targetToken, masterVault.address)).to.equal(
                prevVaultTargetTokenAmount.sub(targetAmount)
            );

            // if neither the source nor the target tokens is BNT - ensure that no BNT have left the system
            if (!isSourceBNT && !isTargetBNT) {
                expect(await getBalance(bnt, traderAddress)).to.equal(prevTraderBNTAmount);
                expect(await getBalance(bnt, beneficiary)).to.equal(prevBeneficiaryBNTAmount);
                expect(await getBalance(bnt, masterVault.address)).to.equal(prevVaultBNTAmount);
            }
        };

        const approve = async (amount: BigNumberish) => {
            const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);

            let sourceAmount = amount;

            await reserveToken.transfer(await trader.getAddress(), sourceAmount);
            await reserveToken.connect(trader).approve(network.address, sourceAmount);
        };

        const testTrades = (source: PoolSpec, target: PoolSpec, amount: BigNumber) => {
            const isSourceNativeToken = source.tokenData.isNative();

            context(`trade ${amount} tokens from ${specToString(source)} to ${specToString(target)}`, () => {
                beforeEach(async () => {
                    await setupPools(source, target);
                });

                    context(`by providing the source amount`, () => {
                        const tradeFunc = tradeBySourceAmount;

                        const TRADES_COUNT = 2;

                        it('should complete multiple trades', async () => {
                            const currentBlockNumber = await poolCollection.currentBlockNumber();

                            for (let i = 0; i < TRADES_COUNT; i++) {
                                if (!isSourceNativeToken) {
                                    await approve(amount);
                                }

                                await verifyTrade(trader, ZERO_ADDRESS, amount, tradeFunc);
                                await poolCollection.setBlockNumber(currentBlockNumber + i + 1);
                            }
                        });
                    });
                
            });
        };

        for (const [sourceSymbol, targetSymbol] of [
            // [TokenSymbol.TKN, TokenSymbol.BNT],
            // [TokenSymbol.TKN, TokenSymbol.ETH],
            // [TokenSymbol.TKN1, TokenSymbol.TKN2],
            // [TokenSymbol.BNT, TokenSymbol.ETH],
            [TokenSymbol.BNT, TokenSymbol.TKN],
            // [TokenSymbol.ETH, TokenSymbol.BNT],
            // [TokenSymbol.ETH, TokenSymbol.TKN]
        ]) {
            const sourceTokenData = new TokenData(sourceSymbol);
            const targetTokenData = new TokenData(targetSymbol);

            for (const sourceBalance of [toWei(1_000_000)]) {
                for (const targetBalance of [toWei(100_000_000)]) {
                    for (const amount of [toWei(1000)]) {
                        for (const tradingFeePercent of [5]) {
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
                                for (const tradingFeePercent2 of [10]) {
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


    // describe('flash-loans', () => {
    //     let network: TestBancorNetwork;
    //     let networkInfo: BancorNetworkInfo;
    //     let networkSettings: NetworkSettings;

    //     let poolCollection: TestPoolCollection;
    //     let masterVault: MasterVault;
    //     let recipient: TestFlashLoanRecipient;
    //     let token: TokenWithAddress;
    //     let emergencyStopper: SignerWithAddress;
    //     let arbitrage: TestArbitrage;

    //     before(async () => {
    //         [, emergencyStopper] = await ethers.getSigners();
    //     });

    //     const BALANCE = toWei(100_000_000);
    //     const LOAN_AMOUNT = toWei(123_456);

    //     beforeEach(async () => {
    //         ({ network, networkInfo, networkSettings, poolCollection, masterVault, arbitrage } = await createSystem());

    //         await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

    //         await network
    //             .connect(deployer)
    //             .grantRole(Roles.BancorNetwork.ROLE_EMERGENCY_STOPPER, emergencyStopper.address);

    //         recipient = await Contracts.TestFlashLoanRecipient.deploy(network.address);
    //     });

    //     const testFlashLoan = (tokenData: TokenData, flashLoanFeePPM: number) => {
    //         const FEE_AMOUNT = LOAN_AMOUNT.mul(flashLoanFeePPM).div(PPM_RESOLUTION);

    //         beforeEach(async () => {
    //             ({ token } = await setupFundedPool(
    //                 {
    //                     tokenData,
    //                     balance: BALANCE,
    //                     requestedFunding: BALANCE.mul(1000),
    //                     bntVirtualBalance: BNT_VIRTUAL_BALANCE,
    //                     baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
    //                 },
    //                 deployer,
    //                 network,
    //                 networkInfo,
    //                 networkSettings,
    //                 poolCollection
    //             ));

    //             await networkSettings.setFlashLoanFeePPM(token.address, flashLoanFeePPM);

    //             await transfer(deployer, token, recipient.address, FEE_AMOUNT);
    //             await recipient.snapshot(token.address);
    //         });

    //         context('returning just about right', () => {
    //             beforeEach(async () => {
    //                 await recipient.setAmountToReturn(LOAN_AMOUNT.add(FEE_AMOUNT));
    //             });

    //             it('should run a flash loan from the arbitrage contract', async () => {
    //                 const prevVaultBalance = await getBalance(token, masterVault.address);
    //                 const prevBNTBalance = await getBalance(token, network.address);

    //                 const token1 = TokenSymbol.TKN1;
    //                 const res = await arbitrage.arbitrage(LOAN_AMOUNT, recipient.address, token1);

    //                 await expect(res)
    //                     .to.emit(network, 'FlashLoanCompleted')
    //                     .withArgs(token.address, arbitrage.address, LOAN_AMOUNT, FEE_AMOUNT);

    //                 const callbackData = await recipient.callbackData();
    //                 expect(callbackData.caller).to.equal(arbitrage.address);
    //                 expect(callbackData.token).to.equal(token.address);
    //                 expect(callbackData.amount).to.equal(LOAN_AMOUNT);
    //                 expect(callbackData.feeAmount).to.equal(FEE_AMOUNT);
    //                 // expect(callbackData.data).to.equal('0x');
    //                 expect(callbackData.receivedAmount).to.equal(LOAN_AMOUNT);

    //                 expect(await getBalance(token, masterVault.address)).to.be.gte(prevVaultBalance.add(FEE_AMOUNT));
    //                 expect(await getBalance(token, network.address)).to.equal(prevBNTBalance);
    //             });
    //         });
    //     };

    //     const symbol = TokenSymbol.BNT;
    //     const flashLoanFee = 2.5;

    //     context(`${symbol} with fee=${flashLoanFee}%`, () => {
    //         testFlashLoan(new TokenData(symbol), toPPM(flashLoanFee));
    //     });
    // });
});
