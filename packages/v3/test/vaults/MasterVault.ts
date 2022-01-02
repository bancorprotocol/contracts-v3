import Contracts from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import { IERC20, MasterVault, TestBancorNetwork, TestMasterPool } from '../../typechain-types';
import { ZERO_ADDRESS } from '../../utils/Constants';
import { TokenData, TokenSymbols } from '../../utils/TokenData';
import { expectRole, Roles } from '../helpers/AccessControl';
import { createSystem, createToken, TokenWithAddress } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('MasterVault', () => {
    shouldHaveGap('MasterVault');

    describe('construction', () => {
        let network: TestBancorNetwork;
        let networkTokenGovernance: TokenGovernance;
        let govTokenGovernance: TokenGovernance;
        let masterVault: MasterVault;
        let masterPool: TestMasterPool;

        beforeEach(async () => {
            ({ network, networkTokenGovernance, govTokenGovernance, masterVault, masterPool } = await createSystem());
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(masterVault.initialize()).to.be.revertedWith('Initializable: contract is already initialized');
        });

        it('should revert when initialized with an invalid network token governance contract', async () => {
            await expect(Contracts.MasterVault.deploy(ZERO_ADDRESS, govTokenGovernance.address)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('should revert when initialized with an invalid network token governance contract', async () => {
            await expect(Contracts.MasterVault.deploy(networkTokenGovernance.address, ZERO_ADDRESS)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('should be properly initialized', async () => {
            const [deployer] = await ethers.getSigners();

            expect(await masterVault.version()).to.equal(1);
            expect(await masterVault.isPayable()).to.be.true;

            await expectRole(masterVault, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
                deployer.address
            ]);
            await expectRole(masterVault, Roles.MasterVault.ROLE_ASSET_MANAGER, Roles.Upgradeable.ROLE_ADMIN, [
                network.address
            ]);
            await expectRole(masterVault, Roles.MasterVault.ROLE_NETWORK_TOKEN_MANAGER, Roles.Upgradeable.ROLE_ADMIN, [
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

        for (const symbol of [TokenSymbols.BNT, TokenSymbols.ETH, TokenSymbols.TKN]) {
            const tokenData = new TokenData(symbol);

            context(`withdrawing ${symbol}`, () => {
                beforeEach(async () => {
                    ({ masterVault, networkToken } = await createSystem());

                    token = tokenData.isNetworkToken() ? networkToken : await createToken(tokenData);

                    await transfer(deployer, token, masterVault.address, amount);
                });

                context('with no special permissions', () => {
                    testWithdrawFundsRestricted();
                });

                context('with admin role', () => {
                    beforeEach(async () => {
                        await masterVault.grantRole(Roles.Upgradeable.ROLE_ADMIN, user.address);
                    });

                    testWithdrawFundsRestricted();
                });

                context('with asset manager role', () => {
                    beforeEach(async () => {
                        await masterVault.grantRole(Roles.MasterVault.ROLE_ASSET_MANAGER, user.address);
                    });

                    testWithdrawFunds();
                });

                context('with network token manager role', () => {
                    beforeEach(async () => {
                        await masterVault.grantRole(Roles.MasterVault.ROLE_NETWORK_TOKEN_MANAGER, user.address);
                    });

                    tokenData.isNetworkToken() ? testWithdrawFunds() : testWithdrawFundsRestricted();
                });
            });
        }
    });
});
