import Contracts from '../../components/Contracts';
import { NetworkToken } from '../../components/LegacyContracts';
import { ExternalRewardsVault } from '../../typechain';
import { expectRole, roles } from '../helpers/AccessControl';
import { BNT, ETH, TKN } from '../helpers/Constants';
import { createSystem } from '../helpers/Factory';
import { prepareEach } from '../helpers/Fixture';
import { shouldHaveGap } from '../helpers/Proxy';
import { TokenWithAddress, createTokenBySymbol, transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

const { Upgradeable: UpgradeableRoles, ExternalRewardsVault: ExternalRewardsVaultRoles } = roles;

describe('ExternalRewardsVault', () => {
    shouldHaveGap('ExternalRewardsVault');

    describe('construction', () => {
        it('should revert when attempting to reinitialize', async () => {
            const { externalRewardsVault } = await createSystem();

            await expect(externalRewardsVault.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be payable', async () => {
            const { externalRewardsVault } = await createSystem();

            expect(await externalRewardsVault.isPayable()).to.be.true;
        });

        it('should be properly initialized', async () => {
            const [deployer] = await ethers.getSigners();

            const externalRewardsVault = await Contracts.ExternalRewardsVault.deploy();
            await externalRewardsVault.initialize();

            expect(await externalRewardsVault.version()).to.equal(1);

            await expectRole(externalRewardsVault, UpgradeableRoles.ROLE_ADMIN, UpgradeableRoles.ROLE_ADMIN, [
                deployer.address
            ]);
            await expectRole(
                externalRewardsVault,
                ExternalRewardsVaultRoles.ROLE_ASSET_MANAGER,
                ExternalRewardsVaultRoles.ROLE_ASSET_MANAGER,
                [deployer.address]
            );
        });
    });

    describe('asset management', () => {
        let amount = 1_000_000;

        let externalProtectionVault: ExternalRewardsVault;
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

        prepareEach(async () => {
            ({ externalProtectionVault, networkToken } = await createSystem());
            [deployer, user] = await ethers.getSigners();
        });

        for (const symbol of [BNT, ETH, TKN]) {
            prepareEach(async () => {
                token = symbol === BNT ? { address: networkToken.address } : await createTokenBySymbol(TKN);

                transfer(deployer, token, externalProtectionVault.address, amount);
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
                            ExternalRewardsVaultRoles.ROLE_ASSET_MANAGER,
                            user.address
                        );
                    });

                    testWithdrawFunds();
                });
            });
        }
    });
});
