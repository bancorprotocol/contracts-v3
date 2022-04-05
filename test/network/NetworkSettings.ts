import { NetworkSettings, TestERC20Token } from '../../components/Contracts';
import { PPM_RESOLUTION, ZERO_ADDRESS } from '../../utils/Constants';
import { toPPM, toWei } from '../../utils/Types';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import { createSystem, createTestToken } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('NetworkSettings', () => {
    let reserveToken: TestERC20Token;
    let networkSettings: NetworkSettings;

    let deployer: SignerWithAddress;
    let nonOwner: SignerWithAddress;

    shouldHaveGap('NetworkSettings', '_protectedTokenWhitelist');

    before(async () => {
        [deployer, nonOwner] = await ethers.getSigners();
    });

    beforeEach(async () => {
        ({ networkSettings } = await createSystem());

        reserveToken = await createTestToken();
    });

    describe('construction', async () => {
        it('should revert when attempting to reinitialize', async () => {
            await expect(networkSettings.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            expect(await networkSettings.version()).to.equal(1);

            await expectRoles(networkSettings, Roles.Upgradeable);

            await expectRole(networkSettings, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
                deployer.address
            ]);

            expect(await networkSettings.protectedTokenWhitelist()).to.be.empty;

            expect(await networkSettings.networkFeePPM()).to.equal(0);
            expect(await networkSettings.withdrawalFeePPM()).to.equal(0);
            expect(await networkSettings.flashLoanFeePPM()).to.equal(0);

            const vortexRewards = await networkSettings.vortexRewards();
            expect(vortexRewards.burnRewardPPM).to.equal(0);
            expect(vortexRewards.burnRewardMaxAmount).to.equal(0);
        });
    });

    describe('protected tokens whitelist', async () => {
        beforeEach(async () => {
            expect(await networkSettings.protectedTokenWhitelist()).to.be.empty;
        });

        describe('adding', () => {
            it('should revert when a non-admin attempts to add a token', async () => {
                await expect(
                    networkSettings.connect(nonOwner).addTokenToWhitelist(reserveToken.address)
                ).to.be.revertedWith('AccessDenied');
            });

            it('should revert when adding an invalid address', async () => {
                await expect(networkSettings.addTokenToWhitelist(ZERO_ADDRESS)).to.be.revertedWith(
                    'InvalidExternalAddress'
                );
            });

            it('should revert when adding an already whitelisted token', async () => {
                await networkSettings.addTokenToWhitelist(reserveToken.address);
                await expect(networkSettings.addTokenToWhitelist(reserveToken.address)).to.be.revertedWith(
                    'AlreadyExists'
                );
            });

            it('should whitelist a token', async () => {
                expect(await networkSettings.isTokenWhitelisted(reserveToken.address)).to.be.false;

                const res = await networkSettings.addTokenToWhitelist(reserveToken.address);
                await expect(res).to.emit(networkSettings, 'TokenAddedToWhitelist').withArgs(reserveToken.address);

                expect(await networkSettings.isTokenWhitelisted(reserveToken.address)).to.be.true;
            });

            it('should revert when a non-admin attempts to add tokens', async () => {
                await expect(
                    networkSettings.connect(nonOwner).addTokensToWhitelist([reserveToken.address])
                ).to.be.revertedWith('AccessDenied');
            });

            it('should revert when adding invalid addresses', async () => {
                await expect(networkSettings.addTokensToWhitelist([ZERO_ADDRESS])).to.be.revertedWith(
                    'InvalidExternalAddress'
                );
            });

            it('should revert when adding already whitelisted tokens in the same transaction', async () => {
                await expect(
                    networkSettings.addTokensToWhitelist([reserveToken.address, reserveToken.address])
                ).to.be.revertedWith('AlreadyExists');
            });

            it('should revert when adding already whitelisted tokens in different transactions', async () => {
                await networkSettings.addTokensToWhitelist([reserveToken.address]);
                await expect(networkSettings.addTokensToWhitelist([reserveToken.address])).to.be.revertedWith(
                    'AlreadyExists'
                );
            });

            it('should whitelist tokens', async () => {
                const reserveToken2 = await createTestToken();
                expect(await networkSettings.isTokenWhitelisted(reserveToken.address)).to.be.false;
                expect(await networkSettings.isTokenWhitelisted(reserveToken2.address)).to.be.false;

                const res = await networkSettings.addTokensToWhitelist([reserveToken.address, reserveToken2.address]);
                await expect(res).to.emit(networkSettings, 'TokenAddedToWhitelist').withArgs(reserveToken.address);
                await expect(res).to.emit(networkSettings, 'TokenAddedToWhitelist').withArgs(reserveToken2.address);

                expect(await networkSettings.isTokenWhitelisted(reserveToken.address)).to.be.true;
                expect(await networkSettings.isTokenWhitelisted(reserveToken2.address)).to.be.true;
            });
        });

        describe('removing', () => {
            beforeEach(async () => {
                await networkSettings.addTokenToWhitelist(reserveToken.address);
            });

            it('should revert when a non-admin attempts to remove a token', async () => {
                await expect(
                    networkSettings.connect(nonOwner).removeTokenFromWhitelist(reserveToken.address)
                ).to.be.revertedWith('AccessDenied');
            });

            it('should revert when removing a non-whitelisted token', async () => {
                await expect(networkSettings.removeTokenFromWhitelist(ZERO_ADDRESS)).to.be.revertedWith('DoesNotExist');

                const reserveToken2 = await createTestToken();
                await expect(networkSettings.removeTokenFromWhitelist(reserveToken2.address)).to.be.revertedWith(
                    'DoesNotExist'
                );
            });

            it('should remove a token', async () => {
                expect(await networkSettings.isTokenWhitelisted(reserveToken.address)).to.be.true;

                const res = await networkSettings.removeTokenFromWhitelist(reserveToken.address);
                await expect(res).to.emit(networkSettings, 'TokenRemovedFromWhitelist').withArgs(reserveToken.address);

                expect(await networkSettings.isTokenWhitelisted(reserveToken.address)).to.be.false;
            });
        });
    });

    describe('pool funding limits', () => {
        const poolFundingLimit = toWei(123_456);

        it('should revert when a non-admin attempts to set a pool limit', async () => {
            await expect(
                networkSettings.connect(nonOwner).setFundingLimit(reserveToken.address, poolFundingLimit)
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when setting a pool limit of an invalid address token', async () => {
            await expect(networkSettings.setFundingLimit(ZERO_ADDRESS, poolFundingLimit)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('should revert when setting a pool limit of a non-whitelisted token', async () => {
            await expect(networkSettings.setFundingLimit(reserveToken.address, poolFundingLimit)).to.be.revertedWith(
                'NotWhitelisted'
            );
        });

        it('should revert when a non-admin attempts to set multiple pool limits', async () => {
            await expect(
                networkSettings.connect(nonOwner).setFundingLimits([reserveToken.address], [poolFundingLimit])
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when setting multiple pool limits of an invalid address token', async () => {
            await expect(networkSettings.setFundingLimits([ZERO_ADDRESS], [poolFundingLimit])).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('should revert when setting multiple pool limits of a non-whitelisted token', async () => {
            await expect(
                networkSettings.setFundingLimits([reserveToken.address], [poolFundingLimit])
            ).to.be.revertedWith('NotWhitelisted');
        });

        context('whitelisted', () => {
            beforeEach(async () => {
                await networkSettings.addTokenToWhitelist(reserveToken.address);
            });

            it('should ignore setting to the same pool funding limit', async () => {
                await networkSettings.setFundingLimit(reserveToken.address, poolFundingLimit);

                const res = await networkSettings.setFundingLimit(reserveToken.address, poolFundingLimit);
                await expect(res).not.to.emit(networkSettings, 'FundingLimitUpdated');

                const res2 = await networkSettings.setFundingLimits([reserveToken.address], [poolFundingLimit]);
                await expect(res2).not.to.emit(networkSettings, 'FundingLimitUpdated');
            });

            it('should be able to set and update pool funding limit of a token', async () => {
                expect(await networkSettings.poolFundingLimit(reserveToken.address)).to.equal(0);

                const res = await networkSettings.setFundingLimit(reserveToken.address, poolFundingLimit);
                await expect(res)
                    .to.emit(networkSettings, 'FundingLimitUpdated')
                    .withArgs(reserveToken.address, 0, poolFundingLimit);

                expect(await networkSettings.poolFundingLimit(reserveToken.address)).to.equal(poolFundingLimit);

                const res2 = await networkSettings.setFundingLimit(reserveToken.address, 0);
                await expect(res2)
                    .to.emit(networkSettings, 'FundingLimitUpdated')
                    .withArgs(reserveToken.address, poolFundingLimit, 0);

                expect(await networkSettings.poolFundingLimit(reserveToken.address)).to.equal(0);
            });

            it('should be able to set and update pool funding limit of multiple tokens', async () => {
                const reserveTokens: TestERC20Token[] = [];

                for (let i = 0; i < 10; i++) {
                    const reserveToken = await createTestToken();
                    await networkSettings.addTokenToWhitelist(reserveToken.address);
                    expect(await networkSettings.poolFundingLimit(reserveToken.address)).to.equal(0);
                    reserveTokens.push(reserveToken);
                }

                const tokens = reserveTokens.map((reserveToken) => reserveToken.address);
                const amounts = reserveTokens.map((_, index) => poolFundingLimit.add(index));
                const res = await networkSettings.setFundingLimits(tokens, amounts);

                for (const [index, reserveToken] of reserveTokens.entries()) {
                    await expect(res)
                        .to.emit(networkSettings, 'FundingLimitUpdated')
                        .withArgs(reserveToken.address, 0, amounts[index]);

                    expect(await networkSettings.poolFundingLimit(reserveToken.address)).to.equal(amounts[index]);
                }

                const res2 = await networkSettings.setFundingLimits(tokens, new Array(tokens.length).fill(0));

                for (const [index, reserveToken] of reserveTokens.entries()) {
                    await expect(res2)
                        .to.emit(networkSettings, 'FundingLimitUpdated')
                        .withArgs(reserveToken.address, amounts[index], 0);

                    expect(await networkSettings.poolFundingLimit(reserveToken.address)).to.equal(0);
                }
            });

            it('should revert when setting multiple pool limits with invalid input', async () => {
                await expect(
                    networkSettings.setFundingLimits([reserveToken.address], [poolFundingLimit, poolFundingLimit])
                ).to.be.revertedWith('InvalidInput');

                await expect(
                    networkSettings.setFundingLimits([reserveToken.address, reserveToken.address], [poolFundingLimit])
                ).to.be.revertedWith('InvalidInput');
            });
        });
    });

    describe('protected tokens whitelist with funding limits', async () => {
        const poolFundingLimit = toWei(123_456);

        it('should revert when a non-admin attempts to add a token', async () => {
            await expect(
                networkSettings.connect(nonOwner).addTokenToWhitelistWithLimit(reserveToken.address, poolFundingLimit)
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when adding an invalid address', async () => {
            await expect(
                networkSettings.addTokenToWhitelistWithLimit(ZERO_ADDRESS, poolFundingLimit)
            ).to.be.revertedWith('InvalidExternalAddress');
        });

        it('should revert when adding an already whitelisted token', async () => {
            await networkSettings.addTokenToWhitelist(reserveToken.address);
            await expect(
                networkSettings.addTokenToWhitelistWithLimit(reserveToken.address, poolFundingLimit)
            ).to.be.revertedWith('AlreadyExists');
        });

        it('should whitelist a token with funding limit', async () => {
            expect(await networkSettings.isTokenWhitelisted(reserveToken.address)).to.be.false;

            const res = await networkSettings.addTokenToWhitelistWithLimit(reserveToken.address, poolFundingLimit);
            await expect(res).to.emit(networkSettings, 'TokenAddedToWhitelist').withArgs(reserveToken.address);
            await expect(res)
                .to.emit(networkSettings, 'FundingLimitUpdated')
                .withArgs(reserveToken.address, 0, poolFundingLimit);

            expect(await networkSettings.isTokenWhitelisted(reserveToken.address)).to.be.true;
            expect(await networkSettings.poolFundingLimit(reserveToken.address)).to.equal(poolFundingLimit);
        });
    });

    describe('min liquidity for trading', () => {
        const minLiquidityForTrading = toWei(1000);

        it('should revert when a non-admin attempts to set the minimum liquidity for trading', async () => {
            await expect(
                networkSettings.connect(nonOwner).setMinLiquidityForTrading(minLiquidityForTrading)
            ).to.be.revertedWith('AccessDenied');
        });

        it('should ignore setting to the same minimum liquidity for trading', async () => {
            await networkSettings.setMinLiquidityForTrading(minLiquidityForTrading);

            const res = await networkSettings.setMinLiquidityForTrading(minLiquidityForTrading);
            await expect(res).not.to.emit(networkSettings, 'MinLiquidityForTradingUpdated');
        });

        it('should be able to set and update the minimum liquidity for trading', async () => {
            expect(await networkSettings.minLiquidityForTrading()).to.equal(0);

            const res = await networkSettings.setMinLiquidityForTrading(minLiquidityForTrading);
            await expect(res)
                .to.emit(networkSettings, 'MinLiquidityForTradingUpdated')
                .withArgs(0, minLiquidityForTrading);

            expect(await networkSettings.minLiquidityForTrading()).to.equal(minLiquidityForTrading);

            const newMinLiquidityForTrading = 1;
            const res2 = await networkSettings.setMinLiquidityForTrading(newMinLiquidityForTrading);
            await expect(res2)
                .to.emit(networkSettings, 'MinLiquidityForTradingUpdated')
                .withArgs(minLiquidityForTrading, newMinLiquidityForTrading);

            expect(await networkSettings.minLiquidityForTrading()).to.equal(newMinLiquidityForTrading);
        });
    });

    describe('withdrawal fee', () => {
        const newWithdrawalFee = 500_000;

        beforeEach(async () => {
            expect(await networkSettings.withdrawalFeePPM()).to.equal(0);
        });

        it('should revert when a non-admin attempts to set the withdrawal fee', async () => {
            await expect(networkSettings.connect(nonOwner).setWithdrawalFeePPM(newWithdrawalFee)).to.be.revertedWith(
                'AccessDenied'
            );
        });

        it('should revert when setting the withdrawal fee to an invalid value', async () => {
            await expect(networkSettings.setWithdrawalFeePPM(PPM_RESOLUTION + 1)).to.be.revertedWith('InvalidFee');
        });

        it('should ignore updating to the same withdrawal fee', async () => {
            await networkSettings.setWithdrawalFeePPM(newWithdrawalFee);

            const res = await networkSettings.setWithdrawalFeePPM(newWithdrawalFee);
            await expect(res).not.to.emit(networkSettings, 'WithdrawalFeePPMUpdated');
        });

        it('should be able to set and update the withdrawal fee', async () => {
            const res = await networkSettings.setWithdrawalFeePPM(newWithdrawalFee);
            await expect(res).to.emit(networkSettings, 'WithdrawalFeePPMUpdated').withArgs(0, newWithdrawalFee);

            expect(await networkSettings.withdrawalFeePPM()).to.equal(newWithdrawalFee);

            const res2 = await networkSettings.setWithdrawalFeePPM(0);
            await expect(res2).to.emit(networkSettings, 'WithdrawalFeePPMUpdated').withArgs(newWithdrawalFee, 0);

            expect(await networkSettings.withdrawalFeePPM()).to.equal(0);
        });
    });

    describe('flash-loan fee', () => {
        const newFlashLoanFee = toPPM(50);

        beforeEach(async () => {
            expect(await networkSettings.flashLoanFeePPM()).to.equal(0);
        });

        it('should revert when a non-admin attempts to set the flash-loan fee', async () => {
            await expect(networkSettings.connect(nonOwner).setFlashLoanFeePPM(newFlashLoanFee)).to.be.revertedWith(
                'AccessDenied'
            );
        });

        it('should revert when setting the flash-loan fee to an invalid value', async () => {
            await expect(networkSettings.setFlashLoanFeePPM(PPM_RESOLUTION + 1)).to.be.revertedWith('InvalidFee');
        });

        it('should ignore updating to the same flash-loan fee', async () => {
            await networkSettings.setFlashLoanFeePPM(newFlashLoanFee);

            const res = await networkSettings.setFlashLoanFeePPM(newFlashLoanFee);
            await expect(res).not.to.emit(networkSettings, 'FlashLoanFeePPMUpdated');
        });

        it('should be able to set and update the flash-loan fee', async () => {
            const res = await networkSettings.setFlashLoanFeePPM(newFlashLoanFee);
            await expect(res).to.emit(networkSettings, 'FlashLoanFeePPMUpdated').withArgs(0, newFlashLoanFee);

            expect(await networkSettings.flashLoanFeePPM()).to.equal(newFlashLoanFee);

            const res2 = await networkSettings.setFlashLoanFeePPM(0);
            await expect(res2).to.emit(networkSettings, 'FlashLoanFeePPMUpdated').withArgs(newFlashLoanFee, 0);

            expect(await networkSettings.flashLoanFeePPM()).to.equal(0);
        });
    });

    describe('vortex rewards', () => {
        const newVortexRewards = {
            burnRewardPPM: toPPM(10),
            burnRewardMaxAmount: toWei(100)
        };

        it('should revert when a non-admin attempts to set the vortex settings', async () => {
            await expect(networkSettings.connect(nonOwner).setVortexRewards(newVortexRewards)).to.be.revertedWith(
                'AccessDenied'
            );
        });

        it('should revert when setting the vortex settings to an invalid value', async () => {
            await expect(
                networkSettings.setVortexRewards({
                    burnRewardPPM: PPM_RESOLUTION + 1,
                    burnRewardMaxAmount: toWei(100)
                })
            ).to.be.revertedWith('InvalidFee');

            await expect(
                networkSettings.setVortexRewards({
                    burnRewardPPM: toPPM(10),
                    burnRewardMaxAmount: 0
                })
            ).to.be.revertedWith('ZeroValue');
        });

        it('should ignore updating to the same vortex settings', async () => {
            await networkSettings.setVortexRewards(newVortexRewards);

            const res = await networkSettings.setVortexRewards(newVortexRewards);
            await expect(res).not.to.emit(networkSettings, 'VortexBurnRewardUpdated');
        });

        it('should be able to set and update the vortex settings', async () => {
            const res = await networkSettings.setVortexRewards(newVortexRewards);
            await expect(res)
                .to.emit(networkSettings, 'VortexBurnRewardUpdated')
                .withArgs(0, newVortexRewards.burnRewardPPM, 0, newVortexRewards.burnRewardMaxAmount);

            const vortexRewards = await networkSettings.vortexRewards();
            expect(vortexRewards.burnRewardPPM).to.equal(newVortexRewards.burnRewardPPM);
            expect(vortexRewards.burnRewardMaxAmount).to.equal(newVortexRewards.burnRewardMaxAmount);
        });
    });
});
