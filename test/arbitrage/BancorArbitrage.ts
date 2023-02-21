import Contracts, {
    BancorNetworkInfo,
    IERC20,
    MasterVault,
    MockExchanges,
    NetworkSettings,
    TestBancorArbitrage,
    TestBancorNetwork,
    TestERC20Token,
    TestFlashLoanRecipient,
    TestPoolCollection
} from '../../components/Contracts';
import { Profiler } from '../../components/Profiler';
import { MAX_UINT256, ZERO_ADDRESS } from '../../utils/Constants';
import {
    EXP2_INPUT_TOO_HIGH, //    MAX_UINT256,
    PPM_RESOLUTION,
    RewardsDistributionType //    ZERO_ADDRESS
} from '../../utils/Constants';
import { NATIVE_TOKEN_ADDRESS, TokenData, TokenSymbol } from '../../utils/TokenData';
import { Addressable, toWei } from '../../utils/Types';
import { max, toPPM } from '../../utils/Types';
import { createProxy } from '../helpers/Factory';
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
import { shouldHaveGap } from '../helpers/Proxy';
import { duration, latest } from '../helpers/Time';
import { toAddress, transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, BigNumberish, ContractTransaction, utils } from 'ethers';
import { ethers } from 'hardhat';

describe('BancorArbitrage', () => {
    let bntPoolToken: IERC20;
    let network: TestBancorNetwork;
    let networkInfo: BancorNetworkInfo;
    let bnt: IERC20;
    let networkSettings: NetworkSettings;
    let poolCollection: TestPoolCollection;
    let bancorArbitrage: TestBancorArbitrage;
    let masterVault: MasterVault;

    let exchanges: MockExchanges;
    let bancorV2: MockExchanges;
    let bancorV3: MockExchanges;
    let uniswapV2Router: MockExchanges;
    let uniswapV2Factory: MockExchanges;
    let uniswapV3Router: MockExchanges;
    let sushiswapV2Router: MockExchanges;
    let baseToken: TokenWithAddress;

    let deployer: SignerWithAddress;
    let user: SignerWithAddress;
    let nonOwner: SignerWithAddress;

    const profiler = new Profiler();

    const BNT_VIRTUAL_BALANCE = 1;
    const BASE_TOKEN_VIRTUAL_BALANCE = 2;
    const MAX_SOURCE_AMOUNT = 100000000;
    const DEADLINE = MAX_UINT256;
    const AMOUNT = 1000;
    const GAS_LIMIT = 227440;
    const MIN_LIQUIDITY_FOR_TRADING = toWei(1000);
    const MIN_RETURN_AMOUNT = BigNumber.from(1);

    const ArbitrageRewardsDefaults = {
        percentagePPM: 30000,
        maxAmount: 100
    };

    const ArbitrageRewardsChanged = {
        percentagePPM: 40000,
        maxAmount: 200
    };

    const RouteParams = {
        maxExchangeId: 4,
        initialExchangeId: 4,
        finalExchangeId: 4,
        maxRouteLength: 3
    };

    interface TradeParams {
        sourceToken: TokenWithAddress;
        targetToken: TokenWithAddress;
        sourceAmount: BigNumberish;
        minTargetAmount: BigNumberish;
        path: Addressable[];
        exchangeId: number;
        deadline: BigNumberish;
    }

    shouldHaveGap('TestBancorArbitrage');

    before(async () => {
        [deployer, user, nonOwner] = await ethers.getSigners();
    });

    beforeEach(async () => {
        ({ network, networkSettings, bnt, poolCollection, networkInfo, bntPoolToken, masterVault } =
            await createSystem());

        baseToken = await createTestToken();
        exchanges =
            bancorV2 =
            bancorV3 =
            uniswapV2Router =
            uniswapV2Factory =
            uniswapV3Router =
            sushiswapV2Router =
                await Contracts.MockExchanges.deploy(100_000_000, baseToken.address);

        bancorArbitrage = await createProxy(Contracts.TestBancorArbitrage, {
            ctorArgs: [
                network.address,
                networkSettings.address,
                bnt.address,
                uniswapV3Router.address,
                uniswapV2Router.address,
                uniswapV2Factory.address,
                bancorV2.address,
                sushiswapV2Router.address
            ]
        });

        await networkSettings.setFlashLoanFeePPM(bnt.address, 0);
        await exchanges.transfer(exchanges.address, MAX_SOURCE_AMOUNT);
    });

    describe('construction', () => {
        it('should revert when initializing with an invalid network contract', async () => {
            await expect(
                Contracts.TestBancorArbitrage.deploy(
                    ZERO_ADDRESS,
                    networkSettings.address,
                    bnt.address,
                    uniswapV3Router.address,
                    uniswapV2Router.address,
                    uniswapV2Factory.address,
                    bancorV2.address,
                    sushiswapV2Router.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when initializing with an invalid networkSettings contract', async () => {
            await expect(
                Contracts.TestBancorArbitrage.deploy(
                    bancorV3.address,
                    ZERO_ADDRESS,
                    bnt.address,
                    uniswapV3Router.address,
                    uniswapV2Router.address,
                    uniswapV2Factory.address,
                    bancorV2.address,
                    sushiswapV2Router.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when initializing with an invalid bnt contract', async () => {
            await expect(
                Contracts.TestBancorArbitrage.deploy(
                    bancorV3.address,
                    networkSettings.address,
                    ZERO_ADDRESS,
                    uniswapV3Router.address,
                    uniswapV2Router.address,
                    uniswapV2Factory.address,
                    bancorV2.address,
                    sushiswapV2Router.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when initializing with an invalid uniswapV2RouterRouter contract', async () => {
            await expect(
                Contracts.TestBancorArbitrage.deploy(
                    bancorV3.address,
                    networkSettings.address,
                    bnt.address,
                    ZERO_ADDRESS,
                    uniswapV2Router.address,
                    uniswapV2Factory.address,
                    bancorV2.address,
                    sushiswapV2Router.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when initializing with an invalid network contract', async () => {
            await expect(
                Contracts.TestBancorArbitrage.deploy(
                    bancorV3.address,
                    networkSettings.address,
                    bnt.address,
                    uniswapV3Router.address,
                    uniswapV2Router.address,
                    uniswapV2Factory.address,
                    ZERO_ADDRESS,
                    sushiswapV2Router.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should be initialized', async () => {
            expect(await bancorArbitrage.version()).to.equal(1);
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(bancorArbitrage.initialize()).to.be.revertedWithError(
                'Initializable: contract is already initialized'
            );
        });
    });

    describe('settings', () => {
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

            const res = await bancorArbitrage.getRewards();
            expect(res.percentagePPM.toString()).to.equal('30000');

            const resChanged = await bancorArbitrage.setRewards(ArbitrageRewardsChanged);
            await expect(resChanged).to.emit(bancorArbitrage, 'RewardsUpdated');

            const resUpdated = await bancorArbitrage.getRewards();
            expect(resUpdated.percentagePPM.toString()).to.equal('40000');
        });
    });

    describe('trades', () => {
        beforeEach(async () => {
            await exchanges.connect(user).approve(bancorArbitrage.address, 100_000_000);
            await bancorArbitrage.setRewards(ArbitrageRewardsDefaults);
        });

        let allExchanges = ['SushiSwap', 'UniswapV2', 'UniswapV3'];
        let allexchangeIds = [2, 3, 4];
        let arbMsg = 'arbitrage ';
        const allRouteIds = [];

        it(arbMsg, async () => {
            const { token: token1 } = await preparePoolAndToken(TokenSymbol.TKN1);
            const { token: token2 } = await preparePoolAndToken(TokenSymbol.TKN2);
            const { token: token3 } = await preparePoolAndToken(TokenSymbol.ETH);

            const tokens = [token1, token2, token3];
            const tokenNames = [TokenSymbol.TKN1, TokenSymbol.TKN2, TokenSymbol.ETH];

            for (let e = 0; e < tokens.length; e++) {
                for (let i = 0; i < tokens.length; i++) {
                    for (let j = 0; j < tokens.length; j++) {
                        if (i != j) {
                            let token1 = tokens[i];
                            let token2 = tokens[j];
                            let exchangeName = allExchanges[e];
                            let exchangeId = allexchangeIds[e];

                            let tokenName1 = tokenNames[i];
                            let tokenName2 = tokenNames[j];
                            console.log(' ***** ');
                            console.log('tokenName1', tokenName1);
                            console.log('tokenName2', tokenName2);
                            console.log('exchangeId', exchangeId);

                            await transfer(deployer, bnt, masterVault.address, AMOUNT * 2 + GAS_LIMIT);
                            await transfer(deployer, bnt, exchanges.address, AMOUNT * 2 + GAS_LIMIT);
                            await transfer(deployer, token1, exchanges.address, AMOUNT * 2 + GAS_LIMIT);
                            await transfer(deployer, token2, exchanges.address, AMOUNT * 2 + GAS_LIMIT);

                            await exchanges.setTokens(token1.address, token2.address);

                            const routes = [
                                {
                                    sourceToken: bnt.address,
                                    targetToken: token1.address,
                                    minTargetAmount: 1,
                                    exchangeId: 1,
                                    customAddress: token1.address,
                                    deadline: DEADLINE
                                },
                                {
                                    sourceToken: token1.address,
                                    targetToken: token2.address,
                                    minTargetAmount: 1,
                                    exchangeId: exchangeId,
                                    customAddress: token2.address,
                                    deadline: DEADLINE
                                },
                                {
                                    sourceToken: token2.address,
                                    targetToken: bnt.address,
                                    minTargetAmount: 1,
                                    exchangeId: 1,
                                    customAddress: bnt.address,
                                    deadline: DEADLINE
                                }
                            ];

                            //                            let arbMsgFinal = arbMsgNew.concat(exchangeId2.toString());
                            //							it(arbMsgFinal, async () => {
                            await bancorArbitrage.connect(user).execute(routes, AMOUNT, {
                                gasLimit: BigNumber.from(GAS_LIMIT * 6)
                            });
                            //							});
                        }
                    }
                }
            }
        });
        //		}
    });

    const preparePoolAndToken = async (symbol: TokenSymbol) => {
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

        await network.setTime(await latest());

        return { poolToken, token };
    };

    const isBNT = (token: TokenWithAddress): boolean => {
        return token.address === bnt.address;
    };

    const transfer = async (
        sourceAccount: SignerWithAddress,
        token: TokenWithAddress,
        target: string | Addressable,
        amount: BigNumberish
    ) => {
        const targetAddress = toAddress(target);
        const tokenAddress = token.address;
        if ([NATIVE_TOKEN_ADDRESS, baseToken.address].includes(tokenAddress)) {
            return sourceAccount.sendTransaction({ to: targetAddress, value: amount });
        }

        return (await Contracts.TestERC20Token.attach(tokenAddress))
            .connect(sourceAccount)
            .transfer(targetAddress, amount);
    };
});

// Initialization:
// Test that the contract reverts when initializing with an invalid network contract
// Test that the contract reverts when initializing with an invalid network settings contract
// Test that the contract reverts when initializing with an invalid BNT contract
// Test that the contract reverts when initializing with an invalid Uniswap V3 router contract
// Test that the contract reverts when initializing with an invalid Uniswap V2 router contract
// Test that the contract reverts when initializing with an invalid Uniswap V2 factory contract
// Test that the contract reverts when initializing with an invalid Bancor V2 network contract

// Trade Function:
// Test that the trade function reverts if the deadline is reached
// Test that the trade function reverts if the source amount is 0
// Test that the trade function reverts if the exchangeId is not supported
// Test that the trade function reverts if the route length is invalid
// Test that the trade function reverts if the path array contains invalid addresses
// Test that the trade function reverts if the caller does not have enough balance of the source token
// Test that the trade function reverts if the minTargetAmount is greater than the expected target amount
// Test that the trade function reverts if the caller does not have enough allowance of the source token
// Test that the trade function reverts if the path is not valid
// Test that the trade function reverts if the path is not a valid route
// Test that the trade function reverts if the pair is not found
// Test that the trade function reverts if the exchange is not found
// Test that the trade function reverts if the source token is not supported

// Rewards Distribution:
// Test that the trade function correctly distributes the rewards to the caller and burns the remaining rewards
// Test that the trade function correctly distributes the rewards based on the percentagePPM setting
// Test that the trade function correctly distributes the rewards based on the maxAmount setting
// Test that the trade function reverts if the rewards to be distributed exceed the maxAmount setting
// Test that the settings function correctly updates the rewards distribution parameters
// Test that the trade function correctly distributes the rewards based on the updated rewards distribution parameters

// FlashLoan:
// Test that the trade function correctly obtains a flash loan from the flashLoanProvider and repays it correctly
// Test that the trade function reverts if the flash loan cannot be obtained
// Test that the trade function reverts if the flash loan cannot be repaid
// Test that the trade function correctly calculates the flash loan amount required
// Test that the trade function correctly calculates the flash loan interest
// Test that the trade function correctly distributes the flash loan interest to the flashLoanProvider
