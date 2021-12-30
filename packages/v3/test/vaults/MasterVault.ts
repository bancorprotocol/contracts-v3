import Contracts from '../../components/Contracts';
import { IERC20, MasterVault, TestBancorNetwork, TestMasterPool } from '../../typechain-types';
import { ZERO_ADDRESS, Symbols } from '../../utils/Constants';
import { expectRole, roles } from '../helpers/AccessControl';
import { createSystem } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { createTokenBySymbol, TokenWithAddress, transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

const { Upgradeable: UpgradeableRoles, MasterVault: MasterVaultRoles } = roles;

describe('MasterVault', () => {
    shouldHaveGap('MasterVault');

    describe('construction', () => {
        let network: TestBancorNetwork;
        let masterVault: MasterVault;
        let masterPool: TestMasterPool;

        beforeEach(async () => {
            ({ network, masterVault, masterPool } = await createSystem());
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(masterVault.initialize()).to.be.revertedWith('Initializable: contract is already initialized');
        });

        it('should revert when initialized with an invalid network token', async () => {
            await expect(Contracts.MasterVault.deploy(ZERO_ADDRESS)).to.be.revertedWith('InvalidAddress');
        });

        it('should be properly initialized', async () => {
            const [deployer] = await ethers.getSigners();

            expect(await masterVault.version()).to.equal(1);
            expect(await masterVault.isPayable()).to.be.true;

            await expectRole(masterVault, UpgradeableRoles.ROLE_ADMIN, UpgradeableRoles.ROLE_ADMIN, [deployer.address]);
            await expectRole(masterVault, MasterVaultRoles.ROLE_ASSET_MANAGER, UpgradeableRoles.ROLE_ADMIN, [
                network.address
            ]);
            await expectRole(masterVault, MasterVaultRoles.ROLE_NETWORK_TOKEN_MANAGER, UpgradeableRoles.ROLE_ADMIN, [
                masterPool.address
            ]);
        });
    });

    describe('asset management', () => {
        const amount = 1_000_000;

        let masterVault: MasterVault;
        let networkToken: IERC20;

        let deployer: SignerWithAddress;
        let user: SignerWithAddress;

        let token: TokenWithAddress;

        const testWithdrawFunds = () => {
            it('should allow withdrawals', async () => {
                await expect(masterVault.connect(user).withdrawFunds(token.address, user.address, amount))
                    .to.emit(masterVault, 'FundsWithdrawn')
                    .withArgs(token.address, user.address, user.address, amount);
            });
        };

        const testWithdrawFundsRestricted = () => {
            it('should revert', async () => {
                await expect(
                    masterVault.connect(user).withdrawFunds(token.address, user.address, amount)
                ).to.revertedWith('AccessDenied');
            });
        };

        before(async () => {
            [deployer, user] = await ethers.getSigners();
        });

        for (const symbol of [Symbols.BNT, Symbols.ETH, Symbols.TKN]) {
            const isNetworkToken = symbol === Symbols.BNT;

            context(`withdrawing ${symbol}`, () => {
                beforeEach(async () => {
                    ({ masterVault, networkToken } = await createSystem());

                    token = isNetworkToken ? networkToken : await createTokenBySymbol(symbol);

                    await transfer(deployer, token, masterVault.address, amount);
                });

                context('with no special permissions', () => {
                    testWithdrawFundsRestricted();
                });

                context('with admin role', () => {
                    beforeEach(async () => {
                        await masterVault.grantRole(UpgradeableRoles.ROLE_ADMIN, user.address);
                    });

                    testWithdrawFundsRestricted();
                });

                context('with asset manager role', () => {
                    beforeEach(async () => {
                        await masterVault.grantRole(MasterVaultRoles.ROLE_ASSET_MANAGER, user.address);
                    });

                    testWithdrawFunds();
                });

                context('with network token manager role', () => {
                    beforeEach(async () => {
                        await masterVault.grantRole(MasterVaultRoles.ROLE_NETWORK_TOKEN_MANAGER, user.address);
                    });

                    isNetworkToken ? testWithdrawFunds() : testWithdrawFundsRestricted();
                });
            });
        }
    });
});
