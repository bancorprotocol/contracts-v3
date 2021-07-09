import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import Contracts from 'components/Contracts';
import { NetworkSettings, TokenHolderUpgradeable, TestERC20Token } from 'typechain';

import { ZERO_ADDRESS, PPM_RESOLUTION } from 'test/helpers/Constants';

import { shouldHaveGap } from 'test/helpers/Proxy';

let networkFeeWallet: TokenHolderUpgradeable;

let accounts: SignerWithAddress[];
let nonOwner: SignerWithAddress;
let proxyAdmin: SignerWithAddress;

let reserveToken: TestERC20Token;

const TOTAL_SUPPLY = BigNumber.from(1_000_000);

describe('NetworkSettings', () => {
    shouldHaveGap('NetworkSettings', '_protectedTokensWhitelist');

    before(async () => {
        accounts = await ethers.getSigners();

        [, nonOwner, proxyAdmin] = accounts;
    });

    beforeEach(async () => {
        networkFeeWallet = await Contracts.TokenHolderUpgradeable.deploy();
        await networkFeeWallet.initialize();

        reserveToken = await Contracts.TestERC20Token.deploy('TKN', 'TKN', TOTAL_SUPPLY);
    });

    const testNetworkSettings = (createNetworkSettings: () => Promise<NetworkSettings>) => {
        describe('construction', async () => {
            it('should revert when attempting to reinitialize', async () => {
                const settings = await createNetworkSettings();

                await expect(settings.initialize()).to.be.revertedWith(
                    'Initializable: contract is already initialized'
                );
            });

            it('should be properly initialized', async () => {
                const settings = await createNetworkSettings();

                expect(await settings.version()).to.equal(1);

                expect(await settings.protectedTokensWhitelist()).to.be.empty;
                const networkFeeParams = await settings.networkFeeParams();
                expect(networkFeeParams[0]).to.equal(ZERO_ADDRESS);
                expect(networkFeeParams[1]).to.equal(BigNumber.from(0));
                expect(await settings.networkFeeWallet()).to.equal(ZERO_ADDRESS);
                expect(await settings.networkFeePPM()).to.equal(BigNumber.from(0));
                expect(await settings.withdrawalFeePPM()).to.equal(BigNumber.from(0));
                expect(await settings.flashLoanFeePPM()).to.equal(BigNumber.from(0));
                expect(await settings.averageRateMaxDeviationPPM()).to.equal(BigNumber.from(0));
            });
        });

        describe('protected tokens whitelist', async () => {
            let settings: NetworkSettings;

            beforeEach(async () => {
                settings = await createNetworkSettings();

                expect(await settings.protectedTokensWhitelist()).to.be.empty;
            });

            describe('adding', () => {
                it('should revert when a non-owner attempts to add a token', async () => {
                    await expect(
                        settings.connect(nonOwner).addTokenToProtectedTokensWhitelist(reserveToken.address)
                    ).to.be.revertedWith('ERR_ACCESS_DENIED');
                });

                it('should revert when adding an invalid address', async () => {
                    await expect(settings.addTokenToProtectedTokensWhitelist(ZERO_ADDRESS)).to.be.revertedWith(
                        'ERR_INVALID_EXTERNAL_ADDRESS'
                    );
                });

                it('should revert when adding an already whitelisted token', async () => {
                    await settings.addTokenToProtectedTokensWhitelist(reserveToken.address);
                    await expect(settings.addTokenToProtectedTokensWhitelist(reserveToken.address)).to.be.revertedWith(
                        'ERR_ALREADY_WHITELISTED'
                    );
                });

                it('should whitelist a token', async () => {
                    expect(await settings.isTokenWhitelisted(reserveToken.address)).to.be.false;

                    const res = await settings.addTokenToProtectedTokensWhitelist(reserveToken.address);
                    await expect(res).to.emit(settings, 'TokenAddedToWhitelist').withArgs(reserveToken.address);

                    expect(await settings.isTokenWhitelisted(reserveToken.address)).to.be.true;
                });
            });

            describe('removing', () => {
                beforeEach(async () => {
                    await settings.addTokenToProtectedTokensWhitelist(reserveToken.address);
                });

                it('should revert when a non-owner attempts to remove a token', async () => {
                    await expect(
                        settings.connect(nonOwner).removeTokenFromProtectedTokensWhitelist(reserveToken.address)
                    ).to.be.revertedWith('ERR_ACCESS_DENIED');
                });

                it('should revert when removing a non-whitelisted token', async () => {
                    await expect(settings.removeTokenFromProtectedTokensWhitelist(ZERO_ADDRESS)).to.be.revertedWith(
                        'ERR_NOT_WHITELISTED'
                    );

                    const reserveToken2 = await Contracts.TestERC20Token.deploy('TKN2', 'TKN2', TOTAL_SUPPLY);
                    await expect(
                        settings.removeTokenFromProtectedTokensWhitelist(reserveToken2.address)
                    ).to.be.revertedWith('ERR_NOT_WHITELISTED');
                });

                it('should remove a token', async () => {
                    expect(await settings.isTokenWhitelisted(reserveToken.address)).to.be.true;

                    const res = await settings.removeTokenFromProtectedTokensWhitelist(reserveToken.address);
                    await expect(res).to.emit(settings, 'TokenRemovedFromWhitelist').withArgs(reserveToken.address);

                    expect(await settings.isTokenWhitelisted(reserveToken.address)).to.be.false;
                });
            });
        });

        describe('pool minting limits', async () => {
            const poolMintingLimit = BigNumber.from(12345).mul(BigNumber.from(10).pow(18));
            let settings: NetworkSettings;

            beforeEach(async () => {
                settings = await createNetworkSettings();
            });

            it('should revert when a non-owner attempts to set a pool limit', async () => {
                await expect(
                    settings.connect(nonOwner).setPoolMintingLimit(reserveToken.address, poolMintingLimit)
                ).to.be.revertedWith('ERR_ACCESS_DENIED');
            });

            it('should revert when setting a pool limit of an invalid address token', async () => {
                await expect(settings.setPoolMintingLimit(ZERO_ADDRESS, poolMintingLimit)).to.be.revertedWith(
                    'ERR_INVALID_ADDRESS'
                );
            });

            it('should be to able to set and update pool minting limit of a token', async () => {
                expect(await settings.poolMintingLimit(reserveToken.address)).to.equal(BigNumber.from(0));

                const res = await settings.setPoolMintingLimit(reserveToken.address, poolMintingLimit);
                await expect(res)
                    .to.emit(settings, 'MintingLimitUpdated')
                    .withArgs(reserveToken.address, BigNumber.from(0), poolMintingLimit);

                expect(await settings.poolMintingLimit(reserveToken.address)).to.equal(poolMintingLimit);

                const res2 = await settings.setPoolMintingLimit(reserveToken.address, BigNumber.from(0));
                await expect(res2)
                    .to.emit(settings, 'MintingLimitUpdated')
                    .withArgs(reserveToken.address, poolMintingLimit, BigNumber.from(0));

                expect(await settings.poolMintingLimit(reserveToken.address)).to.equal(BigNumber.from(0));
            });
        });

        describe('network fee params', async () => {
            let newNetworkFeeWallet: TokenHolderUpgradeable;
            const newNetworkFee = BigNumber.from(100000);
            let settings: NetworkSettings;

            const expectNetworkFeeParams = async (wallet: TokenHolderUpgradeable | undefined, fee: BigNumber) => {
                const walletAddress = wallet?.address || ZERO_ADDRESS;
                const networkFeeParams = await settings.networkFeeParams();
                expect(networkFeeParams[0]).to.equal(walletAddress);
                expect(networkFeeParams[1]).to.equal(fee);
                expect(await settings.networkFeeWallet()).to.equal(walletAddress);
                expect(await settings.networkFeePPM()).to.equal(fee);
            };

            beforeEach(async () => {
                settings = await createNetworkSettings();

                await expectNetworkFeeParams(undefined, BigNumber.from(0));

                newNetworkFeeWallet = await Contracts.TokenHolderUpgradeable.deploy();
                await newNetworkFeeWallet.initialize();
            });

            it('should revert when a non-owner attempts to set the network fee params', async () => {
                await expect(
                    settings.connect(nonOwner).setNetworkFeeWallet(newNetworkFeeWallet.address)
                ).to.be.revertedWith('ERR_ACCESS_DENIED');
                await expect(settings.connect(nonOwner).setNetworkFeePPM(newNetworkFee)).to.be.revertedWith(
                    'ERR_ACCESS_DENIED'
                );
            });

            it('should revert when setting the network wallet to an invalid address', async () => {
                await expect(settings.setNetworkFeeWallet(ZERO_ADDRESS)).to.be.revertedWith('ERR_INVALID_ADDRESS');
            });

            it('should revert when setting the network fee to an invalid value', async () => {
                await expect(settings.setNetworkFeePPM(PPM_RESOLUTION.add(BigNumber.from(1)))).to.be.revertedWith(
                    'ERR_INVALID_FEE'
                );
            });

            it('should be to able to set and update network wallet params', async () => {
                const res = await settings.setNetworkFeeWallet(newNetworkFeeWallet.address);
                await expect(res)
                    .to.emit(settings, 'NetworkFeeWalletUpdated')
                    .withArgs(ZERO_ADDRESS, newNetworkFeeWallet.address);

                await expectNetworkFeeParams(newNetworkFeeWallet, BigNumber.from(0));

                const res2 = await settings.setNetworkFeePPM(newNetworkFee);
                await expect(res2).to.emit(settings, 'NetworkFeePPMUpdated').withArgs(BigNumber.from(0), newNetworkFee);

                await expectNetworkFeeParams(newNetworkFeeWallet, newNetworkFee);

                const res3 = await settings.setNetworkFeeWallet(networkFeeWallet.address);
                await expect(res3)
                    .to.emit(settings, 'NetworkFeeWalletUpdated')
                    .withArgs(newNetworkFeeWallet.address, networkFeeWallet.address);

                await expectNetworkFeeParams(networkFeeWallet, newNetworkFee);

                const res4 = await settings.setNetworkFeePPM(BigNumber.from(0));
                await expect(res4).to.emit(settings, 'NetworkFeePPMUpdated').withArgs(newNetworkFee, BigNumber.from(0));

                await expectNetworkFeeParams(networkFeeWallet, BigNumber.from(0));
            });
        });

        describe('withdrawal fee', async () => {
            const newExitFee = BigNumber.from(500000);
            let settings: NetworkSettings;

            beforeEach(async () => {
                settings = await createNetworkSettings();

                expect(await settings.withdrawalFeePPM()).to.equal(BigNumber.from(0));
            });

            it('should revert when a non-owner attempts to set the withdrawal fee', async () => {
                await expect(settings.connect(nonOwner).setWithdrawalFeePPM(newExitFee)).to.be.revertedWith(
                    'ERR_ACCESS_DENIED'
                );
            });

            it('should revert when setting the withdrawal fee to an invalid value', async () => {
                await expect(settings.setWithdrawalFeePPM(PPM_RESOLUTION.add(BigNumber.from(1)))).to.be.revertedWith(
                    'ERR_INVALID_FEE'
                );
            });

            it('should be to able to set and update the withdrawal fee', async () => {
                const res = await settings.setWithdrawalFeePPM(newExitFee);
                await expect(res).to.emit(settings, 'WithdrawalFeePPMUpdated').withArgs(BigNumber.from(0), newExitFee);

                expect(await settings.withdrawalFeePPM()).to.equal(newExitFee);

                const res2 = await settings.setWithdrawalFeePPM(BigNumber.from(0));
                await expect(res2).to.emit(settings, 'WithdrawalFeePPMUpdated').withArgs(newExitFee, BigNumber.from(0));

                expect(await settings.withdrawalFeePPM()).to.equal(BigNumber.from(0));
            });
        });

        describe('flash-loan fee', async () => {
            const newFlashLoanFee = BigNumber.from(500000);
            let settings: NetworkSettings;

            beforeEach(async () => {
                settings = await createNetworkSettings();

                expect(await settings.flashLoanFeePPM()).to.equal(BigNumber.from(0));
            });

            it('should revert when a non-owner attempts to set the flash-loan fee', async () => {
                await expect(settings.connect(nonOwner).setFlashLoanFeePPM(newFlashLoanFee)).to.be.revertedWith(
                    'ERR_ACCESS_DENIED'
                );
            });

            it('should revert when setting the flash-loan fee to an invalid value', async () => {
                await expect(settings.setFlashLoanFeePPM(PPM_RESOLUTION.add(BigNumber.from(1)))).to.be.revertedWith(
                    'ERR_INVALID_FEE'
                );
            });

            it('should be to able to set and update the flash-loan fee', async () => {
                const res = await settings.setFlashLoanFeePPM(newFlashLoanFee);
                await expect(res)
                    .to.emit(settings, 'FlashLoanFeePPMUpdated')
                    .withArgs(BigNumber.from(0), newFlashLoanFee);

                expect(await settings.flashLoanFeePPM()).to.equal(newFlashLoanFee);

                const res2 = await settings.setFlashLoanFeePPM(BigNumber.from(0));
                await expect(res2)
                    .to.emit(settings, 'FlashLoanFeePPMUpdated')
                    .withArgs(newFlashLoanFee, BigNumber.from(0));

                expect(await settings.flashLoanFeePPM()).to.equal(BigNumber.from(0));
            });
        });

        describe('maximum deviation', async () => {
            const newMaxDeviation = BigNumber.from(500000);
            let settings: NetworkSettings;

            beforeEach(async () => {
                settings = await createNetworkSettings();

                expect(await settings.averageRateMaxDeviationPPM()).to.equal(BigNumber.from(0));
            });

            it('should revert when a non-owner attempts to set the maximum deviation', async () => {
                await expect(
                    settings.connect(nonOwner).setAverageRateMaxDeviationPPM(newMaxDeviation)
                ).to.be.revertedWith('ERR_ACCESS_DENIED');
            });

            it('should revert when setting the maximum deviation to an invalid value', async () => {
                await expect(settings.setAverageRateMaxDeviationPPM(BigNumber.from(0))).to.be.revertedWith(
                    'ERR_INVALID_PORTION'
                );

                await expect(
                    settings.setAverageRateMaxDeviationPPM(PPM_RESOLUTION.add(BigNumber.from(1)))
                ).to.be.revertedWith('ERR_INVALID_PORTION');
            });

            it('should be to able to set and update the maximum deviation', async () => {
                const res = await settings.setAverageRateMaxDeviationPPM(newMaxDeviation);
                await expect(res)
                    .to.emit(settings, 'AverageRateMaxDeviationPPMUpdated')
                    .withArgs(BigNumber.from(0), newMaxDeviation);

                expect(await settings.averageRateMaxDeviationPPM()).to.equal(newMaxDeviation);

                const newMaxDeviation2 = BigNumber.from(5000);
                const res2 = await settings.setAverageRateMaxDeviationPPM(newMaxDeviation2);
                await expect(res2)
                    .to.emit(settings, 'AverageRateMaxDeviationPPMUpdated')
                    .withArgs(newMaxDeviation, newMaxDeviation2);

                expect(await settings.averageRateMaxDeviationPPM()).to.equal(newMaxDeviation2);
            });
        });
    };

    context('as a regular contract', () => {
        testNetworkSettings(async () => {
            const settings = await Contracts.NetworkSettings.deploy();
            await settings.initialize();

            return settings;
        });
    });

    context('as a proxy', () => {
        testNetworkSettings(async () => {
            const logic = await Contracts.NetworkSettings.deploy();

            const proxy = await Contracts.TransparentUpgradeableProxy.deploy(
                logic.address,
                proxyAdmin.address,
                logic.interface.encodeFunctionData('initialize')
            );

            return Contracts.NetworkSettings.attach(proxy.address);
        });
    });
});
