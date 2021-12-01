import Contracts from '../../components/Contracts';
import { DSToken, TokenGovernance, TestStandardPoolConverter } from '../../components/LegacyContracts';
import {
    IERC20,
    BancorV1Migration,
    BancorVault,
    NetworkSettings,
    TestBancorNetwork,
    TestPoolCollection,
    PendingWithdrawals,
    PoolToken
} from '../../typechain-types';
import { ETH, TKN, PPM_RESOLUTION } from '../helpers/Constants';
import { createPool, createSystem } from '../helpers/Factory';
import { createLegacySystem } from '../helpers/LegacyFactory';
import { createTokenBySymbol, getBalance, getTransactionCost } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, ContractTransaction } from 'ethers';
import { ethers, waffle } from 'hardhat';

const INITIAL_RATE = { n: BigNumber.from(1), d: BigNumber.from(2) };
const MAX_DEVIATION = BigNumber.from(10_000);
const MINTING_LIMIT = BigNumber.from(10_000_000);
const MIN_LIQUIDITY = BigNumber.from(100_000);
const DEPOSIT_LIMIT = BigNumber.from(100_000_000);
const TOTAL_SUPPLY = BigNumber.from(1_000_000_000);
const DEPOSIT_AMOUNT = DEPOSIT_LIMIT.div(10);

