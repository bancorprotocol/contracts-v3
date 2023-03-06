import Contracts, {
    BancorArbitrage,
    BancorNetworkInfo,
    IERC20,
    MasterVault,
    MockExchanges,
    NetworkSettings,
    TestBancorNetwork,
    TestPoolCollection,
    TestWETH
} from '../../components/Contracts';
import { ExchangeId, MAX_UINT256, ZERO_ADDRESS } from '../../utils/Constants';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { toPPM, toWei } from '../../utils/Types';
import {
    createProxy,
    createSystem,
    createTestToken,
    depositToPool,
    setupFundedPool,
    TokenWithAddress
} from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { getEvent, parseLog, transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('BancorArbitrage', () => {
    let network: TestBancorNetwork;
    let networkInfo: BancorNetworkInfo;
    let bnt: IERC20;
    let networkSettings: NetworkSettings;
    let poolCollection: TestPoolCollection;
    let bancorArbitrage: BancorArbitrage;
    let masterVault: MasterVault;

    let exchanges: MockExchanges;
    let bancorV2: MockExchanges;
    let bancorV3: MockExchanges;
    let uniswapV2Router: MockExchanges;
    let uniswapV3Router: MockExchanges;
    let sushiswapV2Router: MockExchanges;
    let weth: TestWETH;
    let baseToken: TokenWithAddress;

    let deployer: SignerWithAddress;
    let user: SignerWithAddress;
    let nonOwner: SignerWithAddress;

    const BNT_VIRTUAL_BALANCE = 1;
    const BASE_TOKEN_VIRTUAL_BALANCE = 2;
    const MAX_SOURCE_AMOUNT = toWei(100000000);
    const DEADLINE = MAX_UINT256;
    const AMOUNT = toWei(1000);
    const PPM_RESOLUTION = 1_000_000;
    const MIN_LIQUIDITY_FOR_TRADING = toWei(1000);

    const ArbitrageRewardsDefaults = {
        percentagePPM: 30000,
        maxAmount: toWei(100)
    };

    const ArbitrageRewardsChanged = {
        percentagePPM: 40000,
        maxAmount: toWei(200)
    };

    shouldHaveGap('BancorArbitrage', '_rewards');

    before(async () => {
        [deployer, user, nonOwner] = await ethers.getSigners();
    });

    beforeEach(async () => {
        ({ network, networkSettings, bnt, poolCollection, networkInfo, masterVault } = await createSystem());

        weth = await Contracts.TestWETH.deploy();
        await deployer.sendTransaction({ value: toWei(1_000_000_000), to: weth.address });

        baseToken = await createTestToken();
        exchanges = await Contracts.MockExchanges.deploy(weth.address, toWei(300), true);
        bancorV2 = exchanges;
        bancorV3 = exchanges;
        uniswapV2Router = exchanges;
        uniswapV3Router = exchanges;
        sushiswapV2Router = exchanges;

        bancorArbitrage = await createProxy(Contracts.BancorArbitrage, {
            ctorArgs: [
                bnt.address,
                bancorV2.address,
                network.address,
                uniswapV2Router.address,
                uniswapV3Router.address,
                sushiswapV2Router.address
            ]
        });

        await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
        await transfer(deployer, baseToken, exchanges.address, MAX_SOURCE_AMOUNT);
    });

    describe('construction', () => {
        it('should revert when initializing with an invalid bnt contract', async () => {
            await expect(
                Contracts.BancorArbitrage.deploy(
                    ZERO_ADDRESS,
                    bancorV2.address,
                    bancorV3.address,
                    uniswapV2Router.address,
                    uniswapV3Router.address,
                    sushiswapV2Router.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when initializing with an invalid Bancor v2 network contract', async () => {
            await expect(
                Contracts.BancorArbitrage.deploy(
                    bnt.address,
                    ZERO_ADDRESS,
                    bancorV3.address,
                    uniswapV2Router.address,
                    uniswapV3Router.address,
                    sushiswapV2Router.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when initializing with an invalid Bancor v3 network contract', async () => {
            await expect(
                Contracts.BancorArbitrage.deploy(
                    bnt.address,
                    bancorV2.address,
                    ZERO_ADDRESS,
                    uniswapV2Router.address,
                    uniswapV3Router.address,
                    sushiswapV2Router.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when initializing with an invalid Uniswap v2 router contract', async () => {
            await expect(
                Contracts.BancorArbitrage.deploy(
                    bnt.address,
                    bancorV2.address,
                    bancorV3.address,
                    ZERO_ADDRESS,
                    uniswapV3Router.address,
                    sushiswapV2Router.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when initializing with an invalid Uniswap v3 router contract', async () => {
            await expect(
                Contracts.BancorArbitrage.deploy(
                    bnt.address,
                    bancorV2.address,
                    bancorV3.address,
                    uniswapV2Router.address,
                    ZERO_ADDRESS,
                    sushiswapV2Router.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when initializing with an invalid Sushiswap router contract', async () => {
            await expect(
                Contracts.BancorArbitrage.deploy(
                    bnt.address,
                    bancorV2.address,
                    bancorV3.address,
                    uniswapV2Router.address,
                    uniswapV3Router.address,
                    ZERO_ADDRESS
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should be initialized', async () => {
            expect(await bancorArbitrage.version()).to.equal(2);
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(bancorArbitrage.initialize()).to.be.revertedWithError(
                'Initializable: contract is already initialized'
            );
        });
    });

    describe('rewards', () => {
        it('should revert when a non-admin attempts to set the arbitrage rewards settings', async () => {
            await expect(
                bancorArbitrage.connect(nonOwner).setRewards(ArbitrageRewardsDefaults)
            ).to.be.revertedWithError('AccessDenied');
        });

        it('should ignore setting to the same arbitrage rewards settings', async () => {
            await bancorArbitrage.setRewards(ArbitrageRewardsDefaults);

            const res = await bancorArbitrage.setRewards(ArbitrageRewardsDefaults);
            await expect(res).not.to.emit(bancorArbitrage, 'RewardsUpdated');
        });

        it('should be able to set and update the arbitrage rewards settings', async () => {
            await bancorArbitrage.setRewards(ArbitrageRewardsDefaults);

            const res = await bancorArbitrage.rewards();
            expect(res.percentagePPM).to.equal(100_000);

            const resChanged = await bancorArbitrage.setRewards(ArbitrageRewardsChanged);
            await expect(resChanged).to.emit(bancorArbitrage, 'RewardsUpdated');

            const resUpdated = await bancorArbitrage.rewards();
            expect(resUpdated.percentagePPM).to.equal(40_000);
        });

        describe('distribution and burn', () => {
            // get all exchange ids (omit their names)
            const exchangeIds = Object.values(ExchangeId).filter((key) => !isNaN(parseInt(key as string)));
            const tokenSymbols = [TokenSymbol.TKN1, TokenSymbol.TKN2, TokenSymbol.ETH];
            let arbToken1: TokenWithAddress;
            let arbToken2: TokenWithAddress;

            // remove BancorV3 exchange until the reentrancy guard issue is resolved
            exchangeIds.splice(exchangeIds.indexOf(ExchangeId.BancorV3), 1);

            beforeEach(async () => {
                await transfer(deployer, bnt, masterVault.address, AMOUNT.mul(10_000));
                await bancorArbitrage.setRewards(ArbitrageRewardsDefaults);
                const firstPool = await prepareBancorV3PoolAndToken(tokenSymbols[0]);
                const secondPool = await prepareBancorV3PoolAndToken(tokenSymbols[1]);
                arbToken1 = firstPool.token;
                arbToken2 = secondPool.token;
            });

            it('should correctly distribute rewards to caller and burn tokens', async () => {
                // transfer tokens to exchange
                await transfer(deployer, bnt, exchanges.address, AMOUNT.mul(10));
                await transfer(deployer, arbToken1, exchanges.address, AMOUNT.mul(10));
                await transfer(deployer, arbToken2, exchanges.address, AMOUNT.mul(10));

                const routes = [
                    {
                        exchangeId: ExchangeId.BancorV2,
                        targetToken: arbToken1.address,
                        minTargetAmount: 1,
                        deadline: DEADLINE,
                        customAddress: arbToken1.address,
                        customInt: 0
                    },
                    {
                        exchangeId: ExchangeId.Sushiswap,
                        targetToken: arbToken2.address,
                        minTargetAmount: 1,
                        deadline: DEADLINE,
                        customAddress: arbToken2.address,
                        customInt: 0
                    },
                    {
                        exchangeId: ExchangeId.BancorV2,
                        targetToken: bnt.address,
                        minTargetAmount: 1,
                        deadline: DEADLINE,
                        customAddress: bnt.address,
                        customInt: 0
                    }
                ];

                // each hop through the route from MockExchanges adds 300e18 tokens to the output
                // so 3 hops = 3 * 300e18 = 900 BNT tokens more than start
                // so with 0 flashloan fees, when we repay the flashloan, we have 900 BNT tokens as totalRewards

                const hopCount = 3;
                const totalRewards = toWei(300).mul(hopCount);

                await bancorArbitrage.setRewards(ArbitrageRewardsChanged);

                const rewards = await bancorArbitrage.rewards();

                // calculate expected user rewards based on total rewards and percentagePPM
                const expectedUserReward = totalRewards.mul(rewards.percentagePPM).div(PPM_RESOLUTION);

                // calculate how much bnt should be burnt based on the total rewards and the user rewards
                const expectedBntBurnt = totalRewards.sub(expectedUserReward);

                const userBalanceBefore = await bnt.balanceOf(user.address);

                const bntSupplyBefore = await bnt.totalSupply();

                const exchangeIds = [ExchangeId.BancorV2, ExchangeId.Sushiswap, ExchangeId.BancorV2];
                const tokens = [bnt.address, arbToken1.address, arbToken2.address, bnt.address];

                await expect(bancorArbitrage.connect(user).execute(routes, AMOUNT))
                    .to.emit(bancorArbitrage, 'ArbitrageExecuted')
                    .withArgs(user.address, exchangeIds, tokens, AMOUNT, expectedBntBurnt, expectedUserReward);

                const userBalanceAfter = await bnt.balanceOf(user.address);
                const bntSupplyAfter = await bnt.totalSupply();

                // user rewards are sent to user address, increasing his bnt balance
                const userGain = userBalanceAfter.sub(userBalanceBefore);

                // bnt is burnt by sending it to BNT's address
                // total supply of BNT gets decreased
                const amountBurnt = bntSupplyBefore.sub(bntSupplyAfter);

                expect(userGain).to.be.eq(expectedUserReward);
                expect(amountBurnt).to.be.eq(expectedBntBurnt);
            });

            it('should correctly distribute rewards to caller if exceeding the max rewards', async () => {
                // transfer tokens to exchange
                await transfer(deployer, bnt, exchanges.address, AMOUNT.mul(10));
                await transfer(deployer, arbToken1, exchanges.address, AMOUNT.mul(10));
                await transfer(deployer, arbToken2, exchanges.address, AMOUNT.mul(10));

                const routes = [
                    {
                        exchangeId: ExchangeId.BancorV2,
                        targetToken: arbToken1.address,
                        minTargetAmount: 1,
                        deadline: DEADLINE,
                        customAddress: arbToken1.address,
                        customInt: 0
                    },
                    {
                        exchangeId: ExchangeId.Sushiswap,
                        targetToken: arbToken2.address,
                        minTargetAmount: 1,
                        deadline: DEADLINE,
                        customAddress: arbToken2.address,
                        customInt: 0
                    },
                    {
                        exchangeId: ExchangeId.BancorV2,
                        targetToken: bnt.address,
                        minTargetAmount: 1,
                        deadline: DEADLINE,
                        customAddress: bnt.address,
                        customInt: 0
                    }
                ];

                // each hop through the route from MockExchanges adds 300e18 tokens to the output
                // so 3 hops = 3 * 300e18 = 900 BNT tokens more than start
                // so with 0 flashloan fees, when we repay the flashloan, we have 900 BNT tokens as totalRewards

                const hopCount = 3;
                const totalRewards = toWei(300).mul(hopCount);

                // set rewards max amount to 100
                const RewardsUpdate = {
                    percentagePPM: 100_000,
                    maxAmount: 100
                };

                await bancorArbitrage.setRewards(RewardsUpdate);

                const rewards = await bancorArbitrage.rewards();

                // calculate expected user rewards based on total rewards and percentagePPM
                let expectedUserReward = totalRewards.mul(rewards.percentagePPM).div(PPM_RESOLUTION);

                // check we have exceeded the max reward amount
                expect(expectedUserReward).to.be.gt(rewards.maxAmount);

                // update the expected user reward
                expectedUserReward = rewards.maxAmount;

                // calculate how much bnt should be burnt based on the total rewards and the user rewards
                const expectedBntBurnt = totalRewards.sub(expectedUserReward);

                const userBalanceBefore = await bnt.balanceOf(user.address);

                const bntSupplyBefore = await bnt.totalSupply();

                const exchangeIds = [ExchangeId.BancorV2, ExchangeId.Sushiswap, ExchangeId.BancorV2];
                const tokens = [bnt.address, arbToken1.address, arbToken2.address, bnt.address];

                await expect(bancorArbitrage.connect(user).execute(routes, AMOUNT))
                    .to.emit(bancorArbitrage, 'ArbitrageExecuted')
                    .withArgs(user.address, exchangeIds, tokens, AMOUNT, expectedBntBurnt, expectedUserReward);

                const userBalanceAfter = await bnt.balanceOf(user.address);
                const bntSupplyAfter = await bnt.totalSupply();

                // user rewards are sent to user address, increasing his bnt balance
                const userGain = userBalanceAfter.sub(userBalanceBefore);

                // bnt is burnt by sending it to BNT's address
                // total supply of BNT gets decreased
                const amountBurnt = bntSupplyBefore.sub(bntSupplyAfter);

                expect(userGain).to.be.eq(expectedUserReward);
                expect(amountBurnt).to.be.eq(expectedBntBurnt);
            });
        });
    });

    describe('flashloan', () => {
        // get all exchange ids (omit their names)
        const exchangeIds = Object.values(ExchangeId).filter((key) => !isNaN(parseInt(key as string)));
        const uniV3Fees = [100, 500, 3000];
        const tokenSymbols = [TokenSymbol.TKN1, TokenSymbol.TKN2, TokenSymbol.ETH];
        let arbToken1: TokenWithAddress;
        let arbToken2: TokenWithAddress;

        // remove BancorV3 exchange until the reentrancy guard issue is resolved
        exchangeIds.splice(exchangeIds.indexOf(ExchangeId.BancorV3), 1);

        beforeEach(async () => {
            await transfer(deployer, bnt, masterVault.address, AMOUNT.mul(10_000));
            await bancorArbitrage.setRewards(ArbitrageRewardsDefaults);
            const firstPool = await prepareBancorV3PoolAndToken(tokenSymbols[0]);
            const secondPool = await prepareBancorV3PoolAndToken(tokenSymbols[1]);
            arbToken1 = firstPool.token;
            arbToken2 = secondPool.token;
        });

        it("shouldn't be able to call onFlashloan directly", async () => {
            await expect(
                bancorArbitrage.onFlashLoan(bancorArbitrage.address, bnt.address, 1, 0, '0x')
            ).to.be.revertedWithError('InvalidFlashLoanCaller');
        });

        it('should correctly obtain a flashloan and repay it correctly', async () => {
            // transfer tokens to exchange
            await transfer(deployer, bnt, exchanges.address, AMOUNT.mul(10));
            await transfer(deployer, arbToken1, exchanges.address, AMOUNT.mul(10));
            await transfer(deployer, arbToken2, exchanges.address, AMOUNT.mul(10));

            const routes = [
                {
                    exchangeId: ExchangeId.BancorV2,
                    targetToken: arbToken1.address,
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: arbToken1.address,
                    customInt: 0
                },
                {
                    exchangeId: ExchangeId.Sushiswap,
                    targetToken: arbToken2.address,
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: arbToken2.address,
                    customInt: 0
                },
                {
                    exchangeId: ExchangeId.BancorV2,
                    targetToken: bnt.address,
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: bnt.address,
                    customInt: 0
                }
            ];

            // checking against Bancor Network event:
            // FlashLoanCompleted(Token indexed token, address indexed borrower, uint256 amount, uint256 feeAmount);
            // this also validates that the amount which is retrieved from the flashloan is correct

            await expect(bancorArbitrage.connect(user).execute(routes, AMOUNT))
                .to.emit(network, 'FlashLoanCompleted')
                .withArgs(bnt.address, bancorArbitrage.address, AMOUNT, 0);
        });

        it('should be exempt from flashloan fees', async () => {
            // transfer tokens to exchange
            await transfer(deployer, bnt, exchanges.address, AMOUNT.mul(10));
            await transfer(deployer, arbToken1, exchanges.address, AMOUNT.mul(10));
            await transfer(deployer, arbToken2, exchanges.address, AMOUNT.mul(10));

            const routes = [
                {
                    exchangeId: ExchangeId.BancorV2,
                    targetToken: arbToken1.address,
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: arbToken1.address,
                    customInt: 0
                },
                {
                    exchangeId: ExchangeId.Sushiswap,
                    targetToken: arbToken2.address,
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: arbToken2.address,
                    customInt: 0
                },
                {
                    exchangeId: ExchangeId.BancorV2,
                    targetToken: bnt.address,
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: bnt.address,
                    customInt: 0
                }
            ];

            // checking against Bancor Network event:
            // FlashLoanCompleted(Token indexed token, address indexed borrower, uint256 amount, uint256 feeAmount);
            // this validates the amount and fee are correct

            for (const flashLoanFee of [0.01, 0.02, 0.03, 0.04, 0.05]) {
                await networkSettings.setFlashLoanFeePPM(bnt.address, toPPM(flashLoanFee));

                // fee amount is 0 because the arb contract is exempt from flashloan fees
                const expectedFeeAmount = 0;

                await expect(bancorArbitrage.connect(user).execute(routes, AMOUNT))
                    .to.emit(network, 'FlashLoanCompleted')
                    .withArgs(bnt.address, bancorArbitrage.address, AMOUNT, expectedFeeAmount);
            }
        });

        it('should execute flashloan succesfully on zero reward and burn amount', async () => {
            baseToken = await createTestToken();
            // these exchanges swap the input amount for exactly the output amount
            // leading to 0 BNT gain, but successful repayment of flashloan b/c fee is 0
            // check the logic for 0 BNT gain
            const sameOutputExchanges = await Contracts.MockExchanges.deploy(weth.address, 0, true);
            const bancorV2SameOutput = sameOutputExchanges;
            const uniswapV2RouterSameOutput = sameOutputExchanges;
            const uniswapV3RouterSameOutput = sameOutputExchanges;
            const sushiswapV2RouterSameOutput = sameOutputExchanges;

            const newBancorArbitrage = await createProxy(Contracts.BancorArbitrage, {
                ctorArgs: [
                    bnt.address,
                    bancorV2SameOutput.address,
                    network.address,
                    uniswapV2RouterSameOutput.address,
                    uniswapV3RouterSameOutput.address,
                    sushiswapV2RouterSameOutput.address
                ]
            });

            await transfer(deployer, baseToken, sameOutputExchanges.address, MAX_SOURCE_AMOUNT);

            for (const exchangeId of exchangeIds) {
                let customInt;
                if (exchangeId === ExchangeId.UniswapV3) {
                    customInt = uniV3Fees[tokenSymbols.indexOf(TokenSymbol.TKN1)];

                    await transfer(deployer, weth, sameOutputExchanges.address, AMOUNT.mul(10));
                } else {
                    customInt = 0;
                }

                await transfer(deployer, bnt, sameOutputExchanges.address, AMOUNT.mul(10));
                await transfer(deployer, arbToken1, sameOutputExchanges.address, AMOUNT.mul(10));
                await transfer(deployer, arbToken2, sameOutputExchanges.address, AMOUNT.mul(10));

                const routes = [
                    {
                        exchangeId: ExchangeId.BancorV2,
                        targetToken: arbToken1.address,
                        minTargetAmount: 1,
                        deadline: DEADLINE,
                        customAddress: arbToken1.address,
                        customInt: 0
                    },
                    {
                        exchangeId,
                        targetToken: arbToken2.address,
                        minTargetAmount: 1,
                        deadline: DEADLINE,
                        customAddress: arbToken2.address,
                        customInt
                    },
                    {
                        exchangeId: ExchangeId.BancorV2,
                        targetToken: bnt.address,
                        minTargetAmount: 1,
                        deadline: DEADLINE,
                        customAddress: bnt.address,
                        customInt: 0
                    }
                ];
                const exchangeIds = [ExchangeId.BancorV2, exchangeId, ExchangeId.BancorV2];
                const tokens = [bnt.address, arbToken1.address, arbToken2.address, bnt.address];

                await expect(newBancorArbitrage.connect(user).execute(routes, AMOUNT))
                    .to.emit(newBancorArbitrage, 'ArbitrageExecuted')
                    .withArgs(user.address, exchangeIds, tokens, AMOUNT, 0, 0);
            }
        });

        it('should revert if flashloan cannot be obtained', async () => {
            // transfer tokens to exchange
            await transfer(deployer, bnt, exchanges.address, AMOUNT.mul(10));
            await transfer(deployer, arbToken1, exchanges.address, AMOUNT.mul(10));
            await transfer(deployer, arbToken2, exchanges.address, AMOUNT.mul(10));

            const routes = [
                {
                    exchangeId: ExchangeId.BancorV2,
                    targetToken: arbToken1.address,
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: arbToken1.address,
                    customInt: 0
                },
                {
                    exchangeId: ExchangeId.Sushiswap,
                    targetToken: arbToken2.address,
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: arbToken2.address,
                    customInt: 0
                },
                {
                    exchangeId: ExchangeId.BancorV2,
                    targetToken: bnt.address,
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: bnt.address,
                    customInt: 0
                }
            ];

            // attempt to make flashloan with more than available BNT tokens in the pool
            await expect(bancorArbitrage.connect(user).execute(routes, MAX_UINT256)).to.be.revertedWith(
                'SafeERC20: low-level call failed'
            );
        });

        it('should revert if flashloan cannot be repaid', async () => {
            baseToken = await createTestToken();
            // these exchanges swap the input amount for an output amount which is less
            // leading to negative BNT gain, and unsuccessful repayment of flashloan
            const negativeOutputExchanges = await Contracts.MockExchanges.deploy(weth.address, toWei(1), false);
            const bancorV2NegativeOutput = negativeOutputExchanges;
            const uniswapV2RouterNegativeOutput = negativeOutputExchanges;
            const uniswapV3RouterNegativeOutput = negativeOutputExchanges;
            const sushiswapV2RouterNegativeOutput = negativeOutputExchanges;

            const newBancorArbitrage = await createProxy(Contracts.BancorArbitrage, {
                ctorArgs: [
                    bnt.address,
                    bancorV2NegativeOutput.address,
                    network.address,
                    uniswapV2RouterNegativeOutput.address,
                    uniswapV3RouterNegativeOutput.address,
                    sushiswapV2RouterNegativeOutput.address
                ]
            });

            await transfer(deployer, bnt, negativeOutputExchanges.address, AMOUNT.mul(10));
            await transfer(deployer, arbToken1, negativeOutputExchanges.address, AMOUNT.mul(10));
            await transfer(deployer, arbToken2, negativeOutputExchanges.address, AMOUNT.mul(10));

            const routes = [
                {
                    exchangeId: ExchangeId.BancorV2,
                    targetToken: arbToken1.address,
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: arbToken1.address,
                    customInt: 0
                },
                {
                    exchangeId: ExchangeId.Sushiswap,
                    targetToken: arbToken2.address,
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: arbToken2.address,
                    customInt: 0
                },
                {
                    exchangeId: ExchangeId.BancorV2,
                    targetToken: bnt.address,
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: bnt.address,
                    customInt: 0
                }
            ];

            await expect(newBancorArbitrage.connect(user).execute(routes, AMOUNT)).to.be.revertedWith(
                'SafeERC20: low-level call failed'
            );
        });
    });

    describe('trades', () => {
        // get all exchange ids (omit their names)
        const exchangeIds = Object.values(ExchangeId).filter((key) => !isNaN(parseInt(key as string)));
        const uniV3Fees = [100, 500, 3000];
        const tokenSymbols = [TokenSymbol.TKN1, TokenSymbol.TKN2, TokenSymbol.ETH];
        let arbToken1: TokenWithAddress;
        let arbToken2: TokenWithAddress;

        // remove BancorV3 exchange until the reentrancy guard issue is resolved
        exchangeIds.splice(exchangeIds.indexOf(ExchangeId.BancorV3), 1);

        beforeEach(async () => {
            await transfer(deployer, bnt, masterVault.address, AMOUNT.mul(10_000));
            await bancorArbitrage.setRewards(ArbitrageRewardsDefaults);
            const firstPool = await prepareBancorV3PoolAndToken(tokenSymbols[0]);
            const secondPool = await prepareBancorV3PoolAndToken(tokenSymbols[1]);
            arbToken1 = firstPool.token;
            arbToken2 = secondPool.token;
        });

        it('reverts if the deadline is reached', async () => {
            // transfer tokens to exchange
            await transfer(deployer, bnt, exchanges.address, AMOUNT.mul(10));
            await transfer(deployer, arbToken1, exchanges.address, AMOUNT.mul(10));
            await transfer(deployer, arbToken2, exchanges.address, AMOUNT.mul(10));

            const routes = [
                {
                    exchangeId: ExchangeId.Sushiswap,
                    targetToken: arbToken1.address,
                    minTargetAmount: 1,
                    deadline: 1,
                    customAddress: arbToken1.address,
                    customInt: 0
                },
                {
                    exchangeId: ExchangeId.BancorV2,
                    targetToken: arbToken2.address,
                    minTargetAmount: 1,
                    deadline: 1,
                    customAddress: arbToken2.address,
                    customInt: 0
                },
                {
                    exchangeId: ExchangeId.BancorV2,
                    targetToken: bnt.address,
                    minTargetAmount: 1,
                    deadline: 1,
                    customAddress: bnt.address,
                    customInt: 0
                }
            ];

            await expect(bancorArbitrage.connect(user).execute(routes, AMOUNT)).to.be.revertedWith('Swap timeout');
        });

        it('reverts if source amount is 0', async () => {
            const routes = [
                {
                    exchangeId: ExchangeId.BancorV2,
                    targetToken: arbToken1.address,
                    minTargetAmount: 1,
                    deadline: 1,
                    customAddress: arbToken1.address,
                    customInt: 0
                }
            ];

            await expect(bancorArbitrage.connect(user).execute(routes, 0)).to.be.revertedWithError('ZeroValue');
        });

        it('reverts if the exchangeId is not supported', async () => {
            const InvalidExchangeId = 6;
            const routes = [
                {
                    exchangeId: InvalidExchangeId,
                    targetToken: arbToken1.address,
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: arbToken1.address,
                    customInt: 0
                },
                {
                    exchangeId: InvalidExchangeId,
                    targetToken: arbToken2.address,
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: arbToken2.address,
                    customInt: 0
                },
                {
                    exchangeId: InvalidExchangeId,
                    targetToken: bnt.address,
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: bnt.address,
                    customInt: 0
                }
            ];

            await expect(bancorArbitrage.connect(user).execute(routes, AMOUNT)).to.be.revertedWithError(
                'InvalidExchangeId'
            );
        });

        it('reverts if the route length is invalid', async () => {
            const routeData = {
                exchangeId: ExchangeId.BancorV2,
                targetToken: arbToken1.address,
                minTargetAmount: 1,
                deadline: DEADLINE,
                customAddress: arbToken1.address,
                customInt: 0
            };

            // create a route with 11 hops (max is 10)
            const routes = Array(11).fill(routeData);

            // test with > 10 hops
            await expect(bancorArbitrage.connect(user).execute(routes, AMOUNT)).to.be.revertedWithError(
                'InvalidRouteLength'
            );

            // test with 0 hops
            const emptyRoutes: Array<any> = [];
            await expect(bancorArbitrage.connect(user).execute(emptyRoutes, AMOUNT)).to.be.revertedWithError(
                'InvalidRouteLength'
            );
        });

        it("reverts if caller doesn't have enough balance", async () => {
            const routes = [
                {
                    exchangeId: ExchangeId.BancorV2,
                    targetToken: arbToken1.address,
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: arbToken1.address,
                    customInt: 0
                },
                {
                    exchangeId: ExchangeId.Sushiswap,
                    targetToken: arbToken2.address,
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: arbToken2.address,
                    customInt: 0
                },
                {
                    exchangeId: ExchangeId.BancorV2,
                    targetToken: bnt.address,
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: bnt.address,
                    customInt: 0
                }
            ];

            await expect(bancorArbitrage.connect(user).execute(routes, AMOUNT)).to.be.revertedWith(
                'ERC20: transfer amount exceeds balance'
            );
        });

        it('reverts if the minTargetAmount is greater than the expected target amount', async () => {
            // transfer tokens to exchange
            await transfer(deployer, bnt, exchanges.address, AMOUNT.mul(10));
            await transfer(deployer, arbToken1, exchanges.address, AMOUNT.mul(10));
            await transfer(deployer, arbToken2, exchanges.address, AMOUNT.mul(10));

            const routes = [
                {
                    exchangeId: ExchangeId.BancorV2,
                    targetToken: arbToken1.address,
                    minTargetAmount: MAX_UINT256,
                    deadline: DEADLINE,
                    customAddress: arbToken1.address,
                    customInt: 0
                },
                {
                    exchangeId: ExchangeId.Sushiswap,
                    targetToken: arbToken2.address,
                    minTargetAmount: MAX_UINT256,
                    deadline: DEADLINE,
                    customAddress: arbToken2.address,
                    customInt: 0
                },
                {
                    exchangeId: ExchangeId.BancorV2,
                    targetToken: bnt.address,
                    minTargetAmount: MAX_UINT256,
                    deadline: DEADLINE,
                    customAddress: bnt.address,
                    customInt: 0
                }
            ];

            await expect(bancorArbitrage.connect(user).execute(routes, AMOUNT)).to.be.revertedWith(
                'InsufficientTargetAmount'
            );
        });

        it("reverts if the output token of the arbitrage isn't BNT", async () => {
            const routes = [
                {
                    exchangeId: ExchangeId.BancorV2,
                    targetToken: arbToken1.address,
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: arbToken1.address,
                    customInt: 0
                },
                {
                    exchangeId: ExchangeId.BancorV2,
                    targetToken: arbToken2.address, // other than BNT
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: arbToken2.address,
                    customInt: 0
                }
            ];

            // test invalid output token
            await expect(bancorArbitrage.connect(user).execute(routes, AMOUNT)).to.be.revertedWithError(
                'InvalidInitialAndFinalTokens'
            );
        });

        it("reverts if the path isn't valid", async () => {
            const routes = [
                {
                    exchangeId: ExchangeId.BancorV2,
                    targetToken: bnt.address,
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: bnt.address,
                    customInt: 0
                },
                {
                    exchangeId: ExchangeId.BancorV2,
                    targetToken: bnt.address,
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: bnt.address,
                    customInt: 0
                }
            ];

            // test invalid path result
            // reverts in the MockExchanges contract
            await expect(bancorArbitrage.connect(user).execute(routes, AMOUNT)).to.be.revertedWith(
                'SafeERC20: low-level call failed'
            );
        });

        it('approves ERC-20 tokens for each exchange when trading', async () => {
            for (const exchangeId of exchangeIds) {
                let customInt;
                if (exchangeId === ExchangeId.UniswapV3) {
                    customInt = uniV3Fees[tokenSymbols.indexOf(TokenSymbol.TKN1)];

                    await transfer(deployer, weth, exchanges.address, AMOUNT.mul(10));
                } else {
                    customInt = 0;
                }

                await transfer(deployer, bnt, exchanges.address, AMOUNT.mul(10));
                await transfer(deployer, arbToken1, exchanges.address, AMOUNT.mul(10));
                await transfer(deployer, arbToken2, exchanges.address, AMOUNT.mul(10));

                const routes = [
                    {
                        exchangeId: ExchangeId.BancorV2,
                        targetToken: arbToken1.address,
                        minTargetAmount: 1,
                        deadline: DEADLINE,
                        customAddress: arbToken1.address,
                        customInt: 0
                    },
                    {
                        exchangeId,
                        targetToken: arbToken2.address,
                        minTargetAmount: 1,
                        deadline: DEADLINE,
                        customAddress: arbToken2.address,
                        customInt
                    },
                    {
                        exchangeId: ExchangeId.BancorV2,
                        targetToken: bnt.address,
                        minTargetAmount: 1,
                        deadline: DEADLINE,
                        customAddress: bnt.address,
                        customInt: 0
                    }
                ];
                const secondHopSourceAmount = AMOUNT.add(toWei(600)); // 300 tokens per hop

                // expect to approve exactly the amounts needed for the second trade for each exchange
                await expect(bancorArbitrage.connect(user).execute(routes, AMOUNT))
                    .to.emit(arbToken2, 'Approval')
                    .withArgs(bancorArbitrage.address, exchanges.address, secondHopSourceAmount);
            }
        });

        it('should be exempt from trading fees on Bancor V3', async () => {
            const { token: arbToken1 } = await prepareBancorV3PoolAndToken(tokenSymbols[0]);
            const { token: arbToken2 } = await prepareBancorV3PoolAndToken(tokenSymbols[1]);
            const { token: eth } = await prepareBancorV3PoolAndToken(tokenSymbols[2]);

            // transfer tokens to mock exchanges
            await transfer(deployer, bnt, exchanges.address, AMOUNT.mul(20));
            await transfer(deployer, arbToken1, exchanges.address, AMOUNT.mul(20));
            await transfer(deployer, arbToken2, exchanges.address, AMOUNT.mul(20));

            for(const token of [arbToken2, eth]) {
                const routes = [
                    {
                        exchangeId: ExchangeId.BancorV2,
                        targetToken: arbToken1.address,
                        minTargetAmount: 1,
                        deadline: DEADLINE,
                        customAddress: arbToken1.address,
                        customInt: 0
                    },
                    {
                        exchangeId: ExchangeId.BancorV3,
                        targetToken: token.address,
                        minTargetAmount: 1,
                        deadline: DEADLINE,
                        customAddress: token.address,
                        customInt: 0
                    },
                    {
                        exchangeId: ExchangeId.BancorV2,
                        targetToken: bnt.address,
                        minTargetAmount: 1,
                        deadline: DEADLINE,
                        customAddress: bnt.address,
                        customInt: 0
                    }
                ];

                // check that the fee amount is 0
                // use different fees
                for (const tradeFee of [0.03, 0.05, 1, 2, 3]) {
                    // set trading fee
                    await poolCollection.setTradingFeePPM(arbToken1.address, toPPM(tradeFee));
                    await poolCollection.setTradingFeePPM(token.address, toPPM(tradeFee));
                    // set network fee
                    await poolCollection.setNetworkFeePPM(toPPM(tradeFee));

                    // fee amount is 0 because the arb contract is exempt from trade fees
                    const expectedFeeAmount = 0;

                    // check against the `TokensTraded` event in BancorNetwork
                    // the event is emitted on a successful trade
                    const tx = await bancorArbitrage.connect(user).execute(routes, AMOUNT);
                    const eventSig = 'TokensTraded(bytes32,address,address,uint256,uint256,uint256,uint256,uint256,address)';
                    const tokensTradedEvents = await getEvent(tx, eventSig);

                    const log = await parseLog('BancorNetwork', tokensTradedEvents[0]);
                    expect(log.args.targetFeeAmount).to.be.eq(expectedFeeAmount);
                    expect(log.args.bntFeeAmount).to.be.eq(expectedFeeAmount);
                }
            }
        });
    });

    describe('arbitrage', () => {
        beforeEach(async () => {
            await transfer(deployer, bnt, masterVault.address, AMOUNT.mul(10_000));
            await bancorArbitrage.setRewards(ArbitrageRewardsDefaults);
        });

        // get all exchange ids (omit their names)
        const exchangeIds = Object.values(ExchangeId).filter((key) => !isNaN(parseInt(key as string)));
        const uniV3Fees = [100, 500, 3000];
        const tokenSymbols = [TokenSymbol.TKN1, TokenSymbol.TKN2, TokenSymbol.ETH];

        it('should emit ArbitrageExecuted event on successful arbitrage execution', async () => {
            const { token: arbToken1 } = await prepareBancorV3PoolAndToken(tokenSymbols[0]);
            const { token: arbToken2 } = await prepareBancorV3PoolAndToken(tokenSymbols[1]);

            await transfer(deployer, bnt, exchanges.address, AMOUNT.mul(10));
            await transfer(deployer, arbToken1, exchanges.address, AMOUNT.mul(10));
            await transfer(deployer, arbToken2, exchanges.address, AMOUNT.mul(10));

            const routes = [
                {
                    exchangeId: ExchangeId.BancorV2,
                    targetToken: arbToken1.address,
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: arbToken1.address,
                    customInt: 0
                },
                {
                    exchangeId: ExchangeId.UniswapV2,
                    targetToken: arbToken2.address,
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: arbToken2.address,
                    customInt: 0
                },
                {
                    exchangeId: ExchangeId.BancorV2,
                    targetToken: bnt.address,
                    minTargetAmount: 1,
                    deadline: DEADLINE,
                    customAddress: bnt.address,
                    customInt: 0
                }
            ];

            await expect(bancorArbitrage.connect(user).execute(routes, AMOUNT)).to.emit(
                bancorArbitrage,
                'ArbitrageExecuted'
            );
        });

        for (const exchangeId of exchangeIds) {
            for (const arbToken1Symbol of tokenSymbols) {
                for (const arbToken2Symbol of tokenSymbols) {
                    if (arbToken1Symbol === arbToken2Symbol) {
                        continue;
                    }

                    const exchangeName = ExchangeId[Number(exchangeId)];

                    it(`arbitrage between ${arbToken1Symbol} and ${arbToken2Symbol} using ${exchangeName}`, async () => {
                        const { token: arbToken1 } = await prepareBancorV3PoolAndToken(arbToken1Symbol);
                        const { token: arbToken2 } = await prepareBancorV3PoolAndToken(arbToken2Symbol);

                        let customInt;
                        if (exchangeId === ExchangeId.UniswapV3) {
                            customInt = uniV3Fees[tokenSymbols.indexOf(arbToken1Symbol)];

                            await transfer(deployer, weth, exchanges.address, AMOUNT.mul(10));
                        } else {
                            customInt = 0;
                        }

                        await transfer(deployer, bnt, exchanges.address, AMOUNT.mul(10));
                        await transfer(deployer, arbToken1, exchanges.address, AMOUNT.mul(10));
                        await transfer(deployer, arbToken2, exchanges.address, AMOUNT.mul(10));

                        const routes = [
                            {
                                exchangeId: ExchangeId.BancorV2,
                                targetToken: arbToken1.address,
                                minTargetAmount: 1,
                                deadline: DEADLINE,
                                customAddress: arbToken1.address,
                                customInt: 0
                            },
                            {
                                exchangeId,
                                targetToken: arbToken2.address,
                                minTargetAmount: 1,
                                deadline: DEADLINE,
                                customAddress: arbToken2.address,
                                customInt
                            },
                            {
                                exchangeId: ExchangeId.BancorV2,
                                targetToken: bnt.address,
                                minTargetAmount: 1,
                                deadline: DEADLINE,
                                customAddress: bnt.address,
                                customInt: 0
                            }
                        ];

                        await bancorArbitrage.connect(user).execute(routes, AMOUNT);
                    });
                }
            }
        }
    });

    const prepareBancorV3PoolAndToken = async (symbol: TokenSymbol) => {
        const balance = toWei(100_000_000);
        const { poolToken, token } = await setupFundedPool(
            {
                tokenData: new TokenData(symbol),
                balance,
                requestedFunding: balance.mul(1000),
                bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
            },
            deployer as any as SignerWithAddress,
            network,
            networkInfo,
            networkSettings,
            poolCollection
        );

        // increase BNT liquidity by the growth factor a few times
        for (let i = 0; i < 5; i++) {
            await depositToPool(deployer, token, 1, network);
        }

        return { poolToken, token };
    };
});
