import Contracts from '../../components/Contracts';
import { GovToken, NetworkToken, TokenGovernance } from '../../components/LegacyContracts';
import {
    BancorV1Migration,
    BancorVault,
    NetworkSettings,
    TestBancorNetwork,
    TestPoolCollection,
    TokenHolder
} from '../../typechain';
import { ETH, TKN } from '../helpers/Constants';
import { createPool, createSystem, createTokenHolder } from '../helpers/Factory';
import { createLegacySystem } from '../helpers/LegacyFactory';
import { createTokenBySymbol, getBalance, getTransactionCost } from '../helpers/Utils';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers, waffle } from 'hardhat';

describe.only('BancorV1Migration', () => {
    const INITIAL_RATE = { n: BigNumber.from(1), d: BigNumber.from(2) };
    const MAX_DEVIATION = BigNumber.from(10_000); // %1
    const MINTING_LIMIT = BigNumber.from(10_000_000);
    const WITHDRAWAL_FEE = BigNumber.from(50_000); // 5%
    const MIN_LIQUIDITY_FOR_TRADING = BigNumber.from(100_000);
    const DEPOSIT_LIMIT = BigNumber.from(100_000_000);
    const TOTAL_SUPPLY = BigNumber.from(1_000_000_000);
    const NETWORK_AMOUNT = BigNumber.from(2_500_000);
    const BASE_AMOUNT = BigNumber.from(1_000_000);

    let networkTokenGovernance: TokenGovernance;
    let govTokenGovernance: TokenGovernance;
    let network: TestBancorNetwork;
    let networkSettings: NetworkSettings;
    let networkToken: NetworkToken;
    let govToken: GovToken;
    let poolCollection: TestPoolCollection;
    let bancorVault: BancorVault;
    let externalProtectionWallet: TokenHolder;
    let bancorV1Migration: BancorV1Migration;
    let converter: any;
    let poolToken: any;
    let baseToken: any;
    let deployer: any;
    let provider: any;

    const setup = async () => {
        ({
            networkTokenGovernance,
            govTokenGovernance,
            network,
            networkSettings,
            networkToken,
            govToken,
            poolCollection,
            bancorVault
        } = await createSystem());

        bancorV1Migration = await Contracts.BancorV1Migration.deploy(network.address);

        await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
        await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);
        await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

        externalProtectionWallet = await createTokenHolder();
        await externalProtectionWallet.transferOwnership(network.address);
        await network.setExternalProtectionWallet(externalProtectionWallet.address);
    };

    const initLegacySystem = async (isETH: boolean) => {
        [deployer, provider] = await ethers.getSigners();

        baseToken = await createTokenBySymbol(isETH ? ETH : TKN);

        ({ poolToken, converter } = await createLegacySystem(
            deployer,
            network,
            networkToken,
            networkTokenGovernance,
            govTokenGovernance,
            baseToken
        ));

        await networkTokenGovernance.mint(deployer.address, TOTAL_SUPPLY);
        await networkToken.transfer(provider.address, NETWORK_AMOUNT);

        await createPool(baseToken, network, networkSettings, poolCollection);
        await networkSettings.setPoolMintingLimit(baseToken.address, MINTING_LIMIT);
        await poolCollection.setDepositLimit(baseToken.address, DEPOSIT_LIMIT);
        await poolCollection.setInitialRate(baseToken.address, INITIAL_RATE);

        await networkToken.connect(provider).approve(converter.address, NETWORK_AMOUNT);
        if (!isETH) {
            await baseToken.transfer(provider.address, BASE_AMOUNT);
            await baseToken.connect(provider).approve(converter.address, BASE_AMOUNT);
        }

        await converter
            .connect(provider)
            .addLiquidity([networkToken.address, baseToken.address], [NETWORK_AMOUNT, BASE_AMOUNT], 1, {
                value: isETH ? BASE_AMOUNT : BigNumber.from(0)
            });
    };

    for (const isETH of [false, true]) {
        describe(`base token (${isETH ? 'ETH' : 'ERC20'})`, () => {
            beforeEach(async () => {
                await waffle.loadFixture(setup);
                await initLegacySystem(isETH);
                const baseTokenAmount = DEPOSIT_LIMIT.div(10);
                if (isETH) {
                    await network.deposit(baseToken.address, baseTokenAmount, { value: baseTokenAmount });
                } else {
                    await baseToken.approve(network.address, baseTokenAmount);
                    await network.deposit(baseToken.address, baseTokenAmount);
                }
            });

            it('verifies that the caller can migrate pool tokens', async () => {
                const prevNetworkBalance = await getBalance(networkToken, bancorVault.address);
                const prevBaseBalance = await getBalance(baseToken, bancorVault.address);

                const poolTokenAmount = await getBalance(poolToken, provider.address);
                await poolToken.connect(provider).approve(bancorV1Migration.address, poolTokenAmount);
                const response = await bancorV1Migration
                    .connect(provider)
                    .migratePoolTokens(poolToken.address, poolTokenAmount);
                const gasCost = isETH ? await getTransactionCost(response) : BigNumber.from(0);

                const currNetworkBalance = await getBalance(networkToken, bancorVault.address);
                const currBaseBalance = await getBalance(baseToken, bancorVault.address);

                expect(currNetworkBalance).to.equal(prevNetworkBalance.add(prevNetworkBalance.mul(BASE_AMOUNT).div(prevBaseBalance)));
                expect(currBaseBalance).to.equal(prevBaseBalance.add(BASE_AMOUNT));
            });
        });
    }
});
