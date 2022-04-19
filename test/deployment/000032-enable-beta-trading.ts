import Contracts, { BancorNetwork, PoolCollection, PoolToken } from '../../components/Contracts';
import { BNT, VBNT } from '../../components/LegacyContracts';
import { NetworkSettingsV1 } from '../../components/LegacyContractsV3';
import { DEFAULT_TRADING_FEE_PPM, MAX_UINT256 } from '../../utils/Constants';
import { DeployedContracts, isMainnet } from '../../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { toCents, toWei } from '../../utils/Types';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';
import { ethers, getNamedAccounts } from 'hardhat';

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
            [BetaTokens.ETH]: toCents(3081),
            [BetaTokens.DAI]: toCents(1),
            [BetaTokens.LINK]: toCents(14.25)
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
            const { deployer, dai, link, ethWhale, daiWhale, linkWhale, bntWhale } = await getNamedAccounts();

            const deployerSigner = await ethers.getSigner(deployer);

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
                await poolCollection.connect(deployerSigner).setDepositLimit(address, MAX_UINT256);

                // perform a few token deposit tests
                const whaleSigner = await ethers.getSigner(whale);
                const tokenAmount = toWei(100);

                for (let i = 0; i < 5; i++) {
                    const { liquidity: prevLiquidity } = await poolCollection.poolData(address);

                    if (!isNativeToken) {
                        const token = await Contracts.ERC20.attach(address);
                        await token.connect(whaleSigner).approve(network.address, tokenAmount);
                    }

                    await network
                        .connect(whaleSigner)
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
            }

            // perform a few BNT deposit tests
            const bntWhaleSigner = await ethers.getSigner(bntWhale);
            const bntAmount = toWei(1000);

            for (let i = 0; i < 5; i++) {
                const prevBNBNTTokenAmount = await bntBNT.balanceOf(bntWhaleSigner.address);
                const prevVBNTTokenAmount = await vbnt.balanceOf(bntWhaleSigner.address);
                const prevTotalSupply = await bnt.totalSupply();

                await bnt.connect(bntWhaleSigner).approve(network.address, bntAmount);
                await network.connect(bntWhaleSigner).deposit(bnt.address, bntAmount);

                // test received bnBNT and VBNT amounts (assuming an initial 1:1 ratio)
                expect(await bntBNT.balanceOf(bntWhaleSigner.address)).to.equal(prevBNBNTTokenAmount.add(bntAmount));
                expect(await vbnt.balanceOf(bntWhaleSigner.address)).to.equal(prevVBNTTokenAmount.add(bntAmount));

                expect(await bnt.totalSupply()).to.equal(prevTotalSupply.sub(bntAmount));
            }
        });
    },
    () => !isMainnet()
);
