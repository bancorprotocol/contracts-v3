import { IERC20, ExternalRewardsVault } from '../../typechain-types';
import { BNT, ETH, TKN } from '../../utils/Constants';
import { expectRole, roles } from '../helpers/AccessControl';
import { createSystem } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { TokenWithAddress, createTokenBySymbol, transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

const { Upgradeable: UpgradeableRoles, ExternalRewardsVault: ExternalRewardsVaultRoles } = roles;

describe('ExternalRewardsVault', () => {
    shouldHaveGap('ExternalRewardsVault');

    describe('construction', () => {
        let externalRewardsVault: ExternalRewardsVault;

        beforeEach(async () => {
            ({ externalRewardsVault } = await createSystem());
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(externalRewardsVault.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            const [deployer] = await ethers.getSigners();

            expect(await externalRewardsVault.version()).to.equal(1);
            expect(await externalRewardsVault.isPayable()).to.be.true;

            await expectRole(externalRewardsVault, UpgradeableRoles.ROLE_ADMIN, UpgradeableRoles.ROLE_ADMIN, [
                deployer.address
            ]);
            await expectRole(
                externalRewardsVault,
                ExternalRewardsVaultRoles.ROLE_ASSET_MANAGER,
                UpgradeableRoles.ROLE_ADMIN
            );
        });
    });

    describe('asset management', () => {
        const amount = 1_000_000;

        let externalRewardsVault: ExternalRewardsVault;
        let networkToken: IERC20;

        let deployer: SignerWithAddress;
        let user: SignerWithAddress;

        let token: TokenWithAddress;

        const testWithdrawFunds = () => {
            it('should allow withdrawals', async () => {
                await expect(externalRewardsVault.connect(user).withdrawFunds(token.address, user.address, amount))
                    .to.emit(externalRewardsVault, 'FundsWithdrawn')
                    .withArgs(token.address, user.address, user.address, amount);
            });
        };

        const testWithdrawFundsRestricted = () => {
            it('should revert', async () => {
                await expect(
                    externalRewardsVault.connect(user).withdrawFunds(token.address, user.address, amount)
                ).to.revertedWith('AccessDenied');
            });
        };

        before(async () => {
            [deployer, user] = await ethers.getSigners();
        });

        for (const symbol of [BNT, ETH, TKN]) {
            const isNetworkToken = symbol === BNT;

            beforeEach(async () => {
                ({ externalRewardsVault, networkToken } = await createSystem());

                token = isNetworkToken ? networkToken : await createTokenBySymbol(TKN);

                transfer(deployer, token, externalRewardsVault.address, amount);
            });

            context(`withdrawing ${symbol}`, () => {
                context('with no special permissions', () => {
                    testWithdrawFundsRestricted();
                });

                context('with admin role', () => {
                    beforeEach(async () => {
                        await externalRewardsVault.grantRole(UpgradeableRoles.ROLE_ADMIN, user.address);
                    });

                    testWithdrawFundsRestricted();
                });

                context('with asset manager role', () => {
                    beforeEach(async () => {
                        await externalRewardsVault.grantRole(
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
