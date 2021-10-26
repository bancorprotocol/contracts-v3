import Contracts from '../../components/Contracts';
import { NetworkToken } from '../../components/LegacyContracts';
import { ExternalProtectionVault } from '../../typechain';
import { expectRole, roles } from '../helpers/AccessControl';
import { BNT, ETH, TKN } from '../helpers/Constants';
import { createProxy, createSystem } from '../helpers/Factory';
import { prepareEach } from '../helpers/Fixture';
import { shouldHaveGap } from '../helpers/Proxy';
import { transfer, createTokenBySymbol, TokenWithAddress } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

const { Upgradeable: UpgradeableRoles, ExternalProtectionVault: ExternalProtectionVaultRoles } = roles;

describe('ExternalProtectionVault', () => {
    shouldHaveGap('ExternalProtectionVault');

    describe('construction', () => {
        let externalProtectionVault: ExternalProtectionVault;

        prepareEach(async () => {
            ({ externalProtectionVault } = await createSystem());
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(externalProtectionVault.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be payable', async () => {
            expect(await externalProtectionVault.isPayable()).to.be.true;
        });

        it('should be properly initialized', async () => {
            const [deployer] = await ethers.getSigners();
            const externalProtectionVault = await createProxy(Contracts.ExternalProtectionVault);

            expect(await externalProtectionVault.version()).to.equal(1);

            await expectRole(externalProtectionVault, UpgradeableRoles.ROLE_ADMIN, UpgradeableRoles.ROLE_ADMIN, [
                deployer.address
            ]);
            await expectRole(
                externalProtectionVault,
                ExternalProtectionVaultRoles.ROLE_ASSET_MANAGER,
                ExternalProtectionVaultRoles.ROLE_ASSET_MANAGER,
                [deployer.address]
            );
        });
    });

    describe('asset management', () => {
        let amount = 1_000_000;

        let externalProtectionVault: ExternalProtectionVault;
        let networkToken: NetworkToken;

        let deployer: SignerWithAddress;
        let user: SignerWithAddress;

        let token: TokenWithAddress;

        const testWithdrawFunds = () => {
            it('should withdraw', async () => {
                await expect(externalProtectionVault.connect(user).withdrawFunds(token.address, user.address, amount))
                    .to.emit(externalProtectionVault, 'FundsWithdrawn')
                    .withArgs(token.address, user.address, user.address, amount);
            });
        };

        const testWithdrawFundsRestricted = () => {
            it('should revert', async () => {
                await expect(
                    externalProtectionVault.connect(user).withdrawFunds(token.address, user.address, amount)
                ).to.revertedWith('AccessDenied');
            });
        };

        before(async () => {
            [deployer, user] = await ethers.getSigners();
        });

        for (const symbol of [BNT, ETH, TKN]) {
            const isNetworkToken = symbol === BNT;

            prepareEach(async () => {
                ({ externalProtectionVault, networkToken } = await createSystem());
                token = isNetworkToken ? networkToken : await createTokenBySymbol(symbol);

                await transfer(deployer, token, externalProtectionVault.address, amount);
            });

            context(`withdrawing ${symbol}`, () => {
                context('when regular user', () => {
                    testWithdrawFundsRestricted();
                });

                context('when admin', () => {
                    prepareEach(async () => {
                        await externalProtectionVault.grantRole(UpgradeableRoles.ROLE_ADMIN, user.address);
                    });

                    testWithdrawFundsRestricted();
                });

                context('when role asset manager', () => {
                    prepareEach(async () => {
                        await externalProtectionVault.grantRole(
                            ExternalProtectionVaultRoles.ROLE_ASSET_MANAGER,
                            user.address
                        );
                    });

                    testWithdrawFunds();
                });
            });
        }
    });
});
