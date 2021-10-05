import Contracts from '../../components/Contracts';
import { NetworkSettings, TokenHolder, TestERC20Token } from '../../typechain';
import { expectRole, roles } from '../helpers/AccessControl';
import { ZERO_ADDRESS, PPM_RESOLUTION, TKN } from '../helpers/Constants';
import { createTokenHolder, createSystem } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

const { Upgradeable: UpgradeableRoles } = roles;

describe('NetworkSettings', () => {
    let networkFeeWallet: TokenHolder;
    let reserveToken: TestERC20Token;

    let deployer: SignerWithAddress;
    let nonOwner: SignerWithAddress;

    const TOTAL_SUPPLY = BigNumber.from(1_000_000);

    shouldHaveGap('NetworkSettings', '_protectedTokenWhitelist');

    before(async () => {
        [deployer, nonOwner] = await ethers.getSigners();
    });

    beforeEach(async () => {
        networkFeeWallet = await createTokenHolder();

        reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, TOTAL_SUPPLY);
    });

    describe('construction', async () => {
        it('should revert when attempting to reinitialize', async () => {
            const { networkSettings } = await createSystem();

            await expect(networkSettings.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            const { networkSettings } = await createSystem();

            expect(await networkSettings.version()).to.equal(1);

            await expectRole(networkSettings, UpgradeableRoles.ROLE_OWNER, UpgradeableRoles.ROLE_OWNER, [
                deployer.address
            ]);

            expect(await networkSettings.protectedTokenWhitelist()).to.be.empty;
            const networkFeeParams = await networkSettings.networkFeeParams();
            expect(networkFeeParams[0]).to.equal(ZERO_ADDRESS);
            expect(networkFeeParams[1]).to.equal(BigNumber.from(0));
            expect(await networkSettings.networkFeeWallet()).to.equal(ZERO_ADDRESS);
            expect(await networkSettings.networkFeePPM()).to.equal(BigNumber.from(0));
            expect(await networkSettings.withdrawalFeePPM()).to.equal(BigNumber.from(0));
            expect(await networkSettings.flashLoanFeePPM()).to.equal(BigNumber.from(0));
            expect(await networkSettings.averageRateMaxDeviationPPM()).to.equal(BigNumber.from(0));
        });
    });

    describe('protected tokens whitelist', async () => {
        let networkSettings: NetworkSettings;

        beforeEach(async () => {
            ({ networkSettings } = await createSystem());

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
                    'InvalidExternalAddress()'
                );
            });

            it('should revert when adding an already whitelisted token', async () => {
                await networkSettings.addTokenToWhitelist(reserveToken.address);
                await expect(networkSettings.addTokenToWhitelist(reserveToken.address)).to.be.revertedWith(
                    'AlreadyExists()'
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
                await expect(networkSettings.removeTokenFromWhitelist(ZERO_ADDRESS)).to.be.revertedWith(
                    'DoesNotExist()'
                );

                const reserveToken2 = await Contracts.TestERC20Token.deploy(TKN, TKN, TOTAL_SUPPLY);
                await expect(networkSettings.removeTokenFromWhitelist(reserveToken2.address)).to.be.revertedWith(
                    'DoesNotExist()'
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
        const poolMintingLimit = BigNumber.from(12345).mul(BigNumber.from(10).pow(18));
        let networkSettings: NetworkSettings;

        beforeEach(async () => {
            ({ networkSettings } = await createSystem());
        });

        it('should revert when a non-owner attempts to set a pool limit', async () => {
            await expect(
                networkSettings.connect(nonOwner).setPoolMintingLimit(reserveToken.address, poolMintingLimit)
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when setting a pool limit of an invalid address token', async () => {
            await expect(networkSettings.setPoolMintingLimit(ZERO_ADDRESS, poolMintingLimit)).to.be.revertedWith(
                'InvalidAddress()'
            );
        });

        it('should ignore setting to the same pool minting limit', async () => {
            await networkSettings.setPoolMintingLimit(reserveToken.address, poolMintingLimit);

            const res = await networkSettings.setPoolMintingLimit(reserveToken.address, poolMintingLimit);
            await expect(res).not.to.emit(networkSettings, 'PoolMintingLimitUpdated');
        });

        it('should be able to set and update pool minting limit of a token', async () => {
            expect(await networkSettings.poolMintingLimit(reserveToken.address)).to.equal(BigNumber.from(0));

            const res = await networkSettings.setPoolMintingLimit(reserveToken.address, poolMintingLimit);
            await expect(res)
                .to.emit(networkSettings, 'PoolMintingLimitUpdated')
                .withArgs(reserveToken.address, BigNumber.from(0), poolMintingLimit);

            expect(await networkSettings.poolMintingLimit(reserveToken.address)).to.equal(poolMintingLimit);

            const res2 = await networkSettings.setPoolMintingLimit(reserveToken.address, BigNumber.from(0));
            await expect(res2)
                .to.emit(networkSettings, 'PoolMintingLimitUpdated')
                .withArgs(reserveToken.address, poolMintingLimit, BigNumber.from(0));

            expect(await networkSettings.poolMintingLimit(reserveToken.address)).to.equal(BigNumber.from(0));
        });
    });

    describe('min liquidity for trading', () => {
        const minLiquidityForTrading = BigNumber.from(1000).mul(BigNumber.from(10).pow(18));
        let networkSettings: NetworkSettings;

        beforeEach(async () => {
            ({ networkSettings } = await createSystem());
        });

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
            expect(await networkSettings.minLiquidityForTrading()).to.equal(BigNumber.from(0));

            const res = await networkSettings.setMinLiquidityForTrading(minLiquidityForTrading);
            await expect(res)
                .to.emit(networkSettings, 'MinLiquidityForTradingUpdated')
                .withArgs(BigNumber.from(0), minLiquidityForTrading);

            expect(await networkSettings.minLiquidityForTrading()).to.equal(minLiquidityForTrading);

            const newMinLiquidityForTrading = BigNumber.from(1);
            const res2 = await networkSettings.setMinLiquidityForTrading(newMinLiquidityForTrading);
            await expect(res2)
                .to.emit(networkSettings, 'MinLiquidityForTradingUpdated')
                .withArgs(minLiquidityForTrading, newMinLiquidityForTrading);

            expect(await networkSettings.minLiquidityForTrading()).to.equal(newMinLiquidityForTrading);
        });
    });

    describe('network fee params', () => {
        let newNetworkFeeWallet: TokenHolder;
        const newNetworkFee = BigNumber.from(100000);
        let networkSettings: NetworkSettings;

        const expectNetworkFeeParams = async (wallet: TokenHolder | undefined, fee: BigNumber) => {
            const walletAddress = wallet?.address || ZERO_ADDRESS;
            const networkFeeParams = await networkSettings.networkFeeParams();
            expect(networkFeeParams[0]).to.equal(walletAddress);
            expect(networkFeeParams[1]).to.equal(fee);
            expect(await networkSettings.networkFeeWallet()).to.equal(walletAddress);
            expect(await networkSettings.networkFeePPM()).to.equal(fee);
        };

        beforeEach(async () => {
            ({ networkSettings } = await createSystem());

            await expectNetworkFeeParams(undefined, BigNumber.from(0));

            newNetworkFeeWallet = await createTokenHolder();
        });

        it('should revert when a non-owner attempts to set the network fee params', async () => {
            await expect(
                networkSettings.connect(nonOwner).setNetworkFeeWallet(newNetworkFeeWallet.address)
            ).to.be.revertedWith('AccessDenied');
            await expect(networkSettings.connect(nonOwner).setNetworkFeePPM(newNetworkFee)).to.be.revertedWith(
                'AccessDenied()'
            );
        });

        it('should revert when setting the network wallet to an invalid address', async () => {
            await expect(networkSettings.setNetworkFeeWallet(ZERO_ADDRESS)).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when setting the network fee to an invalid value', async () => {
            await expect(networkSettings.setNetworkFeePPM(PPM_RESOLUTION.add(BigNumber.from(1)))).to.be.revertedWith(
                'InvalidFee()'
            );
        });

        it('should ignore updating to the same network wallet params', async () => {
            await networkSettings.setNetworkFeeWallet(newNetworkFeeWallet.address);

            const res = await networkSettings.setNetworkFeeWallet(newNetworkFeeWallet.address);
            await expect(res).not.to.emit(networkSettings, 'NetworkFeeWalletUpdated');

            await networkSettings.setNetworkFeePPM(newNetworkFee);
            const res2 = await networkSettings.setNetworkFeePPM(newNetworkFee);
            await expect(res2).not.to.emit(networkSettings, 'NetworkFeePPMUpdated');
        });

        it('should be able to set and update network wallet params', async () => {
            const res = await networkSettings.setNetworkFeeWallet(newNetworkFeeWallet.address);
            await expect(res)
                .to.emit(networkSettings, 'NetworkFeeWalletUpdated')
                .withArgs(ZERO_ADDRESS, newNetworkFeeWallet.address);

            await expectNetworkFeeParams(newNetworkFeeWallet, BigNumber.from(0));

            const res2 = await networkSettings.setNetworkFeePPM(newNetworkFee);
            await expect(res2)
                .to.emit(networkSettings, 'NetworkFeePPMUpdated')
                .withArgs(BigNumber.from(0), newNetworkFee);

            await expectNetworkFeeParams(newNetworkFeeWallet, newNetworkFee);

            const res3 = await networkSettings.setNetworkFeeWallet(networkFeeWallet.address);
            await expect(res3)
                .to.emit(networkSettings, 'NetworkFeeWalletUpdated')
                .withArgs(newNetworkFeeWallet.address, networkFeeWallet.address);

            await expectNetworkFeeParams(networkFeeWallet, newNetworkFee);

            const res4 = await networkSettings.setNetworkFeePPM(BigNumber.from(0));
            await expect(res4)
                .to.emit(networkSettings, 'NetworkFeePPMUpdated')
                .withArgs(newNetworkFee, BigNumber.from(0));

            await expectNetworkFeeParams(networkFeeWallet, BigNumber.from(0));
        });
    });

    describe('withdrawal fee', () => {
        const newWithdrawalFee = BigNumber.from(500000);
        let networkSettings: NetworkSettings;

        beforeEach(async () => {
            ({ networkSettings } = await createSystem());

            expect(await networkSettings.withdrawalFeePPM()).to.equal(BigNumber.from(0));
        });

        it('should revert when a non-owner attempts to set the withdrawal fee', async () => {
            await expect(networkSettings.connect(nonOwner).setWithdrawalFeePPM(newWithdrawalFee)).to.be.revertedWith(
                'AccessDenied()'
            );
        });

        it('should revert when setting the withdrawal fee to an invalid value', async () => {
            await expect(networkSettings.setWithdrawalFeePPM(PPM_RESOLUTION.add(BigNumber.from(1)))).to.be.revertedWith(
                'InvalidFee()'
            );
        });

        it('should ignore updating to the same withdrawal fee', async () => {
            await networkSettings.setWithdrawalFeePPM(newWithdrawalFee);

            const res = await networkSettings.setWithdrawalFeePPM(newWithdrawalFee);
            await expect(res).not.to.emit(networkSettings, 'WithdrawalFeePPMUpdated');
        });

        it('should be able to set and update the withdrawal fee', async () => {
            const res = await networkSettings.setWithdrawalFeePPM(newWithdrawalFee);
            await expect(res)
                .to.emit(networkSettings, 'WithdrawalFeePPMUpdated')
                .withArgs(BigNumber.from(0), newWithdrawalFee);

            expect(await networkSettings.withdrawalFeePPM()).to.equal(newWithdrawalFee);

            const res2 = await networkSettings.setWithdrawalFeePPM(BigNumber.from(0));
            await expect(res2)
                .to.emit(networkSettings, 'WithdrawalFeePPMUpdated')
                .withArgs(newWithdrawalFee, BigNumber.from(0));

            expect(await networkSettings.withdrawalFeePPM()).to.equal(BigNumber.from(0));
        });
    });

    describe('flash-loan fee', () => {
        const newFlashLoanFee = BigNumber.from(500000);
        let networkSettings: NetworkSettings;

        beforeEach(async () => {
            ({ networkSettings } = await createSystem());

            expect(await networkSettings.flashLoanFeePPM()).to.equal(BigNumber.from(0));
        });

        it('should revert when a non-owner attempts to set the flash-loan fee', async () => {
            await expect(networkSettings.connect(nonOwner).setFlashLoanFeePPM(newFlashLoanFee)).to.be.revertedWith(
                'AccessDenied()'
            );
        });

        it('should revert when setting the flash-loan fee to an invalid value', async () => {
            await expect(networkSettings.setFlashLoanFeePPM(PPM_RESOLUTION.add(BigNumber.from(1)))).to.be.revertedWith(
                'InvalidFee()'
            );
        });

        it('should ignore updating to the same flash-loan fee', async () => {
            await networkSettings.setFlashLoanFeePPM(newFlashLoanFee);

            const res = await networkSettings.setFlashLoanFeePPM(newFlashLoanFee);
            await expect(res).not.to.emit(networkSettings, 'FlashLoanFeePPMUpdated');
        });

        it('should be able to set and update the flash-loan fee', async () => {
            const res = await networkSettings.setFlashLoanFeePPM(newFlashLoanFee);
            await expect(res)
                .to.emit(networkSettings, 'FlashLoanFeePPMUpdated')
                .withArgs(BigNumber.from(0), newFlashLoanFee);

            expect(await networkSettings.flashLoanFeePPM()).to.equal(newFlashLoanFee);

            const res2 = await networkSettings.setFlashLoanFeePPM(BigNumber.from(0));
            await expect(res2)
                .to.emit(networkSettings, 'FlashLoanFeePPMUpdated')
                .withArgs(newFlashLoanFee, BigNumber.from(0));

            expect(await networkSettings.flashLoanFeePPM()).to.equal(BigNumber.from(0));
        });
    });

    describe('maximum deviation', () => {
        const newMaxDeviation = BigNumber.from(500000);
        let networkSettings: NetworkSettings;

        beforeEach(async () => {
            ({ networkSettings } = await createSystem());

            expect(await networkSettings.averageRateMaxDeviationPPM()).to.equal(BigNumber.from(0));
        });

        it('should revert when a non-owner attempts to set the maximum deviation', async () => {
            await expect(
                networkSettings.connect(nonOwner).setAverageRateMaxDeviationPPM(newMaxDeviation)
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when setting the maximum deviation to an invalid value', async () => {
            await expect(networkSettings.setAverageRateMaxDeviationPPM(BigNumber.from(0))).to.be.revertedWith(
                'InvalidPortion()'
            );

            await expect(
                networkSettings.setAverageRateMaxDeviationPPM(PPM_RESOLUTION.add(BigNumber.from(1)))
            ).to.be.revertedWith('InvalidPortion');
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
                .withArgs(BigNumber.from(0), newMaxDeviation);

            expect(await networkSettings.averageRateMaxDeviationPPM()).to.equal(newMaxDeviation);

            const newMaxDeviation2 = BigNumber.from(5000);
            const res2 = await networkSettings.setAverageRateMaxDeviationPPM(newMaxDeviation2);
            await expect(res2)
                .to.emit(networkSettings, 'AverageRateMaxDeviationPPMUpdated')
                .withArgs(newMaxDeviation, newMaxDeviation2);

            expect(await networkSettings.averageRateMaxDeviationPPM()).to.equal(newMaxDeviation2);
        });
    });
});
