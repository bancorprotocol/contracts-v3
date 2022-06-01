import Contracts, {
    BancorV1Migration,
    IERC20,
    MasterVault,
    NetworkSettings,
    PendingWithdrawals,
    PoolToken,
    TestBancorNetwork,
    TestPoolCollection
} from '../../components/Contracts';
import { DSToken, TestStandardPoolConverter, TokenGovernance } from '../../components/LegacyContracts';
import { PPM_RESOLUTION, ZERO_ADDRESS } from '../../utils/Constants';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { toPPM } from '../../utils/Types';
import { createPool, createSystem, createToken, TokenWithAddress } from '../helpers/Factory';
import { createLegacySystem } from '../helpers/LegacyFactory';
import { getBalance, getTransactionCost } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, BigNumberish } from 'ethers';
import { ethers } from 'hardhat';

describe('BancorV1Migration', () => {
    const BNT_VIRTUAL_BALANCE = 1;
    const BASE_TOKEN_VIRTUAL_BALANCE = 2;
    const FUNDING_LIMIT = BigNumber.from(100_000_000);
    const MIN_LIQUIDITY = BigNumber.from(100_000);
    const TOTAL_SUPPLY = BigNumber.from(1_000_000_000);
    const DEPOSIT_AMOUNT = BigNumber.from(100_000_000);

    let deployer: SignerWithAddress;
    let provider: SignerWithAddress;

    let bntGovernance: TokenGovernance;
    let vbntGovernance: TokenGovernance;
    let vbnt: IERC20;
    let network: TestBancorNetwork;
    let networkSettings: NetworkSettings;
    let bnt: IERC20;
    let bntPoolToken: PoolToken;
    let basePoolToken: PoolToken;
    let pendingWithdrawals: PendingWithdrawals;
    let poolCollection: TestPoolCollection;
    let masterVault: MasterVault;
    let bancorV1Migration: BancorV1Migration;
    let converter: TestStandardPoolConverter;
    let poolToken: DSToken;
    let baseToken: TokenWithAddress;

    before(async () => {
        [deployer, provider] = await ethers.getSigners();
    });

    beforeEach(async () => {
        ({
            bntGovernance,
            vbntGovernance,
            vbnt,
            network,
            networkSettings,
            bnt,
            bntPoolToken,
            pendingWithdrawals,
            poolCollection,
            masterVault
        } = await createSystem());

        bancorV1Migration = await Contracts.BancorV1Migration.deploy(
            network.address,
            networkSettings.address,
            bnt.address
        );
    });

    describe('construction', () => {
        it('should revert when attempting to create with an invalid network contract', async () => {
            await expect(
                Contracts.BancorV1Migration.deploy(ZERO_ADDRESS, networkSettings.address, bnt.address)
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid network settings contract', async () => {
            await expect(
                Contracts.BancorV1Migration.deploy(network.address, ZERO_ADDRESS, bnt.address)
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid BNT contract', async () => {
            await expect(
                Contracts.BancorV1Migration.deploy(network.address, networkSettings.address, ZERO_ADDRESS)
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should be properly initialized', async () => {
            expect(await bancorV1Migration.version()).to.equal(1);
        });
    });

    const initLegacySystem = async (bntAmount: BigNumberish, baseAmount: BigNumberish, isNativeToken: boolean) => {
        baseToken = await createToken(new TokenData(isNativeToken ? TokenSymbol.ETH : TokenSymbol.TKN));

        ({ poolToken, converter } = await createLegacySystem(
            deployer,
            network,
            masterVault,
            bnt,
            bntGovernance,
            vbntGovernance,
            baseToken
        ));

        await bntGovernance.mint(deployer.address, TOTAL_SUPPLY);
        await bnt.transfer(provider.address, bntAmount);

        basePoolToken = await createPool(baseToken, network, networkSettings, poolCollection);

        await networkSettings.setFundingLimit(baseToken.address, FUNDING_LIMIT);

        await pendingWithdrawals.setLockDuration(0);

        await bnt.connect(provider).approve(converter.address, bntAmount);
        if (!isNativeToken) {
            const token = await Contracts.TestERC20Token.attach(baseToken.address);
            await token.transfer(provider.address, baseAmount);
            await token.connect(provider).approve(converter.address, baseAmount);
        }

        await converter.connect(provider).addLiquidity([bnt.address, baseToken.address], [bntAmount, baseAmount], 1, {
            value: isNativeToken ? baseAmount : BigNumber.from(0)
        });
    };

    const verify = async (
        withdrawalFee: number,
        bntAmount: BigNumberish,
        baseAmount: BigNumberish,
        isNativeToken: boolean,
        isTokenWhitelisted: boolean,
        percent: number
    ) => {
        const portionOf = (amount: BigNumberish) => BigNumber.from(amount).mul(percent).div(100);
        const deductFee = (amount: BigNumberish) =>
            BigNumber.from(amount).sub(BigNumber.from(amount).mul(withdrawalFee).div(PPM_RESOLUTION));

        const prevProviderPoolTokenBalance = await getBalance(poolToken, provider.address);
        const prevConverterBNTBalance = await getBalance(bnt, converter.address);
        const prevConverterBaseBalance = await getBalance(baseToken, converter.address);
        const prevVaultBaseBalance = await getBalance(baseToken, masterVault.address);
        const prevProviderBaseBalance = await getBalance(baseToken, provider.address);
        const prevPoolTokenSupply = await poolToken.totalSupply();

        const poolTokenAmount = portionOf(await getBalance(poolToken, provider.address));
        const res0 = await poolToken.connect(provider).approve(bancorV1Migration.address, poolTokenAmount);
        const res1 = await bancorV1Migration.connect(provider).migratePoolTokens(poolToken.address, poolTokenAmount);
        const cost = isNativeToken ? (await getTransactionCost(res0)).add(await getTransactionCost(res1)) : 0;

        const currProviderPoolTokenBalance = await getBalance(poolToken, provider.address);
        const currConverterBNTBalance = await getBalance(bnt, converter.address);
        const currConverterBaseBalance = await getBalance(baseToken, converter.address);
        const currVaultBaseBalance = await getBalance(baseToken, masterVault.address);
        const currProviderBaseBalance = await getBalance(baseToken, provider.address);
        const currPoolTokenSupply = await poolToken.totalSupply();

        const migratedBaseAmount = portionOf(baseAmount);

        expect(currProviderPoolTokenBalance).to.equal(prevProviderPoolTokenBalance.sub(poolTokenAmount));
        expect(currConverterBNTBalance).to.equal(
            prevConverterBNTBalance.sub(prevConverterBNTBalance.mul(migratedBaseAmount).div(prevConverterBaseBalance))
        );
        expect(currConverterBaseBalance).to.equal(prevConverterBaseBalance.sub(migratedBaseAmount));
        expect(currVaultBaseBalance).to.equal(prevVaultBaseBalance.add(isTokenWhitelisted ? migratedBaseAmount : 0));
        expect(currProviderBaseBalance).to.equal(
            prevProviderBaseBalance.add(isTokenWhitelisted ? 0 : migratedBaseAmount).sub(cost)
        );
        expect(currPoolTokenSupply).to.equal(prevPoolTokenSupply.sub(poolTokenAmount));

        await expect(res1)
            .to.emit(bancorV1Migration, 'PositionMigrated')
            .withArgs(
                provider.address,
                poolToken.address,
                baseToken.address,
                bnt.address,
                portionOf(baseAmount),
                portionOf(bntAmount),
                isTokenWhitelisted,
                true
            );

        const prevProviderBNTBalance = await getBalance(bnt, provider);

        const bntPoolTokenAmount = await getBalance(bntPoolToken, provider.address);
        await bntPoolToken.connect(provider).approve(network.address, bntPoolTokenAmount);

        await network.connect(provider).initWithdrawal(bntPoolToken.address, bntPoolTokenAmount);

        const networkIds = await pendingWithdrawals.withdrawalRequestIds(provider.address);
        await vbnt.connect(provider).approve(network.address, await getBalance(vbnt, provider.address));
        await network.connect(provider).withdraw(networkIds[0]);

        const basePoolTokenAmount = await getBalance(basePoolToken, provider.address);

        if (isTokenWhitelisted) {
            await basePoolToken.connect(provider).approve(network.address, basePoolTokenAmount);
            await network.connect(provider).initWithdrawal(basePoolToken.address, basePoolTokenAmount);

            const baseIds = await pendingWithdrawals.withdrawalRequestIds(provider.address);

            const prevProviderBaseBalance = await getBalance(baseToken, provider);

            const res = await network.connect(provider).withdraw(baseIds[0]);
            const transactionCost = isNativeToken ? await getTransactionCost(res) : 0;

            const currProviderBaseBalance = await getBalance(baseToken, provider);

            expect(currProviderBaseBalance.add(transactionCost)).to.equal(
                prevProviderBaseBalance.add(deductFee(migratedBaseAmount))
            );
        } else {
            expect(basePoolTokenAmount).to.equal(0);
        }

        const currProviderBNTBalance = await getBalance(bnt, provider);
        expect(currProviderBNTBalance).to.equal(prevProviderBNTBalance.add(deductFee(portionOf(bntAmount))));
    };

    const deposit = async (amount: BigNumberish, isNativeToken: boolean) => {
        if (isNativeToken) {
            await network.deposit(baseToken.address, amount, { value: amount });
        } else {
            const token = await Contracts.TestERC20Token.attach(baseToken.address);
            await token.approve(network.address, amount);

            await network.deposit(baseToken.address, amount);
        }
    };

    const test = (
        withdrawalFeePercent: number,
        bntAmount: BigNumberish,
        baseAmount: BigNumberish,
        isNativeToken: boolean,
        isTokenWhitelisted: boolean,
        percent: number
    ) => {
        const withdrawalFeePPM = toPPM(withdrawalFeePercent);

        describe(`withdrawal fee = ${withdrawalFeePercent}%`, () => {
            describe(`BNT amount = ${bntAmount}`, () => {
                describe(`base amount = ${baseAmount}`, () => {
                    describe(`base token = ${isNativeToken ? 'ETH' : 'ERC20'}`, () => {
                        describe(`base token is ${isTokenWhitelisted ? '' : 'not '}whitelisted`, () => {
                            beforeEach(async () => {
                                await networkSettings.setWithdrawalFeePPM(withdrawalFeePPM);
                                await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY);

                                await initLegacySystem(bntAmount, baseAmount, isNativeToken);

                                // ensure that enough funding has been requested before a migration
                                await deposit(DEPOSIT_AMOUNT, isNativeToken);

                                await poolCollection.enableTrading(
                                    baseToken.address,
                                    BNT_VIRTUAL_BALANCE,
                                    BASE_TOKEN_VIRTUAL_BALANCE
                                );

                                for (let i = 0; i < 5; i++) {
                                    await deposit(DEPOSIT_AMOUNT, isNativeToken);
                                }

                                if (!isTokenWhitelisted) {
                                    await networkSettings.removeTokenFromWhitelist(baseToken.address);
                                }
                            });

                            it(`verifies that the caller can migrate ${percent}% of its pool tokens`, async () => {
                                await verify(
                                    withdrawalFeePPM,
                                    bntAmount,
                                    baseAmount,
                                    isNativeToken,
                                    isTokenWhitelisted,
                                    percent
                                );
                            });
                        });
                    });
                });
            });
        });
    };

    describe('regular tests', () => {
        for (const withdrawalFeeP of [5]) {
            for (const bntAmount of [1_000_000]) {
                for (const baseAmount of [5_000_000]) {
                    for (const isNativeToken of [false, true]) {
                        for (const isTokenWhitelisted of [false, true]) {
                            for (const percent of [10, 100]) {
                                test(withdrawalFeeP, bntAmount, baseAmount, isNativeToken, isTokenWhitelisted, percent);
                            }
                        }
                    }
                }
            }
        }
    });

    describe('@stress tests', () => {
        for (const withdrawalFeeP of [1, 2.5]) {
            for (const bntAmount of [1_000_000, 5_000_000]) {
                for (const baseAmount of [1_000_000, 5_000_000]) {
                    for (const isNativeToken of [false, true]) {
                        for (const isTokenWhitelisted of [false, true]) {
                            for (const percent of [25, 100]) {
                                test(withdrawalFeeP, bntAmount, baseAmount, isNativeToken, isTokenWhitelisted, percent);
                            }
                        }
                    }
                }
            }
        }
    });
});
