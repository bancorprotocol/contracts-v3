import Contracts from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import { IERC20, ExternalRewardsVault } from '../../typechain-types';
import { ZERO_ADDRESS } from '../../utils/Constants';
import { TokenData, TokenSymbols } from '../../utils/TokenData';
import { expectRole, Roles } from '../helpers/AccessControl';
import { createSystem, createTestToken } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { transfer, TokenWithAddress } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('ExternalRewardsVault', () => {
    shouldHaveGap('ExternalRewardsVault');

    describe('construction', () => {
        let networkTokenGovernance: TokenGovernance;
        let govTokenGovernance: TokenGovernance;
        let externalRewardsVault: ExternalRewardsVault;

        beforeEach(async () => {
            ({ networkTokenGovernance, govTokenGovernance, externalRewardsVault } = await createSystem());
        });

        it('should revert when attempting to create with an invalid network token governance contract', async () => {
            await expect(
                Contracts.ExternalRewardsVault.deploy(ZERO_ADDRESS, govTokenGovernance.address)
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid gov token governance contract', async () => {
            await expect(
                Contracts.ExternalRewardsVault.deploy(networkTokenGovernance.address, ZERO_ADDRESS)
            ).to.be.revertedWith('InvalidAddress');
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

            await expectRole(externalRewardsVault, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
                deployer.address
            ]);
            await expectRole(
                externalRewardsVault,
                Roles.ExternalRewardsVault.ROLE_ASSET_MANAGER,
                Roles.Upgradeable.ROLE_ADMIN
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

        for (const symbol of [TokenSymbols.BNT, TokenSymbols.ETH, TokenSymbols.TKN]) {
            const tokenData = new TokenData(symbol);

            beforeEach(async () => {
                ({ externalRewardsVault, networkToken } = await createSystem());

                token = tokenData.isNetworkToken() ? networkToken : await createTestToken();

                transfer(deployer, token, externalRewardsVault.address, amount);
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
                        await externalRewardsVault.grantRole(
                            Roles.ExternalRewardsVault.ROLE_ASSET_MANAGER,
                            user.address
                        );
                    });

                    testWithdrawFunds();
                });
            });
        }
    });
});
