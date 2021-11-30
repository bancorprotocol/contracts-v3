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
const MIN_LIQUIDITY_FOR_TRADING = BigNumber.from(100_000);
const DEPOSIT_LIMIT = BigNumber.from(100_000_000);
const TOTAL_SUPPLY = BigNumber.from(1_000_000_000);

describe.only('BancorV1Migration', () => {
    let deployer: SignerWithAddress;
    let provider: SignerWithAddress;

    before(async () => {
        [deployer, provider] = await ethers.getSigners();
    });

    for (const withdrawalFee of [1, 2.5, 5]) {
        for (const networkAmount of [1, 2.5, 5]) {
            for (const baseAmount of [1, 2.5, 5]) {
                describe(`withdrawalFee = ${withdrawalFee}%, networkAmount = ${networkAmount}M, baseAmount = ${baseAmount}M`, () => {
                    const WITHDRAWAL_FEE = BigNumber.from(withdrawalFee * 10_000);
                    const NETWORK_AMOUNT = BigNumber.from(networkAmount * 1_000_000);
                    const BASE_AMOUNT = BigNumber.from(baseAmount * 1_000_000);

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

                        bancorV1Migration = await Contracts.BancorV1Migration.deploy(network.address);

                        await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
                        await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);
                        await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
                    };

                    const initLegacySystem = async (isETH: boolean) => {
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
                        await networkToken.transfer(provider.address, NETWORK_AMOUNT);

                        basePoolToken = await createPool(baseToken, network, networkSettings, poolCollection);
                        await networkSettings.setPoolMintingLimit(baseToken.address, MINTING_LIMIT);
                        await poolCollection.setDepositLimit(baseToken.address, DEPOSIT_LIMIT);
                        await poolCollection.setInitialRate(baseToken.address, INITIAL_RATE);
                        await pendingWithdrawals.setLockDuration(0);

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

                    const deductWithdrawalFee = (amount: BigNumber) =>
                        amount.sub(amount.mul(WITHDRAWAL_FEE).div(PPM_RESOLUTION));

                    const totalCost = async (txs: ContractTransaction[]) =>
                        (await Promise.all(txs.map((tx) => getTransactionCost(tx)))).reduce(
                            (a, b) => a.add(b),
                            BigNumber.from(0)
                        );

                    for (const isETH of [false, true]) {
                        describe(`base token (${isETH ? 'ETH' : 'ERC20'})`, () => {
                            beforeEach(async () => {
                                await waffle.loadFixture(setup);
                                await initLegacySystem(isETH);
                                const baseTokenAmount = DEPOSIT_LIMIT.div(10);
                                if (isETH) {
                                    await network.deposit(baseToken.address, baseTokenAmount, {
                                        value: baseTokenAmount
                                    });
                                } else {
                                    await baseToken.approve(network.address, baseTokenAmount);
                                    await network.deposit(baseToken.address, baseTokenAmount);
                                }
                            });

                            it('verifies that the caller can migrate pool tokens', async () => {
                                const prevProviderPoolTokenBalance = await getBalance(poolToken, provider.address);
                                const prevConverterNetworkBalance = await getBalance(networkToken, converter.address);
                                const prevConverterBaseBalance = await getBalance(baseToken, converter.address);
                                const prevVaultNetworkBalance = await getBalance(networkToken, bancorVault.address);
                                const prevVaultBaseBalance = await getBalance(baseToken, bancorVault.address);

                                const poolTokenAmount = await getBalance(poolToken, provider.address);
                                await poolToken.connect(provider).approve(bancorV1Migration.address, poolTokenAmount);
                                await bancorV1Migration
                                    .connect(provider)
                                    .migratePoolTokens(poolToken.address, poolTokenAmount);

                                const currProviderPoolTokenBalance = await getBalance(poolToken, provider.address);
                                const currConverterNetworkBalance = await getBalance(networkToken, converter.address);
                                const currConverterBaseBalance = await getBalance(baseToken, converter.address);
                                const currVaultNetworkBalance = await getBalance(networkToken, bancorVault.address);
                                const currVaultBaseBalance = await getBalance(baseToken, bancorVault.address);

                                expect(currProviderPoolTokenBalance).to.equal(
                                    prevProviderPoolTokenBalance.sub(poolTokenAmount)
                                );
                                expect(currConverterNetworkBalance).to.equal(
                                    prevConverterNetworkBalance.sub(
                                        prevConverterNetworkBalance.mul(BASE_AMOUNT).div(prevConverterBaseBalance)
                                    )
                                );
                                expect(currConverterBaseBalance).to.equal(prevConverterBaseBalance.sub(BASE_AMOUNT));
                                expect(currVaultNetworkBalance).to.equal(
                                    prevVaultNetworkBalance.add(
                                        prevVaultNetworkBalance.mul(BASE_AMOUNT).div(prevVaultBaseBalance)
                                    )
                                );
                                expect(currVaultBaseBalance).to.equal(prevVaultBaseBalance.add(BASE_AMOUNT));

                                const prevProviderNetworkBalance = await getBalance(networkToken, provider);
                                const prevProviderBaseBalance = await getBalance(baseToken, provider);

                                const txs: ContractTransaction[] = [];

                                const masterPoolTokenAmount = await getBalance(masterPoolToken, provider.address);
                                txs.push(
                                    await masterPoolToken
                                        .connect(provider)
                                        .approve(pendingWithdrawals.address, masterPoolTokenAmount)
                                );
                                txs.push(
                                    await pendingWithdrawals
                                        .connect(provider)
                                        .initWithdrawal(masterPoolToken.address, masterPoolTokenAmount)
                                );
                                const networkIds = await pendingWithdrawals.withdrawalRequestIds(provider.address);
                                txs.push(
                                    await govToken
                                        .connect(provider)
                                        .approve(network.address, await getBalance(govToken, provider.address))
                                );
                                txs.push(await network.connect(provider).withdraw(networkIds[0]));

                                const basePoolTokenAmount = await getBalance(basePoolToken, provider.address);
                                txs.push(
                                    await basePoolToken
                                        .connect(provider)
                                        .approve(pendingWithdrawals.address, basePoolTokenAmount)
                                );
                                txs.push(
                                    await pendingWithdrawals
                                        .connect(provider)
                                        .initWithdrawal(basePoolToken.address, basePoolTokenAmount)
                                );
                                const baseIds = await pendingWithdrawals.withdrawalRequestIds(provider.address);
                                txs.push(await network.connect(provider).withdraw(baseIds[0]));

                                const cost = isETH ? await totalCost(txs) : BigNumber.from(0);

                                const currProviderNetworkBalance = await getBalance(networkToken, provider);
                                const currProviderBaseBalance = await getBalance(baseToken, provider);

                                expect(currProviderNetworkBalance).to.equal(
                                    prevProviderNetworkBalance.add(deductWithdrawalFee(NETWORK_AMOUNT))
                                );
                                expect(currProviderBaseBalance.add(cost)).to.equal(
                                    prevProviderBaseBalance.add(deductWithdrawalFee(BASE_AMOUNT))
                                );
                            });
                        });
                    }
                });
            }
        }
    }
});
