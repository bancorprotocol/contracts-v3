import Contracts from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import {
    BancorNetworkInformation,
    BancorVault,
    ExternalProtectionVault,
    ExternalRewardsVault,
    IERC20,
    IPoolToken,
    NetworkSettings,
    TestBancorNetwork,
    TestMasterPool,
    TestPendingWithdrawals,
    TestPoolCollection,
    TestPoolCollectionUpgrader
} from '../../typechain-types';
import { ZERO_ADDRESS } from '../helpers/Constants';
import { BNT, ETH, TKN } from '../helpers/Constants';
import { createSystem, depositToPool, setupSimplePool, PoolSpec } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { latest } from '../helpers/Time';
import { toWei } from '../helpers/Types';
import { createWallet, TokenWithAddress } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Wallet } from 'ethers';
import { ethers } from 'hardhat';

describe('BancorNetworkInformation', () => {
    let deployer: SignerWithAddress;

    shouldHaveGap('BancorNetworkInformation');

    before(async () => {
        [deployer] = await ethers.getSigners();
    });

    describe('construction', () => {
        let network: TestBancorNetwork;
        let networkToken: IERC20;
        let govToken: IERC20;
        let networkInformation: BancorNetworkInformation;
        let networkSettings: NetworkSettings;
        let networkTokenGovernance: TokenGovernance;
        let govTokenGovernance: TokenGovernance;
        let masterPool: TestMasterPool;
        let masterPoolToken: IPoolToken;
        let poolCollectionUpgrader: TestPoolCollectionUpgrader;
        let mainVault: BancorVault;
        let externalProtectionVault: ExternalProtectionVault;
        let externalRewardsVault: ExternalRewardsVault;
        let pendingWithdrawals: TestPendingWithdrawals;

        beforeEach(async () => {
            ({
                network,
                networkToken,
                govToken,
                networkInformation,
                networkSettings,
                networkTokenGovernance,
                govTokenGovernance,
                masterPool,
                poolCollectionUpgrader,
                mainVault,
                externalProtectionVault,
                externalRewardsVault,
                pendingWithdrawals
            } = await createSystem());
        });

        it('should revert when attempting to create with an invalid network contract', async () => {
            await expect(
                Contracts.BancorNetworkInformation.deploy(
                    ZERO_ADDRESS,
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    networkSettings.address,
                    mainVault.address,
                    externalProtectionVault.address,
                    externalRewardsVault.address,
                    masterPool.address,
                    pendingWithdrawals.address,
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid network token governance contract', async () => {
            await expect(
                Contracts.BancorNetworkInformation.deploy(
                    network.address,
                    ZERO_ADDRESS,
                    govTokenGovernance.address,
                    networkSettings.address,
                    mainVault.address,
                    externalProtectionVault.address,
                    externalRewardsVault.address,
                    masterPool.address,
                    pendingWithdrawals.address,
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid gov token governance contract', async () => {
            await expect(
                Contracts.BancorNetworkInformation.deploy(
                    network.address,
                    networkTokenGovernance.address,
                    ZERO_ADDRESS,
                    networkSettings.address,
                    mainVault.address,
                    externalProtectionVault.address,
                    externalRewardsVault.address,
                    masterPool.address,
                    pendingWithdrawals.address,
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid network settings contract', async () => {
            await expect(
                Contracts.BancorNetworkInformation.deploy(
                    network.address,
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    ZERO_ADDRESS,
                    mainVault.address,
                    externalProtectionVault.address,
                    externalRewardsVault.address,
                    masterPool.address,
                    pendingWithdrawals.address,
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid main vault contract', async () => {
            await expect(
                Contracts.BancorNetworkInformation.deploy(
                    network.address,
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    networkSettings.address,
                    ZERO_ADDRESS,
                    externalProtectionVault.address,
                    externalRewardsVault.address,
                    masterPool.address,
                    pendingWithdrawals.address,
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid external protection vault contract', async () => {
            await expect(
                Contracts.BancorNetworkInformation.deploy(
                    network.address,
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    networkSettings.address,
                    mainVault.address,
                    ZERO_ADDRESS,
                    externalRewardsVault.address,
                    masterPool.address,
                    pendingWithdrawals.address,
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid external rewards vault contract', async () => {
            await expect(
                Contracts.BancorNetworkInformation.deploy(
                    network.address,
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    networkSettings.address,
                    mainVault.address,
                    externalProtectionVault.address,
                    ZERO_ADDRESS,
                    masterPool.address,
                    pendingWithdrawals.address,
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid master pool contract', async () => {
            await expect(
                Contracts.BancorNetworkInformation.deploy(
                    network.address,
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    networkSettings.address,
                    mainVault.address,
                    externalProtectionVault.address,
                    externalRewardsVault.address,
                    ZERO_ADDRESS,
                    pendingWithdrawals.address,
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid pending withdrawals contract', async () => {
            await expect(
                Contracts.BancorNetworkInformation.deploy(
                    network.address,
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    networkSettings.address,
                    mainVault.address,
                    externalProtectionVault.address,
                    externalRewardsVault.address,
                    masterPool.address,
                    ZERO_ADDRESS,
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid pool collection upgrader contract', async () => {
            await expect(
                Contracts.BancorNetworkInformation.deploy(
                    network.address,
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    networkSettings.address,
                    mainVault.address,
                    externalProtectionVault.address,
                    externalRewardsVault.address,
                    masterPool.address,
                    pendingWithdrawals.address,
                    ZERO_ADDRESS
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should be properly initialized', async () => {
            expect(await networkInformation.version()).to.equal(1);

            expect(await networkInformation.network()).to.equal(network.address);
            expect(await networkInformation.networkToken()).to.equal(networkToken.address);
            expect(await networkInformation.networkTokenGovernance()).to.equal(networkTokenGovernance.address);
            expect(await networkInformation.govToken()).to.equal(govToken.address);
            expect(await networkInformation.govTokenGovernance()).to.equal(govTokenGovernance.address);
            expect(await networkInformation.networkSettings()).to.equal(networkSettings.address);
            expect(await networkInformation.mainVault()).to.equal(mainVault.address);
            expect(await networkInformation.externalProtectionVault()).to.equal(externalProtectionVault.address);
            expect(await networkInformation.externalRewardsVault()).to.equal(externalRewardsVault.address);
            expect(await networkInformation.masterPool()).to.equal(masterPool.address);
            expect(await networkInformation.masterPoolToken()).to.equal(masterPoolToken.address);
            expect(await networkInformation.pendingWithdrawals()).to.equal(pendingWithdrawals.address);
            expect(await networkInformation.poolCollectionUpgrader()).to.equal(poolCollectionUpgrader.address);
        });
    });

    describe('trade amounts', () => {
        let network: TestBancorNetwork;
        let networkInformation: BancorNetworkInformation;
        let networkSettings: NetworkSettings;
        let networkToken: IERC20;
        let poolCollection: TestPoolCollection;

        let sourceToken: TokenWithAddress;
        let targetToken: TokenWithAddress;

        let trader: Wallet;

        const INITIAL_RATE = { n: BigNumber.from(1), d: BigNumber.from(2) };
        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(100_000));
        const NETWORK_TOKEN_LIQUIDITY = toWei(BigNumber.from(100_000));

        beforeEach(async () => {
            ({ network, networkToken, networkInformation, networkSettings, poolCollection } = await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
        });

        const setupPools = async (source: PoolSpec, target: PoolSpec) => {
            trader = await createWallet();

            ({ token: sourceToken } = await setupSimplePool(
                source,
                deployer,
                network,
                networkInformation,
                networkSettings,
                poolCollection
            ));

            ({ token: targetToken } = await setupSimplePool(
                target,
                deployer,
                network,
                networkInformation,
                networkSettings,
                poolCollection
            ));

            await depositToPool(deployer, networkToken, NETWORK_TOKEN_LIQUIDITY, network);

            await network.setTime(await latest());
        };

        interface TradeAmountsOverrides {
            sourceTokenAddress?: string;
            targetTokenAddress?: string;
        }
        const tradeTargetAmount = async (amount: BigNumber, overrides: TradeAmountsOverrides = {}) => {
            const { sourceTokenAddress = sourceToken.address, targetTokenAddress = targetToken.address } = overrides;

            return networkInformation.tradeTargetAmount(sourceTokenAddress, targetTokenAddress, amount);
        };

        const tradeSourceAmount = async (amount: BigNumber, overrides: TradeAmountsOverrides = {}) => {
            const { sourceTokenAddress = sourceToken.address, targetTokenAddress = targetToken.address } = overrides;

            return networkInformation.tradeSourceAmount(sourceTokenAddress, targetTokenAddress, amount);
        };

        const testTradesAmounts = (source: PoolSpec, target: PoolSpec) => {
            const isSourceETH = source.symbol === ETH;

            context(`when trading from ${source.symbol} to ${target.symbol}`, () => {
                const testAmount = BigNumber.from(1000);

                beforeEach(async () => {
                    await setupPools(source, target);

                    if (!isSourceETH) {
                        const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);

                        await reserveToken.transfer(await trader.getAddress(), testAmount);
                        await reserveToken.connect(trader).approve(network.address, testAmount);
                    }
                });

                it('should revert when attempting to query using an invalid source pool', async () => {
                    await expect(
                        tradeTargetAmount(testAmount, { sourceTokenAddress: ZERO_ADDRESS })
                    ).to.be.revertedWith('InvalidAddress');
                    await expect(
                        tradeSourceAmount(testAmount, { sourceTokenAddress: ZERO_ADDRESS })
                    ).to.be.revertedWith('InvalidAddress');
                });

                it('should revert when attempting to query using an invalid target pool', async () => {
                    await expect(
                        tradeTargetAmount(testAmount, { targetTokenAddress: ZERO_ADDRESS })
                    ).to.be.revertedWith('InvalidAddress');
                    await expect(
                        tradeSourceAmount(testAmount, { targetTokenAddress: ZERO_ADDRESS })
                    ).to.be.revertedWith('InvalidAddress');
                });

                it('should revert when attempting to  query using an invalid amount', async () => {
                    const amount = BigNumber.from(0);

                    await expect(tradeTargetAmount(amount)).to.be.revertedWith('ZeroValue');
                    await expect(tradeSourceAmount(amount)).to.be.revertedWith('ZeroValue');
                });

                it('should revert when attempting to query using unsupported tokens', async () => {
                    const reserveToken2 = await Contracts.TestERC20Token.deploy(TKN, TKN, BigNumber.from(1_000_000));

                    await reserveToken2.transfer(await trader.getAddress(), testAmount);
                    await reserveToken2.connect(trader).approve(network.address, testAmount);

                    // unknown source token
                    await expect(
                        tradeTargetAmount(testAmount, { sourceTokenAddress: reserveToken2.address })
                    ).to.be.revertedWith('InvalidToken');
                    await expect(
                        tradeSourceAmount(testAmount, { sourceTokenAddress: reserveToken2.address })
                    ).to.be.revertedWith('InvalidToken');

                    // unknown target token
                    await expect(
                        tradeTargetAmount(testAmount, { targetTokenAddress: reserveToken2.address })
                    ).to.be.revertedWith('InvalidToken');
                    await expect(
                        tradeSourceAmount(testAmount, { targetTokenAddress: reserveToken2.address })
                    ).to.be.revertedWith('InvalidToken');
                });

                it('should revert when attempting to query using same source and target tokens', async () => {
                    await expect(
                        tradeTargetAmount(testAmount, { targetTokenAddress: sourceToken.address })
                    ).to.be.revertedWith('InvalidTokens');
                    await expect(
                        tradeSourceAmount(testAmount, { targetTokenAddress: sourceToken.address })
                    ).to.be.revertedWith('InvalidTokens');
                });
            });
        };

        for (const [sourceSymbol, targetSymbol] of [
            [TKN, BNT],
            [TKN, ETH],
            [`${TKN}1`, `${TKN}2`],
            [BNT, ETH],
            [BNT, TKN],
            [ETH, BNT],
            [ETH, TKN]
        ]) {
            // perform a basic/sanity suite over a fixed input
            testTradesAmounts(
                {
                    symbol: sourceSymbol,
                    balance: toWei(BigNumber.from(1_000_000)),
                    initialRate: INITIAL_RATE
                },
                {
                    symbol: targetSymbol,
                    balance: toWei(BigNumber.from(5_000_000)),
                    initialRate: INITIAL_RATE
                }
            );
        }
    });
});
