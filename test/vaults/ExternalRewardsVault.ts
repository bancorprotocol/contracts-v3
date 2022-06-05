import Contracts, { ExternalRewardsVault, IERC20 } from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import { ZERO_ADDRESS } from '../../utils/Constants';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import { createSystem, createTestToken, TokenWithAddress } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('ExternalRewardsVault', () => {
    shouldHaveGap('ExternalRewardsVault');

    describe('construction', () => {
        let bntGovernance: TokenGovernance;
        let vbntGovernance: TokenGovernance;
        let externalRewardsVault: ExternalRewardsVault;

        beforeEach(async () => {
            ({ bntGovernance, vbntGovernance, externalRewardsVault } = await createSystem());
        });

        it('should revert when attempting to create with an invalid BNT governance contract', async () => {
            await expect(
                Contracts.ExternalRewardsVault.deploy(ZERO_ADDRESS, vbntGovernance.address)
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid vBNT governance contract', async () => {
            await expect(
                Contracts.ExternalRewardsVault.deploy(bntGovernance.address, ZERO_ADDRESS)
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(externalRewardsVault.initialize()).to.be.revertedWithError(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            const [deployer] = await ethers.getSigners();

            expect(await externalRewardsVault.version()).to.equal(1);
            expect(await externalRewardsVault.isPayable()).to.be.true;

            await expectRoles(externalRewardsVault, Roles.Upgradeable);

            await expectRole(externalRewardsVault, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
                deployer.address
            ]);
            await expectRole(externalRewardsVault, Roles.Vault.ROLE_ASSET_MANAGER, Roles.Upgradeable.ROLE_ADMIN);
        });
    });

    describe('asset management', () => {
        const amount = 1_000_000;

        let externalRewardsVault: ExternalRewardsVault;
        let bnt: IERC20;

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
                ).to.revertedWithError('AccessDenied');
            });
        };

        before(async () => {
            [deployer, user] = await ethers.getSigners();
        });

        for (const symbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
            const tokenData = new TokenData(symbol);

            beforeEach(async () => {
                ({ externalRewardsVault, bnt } = await createSystem());

                token = tokenData.isBNT() ? bnt : await createTestToken();

                await transfer(deployer, token, externalRewardsVault.address, amount);
            });

            context(`withdrawing ${symbol}`, () => {
                context('with no special permissions', () => {
                    testWithdrawFundsRestricted();
                });

                context('with admin role', () => {
                    beforeEach(async () => {
                        await externalRewardsVault.grantRole(Roles.Upgradeable.ROLE_ADMIN, user.address);
                    });

                    testWithdrawFundsRestricted();
                });

                context('with asset manager role', () => {
                    beforeEach(async () => {
                        await externalRewardsVault.grantRole(Roles.Vault.ROLE_ASSET_MANAGER, user.address);
                    });

                    testWithdrawFunds();
                });
            });
        }
    });
});
