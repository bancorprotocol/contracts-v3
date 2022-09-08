import Contracts, {
    IERC20,
    MasterVault,
    NetworkSettings,
    PoolToken,
    TestBancorNetwork,
    TestBNTPool,
    TestERC20Token,
    TestPoolCollection
} from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import { MAX_UINT256, PPM_RESOLUTION, ZERO_ADDRESS } from '../../utils/Constants';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { fromPPM, max, min, toPPM, toWei } from '../../utils/Types';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import { createPool, createSystem, createTestToken, createToken, TokenWithAddress } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, utils } from 'ethers';
import { ethers } from 'hardhat';

const { formatBytes32String } = utils;

describe('BNTPool', () => {
    let deployer: SignerWithAddress;
    let bntManager: SignerWithAddress;
    let fundingManager: SignerWithAddress;
    let provider: SignerWithAddress;
    let provider2: SignerWithAddress;

    const CONTEXT_ID = formatBytes32String('CTX');
    const FUNDING_LIMIT = toWei(10_000_000);

    shouldHaveGap('BNTPool', '_stakedBalance');

    before(async () => {
        [deployer, bntManager, fundingManager, provider, provider2] = await ethers.getSigners();
    });

    describe('construction', () => {
        let network: TestBancorNetwork;
        let bnt: IERC20;
        let networkSettings: NetworkSettings;
        let bntGovernance: TokenGovernance;
        let vbntGovernance: TokenGovernance;
        let masterVault: MasterVault;
        let bntPool: TestBNTPool;
        let bntPoolToken: PoolToken;

        beforeEach(async () => {
            ({ network, bnt, networkSettings, bntGovernance, vbntGovernance, masterVault, bntPool, bntPoolToken } =
                await createSystem());
        });

        it('should revert when attempting to create with an invalid network contract', async () => {
            await expect(
                Contracts.BNTPool.deploy(
                    ZERO_ADDRESS,
                    bntGovernance.address,
                    vbntGovernance.address,
                    networkSettings.address,
                    masterVault.address,
                    bntPoolToken.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid BNT governance contract', async () => {
            await expect(
                Contracts.BNTPool.deploy(
                    network.address,
                    ZERO_ADDRESS,
                    vbntGovernance.address,
                    networkSettings.address,
                    masterVault.address,
                    bntPoolToken.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid vBNT governance contract', async () => {
            await expect(
                Contracts.BNTPool.deploy(
                    network.address,
                    bntGovernance.address,
                    ZERO_ADDRESS,
                    networkSettings.address,
                    masterVault.address,
                    bntPoolToken.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid network settings contract', async () => {
            await expect(
                Contracts.BNTPool.deploy(
                    network.address,
                    bntGovernance.address,
                    vbntGovernance.address,
                    ZERO_ADDRESS,
                    masterVault.address,
                    bntPoolToken.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid master vault contract', async () => {
            await expect(
                Contracts.BNTPool.deploy(
                    network.address,
                    bntGovernance.address,
                    vbntGovernance.address,
                    networkSettings.address,
                    ZERO_ADDRESS,
                    bntPoolToken.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid BNT pool token contract', async () => {
            await expect(
                Contracts.BNTPool.deploy(
                    network.address,
                    bntGovernance.address,
                    vbntGovernance.address,
                    networkSettings.address,
                    masterVault.address,
                    ZERO_ADDRESS
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(bntPool.initialize()).to.be.revertedWithError(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            expect(await bntPool.version()).to.equal(3);

            expect(await bntPool.isPayable()).to.be.false;

            await expectRoles(bntPool, Roles.BNTPool);

            await expectRole(bntPool, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
                deployer.address,
                network.address
            ]);
            await expectRole(bntPool, Roles.BNTPool.ROLE_BNT_POOL_TOKEN_MANAGER, Roles.Upgradeable.ROLE_ADMIN);
            await expectRole(bntPool, Roles.BNTPool.ROLE_BNT_MANAGER, Roles.Upgradeable.ROLE_ADMIN);
            await expectRole(bntPool, Roles.BNTPool.ROLE_VAULT_MANAGER, Roles.Upgradeable.ROLE_ADMIN);
            await expectRole(bntPool, Roles.BNTPool.ROLE_FUNDING_MANAGER, Roles.Upgradeable.ROLE_ADMIN);

            expect(await bntPool.stakedBalance()).to.equal(0);

            const tokenData = new TokenData(TokenSymbol.bnBNT);

            const poolToken = await Contracts.PoolToken.attach(await bntPool.poolToken());
            expect(await poolToken.owner()).to.equal(bntPool.address);
            expect(await poolToken.reserveToken()).to.equal(bnt.address);
            expect(await poolToken.name()).to.equal(tokenData.name());
            expect(await poolToken.symbol()).to.equal(tokenData.symbol());
            expect(await poolToken.decimals()).to.equal(tokenData.decimals());
        });
    });

    describe('minting BNT', () => {
        let bnt: IERC20;
        let bntPool: TestBNTPool;

        beforeEach(async () => {
            ({ bnt, bntPool } = await createSystem());

            await bntPool.grantRole(Roles.BNTPool.ROLE_BNT_MANAGER, bntManager.address);
        });

        it('should revert when attempting to mint from a non-BNT manager', async () => {
            const nonBNTManager = deployer;

            await expect(bntPool.connect(nonBNTManager).mint(provider.address, 1)).to.be.revertedWithError(
                'AccessDenied'
            );
        });

        it('should revert when attempting to mint to an invalid address', async () => {
            await expect(bntPool.connect(bntManager).mint(ZERO_ADDRESS, 1)).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to mint an invalid amount', async () => {
            await expect(bntPool.connect(bntManager).mint(provider.address, 0)).to.be.revertedWithError('ZeroValue');
        });

        it('should mint to the recipient', async () => {
            const amount = toWei(12345);

            const prevTotalSupply = await bnt.totalSupply();
            const prevRecipientTokenBalance = await bnt.balanceOf(provider.address);

            await bntPool.connect(bntManager).mint(provider.address, amount);

            expect(await bnt.totalSupply()).to.equal(prevTotalSupply.add(amount));
            expect(await bnt.balanceOf(provider.address)).to.equal(prevRecipientTokenBalance.add(amount));
        });
    });

    describe('burning BNT from the vault', () => {
        let bnt: IERC20;
        let bntPool: TestBNTPool;
        let masterVault: MasterVault;
        let vaultManager: SignerWithAddress;

        const amount = toWei(12_345);

        before(async () => {
            [, vaultManager] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ bnt, bntPool, masterVault } = await createSystem());

            await bntPool.grantRole(Roles.BNTPool.ROLE_VAULT_MANAGER, vaultManager.address);

            await bnt.transfer(masterVault.address, amount);
        });

        it('should revert when attempting to burn from a non-vault manager', async () => {
            const nonVaultManager = deployer;

            await expect(bntPool.connect(nonVaultManager).burnFromVault(1)).to.be.revertedWithError('AccessDenied');
        });

        it('should revert when attempting to burn an invalid amount', async () => {
            await expect(bntPool.connect(vaultManager).burnFromVault(0)).to.be.revertedWithError('ZeroValue');
        });

        it('should revert when attempting to burn more than the balance of the master vault', async () => {
            await expect(bntPool.connect(vaultManager).burnFromVault(amount.add(1))).to.be.revertedWithError(
                'undefined'
            );
        });

        it('should burn from the master vault', async () => {
            const amount = toWei(12_345);

            const prevTotalSupply = await bnt.totalSupply();
            const prevVaultTokenBalance = await bnt.balanceOf(masterVault.address);

            await bntPool.connect(vaultManager).burnFromVault(amount);

            expect(await bnt.totalSupply()).to.equal(prevTotalSupply.sub(amount));
            expect(await bnt.balanceOf(masterVault.address)).to.equal(prevVaultTokenBalance.sub(amount));
        });
    });

    describe('request funding', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let bnt: IERC20;
        let bntPool: TestBNTPool;
        let bntPoolToken: PoolToken;
        let masterVault: MasterVault;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ networkSettings, network, bnt, bntPool, bntPoolToken, masterVault, poolCollection } =
                await createSystem());

            await bntPool.grantRole(Roles.BNTPool.ROLE_FUNDING_MANAGER, fundingManager.address);

            reserveToken = await createTestToken();

            await createPool(reserveToken, network, networkSettings, poolCollection);

            await networkSettings.setFundingLimit(reserveToken.address, FUNDING_LIMIT);
        });

        const testRequest = async (amount: BigNumber, expectedAmount: BigNumber) => {
            const prevStakedBalance = await bntPool.stakedBalance();
            const prevFunding = await bntPool.currentPoolFunding(reserveToken.address);
            const prevAvailableFunding = await bntPool.availableFunding(reserveToken.address);

            const prevPoolTokenTotalSupply = await bntPoolToken.totalSupply();
            const prevPoolPoolTokenBalance = await bntPoolToken.balanceOf(bntPool.address);
            const prevVaultPoolTokenBalance = await bntPoolToken.balanceOf(masterVault.address);

            expect(prevVaultPoolTokenBalance).to.equal(0);

            const prevTokenTotalSupply = await bnt.totalSupply();
            const prevPoolTokenBalance = await bnt.balanceOf(bntPool.address);
            const prevVaultTokenBalance = await bnt.balanceOf(masterVault.address);

            let expectedPoolTokenAmount;
            if (prevPoolTokenTotalSupply.isZero()) {
                expectedPoolTokenAmount = expectedAmount;
            } else {
                expectedPoolTokenAmount = expectedAmount.mul(prevPoolTokenTotalSupply).div(prevStakedBalance);
            }

            const res = await bntPool.connect(fundingManager).requestFunding(CONTEXT_ID, reserveToken.address, amount);

            await expect(res)
                .to.emit(bntPool, 'FundingRequested')
                .withArgs(CONTEXT_ID, reserveToken.address, expectedAmount, expectedPoolTokenAmount);

            await expect(res)
                .to.emit(bntPool, 'TotalLiquidityUpdated')
                .withArgs(
                    CONTEXT_ID,
                    await bnt.balanceOf(masterVault.address),
                    await bntPool.stakedBalance(),
                    await bntPoolToken.totalSupply()
                );

            expect(await bntPool.stakedBalance()).to.equal(prevStakedBalance.add(expectedAmount));
            expect(await bntPool.currentPoolFunding(reserveToken.address)).to.equal(prevFunding.add(expectedAmount));
            expect(await bntPool.availableFunding(reserveToken.address)).to.equal(
                prevAvailableFunding.sub(expectedAmount)
            );

            expect(await bntPoolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply.add(expectedPoolTokenAmount));
            expect(await bntPoolToken.balanceOf(bntPool.address)).to.equal(
                prevPoolPoolTokenBalance.add(expectedPoolTokenAmount)
            );
            expect(await bntPoolToken.balanceOf(masterVault.address)).to.equal(prevVaultPoolTokenBalance);

            expect(await bnt.totalSupply()).to.equal(prevTokenTotalSupply.add(expectedAmount));
            expect(await bnt.balanceOf(bntPool.address)).to.equal(prevPoolTokenBalance);
            expect(await bnt.balanceOf(masterVault.address)).to.equal(prevVaultTokenBalance.add(expectedAmount));
        };

        it('should revert when attempting to request funding from a non-funding manager', async () => {
            const nonFundingManager = deployer;

            await expect(
                bntPool.connect(nonFundingManager).requestFunding(CONTEXT_ID, reserveToken.address, 1)
            ).to.be.revertedWithError('AccessDenied');
        });

        it('should revert when attempting to request funding for a non-whitelisted pool', async () => {
            await expect(
                bntPool.connect(fundingManager).requestFunding(CONTEXT_ID, ZERO_ADDRESS, 1)
            ).to.be.revertedWithError('NotWhitelisted');

            const reserveToken2 = await createTestToken();
            await expect(
                bntPool.connect(fundingManager).requestFunding(CONTEXT_ID, reserveToken2.address, 1)
            ).to.be.revertedWithError('NotWhitelisted');
        });

        it('should revert when attempting to request a zero funding amount', async () => {
            await expect(
                bntPool.connect(fundingManager).requestFunding(CONTEXT_ID, reserveToken.address, 0)
            ).to.be.revertedWithError('ZeroValue');
        });

        it('should allow requesting funding', async () => {
            for (const amount of [1, 10_000, toWei(1_000_000), toWei(500_000)]) {
                await testRequest(BigNumber.from(amount), BigNumber.from(amount));
            }
        });

        context('when close to the funding limit', () => {
            const remaining = toWei(1_000_000);

            beforeEach(async () => {
                const amount = FUNDING_LIMIT.sub(remaining);

                await testRequest(amount, amount);
            });

            it('should allow requesting funding up to the limit', async () => {
                for (const amount of [toWei(10), toWei(100_000), toWei(899_990)]) {
                    await testRequest(amount, amount);
                }
            });

            it('should revert when requesting more funding amount than the funding limit', async () => {
                for (const amount of [remaining.add(1), remaining.add(toWei(2_000_000)), toWei(2_000_000)]) {
                    await expect(
                        bntPool.connect(fundingManager).requestFunding(CONTEXT_ID, reserveToken.address, amount)
                    ).to.be.revertedWithError('FundingLimitExceeded');
                }
            });

            context('when the funding limit is lowered retroactively', () => {
                beforeEach(async () => {
                    await testRequest(BigNumber.from(100_000), BigNumber.from(100_000));

                    await networkSettings.setFundingLimit(reserveToken.address, 1);
                });

                it('should revert when requesting more funding amount than the funding limit', async () => {
                    for (const amount of [10, 100_000, toWei(2_000_000), toWei(1_500_000)]) {
                        await expect(
                            bntPool.connect(fundingManager).requestFunding(CONTEXT_ID, reserveToken.address, amount)
                        ).to.be.revertedWithError('FundingLimitExceeded');
                    }
                });
            });
        });

        context('when at the funding limit', () => {
            beforeEach(async () => {
                await testRequest(FUNDING_LIMIT, FUNDING_LIMIT);
            });

            it('should revert when requesting more funding amount than the funding limit', async () => {
                for (const amount of [10, 100_000, toWei(2_000_000), toWei(1_500_000)]) {
                    await expect(
                        bntPool.connect(fundingManager).requestFunding(CONTEXT_ID, reserveToken.address, amount)
                    ).to.be.revertedWithError('FundingLimitExceeded');
                }
            });
        });
    });

    describe('renounce funding', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let bnt: IERC20;
        let bntPool: TestBNTPool;
        let bntPoolToken: PoolToken;
        let masterVault: MasterVault;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ networkSettings, network, bnt, bntPool, bntPoolToken, masterVault, poolCollection } =
                await createSystem());

            await bntPool.grantRole(Roles.BNTPool.ROLE_FUNDING_MANAGER, fundingManager.address);

            reserveToken = await createTestToken();

            await createPool(reserveToken, network, networkSettings, poolCollection);

            await networkSettings.setFundingLimit(reserveToken.address, FUNDING_LIMIT);
        });

        const testRenounce = async (amount: BigNumber) => {
            const prevStakedBalance = await bntPool.stakedBalance();
            const prevFunding = await bntPool.currentPoolFunding(reserveToken.address);
            const prevAvailableFunding = await bntPool.availableFunding(reserveToken.address);

            const prevPoolTokenTotalSupply = await bntPoolToken.totalSupply();
            const prevPoolPoolTokenBalance = await bntPoolToken.balanceOf(bntPool.address);
            const prevVaultPoolTokenBalance = await bntPoolToken.balanceOf(masterVault.address);

            expect(prevVaultPoolTokenBalance).to.equal(0);

            const prevTokenTotalSupply = await bnt.totalSupply();
            const prevPoolTokenBalance = await bnt.balanceOf(bntPool.address);
            const prevVaultTokenBalance = await bnt.balanceOf(masterVault.address);

            const reduceFundingAmount = min(prevFunding, amount);
            let expectedPoolTokenAmount = BigNumber.from(0);
            if (prevPoolTokenTotalSupply.gt(0)) {
                expectedPoolTokenAmount = reduceFundingAmount.mul(prevPoolTokenTotalSupply).div(prevStakedBalance);
            }

            expectedPoolTokenAmount = min(expectedPoolTokenAmount, prevPoolPoolTokenBalance);
            let reduceStakedBalance = BigNumber.from(0);
            if (prevPoolTokenTotalSupply.gt(0)) {
                reduceStakedBalance = expectedPoolTokenAmount.mul(prevStakedBalance).div(prevPoolTokenTotalSupply);
            }

            if (prevPoolPoolTokenBalance.gt(0)) {
                expect(expectedPoolTokenAmount).to.be.gt(0);
            }

            if (expectedPoolTokenAmount.gt(0)) {
                expect(reduceStakedBalance).to.be.gt(0);
            }

            const res = await bntPool.connect(fundingManager).renounceFunding(CONTEXT_ID, reserveToken.address, amount);

            await expect(res)
                .to.emit(bntPool, 'FundingRenounced')
                .withArgs(CONTEXT_ID, reserveToken.address, amount, expectedPoolTokenAmount);

            await expect(res)
                .to.emit(bntPool, 'TotalLiquidityUpdated')
                .withArgs(
                    CONTEXT_ID,
                    await bnt.balanceOf(masterVault.address),
                    await bntPool.stakedBalance(),
                    await bntPoolToken.totalSupply()
                );

            expect(await bntPool.stakedBalance()).to.equal(prevStakedBalance.sub(reduceStakedBalance));
            expect(await bntPool.currentPoolFunding(reserveToken.address)).to.equal(
                prevFunding.sub(reduceFundingAmount)
            );

            expect(await bntPool.availableFunding(reserveToken.address)).to.equal(
                prevAvailableFunding.gt(reduceFundingAmount)
                    ? prevAvailableFunding.add(reduceFundingAmount)
                    : FUNDING_LIMIT
            );

            expect(await bntPoolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply.sub(expectedPoolTokenAmount));
            expect(await bntPoolToken.balanceOf(bntPool.address)).to.equal(
                prevPoolPoolTokenBalance.sub(expectedPoolTokenAmount)
            );
            expect(await bntPoolToken.balanceOf(masterVault.address)).to.equal(prevVaultPoolTokenBalance);

            expect(await bnt.totalSupply()).to.equal(prevTokenTotalSupply.sub(amount));
            expect(await bnt.balanceOf(bntPool.address)).to.equal(prevPoolTokenBalance);
            expect(await bnt.balanceOf(masterVault.address)).to.equal(prevVaultTokenBalance.sub(amount));
        };

        it('should revert when attempting to renounce funding from a non-funding manager', async () => {
            const nonFundingManager = deployer;

            await expect(
                bntPool.connect(nonFundingManager).renounceFunding(CONTEXT_ID, reserveToken.address, 1)
            ).to.be.revertedWithError('AccessDenied');
        });

        it('should revert when attempting to renounce funding for a non-whitelisted pool', async () => {
            await expect(
                bntPool.connect(fundingManager).renounceFunding(CONTEXT_ID, ZERO_ADDRESS, 1)
            ).to.be.revertedWithError('NotWhitelisted');

            const reserveToken2 = await createTestToken();
            await expect(
                bntPool.connect(fundingManager).renounceFunding(CONTEXT_ID, reserveToken2.address, 1)
            ).to.be.revertedWithError('NotWhitelisted');
        });

        it('should revert when attempting to renounce a zero funding amount', async () => {
            await expect(
                bntPool.connect(fundingManager).renounceFunding(CONTEXT_ID, reserveToken.address, 0)
            ).to.be.revertedWithError('ZeroValue');
        });

        it('should allow to renounce funding when no funding was ever requested', async () => {
            // ensure that there is enough tokens in the master vault
            const extra = toWei(10_000);
            await bnt.transfer(masterVault.address, extra);

            await testRenounce(BigNumber.from(10_000));
        });

        context('with requested funding', () => {
            const requestedAmount = toWei(1_000_000);

            beforeEach(async () => {
                await bntPool.connect(fundingManager).requestFunding(CONTEXT_ID, reserveToken.address, requestedAmount);
            });

            it('should allow renouncing funding', async () => {
                for (const amount of [1, 10_000, toWei(200_000), toWei(300_000)]) {
                    await testRenounce(BigNumber.from(amount));
                }
            });

            it('should allow renouncing more funding than the previously requested amount', async () => {
                // ensure that there is enough tokens in the master vault
                const extra = toWei(1000);
                await bnt.transfer(masterVault.address, extra);

                await testRenounce(requestedAmount.add(extra));
            });

            context('when BNTPool has insufficient bnBNT tokens', () => {
                const depositAmount = toWei(995_000);

                beforeEach(async () => {
                    // since this is only a unit test, we will simulate a proper transfer of BNT amount from the network
                    // to the BNT pool
                    await bnt.connect(deployer).transfer(bntPool.address, depositAmount);

                    await network.depositToBNTPoolForT(CONTEXT_ID, provider.address, depositAmount, false, 0);
                });

                it('should allow renouncing funding', async () => {
                    const amount = toWei(10_000);

                    const stakedBalance = await bntPool.stakedBalance();
                    const poolTokenTotalSupply = await bntPoolToken.totalSupply();
                    const poolPoolTokenBalance = await bntPoolToken.balanceOf(bntPool.address);

                    const expectedPoolTokenAmount = BigNumber.from(amount).mul(poolTokenTotalSupply).div(stakedBalance);
                    expect(expectedPoolTokenAmount).to.be.gt(poolPoolTokenBalance);

                    await testRenounce(BigNumber.from(amount));
                });
            });

            context('when BNTPool has no bnBNT tokens', () => {
                const depositAmount = toWei(1_000_000);

                beforeEach(async () => {
                    // since this is only a unit test, we will simulate a proper transfer of BNT amount from the network
                    // to the BNT pool
                    await bnt.connect(deployer).transfer(bntPool.address, depositAmount);

                    await network.depositToBNTPoolForT(CONTEXT_ID, provider.address, depositAmount, false, 0);
                });

                it('should allow renouncing funding', async () => {
                    for (const amount of [toWei(10_000), toWei(200_000), toWei(300_000)]) {
                        expect(await bntPoolToken.balanceOf(bntPool.address)).to.equal(0);

                        await testRenounce(BigNumber.from(amount));
                    }
                });
            });
        });
    });

    describe('deposit', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let bnt: IERC20;
        let vbnt: IERC20;
        let bntPool: TestBNTPool;
        let bntPoolToken: PoolToken;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        before(async () => {
            [, fundingManager] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ networkSettings, network, bnt, vbnt, bntPool, bntPoolToken, poolCollection } = await createSystem());

            await bntPool.grantRole(Roles.BNTPool.ROLE_FUNDING_MANAGER, fundingManager.address);

            reserveToken = await createTestToken();
        });

        it('should revert when attempting to deposit from a non-network', async () => {
            const amount = 1;
            const nonNetwork = deployer;

            await expect(
                bntPool.connect(nonNetwork).depositFor(CONTEXT_ID, provider.address, amount, false, 0)
            ).to.be.revertedWithError('AccessDenied');
        });

        it('should revert when attempting to deposit a zero amount', async () => {
            const amount = 0;

            await expect(
                network.depositToBNTPoolForT(CONTEXT_ID, provider.address, amount, false, 0)
            ).to.be.revertedWithError('ZeroValue');
        });

        it('should revert when attempting to deposit for an invalid provider', async () => {
            const amount = 1;

            await expect(
                network.depositToBNTPoolForT(CONTEXT_ID, ZERO_ADDRESS, amount, false, 0)
            ).to.be.revertedWithError('InvalidAddress');
        });

        context('with a whitelisted and registered pool', () => {
            beforeEach(async () => {
                await createPool(reserveToken, network, networkSettings, poolCollection);

                await networkSettings.setFundingLimit(reserveToken.address, FUNDING_LIMIT);
            });

            const testDeposit = async (
                provider: SignerWithAddress,
                amount: BigNumber,
                isMigrating: boolean,
                originalVBNTAmount: BigNumber
            ) => {
                // since this is only a unit test, we will simulate a proper transfer of BNT amount from the network
                // to the BNT pool
                await bnt.connect(deployer).transfer(bntPool.address, amount);

                const prevStakedBalance = await bntPool.stakedBalance();

                const prevPoolTokenTotalSupply = await bntPoolToken.totalSupply();
                const prevPoolPoolTokenBalance = await bntPoolToken.balanceOf(bntPool.address);
                const prevProviderPoolTokenBalance = await bntPoolToken.balanceOf(provider.address);

                const prevTokenTotalSupply = await bnt.totalSupply();
                const prevPoolTokenBalance = await bnt.balanceOf(bntPool.address);
                const prevProviderTokenBalance = await bnt.balanceOf(provider.address);

                const prevVBNTTotalSupply = await vbnt.totalSupply();
                const prevPoolVBNTBalance = await vbnt.balanceOf(bntPool.address);
                const prevProviderVBNTBalance = await vbnt.balanceOf(provider.address);

                let expectedPoolTokenAmount;
                if (prevPoolTokenTotalSupply.eq(0)) {
                    expectedPoolTokenAmount = amount;
                } else {
                    expectedPoolTokenAmount = amount.mul(prevPoolTokenTotalSupply).div(prevStakedBalance);
                }

                let expectedVBNTAmount = expectedPoolTokenAmount;
                if (isMigrating) {
                    expectedVBNTAmount = expectedVBNTAmount.gt(originalVBNTAmount)
                        ? expectedVBNTAmount.sub(originalVBNTAmount)
                        : BigNumber.from(0);
                }

                const poolTokenAmount = await network.callStatic.depositToBNTPoolForT(
                    CONTEXT_ID,
                    provider.address,
                    amount,
                    isMigrating,
                    originalVBNTAmount
                );

                expect(poolTokenAmount).to.equal(expectedPoolTokenAmount);

                const res = await network.depositToBNTPoolForT(
                    CONTEXT_ID,
                    provider.address,
                    amount,
                    isMigrating,
                    originalVBNTAmount
                );

                await expect(res)
                    .to.emit(bntPool, 'TokensDeposited')
                    .withArgs(CONTEXT_ID, provider.address, amount, expectedPoolTokenAmount, expectedVBNTAmount);

                let expectedPoolTokenSupplyIncrease = BigNumber.from(0);
                let expectedStakedBalanceIncrease = BigNumber.from(0);
                if (expectedPoolTokenAmount.gt(prevPoolPoolTokenBalance)) {
                    expectedPoolTokenSupplyIncrease = expectedPoolTokenAmount.sub(prevPoolPoolTokenBalance);

                    if (prevPoolTokenTotalSupply.eq(0)) {
                        expectedStakedBalanceIncrease = expectedPoolTokenSupplyIncrease;
                    } else {
                        expectedStakedBalanceIncrease = expectedPoolTokenSupplyIncrease
                            .mul(prevStakedBalance)
                            .div(prevPoolTokenTotalSupply);
                    }
                }

                if (prevPoolTokenTotalSupply.eq(0)) {
                    expect(expectedPoolTokenSupplyIncrease).to.be.gt(0);
                    expect(expectedStakedBalanceIncrease).to.be.gt(0);
                }

                expect(await bntPool.stakedBalance()).to.equal(prevStakedBalance.add(expectedStakedBalanceIncrease));
                expect(await bntPoolToken.totalSupply()).to.equal(
                    prevPoolTokenTotalSupply.add(expectedPoolTokenSupplyIncrease)
                );
                expect(await bntPoolToken.balanceOf(bntPool.address)).to.equal(
                    max(0, prevPoolPoolTokenBalance.sub(expectedPoolTokenAmount))
                );
                expect(await bntPoolToken.balanceOf(provider.address)).to.equal(
                    prevProviderPoolTokenBalance.add(expectedPoolTokenAmount)
                );

                expect(await bnt.totalSupply()).to.equal(prevTokenTotalSupply.sub(amount));
                expect(await bnt.balanceOf(bntPool.address)).to.equal(prevPoolTokenBalance.sub(amount));
                expect(await bnt.balanceOf(provider.address)).to.equal(prevProviderTokenBalance);

                expect(await vbnt.totalSupply()).to.equal(prevVBNTTotalSupply.add(expectedVBNTAmount));
                expect(await vbnt.balanceOf(bntPool.address)).to.equal(prevPoolVBNTBalance);
                expect(await vbnt.balanceOf(provider.address)).to.equal(
                    prevProviderVBNTBalance.add(expectedVBNTAmount)
                );
            };

            it('should allow to deposit when no funding was requested', async () => {
                const amount = toWei(1_000);
                await testDeposit(provider, BigNumber.from(amount), false, BigNumber.from(0));
            });

            context('with requested funding', () => {
                beforeEach(async () => {
                    const requestedAmount = toWei(1_000_000);

                    await bntPool
                        .connect(fundingManager)
                        .requestFunding(CONTEXT_ID, reserveToken.address, requestedAmount);
                });

                it('should revert when attempting to deposit without sending BNT', async () => {
                    const amount = 1;

                    await expect(
                        network.depositToBNTPoolForT(CONTEXT_ID, provider.address, amount, false, 0)
                    ).to.be.revertedWithError('undefined');
                });

                it('should allow depositing liquidity', async () => {
                    for (const amount of [1, 10_000, toWei(20_000), toWei(30_000)]) {
                        await testDeposit(provider, BigNumber.from(amount), false, BigNumber.from(0));
                        await testDeposit(provider2, BigNumber.from(amount), false, BigNumber.from(0));
                    }
                });

                it('should allow depositing liquidity when the protocol has insufficient bnBNT', async () => {
                    const maxAmount = (await bntPoolToken.balanceOf(bntPool.address))
                        .mul(await bntPool.stakedBalance())
                        .div(await bntPoolToken.totalSupply());

                    await testDeposit(provider, BigNumber.from(maxAmount.add(10_000)), false, BigNumber.from(0));
                });

                it('should allow depositing liquidity when the protocol has no bnBNT', async () => {
                    const maxAmount = (await bntPoolToken.balanceOf(bntPool.address))
                        .mul(await bntPool.stakedBalance())
                        .div(await bntPoolToken.totalSupply());

                    await testDeposit(provider, BigNumber.from(maxAmount), false, BigNumber.from(0));
                    expect(await bntPoolToken.balanceOf(bntPool.address)).to.equal(0);

                    for (const amount of [1, 10_000, toWei(20_000), toWei(30_000)]) {
                        await testDeposit(provider, BigNumber.from(amount), false, BigNumber.from(0));
                    }
                });

                it('should compensate migrating providers when they are depositing liquidity', async () => {
                    for (const amount of [1, 10_000, toWei(20_000), toWei(30_000)]) {
                        await testDeposit(provider, BigNumber.from(amount), true, BigNumber.from(100));
                        await testDeposit(provider2, BigNumber.from(amount), true, BigNumber.from(100));
                    }
                });
            });
        });
    });

    describe('withdraw', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let bnt: IERC20;
        let vbnt: IERC20;
        let bntPool: TestBNTPool;
        let bntPoolToken: PoolToken;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        let fundingManager: SignerWithAddress;

        before(async () => {
            [, fundingManager] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ networkSettings, network, bnt, vbnt, bntPool, bntPoolToken, poolCollection } = await createSystem());

            await bntPool.grantRole(Roles.BNTPool.ROLE_FUNDING_MANAGER, fundingManager.address);

            reserveToken = await createTestToken();
        });

        it('should revert when attempting to withdraw from a non-network', async () => {
            const nonNetwork = deployer;

            await expect(
                bntPool.connect(nonNetwork).withdraw(CONTEXT_ID, provider.address, 1, 1)
            ).to.be.revertedWithError('AccessDenied');
        });

        it('should revert when attempting to withdraw for an invalid provider', async () => {
            await expect(network.withdrawFromBNTPoolT(CONTEXT_ID, ZERO_ADDRESS, 1, 1)).to.be.revertedWithError(
                'InvalidAddress'
            );
        });

        it('should revert when attempting to withdraw with an invalid pool token amount', async () => {
            await expect(network.withdrawFromBNTPoolT(CONTEXT_ID, provider.address, 0, 1)).to.be.revertedWithError(
                'ZeroValue'
            );
        });

        it('should revert when attempting to withdraw with an invalid bnt amount', async () => {
            await expect(network.withdrawFromBNTPoolT(CONTEXT_ID, provider.address, 1, 0)).to.be.revertedWithError(
                'ZeroValue'
            );
        });

        it('should revert when attempting to withdraw before any deposits were made', async () => {
            await expect(network.withdrawFromBNTPoolT(CONTEXT_ID, provider.address, 1, 1)).to.be.revertedWithError(
                'ERR_UNDERFLOW'
            );
        });

        context('with a whitelisted and registered pool', () => {
            beforeEach(async () => {
                await createPool(reserveToken, network, networkSettings, poolCollection);

                await networkSettings.setFundingLimit(reserveToken.address, FUNDING_LIMIT);
            });

            context('with requested funding', () => {
                beforeEach(async () => {
                    const requestedAmount = toWei(1_000_000);

                    await bntPool
                        .connect(fundingManager)
                        .requestFunding(CONTEXT_ID, reserveToken.address, requestedAmount);
                });

                context('with deposited liquidity', () => {
                    let depositPoolTokenAmount: BigNumber;
                    const depositAmount = toWei(1_000_000);

                    beforeEach(async () => {
                        const prevProviderPoolTokenBalance = await bntPoolToken.balanceOf(provider.address);

                        await bnt.connect(deployer).transfer(bntPool.address, depositAmount);
                        await network.depositToBNTPoolForT(CONTEXT_ID, provider.address, depositAmount, false, 0);

                        depositPoolTokenAmount = (await bntPoolToken.balanceOf(provider.address)).sub(
                            prevProviderPoolTokenBalance
                        );

                        await bntPoolToken.connect(provider).transfer(bntPool.address, depositPoolTokenAmount);
                    });

                    const testWithdraw = (poolTokenAmount: BigNumber, withdrawalFeePPM: number) => {
                        context(
                            // eslint-disable-next-line max-len
                            `poolTokenAmount=${poolTokenAmount} (withdrawalFee=${fromPPM(withdrawalFeePPM)}%)`,
                            () => {
                                beforeEach(async () => {
                                    await networkSettings.setWithdrawalFeePPM(withdrawalFeePPM);
                                });

                                it('should allow to withdraw', async () => {
                                    await vbnt.connect(provider).transfer(bntPool.address, poolTokenAmount);

                                    const prevStakedBalance = await bntPool.stakedBalance();

                                    const prevPoolTokenTotalSupply = await bntPoolToken.totalSupply();
                                    const prevPoolPoolTokenBalance = await bntPoolToken.balanceOf(bntPool.address);
                                    const prevNetworkPoolTokenBalance = await bntPoolToken.balanceOf(network.address);
                                    const prevProviderPoolTokenBalance = await bntPoolToken.balanceOf(provider.address);

                                    const prevTokenTotalSupply = await bnt.totalSupply();
                                    const prevPoolTokenBalance = await bnt.balanceOf(bntPool.address);
                                    const prevProviderTokenBalance = await bnt.balanceOf(provider.address);

                                    const prevVBNTTotalSupply = await vbnt.totalSupply();
                                    const prevPoolVBNTBalance = await vbnt.balanceOf(bntPool.address);
                                    const prevProviderVBNTBalance = await vbnt.balanceOf(provider.address);

                                    const bntAmount = poolTokenAmount
                                        .mul(prevStakedBalance)
                                        .div(prevPoolTokenTotalSupply);

                                    const expectedWithdrawalFeeAmount = poolTokenAmount
                                        .mul(prevStakedBalance.mul(withdrawalFeePPM))
                                        .div(prevPoolTokenTotalSupply.mul(PPM_RESOLUTION));
                                    const expectedWithdrawnAmount = bntAmount.sub(expectedWithdrawalFeeAmount);

                                    const withdrawalAmount = await bntPool.withdrawalAmount(poolTokenAmount);
                                    expect(withdrawalAmount).to.equal(expectedWithdrawnAmount);

                                    const res = await network.withdrawFromBNTPoolT(
                                        CONTEXT_ID,
                                        provider.address,
                                        poolTokenAmount,
                                        bntAmount
                                    );

                                    await expect(res)
                                        .to.emit(bntPool, 'TokensWithdrawn')
                                        .withArgs(
                                            CONTEXT_ID,
                                            provider.address,
                                            expectedWithdrawnAmount,
                                            poolTokenAmount,
                                            poolTokenAmount,
                                            expectedWithdrawalFeeAmount
                                        );

                                    expect(await bntPool.stakedBalance()).to.equal(prevStakedBalance);

                                    expect(await bntPoolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply);
                                    expect(await bntPoolToken.balanceOf(bntPool.address)).to.equal(
                                        prevPoolPoolTokenBalance
                                    );
                                    expect(await bntPoolToken.balanceOf(network.address)).to.equal(
                                        prevNetworkPoolTokenBalance
                                    );
                                    expect(await bntPoolToken.balanceOf(provider.address)).to.equal(
                                        prevProviderPoolTokenBalance
                                    );

                                    expect(await bnt.totalSupply()).to.equal(
                                        prevTokenTotalSupply.add(expectedWithdrawnAmount)
                                    );
                                    expect(await bnt.balanceOf(bntPool.address)).to.equal(prevPoolTokenBalance);
                                    expect(await bnt.balanceOf(provider.address)).to.equal(
                                        prevProviderTokenBalance.add(expectedWithdrawnAmount)
                                    );

                                    expect(await vbnt.totalSupply()).to.equal(prevVBNTTotalSupply.sub(poolTokenAmount));
                                    expect(await vbnt.balanceOf(bntPool.address)).to.equal(
                                        prevPoolVBNTBalance.sub(poolTokenAmount)
                                    );
                                    expect(await vbnt.balanceOf(provider.address)).to.equal(prevProviderVBNTBalance);
                                });
                            }
                        );
                    };

                    it('should revert when attempting to withdraw without sending vBNT', async () => {
                        const poolTokenAmount = 1000;

                        await expect(
                            network.withdrawFromBNTPoolT(CONTEXT_ID, provider.address, poolTokenAmount, poolTokenAmount)
                        ).to.be.revertedWithError(new TokenData(TokenSymbol.vBNT).errors().exceedsBalance);
                    });

                    it('should revert when attempting to withdraw more than the deposited pool token amount', async () => {
                        const poolTokenAmount = depositPoolTokenAmount.add(1000);
                        await vbnt.connect(provider).transfer(bntPool.address, depositPoolTokenAmount);

                        await expect(
                            network.withdrawFromBNTPoolT(CONTEXT_ID, provider.address, poolTokenAmount, depositAmount)
                        ).to.be.revertedWithError(new TokenData(TokenSymbol.vBNT).errors().exceedsBalance);
                    });

                    it('should revert when attempting to withdraw inconsistent amounts', async () => {
                        const poolTokenAmount = 1000;
                        await vbnt.connect(provider).transfer(bntPool.address, poolTokenAmount);

                        await expect(
                            network.withdrawFromBNTPoolT(
                                CONTEXT_ID,
                                provider.address,
                                poolTokenAmount,
                                poolTokenAmount * 10_000
                            )
                        ).to.be.revertedWithError('InvalidParam');
                    });

                    for (const poolTokenAmount of [100, 10_000, toWei(20_000), toWei(30_000)]) {
                        for (const withdrawalFeePPM of [toPPM(0), toPPM(0.25), toPPM(20)])
                            testWithdraw(BigNumber.from(poolTokenAmount), withdrawalFeePPM);
                    }
                });
            });
        });
    });

    describe('fee collection', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let bntPool: TestBNTPool;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ network, networkSettings, bntPool, poolCollection } = await createSystem());

            reserveToken = await createTestToken();
            await createPool(reserveToken, network, networkSettings, poolCollection);

            await networkSettings.setFundingLimit(reserveToken.address, FUNDING_LIMIT);
        });

        for (const tradeFee of [true, false]) {
            context(`${tradeFee ? 'trade' : 'other'} fees`, () => {
                it('should revert when attempting to notify about collected fee from a non-network', async () => {
                    const nonNetwork = deployer;

                    await expect(
                        bntPool.connect(nonNetwork).onFeesCollected(reserveToken.address, 1, tradeFee)
                    ).to.be.revertedWithError('AccessDenied');
                });

                it('should revert when attempting to notify about collected fee from an invalid pool', async () => {
                    await expect(network.onBNTFeesCollectedT(ZERO_ADDRESS, 1, tradeFee)).to.be.revertedWithError(
                        'InvalidAddress'
                    );
                });

                for (const feeAmount of [0, 12_345, toWei(12_345)]) {
                    it(`should collect fees of ${feeAmount.toString()}`, async () => {
                        const prevStakedBalance = await bntPool.stakedBalance();
                        const prevFunding = await bntPool.currentPoolFunding(reserveToken.address);
                        const prevAvailableFunding = await bntPool.availableFunding(reserveToken.address);
                        const expectedFunding = tradeFee ? feeAmount : 0;

                        await network.onBNTFeesCollectedT(reserveToken.address, feeAmount, tradeFee);

                        expect(await bntPool.stakedBalance()).to.equal(prevStakedBalance.add(feeAmount));
                        expect(await bntPool.currentPoolFunding(reserveToken.address)).to.equal(
                            prevFunding.add(expectedFunding)
                        );
                        expect(await bntPool.availableFunding(reserveToken.address)).to.equal(
                            prevAvailableFunding.sub(expectedFunding)
                        );
                    });
                }
            });
        }
    });

    describe('asset management', () => {
        const amount = 1_000_000;

        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let poolCollection: TestPoolCollection;
        let bntPool: TestBNTPool;
        let bntPoolToken: PoolToken;
        let bnt: IERC20;

        let token: TokenWithAddress;

        const testWithdrawFunds = () => {
            it('should allow withdrawals', async () => {
                await expect(bntPool.connect(provider).withdrawFunds(token.address, provider.address, amount))
                    .to.emit(bntPool, 'FundsWithdrawn')
                    .withArgs(token.address, provider.address, provider.address, amount);
            });
        };

        const testWithdrawFundsRestricted = () => {
            it('should revert', async () => {
                await expect(
                    bntPool.connect(provider).withdrawFunds(token.address, provider.address, amount)
                ).to.revertedWithError('AccessDenied');
            });
        };

        for (const symbol of [TokenSymbol.TKN, TokenSymbol.bnBNT]) {
            const isBNTPoolToken = symbol === TokenSymbol.bnBNT;

            context(`withdrawing ${symbol}`, () => {
                beforeEach(async () => {
                    ({ network, bntPool, bntPoolToken, bnt, networkSettings, poolCollection } = await createSystem());

                    await bntPool.grantRole(Roles.BNTPool.ROLE_BNT_MANAGER, bntManager.address);

                    await bntPool.grantRole(Roles.BNTPool.ROLE_FUNDING_MANAGER, fundingManager.address);

                    const reserveToken = await createTestToken();

                    if (isBNTPoolToken) {
                        token = bntPoolToken;

                        await createPool(reserveToken, network, networkSettings, poolCollection);

                        await bntPool.connect(bntManager).mint(deployer.address, amount);
                        await bnt.connect(deployer).transfer(bntPool.address, amount);

                        await networkSettings.setFundingLimit(reserveToken.address, amount);

                        await bntPool.connect(fundingManager).requestFunding(CONTEXT_ID, reserveToken.address, amount);

                        await network.depositToBNTPoolForT(CONTEXT_ID, deployer.address, amount, false, 0);
                    } else {
                        token = await createToken(new TokenData(symbol));
                    }

                    await transfer(deployer, token, bntPool.address, amount);
                });

                context('with no special permissions', () => {
                    testWithdrawFundsRestricted();
                });

                context('with admin role', () => {
                    beforeEach(async () => {
                        await bntPool.grantRole(Roles.Upgradeable.ROLE_ADMIN, provider.address);
                    });

                    testWithdrawFundsRestricted();
                });

                context('with BNT pool token manager role', () => {
                    beforeEach(async () => {
                        await bntPool.grantRole(Roles.BNTPool.ROLE_BNT_POOL_TOKEN_MANAGER, provider.address);
                    });

                    if (isBNTPoolToken) {
                        testWithdrawFunds();
                    } else {
                        testWithdrawFundsRestricted();
                    }
                });
            });
        }
    });

    describe('pool token calculations', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let bntPool: TestBNTPool;
        let bntPoolToken: PoolToken;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        const BNT_LIQUIDITY = toWei(1_000_000_000);

        beforeEach(async () => {
            ({ networkSettings, network, bntPool, bntPoolToken, poolCollection } = await createSystem());

            await bntPool.grantRole(Roles.BNTPool.ROLE_FUNDING_MANAGER, fundingManager.address);

            reserveToken = await createTestToken();

            await createPool(reserveToken, network, networkSettings, poolCollection);

            await networkSettings.setFundingLimit(reserveToken.address, MAX_UINT256);

            await bntPool.connect(fundingManager).requestFunding(CONTEXT_ID, reserveToken.address, BNT_LIQUIDITY);
        });

        for (const bntAmount of [0, 1000, toWei(10_000), toWei(1_000_000)]) {
            context(`underlying amount of ${bntAmount.toString()}`, () => {
                it('should properly convert between underlying amount and pool token amount', async () => {
                    const poolTokenTotalSupply = await bntPoolToken.totalSupply();
                    const stakedBalance = await bntPool.stakedBalance();

                    const poolTokenAmount = await bntPool.underlyingToPoolToken(bntAmount);
                    expect(poolTokenAmount).to.equal(
                        // ceil(bntAmount * poolTokenTotalSupply / stakedBalance)
                        BigNumber.from(bntAmount).mul(poolTokenTotalSupply).add(stakedBalance).sub(1).div(stakedBalance)
                    );

                    const underlyingAmount = await bntPool.poolTokenToUnderlying(poolTokenAmount);
                    expect(underlyingAmount).to.equal(bntAmount);
                });

                it('should properly calculate pool token amount to burn in order to increase underlying value', async () => {
                    const poolTokenAmount = toWei(100_000);
                    await bntPool.mintPoolTokenT(deployer.address, poolTokenAmount);

                    const prevUnderlying = await bntPool.poolTokenToUnderlying(poolTokenAmount);
                    const poolTokenAmountToBurn = await bntPool.poolTokenAmountToBurn(bntAmount);

                    // ensure that burning the resulted pool token amount increases the underlying by the
                    // specified BNT amount while taking into account pool tokens owned by the protocol
                    await bntPool.burnPoolTokenT(poolTokenAmountToBurn);

                    expect(await bntPool.poolTokenToUnderlying(poolTokenAmount)).to.equal(
                        prevUnderlying.add(bntAmount)
                    );
                });
            });
        }
    });
});
