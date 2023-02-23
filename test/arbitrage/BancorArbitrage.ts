import Contracts, {
    BancorNetworkInfo,
    IERC20,
    MasterVault,
    MockExchanges,
    NetworkSettings,
    TestBancorArbitrage,
    TestBancorNetwork,
    TestPoolCollection,
    TestWETH
} from '../../components/Contracts';
import { ExchangeId, MAX_UINT256, ZERO_ADDRESS } from '../../utils/Constants';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { toWei } from '../../utils/Types';
import { createProxy } from '../helpers/Factory';
import { createSystem, createTestToken, depositToPool, setupFundedPool, TokenWithAddress } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('BancorArbitrage', () => {
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

    const ArbitrageRewardsDefaults = {
        percentagePPM: 30000,
        maxAmount: toWei(100)
    };

    const ArbitrageRewardsChanged = {
        percentagePPM: 40000,
        maxAmount: toWei(200)
    };

    shouldHaveGap('TestBancorArbitrage', '_rewards');

    before(async () => {
        [deployer, user, nonOwner] = await ethers.getSigners();
    });

    beforeEach(async () => {
        ({ network, networkSettings, bnt, poolCollection, networkInfo, masterVault } = await createSystem());

        weth = await Contracts.TestWETH.deploy();
        await deployer.sendTransaction({ value: toWei(1_000_000_000), to: weth.address });

        baseToken = await createTestToken();
        exchanges = await Contracts.MockExchanges.deploy(weth.address);
        bancorV2 = exchanges;
        bancorV3 = exchanges;
        uniswapV2Router = exchanges;
        uniswapV3Router = exchanges;
        sushiswapV2Router = exchanges;

        bancorArbitrage = await createProxy(Contracts.TestBancorArbitrage, {
            ctorArgs: [
                bnt.address,
                bancorV2.address,
                network.address,
                uniswapV2Router.address,
                uniswapV3Router.address,
                sushiswapV2Router.address
            ]
        });

        await networkSettings.setFlashLoanFeePPM(bnt.address, 0);
        await transfer(deployer, baseToken, exchanges.address, MAX_SOURCE_AMOUNT);
    });

    describe('construction', () => {
        it('should revert when initializing with an invalid bnt contract', async () => {
            await expect(
                Contracts.TestBancorArbitrage.deploy(
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
                Contracts.TestBancorArbitrage.deploy(
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
                Contracts.TestBancorArbitrage.deploy(
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
                Contracts.TestBancorArbitrage.deploy(
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
                Contracts.TestBancorArbitrage.deploy(
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
                Contracts.TestBancorArbitrage.deploy(
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
            expect(await bancorArbitrage.version()).to.equal(1);
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
            expect(res.percentagePPM).to.equal(30_000);

            const resChanged = await bancorArbitrage.setRewards(ArbitrageRewardsChanged);
            await expect(resChanged).to.emit(bancorArbitrage, 'RewardsUpdated');

            const resUpdated = await bancorArbitrage.rewards();
            expect(resUpdated.percentagePPM).to.equal(40_000);
        });
    });

    describe('arbitrage', () => {
        beforeEach(async () => {
            await transfer(deployer, bnt, masterVault.address, AMOUNT.mul(10_000));
            await bancorArbitrage.setRewards(ArbitrageRewardsDefaults);
        });

        // get all exchange ids (omit their names)
        let exchangeIds = Object.values(ExchangeId).filter((key) => !isNaN(Number(key)));
        let uniV3Fees = [100, 500, 3000];
        const tokenSymbols = [TokenSymbol.TKN1, TokenSymbol.TKN2, TokenSymbol.ETH];

        // remove BancorV3 exchange until the reentrancy guard issue is resolved
        exchangeIds.splice(exchangeIds.indexOf(ExchangeId.BancorV3), 1);

        for (let exchangeId of exchangeIds) {
            for (let arbToken1Symbol of tokenSymbols) {
                for (let arbToken2Symbol of tokenSymbols) {
                    if (arbToken1Symbol == arbToken2Symbol) {
                        continue;
                    }

                    const exchangeName = ExchangeId[Number(exchangeId)];

                    it(`arbitrage between ${arbToken1Symbol} and ${arbToken2Symbol} using ${exchangeName}`, async () => {
                        const { token: arbToken1 } = await prepareBancorV3PoolAndToken(arbToken1Symbol);
                        const { token: arbToken2 } = await prepareBancorV3PoolAndToken(arbToken2Symbol);

                        let customInt;
                        if (exchangeId == ExchangeId.UniswapV3) {
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

// Initialization:
// Test that the contract reverts when initializing with an invalid network contract
// Test that the contract reverts when initializing with an invalid network settings contract
// Test that the contract reverts when initializing with an invalid BNT contract
// Test that the contract reverts when initializing with an invalid Uniswap V3 router contract
// Test that the contract reverts when initializing with an invalid Uniswap V2 router contract
// Test that the contract reverts when initializing with an invalid Sushiswap router contract
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
