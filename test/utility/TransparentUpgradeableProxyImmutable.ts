import Contracts, { TestLogic, TransparentUpgradeableProxyImmutable } from '../../components/Contracts';
import { ZERO_ADDRESS } from '../../utils/Constants';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('TransparentUpgradeableProxyImmutable', () => {
    let admin: SignerWithAddress;
    let nonAdmin: SignerWithAddress;

    const VERSION = 1;
    const DATA = 100;

    before(async () => {
        [, admin, nonAdmin] = await ethers.getSigners();
    });

    describe('construction', () => {
        let logic: TestLogic;

        beforeEach(async () => {
            logic = await Contracts.TestLogic.deploy(VERSION);
        });

        it('should revert when attempting to create with an invalid logic contract', async () => {
            await expect(
                Contracts.TransparentUpgradeableProxyImmutable.deploy(ZERO_ADDRESS, admin.address, [])
            ).to.be.revertedWithError('ERC1967: new implementation is not a contract');

            await expect(
                Contracts.TransparentUpgradeableProxyImmutable.deploy(admin.address, admin.address, [])
            ).to.be.revertedWithError('ERC1967: new implementation is not a contract');
        });

        it('should revert when attempting to create with an invalid admin', async () => {
            await expect(
                Contracts.TransparentUpgradeableProxyImmutable.deploy(logic.address, ZERO_ADDRESS, [])
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should be properly initialized', async () => {
            const proxy = await Contracts.TransparentUpgradeableProxyImmutable.deploy(logic.address, admin.address, []);

            const contract = await Contracts.TestLogic.attach(proxy.address);

            expect(await proxy.connect(admin).callStatic.implementation()).to.equal(logic.address);
            expect(await proxy.connect(admin).callStatic.admin()).to.equal(admin.address);
            expect(await contract.connect(nonAdmin).initialized()).to.be.false;
            expect(await contract.connect(nonAdmin).version()).to.equal(VERSION);
            expect(await contract.connect(nonAdmin).data()).to.equal(0);

            const proxy2 = await Contracts.TransparentUpgradeableProxyImmutable.deploy(
                logic.address,
                admin.address,
                logic.interface.encodeFunctionData('initialize')
            );
            const contract2 = await Contracts.TestLogic.attach(proxy2.address);

            expect(await proxy2.connect(admin).callStatic.implementation()).to.equal(logic.address);
            expect(await proxy2.connect(admin).callStatic.admin()).to.equal(admin.address);
            expect(await contract2.connect(nonAdmin).initialized()).to.be.true;
            expect(await contract2.connect(nonAdmin).version()).to.equal(VERSION);
            expect(await contract2.connect(nonAdmin).data()).to.equal(DATA);
        });
    });

    describe('proxy', () => {
        let logic: TestLogic;
        let proxy: TransparentUpgradeableProxyImmutable;
        let contract: TestLogic;

        beforeEach(async () => {
            logic = await Contracts.TestLogic.deploy(VERSION);
            proxy = await Contracts.TransparentUpgradeableProxyImmutable.deploy(
                logic.address,
                admin.address,
                logic.interface.encodeFunctionData('initialize')
            );
            contract = await Contracts.TestLogic.attach(proxy.address);
        });

        describe('callback', () => {
            const data = 123;

            it('should revert when an admin attempt to call into the contract', async () => {
                await expect(contract.connect(admin).setData(data)).to.be.revertedWithError('AccessDenied');
            });

            it('should allow a non-admin to call into the contract', async () => {
                await contract.connect(nonAdmin).setData(data);
                expect(await contract.connect(nonAdmin).data()).to.equal(data);
            });
        });

        describe('upgrade', () => {
            let newLogic: TestLogic;

            beforeEach(async () => {
                newLogic = await Contracts.TestLogic.deploy(VERSION);
            });

            it('should revert when a non-admin attempts to upgrade the proxy', async () => {
                await expect(proxy.connect(nonAdmin).upgradeTo(newLogic.address)).to.be.revertedWithError(
                    "function selector was not recognized and there's no fallback function"
                );
                await expect(proxy.connect(nonAdmin).upgradeToAndCall(newLogic.address, [])).to.be.revertedWithError(
                    "function selector was not recognized and there's no fallback function"
                );
            });

            it('should revert when attempting to upgrade to an invalid logic contract', async () => {
                await expect(proxy.connect(admin).upgradeTo(ZERO_ADDRESS)).to.be.revertedWithError(
                    'ERC1967: new implementation is not a contract'
                );
                await expect(proxy.connect(admin).upgradeTo(admin.address)).to.be.revertedWithError(
                    'ERC1967: new implementation is not a contract'
                );

                await expect(proxy.connect(admin).upgradeToAndCall(ZERO_ADDRESS, [])).to.be.revertedWithError(
                    'ERC1967: new implementation is not a contract'
                );
                await expect(proxy.connect(admin).upgradeToAndCall(admin.address, [])).to.be.revertedWithError(
                    'ERC1967: new implementation is not a contract'
                );
            });

            it('should allow the admin to upgrade to a new logic contract', async () => {
                expect(await proxy.connect(admin).callStatic.implementation()).to.equal(logic.address);
                expect(await contract.connect(nonAdmin).initialized()).to.be.true;
                expect(await contract.connect(nonAdmin).version()).to.equal(VERSION);

                await proxy.connect(admin).upgradeTo(newLogic.address);

                expect(await proxy.connect(admin).callStatic.implementation()).to.equal(newLogic.address);
                expect(await contract.connect(nonAdmin).initialized()).to.be.true;
                expect(await contract.connect(nonAdmin).version()).to.equal(VERSION);

                const newData = DATA + 1000;
                const newVersion = VERSION + 1;
                const newLogic2 = await Contracts.TestLogic.deploy(newVersion);
                await proxy
                    .connect(admin)
                    .upgradeToAndCall(newLogic2.address, newLogic.interface.encodeFunctionData('setData', [newData]));

                expect(await proxy.connect(admin).callStatic.implementation()).to.equal(newLogic2.address);
                expect(await contract.connect(nonAdmin).initialized()).to.be.true;
                expect(await contract.connect(nonAdmin).version()).to.equal(newVersion);
                expect(await contract.connect(nonAdmin).data()).to.equal(newData);
            });
        });
    });
});
