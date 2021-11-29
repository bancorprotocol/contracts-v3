import Contracts from '../../components/Contracts';
import { NetworkSettings, NetworkFeeVault, TestERC20Token } from '../../typechain-types';
import { expectRole, roles } from '../helpers/AccessControl';
import { ZERO_ADDRESS, PPM_RESOLUTION, TKN } from '../helpers/Constants';
import { createSystem } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { toWei } from '../helpers/Types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

const { Upgradeable: UpgradeableRoles } = roles;

describe('NetworkSettings', () => {
    let networkFeeVault: NetworkFeeVault;
    let reserveToken: TestERC20Token;
    let networkSettings: NetworkSettings;

    let deployer: SignerWithAddress;
    let nonOwner: SignerWithAddress;

    const TOTAL_SUPPLY = 1_000_000;

    shouldHaveGap('NetworkSettings', '_protectedTokenWhitelist');

    before(async () => {
        [deployer, nonOwner] = await ethers.getSigners();
    });

    beforeEach(async () => {
        ({ networkSettings, networkFeeVault } = await createSystem());

        reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, TOTAL_SUPPLY);
    });

    describe('construction', async () => {
        it('should revert when attempting to reinitialize', async () => {
            await expect(networkSettings.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            expect(await networkSettings.version()).to.equal(1);

            await expectRole(networkSettings, UpgradeableRoles.ROLE_ADMIN, UpgradeableRoles.ROLE_ADMIN, [
                deployer.address
            ]);

            expect(await networkSettings.protectedTokenWhitelist()).to.be.empty;
            const networkFeeParams = await networkSettings.networkFeeParams();
            expect(networkFeeParams[0]).to.equal(networkFeeVault.address);
            expect(networkFeeParams[1]).to.equal(0);
            expect(await networkSettings.networkFeeVault()).to.equal(networkFeeVault.address);
            expect(await networkSettings.networkFeePPM()).to.equal(0);
            expect(await networkSettings.withdrawalFeePPM()).to.equal(0);
            expect(await networkSettings.flashLoanFeePPM()).to.equal(0);
            expect(await networkSettings.averageRateMaxDeviationPPM()).to.equal(0);
        });
    });

    describe('protected tokens whitelist', async () => {
        beforeEach(async () => {
            expect(await networkSettings.protectedTokenWhitelist()).to.be.empty;
        });

        describe('adding', () => {
            it('should revert when a non-owner attempts to add a token', async () => {
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
        });

        describe('removing', () => {
            beforeEach(async () => {
                await networkSettings.addTokenToWhitelist(reserveToken.address);
            });

            it('should revert when a non-owner attempts to remove a token', async () => {
                await expect(
                    networkSettings.connect(nonOwner).removeTokenFromWhitelist(reserveToken.address)
                ).to.be.revertedWith('AccessDenied');
            });

            it('should revert when removing a non-whitelisted token', async () => {
                await expect(networkSettings.removeTokenFromWhitelist(ZERO_ADDRESS)).to.be.revertedWith('DoesNotExist');

                const reserveToken2 = await Contracts.TestERC20Token.deploy(TKN, TKN, TOTAL_SUPPLY);
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

    describe('pool minting limits', () => {
        const poolMintingLimit = toWei(123_456);

        it('should revert when a non-owner attempts to set a pool limit', async () => {
            await expect(
                networkSettings.connect(nonOwner).setPoolMintingLimit(reserveToken.address, poolMintingLimit)
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when setting a pool limit of an invalid address token', async () => {
            await expect(networkSettings.setPoolMintingLimit(ZERO_ADDRESS, poolMintingLimit)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('should ignore setting to the same pool minting limit', async () => {
            await networkSettings.setPoolMintingLimit(reserveToken.address, poolMintingLimit);

            const res = await networkSettings.setPoolMintingLimit(reserveToken.address, poolMintingLimit);
            await expect(res).not.to.emit(networkSettings, 'PoolMintingLimitUpdated');
        });

        it('should be able to set and update pool minting limit of a token', async () => {
            expect(await networkSettings.poolMintingLimit(reserveToken.address)).to.equal(0);

            const res = await networkSettings.setPoolMintingLimit(reserveToken.address, poolMintingLimit);
            await expect(res)
                .to.emit(networkSettings, 'PoolMintingLimitUpdated')
                .withArgs(reserveToken.address, 0, poolMintingLimit);

            expect(await networkSettings.poolMintingLimit(reserveToken.address)).to.equal(poolMintingLimit);

            const res2 = await networkSettings.setPoolMintingLimit(reserveToken.address, 0);
            await expect(res2)
                .to.emit(networkSettings, 'PoolMintingLimitUpdated')
                .withArgs(reserveToken.address, poolMintingLimit, 0);

            expect(await networkSettings.poolMintingLimit(reserveToken.address)).to.equal(0);
        });
    });

    describe('min liquidity for trading', () => {
        const minLiquidityForTrading = 1000;

        it('should revert when a non-owner attempts to set the minimum liquidity for trading', async () => {
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

    describe('network fee params', () => {
        const newNetworkFee = 100_000;

        const expectNetworkFeeParams = async (vault: NetworkFeeVault | undefined, fee: number) => {
            const vaultAddress = vault?.address || ZERO_ADDRESS;
            const networkFeeParams = await networkSettings.networkFeeParams();
            expect(networkFeeParams[0]).to.equal(vaultAddress);
            expect(networkFeeParams[1]).to.equal(fee);
            expect(await networkSettings.networkFeeVault()).to.equal(vaultAddress);
            expect(await networkSettings.networkFeePPM()).to.equal(fee);
        };

        beforeEach(async () => {
            await expectNetworkFeeParams(networkFeeVault, 0);
        });

        it('should revert when setting the network fee to an invalid value', async () => {
            await expect(networkSettings.setNetworkFeePPM(PPM_RESOLUTION + 1)).to.be.revertedWith('InvalidFee');
        });

        it('should be able to set and update network vault params', async () => {
            const res = await networkSettings.setNetworkFeePPM(newNetworkFee);
            await expect(res).to.emit(networkSettings, 'NetworkFeePPMUpdated').withArgs(0, newNetworkFee);

            await expectNetworkFeeParams(networkFeeVault, newNetworkFee);
        });
    });

    describe('withdrawal fee', () => {
        const newWithdrawalFee = 500_000;

        beforeEach(async () => {
            expect(await networkSettings.withdrawalFeePPM()).to.equal(0);
        });

        it('should revert when a non-owner attempts to set the withdrawal fee', async () => {
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
        const newFlashLoanFee = 500_000;

        beforeEach(async () => {
            expect(await networkSettings.flashLoanFeePPM()).to.equal(0);
        });

        it('should revert when a non-owner attempts to set the flash-loan fee', async () => {
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

    describe('maximum deviation', () => {
        const newMaxDeviation = 500_000;

        beforeEach(async () => {
            expect(await networkSettings.averageRateMaxDeviationPPM()).to.equal(0);
        });

        it('should revert when a non-owner attempts to set the maximum deviation', async () => {
            await expect(
                networkSettings.connect(nonOwner).setAverageRateMaxDeviationPPM(newMaxDeviation)
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when setting the maximum deviation to an invalid value', async () => {
            await expect(networkSettings.setAverageRateMaxDeviationPPM(0)).to.be.revertedWith('InvalidPortion');

            await expect(networkSettings.setAverageRateMaxDeviationPPM(PPM_RESOLUTION + 1)).to.be.revertedWith(
                'InvalidPortion'
            );
        });

        it('should ignore updating to the same maximum deviation', async () => {
            await networkSettings.setAverageRateMaxDeviationPPM(newMaxDeviation);

            const res = await networkSettings.setAverageRateMaxDeviationPPM(newMaxDeviation);
            await expect(res).not.to.emit(networkSettings, 'AverageRateMaxDeviationPPMUpdated');
        });

        it('should be able to set and update the maximum deviation', async () => {
            const res = await networkSettings.setAverageRateMaxDeviationPPM(newMaxDeviation);
            await expect(res)
                .to.emit(networkSettings, 'AverageRateMaxDeviationPPMUpdated')
                .withArgs(0, newMaxDeviation);

            expect(await networkSettings.averageRateMaxDeviationPPM()).to.equal(newMaxDeviation);

            const newMaxDeviation2 = 5000;
            const res2 = await networkSettings.setAverageRateMaxDeviationPPM(newMaxDeviation2);
            await expect(res2)
                .to.emit(networkSettings, 'AverageRateMaxDeviationPPMUpdated')
                .withArgs(newMaxDeviation, newMaxDeviation2);

            expect(await networkSettings.averageRateMaxDeviationPPM()).to.equal(newMaxDeviation2);
        });
    });
});
