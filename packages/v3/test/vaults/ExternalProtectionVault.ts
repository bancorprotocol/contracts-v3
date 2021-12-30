import Contracts from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import { IERC20, ExternalProtectionVault, TestBancorNetwork } from '../../typechain-types';
import { Symbols, ZERO_ADDRESS } from '../../utils/Constants';
import { expectRole, roles } from '../helpers/AccessControl';
import { createSystem } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { transfer, createTokenBySymbol, TokenWithAddress } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

const { Upgradeable: UpgradeableRoles, ExternalProtectionVault: ExternalProtectionVaultRoles } = roles;

describe('ExternalProtectionVault', () => {
    shouldHaveGap('ExternalProtectionVault');

    describe('construction', () => {
        let network: TestBancorNetwork;
        let networkTokenGovernance: TokenGovernance;
        let govTokenGovernance: TokenGovernance;
        let externalProtectionVault: ExternalProtectionVault;

        beforeEach(async () => {
            ({ network, networkTokenGovernance, govTokenGovernance, externalProtectionVault } = await createSystem());
        });

        it('should revert when attempting to create with an invalid network token governance contract', async () => {
            await expect(
                Contracts.ExternalProtectionVault.deploy(ZERO_ADDRESS, govTokenGovernance.address)
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid gov token governance contract', async () => {
            await expect(
                Contracts.ExternalProtectionVault.deploy(networkTokenGovernance.address, ZERO_ADDRESS)
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(externalProtectionVault.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            const [deployer] = await ethers.getSigners();

            expect(await externalProtectionVault.version()).to.equal(1);
            expect(await externalProtectionVault.isPayable()).to.be.true;

            await expectRole(externalProtectionVault, UpgradeableRoles.ROLE_ADMIN, UpgradeableRoles.ROLE_ADMIN, [
                deployer.address
            ]);
            await expectRole(
                externalProtectionVault,
                ExternalProtectionVaultRoles.ROLE_ASSET_MANAGER,
                UpgradeableRoles.ROLE_ADMIN,
                [network.address]
            );
        });
    });

    describe('asset management', () => {
        const amount = 1_000_000;

        let externalProtectionVault: ExternalProtectionVault;
        let networkToken: IERC20;

        let deployer: SignerWithAddress;
        let user: SignerWithAddress;

        let token: TokenWithAddress;

        const testWithdrawFunds = () => {
            it('should allow withdrawals', async () => {
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

        for (const symbol of [Symbols.BNT, Symbols.ETH, Symbols.TKN]) {
            const isNetworkToken = symbol === Symbols.BNT;

            beforeEach(async () => {
                ({ externalProtectionVault, networkToken } = await createSystem());

                token = isNetworkToken ? networkToken : await createTokenBySymbol(symbol);

                await transfer(deployer, token, externalProtectionVault.address, amount);
            });

            context(`withdrawing ${symbol}`, () => {
                context('with no special permissions', () => {
                    testWithdrawFundsRestricted();
                });

                context('with admin role', () => {
                    beforeEach(async () => {
                        await externalProtectionVault.grantRole(UpgradeableRoles.ROLE_ADMIN, user.address);
                    });

                    testWithdrawFundsRestricted();
                });

                context('with asset manager role', () => {
                    beforeEach(async () => {
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
