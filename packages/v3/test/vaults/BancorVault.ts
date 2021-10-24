import Contracts from '../../components/Contracts';
import { NetworkToken } from '../../components/LegacyContracts';
import { BancorVault } from '../../typechain';
import { expectRole, roles } from '../helpers/AccessControl';
import { ZERO_ADDRESS, BNT, ETH, TKN } from '../helpers/Constants';
import { createSystem } from '../helpers/Factory';
import { prepareEach } from '../helpers/Fixture';
import { shouldHaveGap } from '../helpers/Proxy';
import { createTokenBySymbol, TokenWithAddress, transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

const { Upgradeable: UpgradeableRoles, BancorVault: BancorVaultRoles } = roles;

describe('BancorVault', () => {
    shouldHaveGap('BancorVault');

    describe('construction', () => {
        let bancorVault: BancorVault;

        prepareEach(async () => {
            ({ bancorVault } = await createSystem());
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(bancorVault.initialize()).to.be.revertedWith('Initializable: contract is already initialized');
        });

        it('should revert when initialized with an invalid network token', async () => {
            await expect(Contracts.BancorVault.deploy(ZERO_ADDRESS)).to.be.revertedWith('InvalidAddress');
        });

        it('should be properly initialized', async () => {
            const [deployer] = await ethers.getSigners();
            const reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, BigNumber.from(1_000_000));

            const vault = await Contracts.BancorVault.deploy(reserveToken.address);
            await vault.initialize();

            expect(await bancorVault.isPayable()).to.be.true;

            expect(await bancorVault.version()).to.equal(1);

            await expectRole(vault, UpgradeableRoles.ROLE_ADMIN, UpgradeableRoles.ROLE_ADMIN, [deployer.address]);
            await expectRole(vault, BancorVaultRoles.ROLE_ASSET_MANAGER, BancorVaultRoles.ROLE_ASSET_MANAGER, [
                deployer.address
            ]);
            await expectRole(vault, BancorVaultRoles.ROLE_NETWORK_TOKEN_MANAGER, BancorVaultRoles.ROLE_ASSET_MANAGER);
        });
    });

    describe('asset management', () => {
        let amount = 1_000_000;

        let bancorVault: BancorVault;
        let networkToken: NetworkToken;

        let deployer: SignerWithAddress;
        let user: SignerWithAddress;

        let token: TokenWithAddress;

        const testWithdrawFunds = () => {
            it('should withdraw', async () => {
                await expect(bancorVault.connect(user).withdrawFunds(token.address, user.address, amount))
                    .to.emit(bancorVault, 'FundsWithdrawn')
                    .withArgs(token.address, user.address, user.address, amount);
            });
        };

        const testWithdrawFundsRestricted = () => {
            it('should revert', async () => {
                await expect(
                    bancorVault.connect(user).withdrawFunds(token.address, user.address, amount)
                ).to.revertedWith('AccessDenied');
            });
        };

        prepareEach(async () => {
            ({ bancorVault, networkToken } = await createSystem());
            [deployer, user] = await ethers.getSigners();
        });

        context(`withdrawing ${ETH}`, () => {
            prepareEach(async () => {
                token = await createTokenBySymbol(ETH);

                transfer(deployer, token, bancorVault.address, amount);
            });

            context('when role asset manager', () => {
                prepareEach(async () => {
                    await bancorVault.grantRole(BancorVaultRoles.ROLE_ASSET_MANAGER, user.address);
                });

                testWithdrawFunds();
            });

            context('when network token manager', () => {
                prepareEach(async () => {
                    await bancorVault.grantRole(BancorVaultRoles.ROLE_NETWORK_TOKEN_MANAGER, user.address);
                });

                testWithdrawFundsRestricted();
            });

            context('when regular user', () => {
                testWithdrawFundsRestricted();
            });
        });

        context(`withdrawing ${BNT}`, () => {
            prepareEach(async () => {
                token = networkToken;

                transfer(deployer, token, bancorVault.address, amount);
            });

            context('when role asset manager', () => {
                prepareEach(async () => {
                    await bancorVault.grantRole(BancorVaultRoles.ROLE_ASSET_MANAGER, user.address);
                });

                testWithdrawFunds();
            });

            context('when network token manager', () => {
                prepareEach(async () => {
                    await bancorVault.grantRole(BancorVaultRoles.ROLE_NETWORK_TOKEN_MANAGER, user.address);
                });

                testWithdrawFunds();
            });

            context('when regular user', () => {
                testWithdrawFundsRestricted();
            });
        });

        context(`withdrawing ${TKN}`, () => {
            prepareEach(async () => {
                token = await Contracts.TestERC20Token.deploy('TKN', 'TKN', amount);

                transfer(deployer, token, bancorVault.address, amount);
            });

            context('when role asset manager', () => {
                prepareEach(async () => {
                    await bancorVault.grantRole(BancorVaultRoles.ROLE_ASSET_MANAGER, user.address);
                });

                testWithdrawFunds();
            });

            context('when network token manager', () => {
                prepareEach(async () => {
                    await bancorVault.grantRole(BancorVaultRoles.ROLE_NETWORK_TOKEN_MANAGER, user.address);
                });

                testWithdrawFundsRestricted();
            });

            context('when regular user', () => {
                testWithdrawFundsRestricted();
            });
        });
    });
});
