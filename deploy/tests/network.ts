import Contracts, {
    AccessControlEnumerable,
    BancorNetwork,
    BancorNetworkInfo,
    BancorPortal,
    BNTPool,
    ExternalProtectionVault,
    ExternalRewardsVault,
    MasterVault,
    NetworkSettings,
    PendingWithdrawals,
    PoolCollection,
    PoolMigrator,
    PoolToken,
    PoolTokenFactory,
    StandardRewards
} from '../../components/Contracts';
import { BNT, TokenGovernance, VBNT } from '../../components/LegacyContracts';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { performTestDeployment } from '../../test/helpers/Deploy';
import { getBalance, getTransactionCost } from '../../test/helpers/Utils';
import { MAX_UINT256, ZERO_ADDRESS } from '../../utils/Constants';
import {
    DeployedContracts,
    deploymentMetadata,
    getLatestDeploymentTag,
    getNamedSigners,
    isMainnet,
    isMainnetFork
} from '../../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { toWei } from '../../utils/Types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';
import { getNamedAccounts } from 'hardhat';

(isMainnet() ? describe : describe.skip)('network', async () => {
    let network: BancorNetwork;
    let bntGovernance: TokenGovernance;
    let vbntGovernance: TokenGovernance;
    let bnt: BNT;
    let vbnt: VBNT;
    let networkSettings: NetworkSettings;
    let masterVault: MasterVault;
    let externalProtectionVault: ExternalProtectionVault;
    let externalRewardsVault: ExternalRewardsVault;
    let bntPool: BNTPool;
    let bntBNT: PoolToken;
    let pendingWithdrawals: PendingWithdrawals;
    let poolTokenFactory: PoolTokenFactory;
    let poolMigrator: PoolMigrator;
    let poolCollection: PoolCollection;
    let standardRewards: StandardRewards;
    let networkInfo: BancorNetworkInfo;
    let bancorPortal: BancorPortal;

    beforeEach(async () => {
        const { tag } = deploymentMetadata(getLatestDeploymentTag());

        await performTestDeployment(tag);

        network = await DeployedContracts.BancorNetwork.deployed();
        bntGovernance = await DeployedContracts.BNTGovernance.deployed();
        vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
        bnt = await DeployedContracts.BNT.deployed();
        vbnt = await DeployedContracts.VBNT.deployed();
        networkSettings = await DeployedContracts.NetworkSettings.deployed();
        masterVault = await DeployedContracts.MasterVault.deployed();
        externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
        externalRewardsVault = await DeployedContracts.ExternalRewardsVault.deployed();
        bntPool = await DeployedContracts.BNTPool.deployed();
        bntBNT = await DeployedContracts.bnBNT.deployed();
        pendingWithdrawals = await DeployedContracts.PendingWithdrawals.deployed();
        poolTokenFactory = await DeployedContracts.PoolTokenFactory.deployed();
        poolMigrator = await DeployedContracts.PoolMigrator.deployed();
        poolCollection = await DeployedContracts.PoolCollectionType1V1.deployed();
        standardRewards = await DeployedContracts.StandardRewards.deployed();
        networkInfo = await DeployedContracts.BancorNetworkInfo.deployed();
        bancorPortal = await DeployedContracts.BancorPortal.deployed();
    });

    describe.only('roles', () => {
        it('should have the correct set of roles', async () => {
            const { deployer, deployerV2, foundationMultisig, daoMultisig, legacyStakingRewards } =
                await getNamedAccounts();

            const liquidityProtection = await DeployedContracts.LiquidityProtection.deployed();

            await expectRoleMembers(
                bntGovernance as any as AccessControlEnumerable,
                Roles.TokenGovernance.ROLE_SUPERVISOR,
                [isMainnetFork() ? foundationMultisig : deployer]
            );
            await expectRoleMembers(
                bntGovernance as any as AccessControlEnumerable,
                Roles.TokenGovernance.ROLE_GOVERNOR,
                isMainnet() ? [deployerV2] : [deployer]
            );
            await expectRoleMembers(
                bntGovernance as any as AccessControlEnumerable,
                Roles.TokenGovernance.ROLE_MINTER,
                isMainnet()
                    ? [standardRewards.address, bntPool.address, liquidityProtection.address, legacyStakingRewards]
                    : [standardRewards.address, bntPool.address]
            );

            await expectRoleMembers(
                vbntGovernance as any as AccessControlEnumerable,
                Roles.TokenGovernance.ROLE_SUPERVISOR,
                [isMainnetFork() ? foundationMultisig : deployer]
            );
            await expectRoleMembers(
                vbntGovernance as any as AccessControlEnumerable,
                Roles.TokenGovernance.ROLE_GOVERNOR,
                isMainnet() ? [deployerV2] : [deployer]
            );
            await expectRoleMembers(
                vbntGovernance as any as AccessControlEnumerable,
                Roles.TokenGovernance.ROLE_MINTER,
                isMainnet() ? [bntPool.address, liquidityProtection.address] : [bntPool.address]
            );

            await expectRoleMembers(masterVault, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig, network.address]);
            await expectRoleMembers(masterVault, Roles.Vault.ROLE_ASSET_MANAGER, [
                network.address,
                poolCollection.address
            ]);

            await expectRoleMembers(externalProtectionVault, Roles.Upgradeable.ROLE_ADMIN, [
                daoMultisig,
                network.address
            ]);
            await expectRoleMembers(externalProtectionVault, Roles.Vault.ROLE_ASSET_MANAGER, [
                network.address,
                poolCollection.address
            ]);

            await expectRoleMembers(externalRewardsVault, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);
            await expectRoleMembers(externalRewardsVault, Roles.Vault.ROLE_ASSET_MANAGER, [standardRewards.address]);

            await expectRoleMembers(poolTokenFactory, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

            await expectRoleMembers(networkSettings, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

            await expectRoleMembers(bntPool, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig, network.address]);
            await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_BNT_POOL_TOKEN_MANAGER);
            await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_BNT_MANAGER, [poolCollection.address]);
            await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_VAULT_MANAGER, [poolCollection.address]);
            await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_FUNDING_MANAGER, [poolCollection.address]);

            await expectRoleMembers(pendingWithdrawals, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

            await expectRoleMembers(poolMigrator, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

            await expectRoleMembers(network, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);
            await expectRoleMembers(network, Roles.BancorNetwork.ROLE_MIGRATION_MANAGER, [liquidityProtection.address]);
            await expectRoleMembers(network, Roles.BancorNetwork.ROLE_EMERGENCY_STOPPER);
            await expectRoleMembers(network, Roles.BancorNetwork.ROLE_NETWORK_FEE_MANAGER);

            await expectRoleMembers(standardRewards, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

            await expectRoleMembers(networkInfo, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

            await expectRoleMembers(bancorPortal, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);
        });
    });

    describe('health checks', () => {
        enum TestPools {
            BNT = 'BNT',
            ETH = 'ETH',
            DAI = 'DAI',
            LINK = 'LINK'
        }

        interface Pool {
            token: string;
            whale: SignerWithAddress;
        }

        let pools: Record<string, Pool>;

        beforeEach(async () => {
            const { dai, link } = await getNamedAccounts();
            const { daoMultisig, ethWhale, daiWhale, linkWhale } = await getNamedSigners();

            pools = {
                [TestPools.ETH]: {
                    token: NATIVE_TOKEN_ADDRESS,
                    whale: ethWhale
                },
                [TestPools.DAI]: {
                    token: dai,
                    whale: daiWhale
                },
                [TestPools.LINK]: {
                    token: link,
                    whale: linkWhale
                }
            };

            for (const { token } of Object.values(pools)) {
                await poolCollection.connect(daoMultisig).setDepositLimit(token, MAX_UINT256);
            }
        });

        it('should perform deposits', async () => {
            for (const [tokenSymbol, { token, whale }] of Object.entries(pools)) {
                const isNativeToken = tokenSymbol === TestPools.ETH;

                const depositAmount = toWei(1000);

                for (let i = 0; i < 5; i++) {
                    const { liquidity: prevLiquidity } = await poolCollection.poolData(token);

                    if (!isNativeToken) {
                        const tokenContract = await Contracts.ERC20.attach(token);
                        await tokenContract.connect(whale).approve(network.address, depositAmount);
                    }

                    await network.connect(whale).deposit(token, depositAmount, {
                        value: isNativeToken ? depositAmount : BigNumber.from(0)
                    });

                    const { liquidity } = await poolCollection.poolData(token);
                    expect(liquidity.stakedBalance).to.equal(prevLiquidity.stakedBalance.add(depositAmount));

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

            const { bntWhale } = await getNamedSigners();

            // perform a few BNT deposit tests
            const bntAmount = toWei(10);

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

        it('should perform withdrawals', async () => {
            const { daoMultisig, bntWhale } = await getNamedSigners();

            await pendingWithdrawals.connect(daoMultisig).setLockDuration(0);

            const testPools = {
                ...pools,
                BNT: {
                    token: bnt.address,
                    whale: bntWhale
                }
            };

            for (const [tokenSymbol, { token, whale }] of Object.entries(testPools)) {
                const isNativeToken = tokenSymbol === TestPools.ETH;
                if (isNativeToken) {
                    continue;
                }
                const isBNT = tokenSymbol === TestPools.BNT;

                const poolToken = await Contracts.PoolToken.attach(await networkInfo.poolToken(token));
                const prevPoolTokenAmount = await poolToken.balanceOf(whale.address);
                const initialVBNTAmount = await vbnt.balanceOf(whale.address);

                // ensure that there is a position to withdraw
                const depositAmount = toWei(10);

                if (!isNativeToken) {
                    const tokenContract = await Contracts.ERC20.attach(token);
                    await tokenContract.connect(whale).approve(network.address, depositAmount);
                }

                const poolTokenAmount = await network.connect(whale).callStatic.deposit(token, depositAmount, {
                    value: isNativeToken ? depositAmount : BigNumber.from(0)
                });

                await network
                    .connect(whale)
                    .deposit(token, depositAmount, { value: isNativeToken ? depositAmount : BigNumber.from(0) });

                expect(await poolToken.balanceOf(whale.address)).to.equal(prevPoolTokenAmount.add(poolTokenAmount));
                expect(await vbnt.balanceOf(whale.address)).to.equal(
                    isBNT ? initialVBNTAmount.add(poolTokenAmount) : initialVBNTAmount
                );

                // perform a few small trades to stabilize the EMA
                if (!isBNT) {
                    const tradeCount = 10;
                    const tradeAmount = toWei(1);
                    if (!isNativeToken) {
                        const tokenContract = await Contracts.ERC20.attach(token);
                        await tokenContract.connect(whale).approve(network.address, tradeAmount.mul(tradeCount));
                    }

                    for (let i = 0; i < tradeCount; i++) {
                        await network
                            .connect(whale)
                            .tradeBySourceAmount(token, bnt.address, tradeAmount, 1, MAX_UINT256, ZERO_ADDRESS, {
                                value: isNativeToken ? tradeAmount : BigNumber.from(0)
                            });
                    }
                }

                // initiate withdrawal
                const prevTokenAmount = await getBalance({ address: token }, whale);

                await poolToken.connect(whale).approve(network.address, poolTokenAmount);

                const id = await network.connect(whale).callStatic.initWithdrawal(poolToken.address, poolTokenAmount);
                await network.connect(whale).initWithdrawal(poolToken.address, poolTokenAmount);

                expect(await poolToken.balanceOf(whale.address)).to.equal(prevPoolTokenAmount);

                if (isBNT) {
                    await vbnt.connect(whale).approve(network.address, poolTokenAmount);
                }

                const withdrawnAmount = await network.connect(whale).callStatic.withdraw(id);
                await network.connect(whale).withdraw(id);

                expect(await poolToken.balanceOf(whale.address)).to.equal(prevPoolTokenAmount);
                expect(await getBalance({ address: token }, whale)).to.equal(prevTokenAmount.add(withdrawnAmount));
                expect(await vbnt.balanceOf(whale.address)).to.equal(initialVBNTAmount);
            }
        });

        it('should perform trades', async () => {
            for (const [tokenSymbol, { token, whale }] of Object.entries(pools)) {
                const isNativeToken = tokenSymbol === TestPools.ETH;
                const tokenWithAddress = { address: token };

                const tradeAmount = toWei(2500);

                for (let i = 0; i < 5; i++) {
                    if (!isNativeToken) {
                        const tokenContract = await Contracts.ERC20.attach(token);
                        await tokenContract.connect(whale).approve(network.address, tradeAmount);
                    }

                    const prevTokenBalance = await getBalance(tokenWithAddress, whale);
                    const prevBNTBalance = await getBalance(bnt, whale);

                    const res = await network
                        .connect(whale)
                        .tradeBySourceAmount(token, bnt.address, tradeAmount, 1, MAX_UINT256, ZERO_ADDRESS, {
                            value: isNativeToken ? tradeAmount : BigNumber.from(0)
                        });

                    let transactionCost = BigNumber.from(0);
                    if (isNativeToken) {
                        transactionCost = await getTransactionCost(res);
                    }

                    const newBNTBalance = await getBalance(bnt, whale);

                    expect(await getBalance(tokenWithAddress, whale)).to.equal(
                        prevTokenBalance.sub(tradeAmount).sub(transactionCost)
                    );
                    expect(newBNTBalance).to.be.gt(prevBNTBalance);

                    await bnt.connect(whale).approve(network.address, newBNTBalance);

                    const prevTokenBalance2 = await getBalance(tokenWithAddress, whale);

                    await network
                        .connect(whale)
                        .tradeBySourceAmount(bnt.address, token, newBNTBalance, 1, MAX_UINT256, ZERO_ADDRESS);

                    expect(await getBalance(tokenWithAddress, whale)).to.gte(prevTokenBalance2);
                    expect(await getBalance(bnt, whale)).to.be.equal(0);
                }
            }
        });
    });
});
