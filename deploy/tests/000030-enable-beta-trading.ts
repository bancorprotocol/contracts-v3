import Contracts, { BancorNetwork, PoolCollection, PoolToken } from '../../components/Contracts';
import { BNT, VBNT } from '../../components/LegacyContracts';
import { NetworkSettingsV1 } from '../../components/LegacyContractsV3';
import { describeDeployment } from '../../test/helpers/Deploy';
import { getBalance, getTransactionCost } from '../../test/helpers/Utils';
import { DEFAULT_TRADING_FEE_PPM, MAX_UINT256, ZERO_ADDRESS } from '../../utils/Constants';
import { DeployedContracts, getNamedSigners, isMainnet } from '../../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { toCents, toWei } from '../../utils/Types';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';
import { getNamedAccounts } from 'hardhat';

describeDeployment(
    __filename,
    () => {
        let bnt: BNT;
        let vbnt: VBNT;
        let network: BancorNetwork;
        let networkSettings: NetworkSettingsV1;
        let poolCollection: PoolCollection;
        let bntBNT: PoolToken;

        // TODO: make sure to update the limits and the rates before running the script in production
        const BNT_TOKEN_PRICE_IN_CENTS = toCents(2.29);

        enum BetaTokens {
            ETH = 'ETH',
            DAI = 'DAI',
            LINK = 'LINK'
        }

        const BETA_TOKEN_PRICES_IN_CENTS = {
            [BetaTokens.ETH]: toCents(3082),
            [BetaTokens.DAI]: toCents(1),
            [BetaTokens.LINK]: toCents(13.92)
        };

        const BNT_FUNDING_LIMIT_IN_CENTS = toCents(156_250);
        const FUNDING_LIMIT = toWei(BNT_FUNDING_LIMIT_IN_CENTS).div(BNT_TOKEN_PRICE_IN_CENTS);

        beforeEach(async () => {
            bnt = await DeployedContracts.BNT.deployed();
            vbnt = await DeployedContracts.VBNT.deployed();
            network = await DeployedContracts.BancorNetwork.deployed();
            networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
            poolCollection = await DeployedContracts.PoolCollectionType1V1.deployed();
            bntBNT = await DeployedContracts.bnBNT.deployed();
        });

        it('should enable trading on the beta pools', async () => {
            const { dai, link } = await getNamedAccounts();
            const { deployer, ethWhale, daiWhale, linkWhale, bntWhale } = await getNamedSigners();

            const BETA_TOKENS = {
                [BetaTokens.ETH]: {
                    address: NATIVE_TOKEN_ADDRESS,
                    whale: ethWhale
                },
                [BetaTokens.DAI]: {
                    address: dai,
                    whale: daiWhale
                },
                [BetaTokens.LINK]: {
                    address: link,
                    whale: linkWhale
                }
            };

            for (const [tokenSymbol, { address, whale }] of Object.entries(BETA_TOKENS)) {
                const isNativeToken = tokenSymbol === BetaTokens.ETH;

                expect(await networkSettings.poolFundingLimit(address)).to.equal(FUNDING_LIMIT);

                const data = await poolCollection.poolData(address);
                expect(data.tradingFeePPM).to.equal(DEFAULT_TRADING_FEE_PPM);

                const tokenPriceInCents = BETA_TOKEN_PRICES_IN_CENTS[tokenSymbol as BetaTokens];
                const bntVirtualBalance = tokenPriceInCents;
                const tokenVirtualBalance = BNT_TOKEN_PRICE_IN_CENTS;

                expect(data.liquidity.baseTokenTradingLiquidity).to.equal(
                    data.liquidity.bntTradingLiquidity.mul(tokenVirtualBalance).div(bntVirtualBalance)
                );

                expect(data.tradingEnabled).to.be.true;

                // increase deposit limits and perform a few tests
                await poolCollection.connect(deployer).setDepositLimit(address, MAX_UINT256);

                // perform a few deposit tests
                const tokenAmount = toWei(100);

                for (let i = 0; i < 5; i++) {
                    const { liquidity: prevLiquidity } = await poolCollection.poolData(address);

                    if (!isNativeToken) {
                        const token = await Contracts.ERC20.attach(address);
                        await token.connect(whale).approve(network.address, tokenAmount);
                    }

                    await network
                        .connect(whale)
                        .deposit(address, tokenAmount, { value: isNativeToken ? tokenAmount : BigNumber.from(0) });

                    const { liquidity } = await poolCollection.poolData(address);
                    expect(liquidity.stakedBalance).to.equal(prevLiquidity.stakedBalance.add(tokenAmount));

                    expect({
                        n: prevLiquidity.bntTradingLiquidity,
                        d: prevLiquidity.baseTokenTradingLiquidity
                    }).to.be.almostEqual(
                        {
                            n: liquidity.bntTradingLiquidity,
                            d: liquidity.baseTokenTradingLiquidity
                        },
                        {
                            maxAbsoluteError: new Decimal(0),
                            maxRelativeError: new Decimal('0000000000000000000001')
                        }
                    );
                }

                // perform a few trade tests
                for (let i = 0; i < 5; i++) {
                    if (!isNativeToken) {
                        const token = await Contracts.ERC20.attach(address);
                        await token.connect(whale).approve(network.address, tokenAmount);
                    }

                    const prevTokenBalance = await getBalance({ address }, whale);
                    const prevBNTBalance = await getBalance(bnt, whale);

                    const res = await network
                        .connect(whale)
                        .tradeBySourceAmount(address, bnt.address, tokenAmount, 1, MAX_UINT256, ZERO_ADDRESS, {
                            value: isNativeToken ? tokenAmount : BigNumber.from(0)
                        });

                    let transactionCost = BigNumber.from(0);
                    if (isNativeToken) {
                        transactionCost = await getTransactionCost(res);
                    }

                    const newBNTBalance = await getBalance(bnt, whale);

                    expect(await getBalance({ address }, whale)).to.equal(
                        prevTokenBalance.sub(tokenAmount).sub(transactionCost)
                    );
                    expect(newBNTBalance).to.be.gt(prevBNTBalance);

                    await bnt.connect(whale).approve(network.address, newBNTBalance);

                    const prevTokenBalance2 = await getBalance({ address }, whale);

                    await network
                        .connect(whale)
                        .tradeBySourceAmount(bnt.address, address, newBNTBalance, 1, MAX_UINT256, ZERO_ADDRESS);

                    expect(await getBalance({ address }, whale)).to.gte(prevTokenBalance2);
                    expect(await getBalance(bnt, whale)).to.be.equal(0);
                }
            }

            // perform a few BNT deposit tests
            const bntAmount = toWei(1000);

            for (let i = 0; i < 5; i++) {
                const prevBNBNTAmount = await getBalance(bntBNT, bntWhale);
                const prevVBNTTokenAmount = await getBalance(vbnt, bntWhale);
                const prevTotalSupply = await bnt.totalSupply();

                await bnt.connect(bntWhale).approve(network.address, bntAmount);
                await network.connect(bntWhale).deposit(bnt.address, bntAmount);

                const receivedBNBNTAmount = (await getBalance(bntBNT, bntWhale)).sub(prevBNBNTAmount);

                expect(receivedBNBNTAmount).be.gt(0);
                expect(await getBalance(vbnt, bntWhale)).to.equal(prevVBNTTokenAmount.add(receivedBNBNTAmount));

                expect(await bnt.totalSupply()).to.equal(prevTotalSupply.sub(bntAmount));
            }
        });
    },
    () => !isMainnet()
);
