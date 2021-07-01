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

const DEFAULT_NETWORK_FEE = BigNumber.from(10000);
const DEFAULT_EXIT_FEE = BigNumber.from(5000);
const DEFAULT_FLASH_LOAN_FEE = BigNumber.from(1000);
const DEFAULT_MAX_DEVIATION = BigNumber.from(5000);

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

    const testNetworkSettings = (
        createNetworkSettings: (
            networkFeePPMWallet: string,
            networkFeePPM: BigNumber,
            exitFeePPM: BigNumber,
            flashLoanFeePPM: BigNumber,
            averageRateMaxDeviationPPM: BigNumber
        ) => Promise<NetworkSettings>
    ) => {
        describe('construction', async () => {
            it('should revert when initialized with an invalid network fee wallet', async () => {
                await expect(
                    createNetworkSettings(
                        ZERO_ADDRESS,
                        DEFAULT_NETWORK_FEE,
                        DEFAULT_EXIT_FEE,
                        DEFAULT_FLASH_LOAN_FEE,
                        DEFAULT_MAX_DEVIATION
                    )
                ).to.be.revertedWith('ERR_INVALID_ADDRESS');
            });

            it('should revert when initialized with an invalid network fee', async () => {
                await expect(
                    createNetworkSettings(
                        networkFeeWallet.address,
                        PPM_RESOLUTION.add(BigNumber.from(1)),
                        DEFAULT_EXIT_FEE,
                        DEFAULT_FLASH_LOAN_FEE,
                        DEFAULT_MAX_DEVIATION
                    )
                ).to.be.revertedWith('ERR_INVALID_FEE');
            });

            it('should revert when initialized with an invalid exit fee', async () => {
                await expect(
                    createNetworkSettings(
                        networkFeeWallet.address,
                        DEFAULT_NETWORK_FEE,
                        PPM_RESOLUTION.add(BigNumber.from(1)),
                        DEFAULT_FLASH_LOAN_FEE,
                        DEFAULT_MAX_DEVIATION
                    )
                ).to.be.revertedWith('ERR_INVALID_FEE');
            });

            it('should revert when initialized with an invalid flash loan fee', async () => {
                await expect(
                    createNetworkSettings(
                        networkFeeWallet.address,
                        DEFAULT_NETWORK_FEE,
                        DEFAULT_EXIT_FEE,
                        PPM_RESOLUTION.add(BigNumber.from(1)),
                        DEFAULT_MAX_DEVIATION
                    )
                ).to.be.revertedWith('ERR_INVALID_FEE');
            });

            it('should revert when initialized with an invalid deviation', async () => {
                await expect(
                    createNetworkSettings(
                        networkFeeWallet.address,
                        DEFAULT_NETWORK_FEE,
                        DEFAULT_EXIT_FEE,
                        DEFAULT_FLASH_LOAN_FEE,
                        BigNumber.from(0)
                    )
                ).to.be.revertedWith('ERR_INVALID_PORTION');

                await expect(
                    createNetworkSettings(
                        networkFeeWallet.address,
                        DEFAULT_NETWORK_FEE,
                        DEFAULT_EXIT_FEE,
                        DEFAULT_FLASH_LOAN_FEE,
                        PPM_RESOLUTION.add(BigNumber.from(1))
                    )
                ).to.be.revertedWith('ERR_INVALID_PORTION');
            });

            it('should be properly initialized', async () => {
                const settings = await createNetworkSettings(
                    networkFeeWallet.address,
                    DEFAULT_NETWORK_FEE,
                    DEFAULT_EXIT_FEE,
                    DEFAULT_FLASH_LOAN_FEE,
                    DEFAULT_MAX_DEVIATION
                );

                expect(await settings.version()).to.equal(1);

                expect(await settings.protectedTokensWhitelist()).to.be.empty;
                const networkFeeParams = await settings.networkFeeParams();
                expect(networkFeeParams[0]).to.equal(networkFeeWallet.address);
                expect(networkFeeParams[1]).to.equal(DEFAULT_NETWORK_FEE);
                expect(await settings.networkFeeWallet()).to.equal(networkFeeWallet.address);
                expect(await settings.networkFeePPM()).to.equal(DEFAULT_NETWORK_FEE);
                expect(await settings.exitFeePPM()).to.equal(DEFAULT_EXIT_FEE);
                expect(await settings.flashLoanFeePPM()).to.equal(DEFAULT_FLASH_LOAN_FEE);
                expect(await settings.averageRateMaxDeviationPPM()).to.equal(DEFAULT_MAX_DEVIATION);
            });
        });

        describe('protected tokens white list', async () => {
            let settings: NetworkSettings;

            beforeEach(async () => {
                settings = await createNetworkSettings(
                    networkFeeWallet.address,
                    DEFAULT_NETWORK_FEE,
                    DEFAULT_EXIT_FEE,
                    DEFAULT_FLASH_LOAN_FEE,
                    DEFAULT_MAX_DEVIATION
                );

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
                settings = await createNetworkSettings(
                    networkFeeWallet.address,
                    DEFAULT_NETWORK_FEE,
                    DEFAULT_EXIT_FEE,
                    DEFAULT_FLASH_LOAN_FEE,
                    DEFAULT_MAX_DEVIATION
                );
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

            const expectNetworkFeeParams = async (wallet: TokenHolderUpgradeable, fee: BigNumber) => {
                const networkFeeParams = await settings.networkFeeParams();
                expect(networkFeeParams[0]).to.equal(wallet.address);
                expect(networkFeeParams[1]).to.equal(fee);
                expect(await settings.networkFeeWallet()).to.equal(wallet.address);
                expect(await settings.networkFeePPM()).to.equal(fee);
            };

            beforeEach(async () => {
                settings = await createNetworkSettings(
                    networkFeeWallet.address,
                    DEFAULT_NETWORK_FEE,
                    DEFAULT_EXIT_FEE,
                    DEFAULT_FLASH_LOAN_FEE,
                    DEFAULT_MAX_DEVIATION
                );

                await expectNetworkFeeParams(networkFeeWallet, DEFAULT_NETWORK_FEE);

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
                    .withArgs(networkFeeWallet.address, newNetworkFeeWallet.address);

                await expectNetworkFeeParams(newNetworkFeeWallet, DEFAULT_NETWORK_FEE);

                const res2 = await settings.setNetworkFeePPM(newNetworkFee);
                await expect(res2)
                    .to.emit(settings, 'NetworkFeePPMUpdated')
                    .withArgs(DEFAULT_NETWORK_FEE, newNetworkFee);

                await expectNetworkFeeParams(newNetworkFeeWallet, newNetworkFee);

                const res3 = await settings.setNetworkFeeWallet(networkFeeWallet.address);
                await expect(res3)
                    .to.emit(settings, 'NetworkFeeWalletUpdated')
                    .withArgs(newNetworkFeeWallet.address, networkFeeWallet.address);

                await expectNetworkFeeParams(networkFeeWallet, newNetworkFee);

                const res4 = await settings.setNetworkFeePPM(DEFAULT_NETWORK_FEE);
                await expect(res4)
                    .to.emit(settings, 'NetworkFeePPMUpdated')
                    .withArgs(newNetworkFee, DEFAULT_NETWORK_FEE);

                await expectNetworkFeeParams(networkFeeWallet, DEFAULT_NETWORK_FEE);
            });
        });

        describe('exit fee', async () => {
            const newExitFee = BigNumber.from(500000);
            let settings: NetworkSettings;

            beforeEach(async () => {
                settings = await createNetworkSettings(
                    networkFeeWallet.address,
                    DEFAULT_NETWORK_FEE,
                    DEFAULT_EXIT_FEE,
                    DEFAULT_FLASH_LOAN_FEE,
                    DEFAULT_MAX_DEVIATION
                );

                expect(await settings.exitFeePPM()).to.equal(DEFAULT_EXIT_FEE);
            });

            it('should revert when a non-owner attempts to set the exit fee', async () => {
                await expect(settings.connect(nonOwner).setExitFeePPM(newExitFee)).to.be.revertedWith(
                    'ERR_ACCESS_DENIED'
                );
            });

            it('should revert when setting the exit fee to an invalid value', async () => {
                await expect(settings.setExitFeePPM(PPM_RESOLUTION.add(BigNumber.from(1)))).to.be.revertedWith(
                    'ERR_INVALID_FEE'
                );
            });

            it('should be to able to set and update the exit fee', async () => {
                const res = await settings.setExitFeePPM(newExitFee);
                await expect(res).to.emit(settings, 'ExitFeePPMUpdated').withArgs(DEFAULT_EXIT_FEE, newExitFee);

                expect(await settings.exitFeePPM()).to.equal(newExitFee);

                const res2 = await settings.setExitFeePPM(DEFAULT_EXIT_FEE);
                await expect(res2).to.emit(settings, 'ExitFeePPMUpdated').withArgs(newExitFee, DEFAULT_EXIT_FEE);

                expect(await settings.exitFeePPM()).to.equal(DEFAULT_EXIT_FEE);
            });
        });

        describe('flash loan fee', async () => {
            const newFlashLoanFee = BigNumber.from(500000);
            let settings: NetworkSettings;

            beforeEach(async () => {
                settings = await createNetworkSettings(
                    networkFeeWallet.address,
                    DEFAULT_NETWORK_FEE,
                    DEFAULT_EXIT_FEE,
                    DEFAULT_FLASH_LOAN_FEE,
                    DEFAULT_MAX_DEVIATION
                );

                expect(await settings.flashLoanFeePPM()).to.equal(DEFAULT_FLASH_LOAN_FEE);
            });

            it('should revert when a non-owner attempts to set the flash loan fee', async () => {
                await expect(settings.connect(nonOwner).setFlashLoanFeePPM(newFlashLoanFee)).to.be.revertedWith(
                    'ERR_ACCESS_DENIED'
                );
            });

            it('should revert when setting the flash loan fee to an invalid value', async () => {
                await expect(settings.setFlashLoanFeePPM(PPM_RESOLUTION.add(BigNumber.from(1)))).to.be.revertedWith(
                    'ERR_INVALID_FEE'
                );
            });

            it('should be to able to set and update the flash loan fee', async () => {
                const res = await settings.setFlashLoanFeePPM(newFlashLoanFee);
                await expect(res)
                    .to.emit(settings, 'FlashLoanFeePPMUpdated')
                    .withArgs(DEFAULT_FLASH_LOAN_FEE, newFlashLoanFee);

                expect(await settings.flashLoanFeePPM()).to.equal(newFlashLoanFee);

                const res2 = await settings.setFlashLoanFeePPM(DEFAULT_FLASH_LOAN_FEE);
                await expect(res2)
                    .to.emit(settings, 'FlashLoanFeePPMUpdated')
                    .withArgs(newFlashLoanFee, DEFAULT_FLASH_LOAN_FEE);

                expect(await settings.flashLoanFeePPM()).to.equal(DEFAULT_FLASH_LOAN_FEE);
            });
        });

        describe('maximum deviation', async () => {
            const newMaxDeviation = BigNumber.from(500000);
            let settings: NetworkSettings;

            beforeEach(async () => {
                settings = await createNetworkSettings(
                    networkFeeWallet.address,
                    DEFAULT_NETWORK_FEE,
                    DEFAULT_EXIT_FEE,
                    DEFAULT_FLASH_LOAN_FEE,
                    DEFAULT_MAX_DEVIATION
                );

                expect(await settings.averageRateMaxDeviationPPM()).to.equal(DEFAULT_MAX_DEVIATION);
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
                    .withArgs(DEFAULT_MAX_DEVIATION, newMaxDeviation);

                expect(await settings.averageRateMaxDeviationPPM()).to.equal(newMaxDeviation);

                const res2 = await settings.setAverageRateMaxDeviationPPM(DEFAULT_MAX_DEVIATION);
                await expect(res2)
                    .to.emit(settings, 'AverageRateMaxDeviationPPMUpdated')
                    .withArgs(newMaxDeviation, DEFAULT_MAX_DEVIATION);

                expect(await settings.averageRateMaxDeviationPPM()).to.equal(DEFAULT_MAX_DEVIATION);
            });
        });
    };

    context('as a regular contract', () => {
        testNetworkSettings(
            async (
                networkFeePPMWallet: string,
                networkFeePPM: BigNumber,
                exitFeePPM: BigNumber,
                flashLoanFeePPM: BigNumber,
                averageRateMaxDeviationPPM: BigNumber
            ) => {
                const settings = await Contracts.NetworkSettings.deploy();
                await settings.initialize(
                    networkFeePPMWallet,
                    networkFeePPM,
                    exitFeePPM,
                    flashLoanFeePPM,
                    averageRateMaxDeviationPPM
                );

                return settings;
            }
        );
    });

    context('as a proxy', () => {
        testNetworkSettings(
            async (
                networkFeePPMWallet: string,
                networkFeePPM: BigNumber,
                exitFeePPM: BigNumber,
                flashLoanFeePPM: BigNumber,
                averageRateMaxDeviationPPM: BigNumber
            ) => {
                const logic = await Contracts.NetworkSettings.deploy();

                const proxy = await Contracts.TransparentUpgradeableProxy.deploy(
                    logic.address,
                    proxyAdmin.address,
                    logic.interface.encodeFunctionData('initialize', [
                        networkFeePPMWallet,
                        networkFeePPM,
                        exitFeePPM,
                        flashLoanFeePPM,
                        averageRateMaxDeviationPPM
                    ])
                );

                return Contracts.NetworkSettings.attach(proxy.address);
            }
        );
    });
});