describe('BancorV1Migration', () => {
    let deployer: SignerWithAddress;
    let provider: SignerWithAddress;

    let networkTokenGovernance: TokenGovernance;
    let govTokenGovernance: TokenGovernance;
    let govToken: IERC20;
    let network: TestBancorNetwork;
    let networkSettings: NetworkSettings;
    let networkToken: IERC20;
    let masterPoolToken: PoolToken;
    let basePoolToken: PoolToken;
    let pendingWithdrawals: PendingWithdrawals;
    let poolCollection: TestPoolCollection;
    let bancorVault: BancorVault;
    let bancorV1Migration: BancorV1Migration;
    let converter: TestStandardPoolConverter;
    let poolToken: DSToken;
    let baseToken: any;

    const setup = async () => {
        ({
            networkTokenGovernance,
            govTokenGovernance,
            govToken,
            network,
            networkSettings,
            networkToken,
            masterPoolToken,
            pendingWithdrawals,
            poolCollection,
            bancorVault
        } = await createSystem());
    };

    const initLegacySystem = async (networkAmount: BigNumber, baseAmount: BigNumber, isETH: boolean) => {
        baseToken = await createTokenBySymbol(isETH ? ETH : TKN);

        ({ poolToken, converter } = await createLegacySystem(
            deployer,
            network,
            bancorVault,
            networkToken,
            networkTokenGovernance,
            govTokenGovernance,
            baseToken
        ));

        await networkTokenGovernance.mint(deployer.address, TOTAL_SUPPLY);
        await networkToken.transfer(provider.address, networkAmount);

        basePoolToken = await createPool(baseToken, network, networkSettings, poolCollection);
        await networkSettings.setPoolMintingLimit(baseToken.address, MINTING_LIMIT);
        await poolCollection.setDepositLimit(baseToken.address, DEPOSIT_LIMIT);
        await poolCollection.setInitialRate(baseToken.address, INITIAL_RATE);
        await pendingWithdrawals.setLockDuration(0);

        await networkToken.connect(provider).approve(converter.address, networkAmount);
        if (!isETH) {
            await baseToken.transfer(provider.address, baseAmount);
            await baseToken.connect(provider).approve(converter.address, baseAmount);
        }

        await converter
            .connect(provider)
            .addLiquidity([networkToken.address, baseToken.address], [networkAmount, baseAmount], 1, {
                value: isETH ? baseAmount : BigNumber.from(0)
            });
    };

    const totalCost = async (txs: ContractTransaction[]) =>
        (await Promise.all(txs.map((tx) => getTransactionCost(tx)))).reduce((a, b) => a.add(b), BigNumber.from(0));

    const init = async (withdrawalFee: BigNumber, networkAmount: BigNumber, baseAmount: BigNumber, isETH: boolean) => {
        await waffle.loadFixture(setup);

        bancorV1Migration = await Contracts.BancorV1Migration.deploy(network.address);

        await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
        await networkSettings.setWithdrawalFeePPM(withdrawalFee);
        await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY);

        await initLegacySystem(networkAmount, baseAmount, isETH);

        if (isETH) {
            await network.deposit(baseToken.address, DEPOSIT_AMOUNT, { value: DEPOSIT_AMOUNT });
        } else {
            await baseToken.approve(network.address, DEPOSIT_AMOUNT);
            await network.deposit(baseToken.address, DEPOSIT_AMOUNT);
        }
    };

    const verify = async (
        withdrawalFee: BigNumber,
        networkAmount: BigNumber,
        baseAmount: BigNumber,
        isETH: boolean,
        percent: number
    ) => {
        const portionOf = (amount: BigNumber) => amount.mul(percent).div(100);
        const deductFee = (amount: BigNumber) => amount.sub(amount.mul(withdrawalFee).div(PPM_RESOLUTION));

        const prevProviderPoolTokenBalance = await getBalance(poolToken, provider.address);
        const prevConverterNetworkBalance = await getBalance(networkToken, converter.address);
        const prevConverterBaseBalance = await getBalance(baseToken, converter.address);
        const prevVaultNetworkBalance = await getBalance(networkToken, bancorVault.address);
        const prevVaultBaseBalance = await getBalance(baseToken, bancorVault.address);
        const prevPoolTokenSupply = await poolToken.totalSupply();

        const poolTokenAmount = portionOf(await getBalance(poolToken, provider.address));
        await poolToken.connect(provider).approve(bancorV1Migration.address, poolTokenAmount);
        await bancorV1Migration.connect(provider).migratePoolTokens(poolToken.address, poolTokenAmount);

        const currProviderPoolTokenBalance = await getBalance(poolToken, provider.address);
        const currConverterNetworkBalance = await getBalance(networkToken, converter.address);
        const currConverterBaseBalance = await getBalance(baseToken, converter.address);
        const currVaultNetworkBalance = await getBalance(networkToken, bancorVault.address);
        const currVaultBaseBalance = await getBalance(baseToken, bancorVault.address);
        const currPoolTokenSupply = await poolToken.totalSupply();

        expect(currProviderPoolTokenBalance).to.equal(prevProviderPoolTokenBalance.sub(poolTokenAmount));
        expect(currConverterNetworkBalance).to.equal(
            prevConverterNetworkBalance.sub(
                prevConverterNetworkBalance.mul(portionOf(baseAmount)).div(prevConverterBaseBalance)
            )
        );
        expect(currConverterBaseBalance).to.equal(prevConverterBaseBalance.sub(portionOf(baseAmount)));
        expect(currVaultNetworkBalance).to.equal(
            prevVaultNetworkBalance.add(prevVaultNetworkBalance.mul(portionOf(baseAmount)).div(prevVaultBaseBalance))
        );
        expect(currVaultBaseBalance).to.equal(prevVaultBaseBalance.add(portionOf(baseAmount)));
        expect(currPoolTokenSupply).to.equal(prevPoolTokenSupply.sub(poolTokenAmount));

        const prevProviderNetworkBalance = await getBalance(networkToken, provider);
        const prevProviderBaseBalance = await getBalance(baseToken, provider);

        const txs: ContractTransaction[] = [];

        const masterPoolTokenAmount = await getBalance(masterPoolToken, provider.address);
        txs.push(await masterPoolToken.connect(provider).approve(pendingWithdrawals.address, masterPoolTokenAmount));
        txs.push(
            await pendingWithdrawals.connect(provider).initWithdrawal(masterPoolToken.address, masterPoolTokenAmount)
        );
        const networkIds = await pendingWithdrawals.withdrawalRequestIds(provider.address);
        txs.push(
            await govToken.connect(provider).approve(network.address, await getBalance(govToken, provider.address))
        );
        txs.push(await network.connect(provider).withdraw(networkIds[0]));

        const basePoolTokenAmount = await getBalance(basePoolToken, provider.address);
        txs.push(await basePoolToken.connect(provider).approve(pendingWithdrawals.address, basePoolTokenAmount));
        txs.push(await pendingWithdrawals.connect(provider).initWithdrawal(basePoolToken.address, basePoolTokenAmount));
        const baseIds = await pendingWithdrawals.withdrawalRequestIds(provider.address);
        txs.push(await network.connect(provider).withdraw(baseIds[0]));

        const cost = isETH ? await totalCost(txs) : BigNumber.from(0);

        const currProviderNetworkBalance = await getBalance(networkToken, provider);
        const currProviderBaseBalance = await getBalance(baseToken, provider);

        expect(currProviderNetworkBalance).to.equal(
            prevProviderNetworkBalance.add(deductFee(portionOf(networkAmount)))
        );
        expect(currProviderBaseBalance.add(cost)).to.equal(
            prevProviderBaseBalance.add(deductFee(portionOf(baseAmount)))
        );
    };

    const test = (
        withdrawalFeeP: number,
        networkAmountM: number,
        baseAmountM: number,
        isETH: boolean,
        percent: number
    ) => {
        const withdrawalFee = BigNumber.from(withdrawalFeeP * 10_000);
        const networkAmount = BigNumber.from(networkAmountM * 1_000_000);
        const baseAmount = BigNumber.from(baseAmountM * 1_000_000);

        describe(`withdrawal fee = ${withdrawalFeeP}%`, () => {
            describe(`network amount = ${networkAmountM}M`, () => {
                describe(`base amount = ${baseAmountM}M`, () => {
                    describe(`base token = ${isETH ? 'ETH' : 'ERC20'}`, () => {
                        before(async () => {
                            await init(withdrawalFee, networkAmount, baseAmount, isETH);
                        });
                        it(`verifies that the caller can migrate ${percent}% of its pool tokens`, async () => {
                            await verify(withdrawalFee, networkAmount, baseAmount, isETH, percent);
                        });
                    });
                });
            });
        });
    };

    before(async () => {
        [deployer, provider] = await ethers.getSigners();
    });

    describe('quick tests', () => {
        for (const withdrawalFeeP of [1, 5]) {
            for (const networkAmountM of [1, 5]) {
                for (const baseAmountM of [1, 5]) {
                    for (const isETH of [false, true]) {
                        for (const percent of [10, 100]) {
                            test(withdrawalFeeP, networkAmountM, baseAmountM, isETH, percent);
                        }
                    }
                }
            }
        }
    });

    describe('@stress tests', () => {
        for (const withdrawalFeeP of [1, 2.5, 5]) {
            for (const networkAmountM of [1, 2.5, 5]) {
                for (const baseAmountM of [1, 2.5, 5]) {
                    for (const isETH of [false, true]) {
                        for (const percent of [10, 25, 50, 100]) {
                            test(withdrawalFeeP, networkAmountM, baseAmountM, isETH, percent);
                        }
                    }
                }
            }
        }
    });
});
