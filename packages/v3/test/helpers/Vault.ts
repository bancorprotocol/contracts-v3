import { NetworkToken } from '../../components/LegacyContracts';
import { IVault } from '../../typechain';
import { BNT } from './Constants';
import { createTokenBySymbol } from './Utils';
import { expect } from 'chai';
import { ethers } from 'hardhat';

export const withdrawFundsTest = (
    getVault: () => Promise<{
        vault: IVault;
        networkToken: NetworkToken;
    }>,
    tests: {
        token: string;
        roles: { name: string | undefined; role: string | undefined; isExpectedSuccessful: boolean }[];
    }[]
) => {
    for (let test of tests) {
        context('withdraw funds ' + test.token, () => {
            for (let roleToTest of test.roles) {
                const roleName = roleToTest.name || 'none';

                it('with role: ' + roleName, async () => {
                    const { vault, networkToken } = await getVault();

                    const [, sender, target] = await ethers.getSigners();

                    const token =
                        test.token === BNT ? networkToken.address : (await createTokenBySymbol(test.token)).address;

                    if (roleName !== 'none') {
                        await (vault as any).grantRole(roleToTest.role, sender.address);
                    }
                    const res = vault.connect(sender).withdrawFunds(token, target.address, 0);

                    if (roleToTest.isExpectedSuccessful) {
                        await expect(res)
                            .to.emit(vault, 'FundsWithdrawn')
                            .withArgs(token, sender.address, target.address, 0);
                    } else {
                        await expect(res).to.revertedWith('AccessDenied');
                    }
                });
            }
        });
    }
};
